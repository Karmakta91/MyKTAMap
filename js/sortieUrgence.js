/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// sortieUrgence.js — Sortie d'urgence : trouve les POI de sortie (cavage / puits à échelon / escalier de service
// OUVERTS, ou entrée), les classe par distance navigable réelle (Pathfinder, multi-niveau) depuis la position, et
// propose de tracer l'itinéraire vers la plus proche (+ « Autres sorties »).
// Cas dégradés : position jamais confirmée → picker « Où es-tu ? » ; aucun candidat → toast ; Pathfinder en échec
//   pour une sortie → distance à vol d'oiseau, affichée comme NON vérifiée, en fin de liste.
// Vibration : trouvée → medium ; aucune → error.
// Expose : window.SortieUrgence — declencher(), declencherDepuis(x, y, level, opts), isActive(), relancerDepuis(pos)
// Garde-fous : scripts/check-guidage.js, scripts/check-position-confirmee.js · Doc : docs/architecture/tracking.md

(function() {
  "use strict";

  const SU = {};
  let _modal = null;
  let _isPicking = false;          // mode picker carte actif
  let _pickHandler = null;         // handler temporaire map.on("click")
  let _lastResultats = null;       // résultats sortés du dernier calcul (cache)

  // ── Constantes ──────────────
  // Les tags des POI sont des CODES : cao (cavage ouvert), peo (puits à échelon ouvert), eso (escalier de service
  // ouvert). Les fermés (caf / pef / esf) sont EXCLUS, non traversables. Comparaison lowercase + trim.
  const TYPES_SORTIE = [
    "cao",
    "peo",
    "eso"
  ];
  // Tags « entrée » : on ressort par où on est entré. Le libellé libre `entrée` (avec ou sans accent) ET le tag
  // intégré `entree_plan` (map.js > TAGS_BUILTIN), sinon un plan balisé avec l'outil prévu n'a « aucune sortie ».
  const TAGS_ENTREE = ["entrée", "entree", "entree_plan"];

  // ── Helpers ──────────────
  function _norm(s) {
    return String(s || "").trim().toLowerCase();
  }

  // Sortie si tags ∩ TYPES_SORTIE ≠ ∅ ou tag entrée. Robuste à l'absence de tags.
  function _estUneSortie(point) {
    if (!point || !Array.isArray(point.tags) || point.tags.length === 0) return false;
    const tagsNorm = point.tags.map(_norm);
    if (tagsNorm.some(function(t) { return TAGS_ENTREE.indexOf(t) >= 0; })) return true;
    return tagsNorm.some(function(t) { return TYPES_SORTIE.indexOf(t) >= 0; });
  }

  // POI du plan courant (session + data layers embarqués)
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

  // Distance euclidienne au sol (ignore niveaux et murs — repli uniquement)
  function _distEucl(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // 🩸 `distPx` est en PIXELS plan et window.formatDistance attend des MÈTRES : diviser par APP_CONFIG.scale
  // (px/m), sinon la distance est multipliée par l'échelle. Comme lostMode.js et measure.js.
  function _formatDist(distPx) {
    const scale = (window.APP_CONFIG && typeof window.APP_CONFIG.scale === "number"
                   && window.APP_CONFIG.scale > 0)
                    ? window.APP_CONFIG.scale
                    : 1; // fallback si pas d'échelle (= distance brute en px)
    const distM = distPx / scale;
    if (typeof window.formatDistance === "function") {
      return window.formatDistance(distM, 0);
    }
    // Repli si formatDistance n'est pas chargé
    if (scale === 1) return Math.round(distPx) + " px";
    return distM < 1000
      ? distM.toFixed(0) + " m"
      : (distM / 1000).toFixed(2) + " km";
  }

  // ── Pathfinder ──────────────
  // Distance navigable via window.Pathfinder.computeRoute → Promise<{ distPx, path } | null> (null = échec, la
  // sortie est classée en fin avec sa distance à vol d'oiseau).
  // `contraintes` (facultatif, Mode Secours « Évacuer », brancard) : { avoidZones: [types], respecterInaccessibles }.
  function _calculerDistPathfinder(origine, cible, contraintes) {
    if (!window.Pathfinder || typeof window.Pathfinder.computeRoute !== "function") {
      return Promise.resolve(null);
    }
    const waypoints = [
      { x: origine.x, y: origine.y, source: "tracker",     label: "Position" },
      { x: cible.x,   y: cible.y,   source: "search",      label: cible.nom || "Sortie" }
    ];
    // Niveau connu → calage sur une galerie de CE niveau
    if (Number.isInteger(origine.level)) waypoints[0].level = origine.level;
    if (Number.isInteger(cible.level))   waypoints[1].level = cible.level;
    const c = contraintes || null;
    return window.Pathfinder.computeRoute(waypoints, {
      avoidPoints: [],
      avoidTags:   [],
      avoidRadius: 0,
      avoidZones:  c && Array.isArray(c.avoidZones) ? c.avoidZones : [],
      respecterInaccessibles: !(c && c.respecterInaccessibles === false)
    }).then(function(res) {
      if (!res || !Array.isArray(res.path) || res.path.length < 2) return null;
      // Longueur cumulée du path (px plan)
      let d = 0;
      for (let i = 1; i < res.path.length; i++) {
        d += _distEucl(res.path[i - 1], res.path[i]);
      }
      // ⚠️ Une zone qui coupe la galerie d'une sortie ne la rend pas injoignable : le moteur cale sur la galerie
      // restante et le chemin s'arrête court. Les écarts de calage (départ, arrivée) comptent donc dans la
      // distance, et au-delà de 10 m le chemin est « coupé » (brancard : traverse ce qu'on évite ; classique :
      // zone inaccessible ou galerie non tracée) — classé après les chemins entiers, alerte dans la fenêtre.
      const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
      const ecart = _distEucl(origine, res.path[0]) + _distEucl(res.path[res.path.length - 1], cible);
      d += ecart;
      const contourne = !!(res.usedFallback || ecart > 10 * pxParM);
      return { distPx: d, path: res.path, contourne: contourne, ecartM: ecart / pxParM };
    }).catch(function(err) {
      console.warn("[SortieUrgence] computeRoute échec pour", cible.nom, ":", err);
      return null;
    });
  }

  // ── Pipeline ──────────────
  // Toutes les sorties, distances Pathfinder, tri → Promise<[{point, distPx, path, fallback}, ...]>.
  // `supp` (facultatif, Mode Secours) : accès des équipes en plus des POI tagués ; un candidat à moins de 10 m
  // d'un POI de sortie est un doublon.
  function _calculerToutesSorties(origine, supp, contraintes) {
    const points = _tousLesPoints();
    const sorties = points.filter(_estUneSortie);
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    (Array.isArray(supp) ? supp : []).forEach(function(c) {
      if (!c || typeof c.x !== "number" || typeof c.y !== "number") return;
      if (sorties.some(function(p) { return _distEucl(p, c) < 10 * pxParM; })) return;
      sorties.push(c);
    });
    if (sorties.length === 0) return Promise.resolve([]);

    // 15 plus proches à vol d'oiseau seulement : pas de rafale de Pathfinder sur un plan à 100+ entrées.
    const presort = sorties.map(function(p) {
      return { point: p, dEucl: _distEucl(origine, p) };
    }).sort(function(a, b) { return a.dEucl - b.dEucl; }).slice(0, 15);

    return Promise.all(presort.map(function(item) {
      return _calculerDistPathfinder(origine, item.point, contraintes).then(function(pf) {
        if (pf) {
          return { point: item.point, distPx: pf.distPx, path: pf.path, fallback: false,
                   contourne: pf.contourne, ecartM: pf.ecartM };
        }
        // Repli : distance euclidienne, sortie gardée mais marquée fallback
        return { point: item.point, distPx: item.dEucl, path: null, fallback: true };
      });
    })).then(function(resultats) {
      return resultats.sort(function(a, b) {
        // Atteignables d'abord, puis par distance
        if (a.fallback !== b.fallback) return a.fallback ? 1 : -1;
        // Chemin entier avant chemin coupé (> 10 m de la sortie ou de la position, ou zone à éviter traversée)
        if (!!a.contourne !== !!b.contourne) return a.contourne ? 1 : -1;
        return a.distPx - b.distPx;
      });
    });
  }

  // ── Modale ──────────────
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
      if (e.target === _modal) { _fermerModale(); return; }
      // Boutons du résultat : délégation (CSP sans 'unsafe-inline')
      const b = e.target.closest && e.target.closest("[data-sortie-action]");
      if (!b) return;
      e.preventDefault();
      const a = b.getAttribute("data-sortie-action");
      if (a === "tracer") window.SortieUrgence._tracerMeilleure();
      else if (a === "alternatives") window.SortieUrgence._toggleAlternatives();
      else if (a === "index") window.SortieUrgence._tracerIndex(parseInt(b.getAttribute("data-idx"), 10));
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

  // Ligne d'état « d'où part le calcul » : un ÉTAT, pas un avertissement (ignoré dans une modale d'urgence).
  function _texteOrigine(meta) {
    const mode = meta && meta.mode;
    if (mode === "clic") return window.I18n.t("sortie.origine.clic");
    if (mode === "victime") return window.I18n.t("sortie.origine.victime");   // Mode Secours, Évacuer
    if (mode === "confirmee") {
      const ts = meta.ts;
      if (typeof ts !== "number") return window.I18n.t("sortie.origine.confirmeeRecent");
      const min = Math.round((Date.now() - ts) / 60000);
      return (min < 1)
        ? window.I18n.t("sortie.origine.confirmeeRecent")
        : window.I18n.t("sortie.origine.confirmee", { min: min });
    }
    return window.I18n.t("sortie.origine.suivi");
  }

  // Options brancard : rappel de ce qui est évité + alerte si la meilleure sortie n'est atteignable qu'en
  // traversant une zone « à éviter ». Sans options : même alerte si le meilleur chemin est coupé (> 10 m).
  function _htmlContraintes(meta, meilleure) {
    const c = meta && meta.contraintes;
    if (!c) {
      if (!meilleure || !meilleure.contourne) return "";
      const ecart = window.formatDistance(meilleure.ecartM || 0, 0);
      return '<div class="kta-sortie-fallback-txt">⚠️ ' +
             window.I18n.t("sortie.coupee.alerte", { ecart: ecart }) + '</div>';
    }
    const lab = function(type) {
      const L = window.LegendCustomization;
      const l = L && typeof L.getLabel === "function" ? L.getLabel("zones", type) : null;
      return window.ktaEsc(l || type);
    };
    const parts = [];
    if (Array.isArray(c.avoidZones) && c.avoidZones.length) {
      parts.push(window.I18n.t("sortie.brancard.evite", { liste: c.avoidZones.map(lab).join(", ") }));
    }
    if (c.respecterInaccessibles === false) parts.push(window.I18n.t("sortie.brancard.inaccLeve"));
    let html = '<div class="kta-sortie-brancard">' + window.I18n.t("sortie.brancard.titre") + " " +
               (parts.length ? parts.join(" · ") : window.I18n.t("sortie.brancard.aucune")) + '</div>';
    if (meilleure && meilleure.contourne) {
      html += '<div class="kta-sortie-fallback-txt">⚠️ ' + window.I18n.t("sortie.brancard.contourne") + '</div>';
    }
    return html;
  }

  function _rendreContenuPrincipal(resultats, origine, meta) {
    if (!resultats || resultats.length === 0) {
      // Classe urgence : vibre même si la préférence de confort est OFF
      if (window.kta_vibrate && window.kta_vibrate.urgence) window.kta_vibrate.urgence.error();
      else if (window.kta_vibrate) window.kta_vibrate.error();
      return (
        '<p class="kta-sortie-err">' +
          window.I18n.t("sortie.aucune.titre") +
        '</p>' +
        '<p style="font-size:12px; color:#8892a4;">' +
          window.I18n.t("sortie.aucune.detail") +
        '</p>'
      );
    }

    if (window.kta_vibrate && window.kta_vibrate.urgence) window.kta_vibrate.urgence.medium();
    else if (window.kta_vibrate) window.kta_vibrate.medium();

    const meilleure = resultats[0];
    const safeNom = window.ktaEsc(meilleure.point.nom || window.I18n.t("sortie.item.sansNom"));
    const distTxt = _formatDist(meilleure.distPx);
    // 🩸 Une sortie à vol d'oiseau est dite NON vérifiée en toutes lettres ; si AUCUNE n'a de chemin vérifié
    // (Pathfinder absent, réseau coupé), un bandeau le dit avant tout.
    const fallbackTxt = meilleure.fallback
      ? '<div class="kta-sortie-fallback-txt">⚠️ ' + window.I18n.t("sortie.fallback.label") + '</div>'
      : '';
    const tousFallback = resultats.every(function(r) { return r.fallback; });
    // Plan SANS AUCUN TRACÉ : dit en clair, avant tout (le guidage n'aurait rien à indiquer).
    const sansTrace = !!(window.Pathfinder && typeof window.Pathfinder.aDesTraces === "function" &&
                         !window.Pathfinder.aDesTraces());
    const bandeau = sansTrace
      ? '<div class="kta-sortie-bandeau">' + window.I18n.t("guid.aucunTraceSortie") + '</div>'
      : tousFallback
        ? '<div class="kta-sortie-bandeau">' + window.I18n.t("sortie.fallback.bandeau") + '</div>'
        : '';
    const levelTxt = (typeof meilleure.point.level === "number" && meilleure.point.level !== 0)
      ? ' <span class="kta-sortie-niveau">' + window.I18n.t("sortie.item.niveau", { level: meilleure.point.level }) + '</span>'
      : '';

    // Cache pour « Tracer » (origine réutilisée telle quelle)
    _lastResultats = { resultats: resultats, origine: origine, meta: meta || null };

    let html =
      bandeau +
      '<div class="kta-sortie-principal' + (meilleure.fallback ? ' kta-sortie-principal-fallback' : '') + '">' +
        '<div class="kta-sortie-icone">🚪</div>' +
        '<div class="kta-sortie-info">' +
          '<div class="kta-sortie-nom">' + safeNom + levelTxt + '</div>' +
          '<div class="kta-sortie-dist">' + distTxt + '</div>' +
          fallbackTxt +
        '</div>' +
      '</div>' +
      '<div class="kta-sortie-origine">' + _texteOrigine(meta) + '</div>' +
      _htmlContraintes(meta, meilleure) +
      '<div class="kta-sortie-actions">' +
        '<button type="button" class="kta-btn kta-btn-primary kta-sortie-btn-tracer" data-sortie-action="tracer">' +
          window.I18n.t("sortie.btn.tracer") +
        '</button>' +
      '</div>';

    if (resultats.length > 1) {
      html += (
        '<div class="kta-sortie-alternatives">' +
          '<button type="button" class="kta-sortie-alt-toggle" data-sortie-action="alternatives">' +
            window.I18n.t("sortie.btn.voirAutres", {
              n: (resultats.length - 1),
              s: (resultats.length - 1 > 1 ? "s" : "")
            }) +
          '</button>' +
          '<ul class="kta-sortie-alt-liste" id="kta-sortie-alt-liste" style="display:none;">'
      );
      let sepPose = false;
      for (let i = 1; i < resultats.length; i++) {
        const r = resultats[i];
        // Séparateur avant les non vérifiées (déjà en fin de liste)
        if (r.fallback && !sepPose) {
          html += '<li class="kta-sortie-alt-sep">' + window.I18n.t("sortie.fallback.sep") + '</li>';
          sepPose = true;
        }
        const n = window.ktaEsc(r.point.nom || window.I18n.t("sortie.item.sansNomCourt"));
        const d = _formatDist(r.distPx);
        const fb = r.fallback
          ? ' <span class="kta-sortie-fallback">≈ ' + window.I18n.t("sortie.fallback.court") + '</span>'
          : '';
        const lv = (typeof r.point.level === "number" && r.point.level !== 0)
          ? ' <span class="kta-sortie-niveau">' + window.I18n.t("sortie.item.niveauCourt", { level: r.point.level }) + '</span>'
          : '';
        html += (
          '<li>' +
            '<button type="button" class="kta-sortie-alt-item" data-sortie-action="index" data-idx="' + i + '">' +
              '<strong>' + n + '</strong>' + lv + ' — ' + d + fb +
            '</button>' +
          '</li>'
        );
      }
      html += '</ul></div>';
    }

    return html;
  }

  // Trace la meilleure (idx 0) : ferme la modale, délègue à window.itineraireYAller.
  SU._tracerMeilleure = function() { SU._tracerIndex(0); };

  SU._tracerIndex = function(idx) {
    if (!_lastResultats || !_lastResultats.resultats) return;
    const r = _lastResultats.resultats[idx];
    if (!r || !r.point) return;
    _fermerModale();
    if (typeof window.itineraireYAller === "function") {
      // 🩸 L'ORIGINE du calcul est transmise : sinon itineraireYAller reteste la position du tracker, cul-de-sac
      // quand la sortie a été calculée depuis un point tapé. urgence:true : bandeau de guidage sans croix, un écart
      // propose la sortie la plus proche d'ici.
      const m = _lastResultats.meta || {};
      // Évacuation : tracé et recalculs gardent contraintes et accès du scénario (sinon le tracé diffère du classé).
      const evac = (m.contraintes || m.supp) ? { contraintes: m.contraintes || null, supp: m.supp || null } : null;
      window.itineraireYAller(r.point.x, r.point.y,
        r.point.nom || window.I18n.t("sortie.item.nomDefaut"),
        { origine: _lastResultats.origine, urgence: true, evacuation: evac });
    } else {
      window.ktaAlerte(window.I18n.t("sortie.erreur.itineraireIndispo"), { type: "erreur" });
    }
  };

  SU._toggleAlternatives = function() {
    const ul = document.getElementById("kta-sortie-alt-liste");
    if (!ul) return;
    ul.style.display = (ul.style.display === "none") ? "" : "none";
    const btn = ul.previousElementSibling;
    if (btn) btn.textContent = btn.textContent.replace(/^[▾▸]/, ul.style.display === "none" ? "▾" : "▸");
  };

  // ── Entrées ──────────────
  // Règle « instant T » (décision produit) : suivi actif OU position confirmée depuis le chargement du plan → on
  // part de la position du tracker, SANS question ; jamais confirmée → SEUL cas où l'on demande « Où es-tu ? »
  // (picker partagé, qui recale aussi le tracker). 🩸 getTrackingPosition() rend TOUJOURS une position (le départ
  // du plan) : se fier à elle seule donnerait la sortie la plus proche de l'ENTRÉE.
  function declencher() {
    const pos = (typeof window.getTrackingPosition === "function")
      ? window.getTrackingPosition()
      : null;
    const etat = (typeof window.getTrackingPositionEtat === "function")
      ? window.getTrackingPositionEtat()
      : null;
    const posOk = !!(pos && typeof pos.x === "number" && typeof pos.y === "number");
    if (posOk && (!etat || etat.suiviActif || etat.confirmee)) {
      _lancer(pos, {
        mode: (etat && etat.suiviActif) ? "suivi" : "confirmee",
        ts:   etat ? etat.ts : null
      });
      return;
    }
    SU._modePickerCarte();
  }

  // Depuis une position arbitraire. Mode Secours : l'évacuation part de la VICTIME, niveau compris (sans lui, une
  // victime au −1 est calée sur la galerie la plus proche, tous niveaux).
  // `opts.sortiesSupp` : [{ x, y, level?, nom }] — candidats en plus (Mode Secours).
  function declencherDepuis(x, y, level, opts) {
    if (typeof x !== "number" || typeof y !== "number") {
      declencher();
      return;
    }
    const o = { x: x, y: y };
    if (Number.isInteger(level)) o.level = level;
    _lancer(o, { mode: (opts && opts.origine === "victime") ? "victime" : "clic", supp: opts && opts.sortiesSupp,
                 contraintes: (opts && opts.contraintes) || null });
  }

  async function _lancer(origine, meta) {
    _ouvrirModale(
      '<div class="kta-sortie-loader">' +
        '<div class="kta-sortie-spinner"></div>' +
        '<p>' + window.I18n.t("sortie.loader") + '</p>' +
      '</div>'
    );
    // 🩸 Yield-to-paint AVANT la rafale de computeRoute (jusqu'à 15 Dijkstra SYNC) : sans frame peinte, le spinner
    // ne s'affiche pas et l'écran fige (comme l'overlay itinéraire, cf computeLoader.js).
    await new Promise(function(r) { requestAnimationFrame(function() { setTimeout(r, 0); }); });
    _calculerToutesSorties(origine, meta && meta.supp, meta && meta.contraintes).then(function(resultats) {
      // La modale a pu être fermée entre-temps
      if (!_modal) return;
      const corps = _modal.querySelector(".kta-sortie-urgence-corps");
      if (corps) corps.innerHTML = _rendreContenuPrincipal(resultats, origine, meta);
    });
  }

  SU._modePickerCarte = function() {
    _fermerModale();
    if (!window.map) {
      window.ktaAlerte(window.I18n.t("sortie.erreur.carteIndispo"), { type: "erreur" });
      return;
    }
    // Picker partagé (utils.js) : floater « Où es-tu ? » + Annuler, clic capturé même sur un marqueur, et le tap
    // RECALE le tracker (position confirmée pour « Tracer », Urgence XL, « Y aller »).
    if (typeof window.ktaDemanderPositionCarte === "function") {
      window.ktaDemanderPositionCarte(function(p) {
        _lancer({ x: p.x, y: p.y }, { mode: "clic" });
      }, { icone: "🚨", texte: window.I18n.t("sortie.pick.floater") });
      return;
    }
    // Repli (helper absent) : picker nu, sans floater
    _isPicking = true;
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(window.I18n.t("sortie.toast.pickPosition"), "info");
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
      _lancer({ x: x, y: y }, { mode: "clic" });
    };
    window.map.on("click", _pickHandler);
  };

  SU._fermer = function() { _fermerModale(); };

  // Écart en guidage d'urgence : relance vers la sortie la plus proche D'ICI (pas la même), même modale ;
  // l'utilisateur confirme en touchant « Tracer ».
  SU.relancerDepuis = function(pos) {
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") { declencher(); return; }
    const etat = (typeof window.getTrackingPositionEtat === "function")
      ? window.getTrackingPositionEtat() : null;
    const road = (typeof window.getRoads === "function" ? window.getRoads() : [])
      .find(function(r) { return r && r.type === "itinerary" && r.evacuation; });
    const evac = road ? road.evacuation : null;
    _lancer({ x: pos.x, y: pos.y }, {
      mode: (etat && etat.suiviActif) ? "suivi" : "confirmee",
      ts:   etat ? etat.ts : null,
      supp: evac ? evac.supp : null,
      contraintes: evac ? evac.contraintes : null
    });
  };

  // ── Export ──────────────
  SU.declencher       = declencher;
  SU.declencherDepuis = declencherDepuis;
  SU.isActive         = function() { return !!_modal; };

  window.SortieUrgence = SU;

  console.log("[SortieUrgence] Module chargé (v1.35.0 — sortie + pathfinder)");
})();
