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
//   window.SortieUrgence.relancerDepuis(pos) — sorties les plus proches d'ici (guidage, écart)
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
  // Tags « entrée » : un POI marqué comme entrée est aussi une sortie (un
  // cataphile peut ressortir par où il est entré). Le libellé libre `entrée`
  // (avec ou sans accent) ET le tag INTÉGRÉ « Point d'entrée du plan »
  // (`entree_plan`, map.js > TAGS_BUILTIN). 🚨 Q3 de l'audit ergonomie du
  // 13/09/2026 : seul `entrée` était reconnu — un plan balisé avec l'outil
  // prévu pour ça n'avait « aucune sortie identifiée ».
  const TAGS_ENTREE = ["entrée", "entree", "entree_plan"];

  // ========== HELPERS ==========
  function _norm(s) {
    return String(s || "").trim().toLowerCase();
  }

  // Test si un POI matche le critère sortie (tags ∩ TYPES_SORTIE ≠ ∅ OU
  // tags ⊇ {entrée}). Robuste à l'absence de tags.
  function _estUneSortie(point) {
    if (!point || !Array.isArray(point.tags) || point.tags.length === 0) return false;
    const tagsNorm = point.tags.map(_norm);
    if (tagsNorm.some(function(t) { return TAGS_ENTREE.indexOf(t) >= 0; })) return true;
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
  // `contraintes` (facultatif, Mode Secours « 🚑 Évacuer », options brancard) :
  // { avoidZones: [types], respecterInaccessibles: bool }. Absent = calcul historique.
  function _calculerDistPathfinder(origine, cible, contraintes) {
    if (!window.Pathfinder || typeof window.Pathfinder.computeRoute !== "function") {
      return Promise.resolve(null);
    }
    const waypoints = [
      { x: origine.x, y: origine.y, source: "tracker",     label: "Position" },
      { x: cible.x,   y: cible.y,   source: "search",      label: cible.nom || "Sortie" }
    ];
    // Niveau connu → calage sur une galerie de CE niveau (pathfinder, 4.2).
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
      // Calcule la longueur cumulée du path (en px plan).
      let d = 0;
      for (let i = 1; i < res.path.length; i++) {
        d += _distEucl(res.path[i - 1], res.path[i]);
      }
      // Une zone (inaccessible, ou évitée en brancard) qui coupe la galerie d'une sortie ne
      // la rend pas injoignable : le moteur cale la sortie sur la galerie restante la plus
      // proche et le chemin s'arrête court — la sortie passait devant à tort. Les écarts de
      // calage (départ et arrivée) comptent dans la distance (06/10/2026) ; en brancard,
      // au-delà de 10 m, la sortie n'est atteinte qu'en traversant ce qu'on voulait éviter.
      const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
      const ecart = _distEucl(origine, res.path[0]) + _distEucl(res.path[res.path.length - 1], cible);
      d += ecart;
      const contourne = !!(c && (res.usedFallback || ecart > 10 * pxParM));
      return { distPx: d, path: res.path, contourne: contourne };
    }).catch(function(err) {
      console.warn("[SortieUrgence] computeRoute échec pour", cible.nom, ":", err);
      return null;
    });
  }

  // ========== PIPELINE ==========
  // Trouve toutes les sorties, calcule leurs distances pathfinder, trie.
  // Retourne Promise<[{point, distPx, path, fallback}, ...]>.
  // `supp` (facultatif) : candidats en plus des POI tagués — Mode Secours (30/09) :
  // les accès des équipes du scénario, que le plan ne tague pas forcément. Un
  // candidat à moins de 10 m d'un POI de sortie ne s'ajoute pas (doublon).
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

    // On limite à 15 sorties les plus proches en euclidien d'abord pour
    // éviter de spam le pathfinder sur des cas extrêmes (plan avec 100+
    // entrées tagées). En pratique, un plan typique en a < 10.
    const presort = sorties.map(function(p) {
      return { point: p, dEucl: _distEucl(origine, p) };
    }).sort(function(a, b) { return a.dEucl - b.dEucl; }).slice(0, 15);

    return Promise.all(presort.map(function(item) {
      return _calculerDistPathfinder(origine, item.point, contraintes).then(function(pf) {
        if (pf) {
          return { point: item.point, distPx: pf.distPx, path: pf.path, fallback: false, contourne: pf.contourne };
        }
        // Fallback : distance euclidienne (sortie inaccessible par pathfinder,
        // on l'inclut quand même mais marquée fallback dans l'UI).
        return { point: item.point, distPx: item.dEucl, path: null, fallback: true };
      });
    })).then(function(resultats) {
      return resultats.sort(function(a, b) {
        // Les non-fallback d'abord (= vraiment atteignables), puis par dist.
        if (a.fallback !== b.fallback) return a.fallback ? 1 : -1;
        // Brancard : un chemin qui respecte les zones à éviter passe avant un chemin qui les traverse.
        if (!!a.contourne !== !!b.contourne) return a.contourne ? 1 : -1;
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
      if (e.target === _modal) { _fermerModale(); return; }
      // Boutons du résultat : délégation (aucun gestionnaire inline — CSP sans 'unsafe-inline', 07/10/2026).
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

  // Ligne d'état sous le résultat : d'où part le calcul. Un ÉTAT, pas un
  // avertissement — un avertissement dans une modale d'urgence est ignoré.
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

  // Options brancard (Mode Secours) : rappel de ce que le calcul évite, et alerte si la
  // meilleure sortie n'est atteignable qu'en traversant une zone demandée « à éviter ».
  function _htmlContraintes(meta, meilleure) {
    const c = meta && meta.contraintes;
    if (!c) return "";
    const lab = function(type) {
      const L = window.LegendCustomization;
      const l = L && typeof L.getLabel === "function" ? L.getLabel("zones", type) : null;
      return String(l || type).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
      // 🚨 classe urgence : vibre même si la préférence de confort est OFF
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
    const safeNom = String(meilleure.point.nom || window.I18n.t("sortie.item.sansNom"))
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const distTxt = _formatDist(meilleure.distPx);
    // 🚨 Q4 (audit 13/09/2026) : une sortie « à vol d'oiseau » était présentée
    // comme atteignable, avec un « ≈ » gris de 12 px expliqué dans un title
    // invisible au doigt. Désormais en toutes lettres, et si AUCUNE sortie
    // n'a de chemin vérifié (Pathfinder absent, réseau coupé), un bandeau
    // le dit avant tout.
    const fallbackTxt = meilleure.fallback
      ? '<div class="kta-sortie-fallback-txt">⚠️ ' + window.I18n.t("sortie.fallback.label") + '</div>'
      : '';
    const tousFallback = resultats.every(function(r) { return r.fallback; });
    // 🪧 27/09/2026 (décision KARMA) — plan SANS AUCUN TRACÉ : on le dit en
    // clair, avant tout. Le bandeau générique « aucun chemin vérifié » ne
    // disait pas pourquoi, ni que le guidage n'aurait rien à indiquer.
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

    // Cache pour le bouton "Tracer" (l'origine y est réutilisée telle quelle)
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
        // Les non vérifiées sont déjà triées en fin de liste : un séparateur
        // explicite les relègue visuellement (Q4).
        if (r.fallback && !sepPose) {
          html += '<li class="kta-sortie-alt-sep">' + window.I18n.t("sortie.fallback.sep") + '</li>';
          sepPose = true;
        }
        const n = String(r.point.nom || window.I18n.t("sortie.item.sansNomCourt"))
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

  // Déclenche le tracé de la meilleure (idx 0) → ferme la modale + délègue
  // à window.itineraireYAller.
  SU._tracerMeilleure = function() { SU._tracerIndex(0); };

  SU._tracerIndex = function(idx) {
    if (!_lastResultats || !_lastResultats.resultats) return;
    const r = _lastResultats.resultats[idx];
    if (!r || !r.point) return;
    _fermerModale();
    if (typeof window.itineraireYAller === "function") {
      // 🚨 B1 (audit 13/09/2026) : on passe l'ORIGINE du calcul. Sans ça,
      // itineraireYAller re-testait la position du tracker — cul-de-sac dès
      // que la sortie avait été calculée depuis un point tapé.
      // 🪧 urgence:true (guidage, décisions A/C/G) : bandeau de guidage sans
      // croix, et un écart propose la sortie la plus proche d'ici.
      const m = _lastResultats.meta || {};
      // Évacuation (Mode Secours) : le tracé et ses recalculs gardent les contraintes du
      // classement et les accès du scénario — sinon le chemin tracé pouvait différer du classé.
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

  // ========== ENTRÉES ==========
  // Entrée principale — règle « instant T » (décision KARMA 13/09/2026) :
  //   • suivi actif OU position confirmée depuis le chargement du plan → on
  //     part de la position du tracker à l'instant T, SANS question ;
  //   • jamais confirmée (= encore le départ du plan, ou après un reset) →
  //     c'est le SEUL cas où l'on demande « Où es-tu ? », par le picker
  //     partagé (1 tap sur la carte, qui recale aussi le tracker).
  // 🚨 B1 de l'audit ergonomie : avant, getTrackingPosition() renvoyait
  // TOUJOURS une position (le départ du plan) — la branche « pas de tracker »
  // était morte, et la sortie la plus proche de l'ENTRÉE du plan était
  // présentée comme la plus proche de l'utilisateur.
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

  // Variante : déclenche depuis une position arbitraire (utilisée par la
  // commande vocale qui pourrait passer un POI de référence à l'avenir).
  // Mode Secours (A3, 29/09/2026) : l'évacuation part de la VICTIME, niveau compris —
  // sans lui, une victime au −1 était calée sur la galerie la plus proche, tous niveaux.
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
    // 🌀 v1.55.1 : yield-to-paint AVANT le batch de Pathfinder.computeRoute
    // (jusqu'à 15 Dijkstra SYNC bloquants). Sans une frame peinte ici, le
    // spinner de la modale ne s'affiche pas et l'écran fige « sans rien
    // montrer » — même cause que l'overlay itinéraire (cf computeLoader.js).
    await new Promise(function(r) { requestAnimationFrame(function() { setTimeout(r, 0); }); });
    _calculerToutesSorties(origine, meta && meta.supp, meta && meta.contraintes).then(function(resultats) {
      // On peut être interrompu si l'user ferme la modale entre temps
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
    // Picker partagé (utils.js) : floater « Où es-tu ? » avec Annuler, clic
    // capturé même sur un marqueur, et le tap RECALE le tracker (position
    // confirmée pour la suite : « Tracer », Urgence XL, « Y aller »).
    if (typeof window.ktaDemanderPositionCarte === "function") {
      window.ktaDemanderPositionCarte(function(p) {
        _lancer({ x: p.x, y: p.y }, { mode: "clic" });
      }, { icone: "🚨", texte: window.I18n.t("sortie.pick.floater") });
      return;
    }
    // Repli (helper absent) : ancien picker nu, sans floater.
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

  // 🪧 27/09/2026 — Guidage, décision G : en sortie d'urgence, un écart ne
  // relance pas le chemin vers la MÊME sortie mais vers la plus proche D'ICI
  // — quelqu'un qui a dévié est peut-être plus près d'une autre. Même modale
  // que le déclenchement : l'utilisateur confirme en touchant « Tracer ».
  SU.relancerDepuis = function(pos) {
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") { declencher(); return; }
    const etat = (typeof window.getTrackingPositionEtat === "function")
      ? window.getTrackingPositionEtat() : null;
    // Une évacuation recalculée garde ses options brancard et les accès du scénario.
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

  // ========== EXPORT ==========
  SU.declencher       = declencher;
  SU.declencherDepuis = declencherDepuis;
  SU.isActive         = function() { return !!_modal; };

  window.SortieUrgence = SU;

  console.log("[SortieUrgence] Module chargé (v1.35.0 — sortie + pathfinder)");
})();
