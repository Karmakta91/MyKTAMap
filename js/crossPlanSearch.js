/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// CROSSPLANSEARCH.JS — Recherche dans TOUS les plans de la bibliothèque
// =========================
//   - Entrées : bouton de l'accueil (« 🌐 Recherche multi-plans ») et pont depuis la recherche Ctrl+K (« 🌐 Tous les
//     plans », saisie reprise) ; barre de l'accueil via rechercher().
//   - Périmètre : POINTS (session + calques de chaque plan).
//   - Clic sur un résultat : mini-confirmation si un plan est chargé, puis InterPlanLinks.goTo (changement de plan,
//     niveau, pan/flash).
//   - Scan à la demande + cache RAM par plan (TTL), aucun index persistant.
// Dépend de : InterPlanLinks.collectPointsForPlan (points d'un plan NON chargé) et InterPlanLinks.goTo.
// 100 % local : lit sessions et ZIP stockés, ne fetche que la config et les calques des plans servis (aucune
// nouvelle surface réseau).

(function() {
  "use strict";

  const MODAL_ID = "kta-xps-modal";
  const CACHE_TTL_MS = 120000;   // 2 min — le temps d'une session de recherche

  const _cache = {};

  function _t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }
  function _esc(s) { return window.ktaEsc(s); }   // échappeur unique (js/langManager.js)

  // Rend { pts, dataError } ; dataError = calques injoignables (serveur off, ZIP absent) → compteur ⚠️ au statut.
  async function _pointsDuPlan(plan) {
    const hit = _cache[plan.id];
    if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) return hit;
    let pts = [];
    const stats = {};
    try {
      pts = await window.InterPlanLinks.collectPointsForPlan(plan, stats);
    } catch(e) { console.warn("[CrossPlanSearch] lecture " + plan.id + " :", e); stats.dataError = true; }
    const entry = { pts: pts, dataError: !!stats.dataError, ts: Date.now() };
    _cache[plan.id] = entry;
    return entry;
  }

  // « Un plan est-il AFFICHÉ ? » : source unique window.ktaPlanAffiche (utils.js). 🩸 `PLAN_CONFIG.plan` est vrai
  // pendant qu'un plan se charge sous l'accueil : case multi-hop et boutons 🧭 s'y afficheraient.
  function _planAffiche() {
    return (typeof window.ktaPlanAffiche === "function")
      ? window.ktaPlanAffiche()
      : !!(window.PLAN_CONFIG && window.PLAN_CONFIG.plan);
  }

  function _fermer() {
    const m = document.getElementById(MODAL_ID);
    if (m) m.remove();
  }

  // Entrée principale. initialQuery optionnel (pont Ctrl+K). opts.onSelect(plan, pt) = mode SÉLECTION : le clic
  // appelle le callback au lieu de naviguer (modale Itinéraire : destination sur un autre plan).
  function ouvrir(initialQuery, opts) {
    opts = opts || {};
    _fermer();
    const plans = (window.PlanRegistry ? window.PlanRegistry.getAll() : []);
    if (plans.length === 0) {
      window.ktaAlerte(_t("xps.err.noPlan"));
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-xps-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">🌐 ' + _esc(_t("xps.titre")) + '</span>' +
          '<button class="kta-readme-modal-close" id="kta-xps-close" type="button" aria-label="✕">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<input type="text" id="kta-xps-input" class="kta-ipl-search" ' +
            'placeholder="' + _esc(_t("xps.placeholder")) + '" autocomplete="off">' +
          // Case multi-hop (option, désactivée par défaut, persistée par InterPlanRoute) : itinéraire 🧭 par des plans
          // intermédiaires. Pas rendue à l'accueil : l'itinéraire part de la position du tracker sur un plan chargé.
          (_planAffiche()
            ? '<label class="kta-xps-multihop" title="' + _esc(_t("xps.multihop.hint")) + '">' +
                '<input type="checkbox" id="kta-xps-multihop-cb">' +
                '<span>' + _esc(_t("xps.multihop.label")) + '</span>' +
              '</label>'
            : '') +
          '<div class="kta-xps-status" id="kta-xps-status"></div>' +
          '<div class="kta-ipl-results kta-xps-results" id="kta-xps-results"></div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    document.getElementById("kta-xps-close").addEventListener("click", _fermer);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _fermer(); });

    // Case multi-hop lue/écrite par InterPlanRoute (source unique) ; absente à l'accueil, `mhCb` peut être null.
    const mhCb = document.getElementById("kta-xps-multihop-cb");
    if (mhCb) {
      if (window.InterPlanRoute && typeof window.InterPlanRoute.isMultiHopEnabled === "function") {
        mhCb.checked = window.InterPlanRoute.isMultiHopEnabled();
        mhCb.addEventListener("change", function() {
          window.InterPlanRoute.setMultiHopEnabled(mhCb.checked);
        });
      } else if (mhCb.parentNode) {
        mhCb.parentNode.style.display = "none";
      }
    }

    const input    = document.getElementById("kta-xps-input");
    const statusEl = document.getElementById("kta-xps-status");
    const resEl    = document.getElementById("kta-xps-results");

    // Index en construction : [{plan, pt}], rempli par le scan progressif.
    let _index = [];
    let _scanDone = false;

    function _renderResults() {
      const f = String(input.value || "").toLowerCase().trim();
      if (!f) {
        resEl.innerHTML = "";
        return;
      }
      const matches = _index.filter(function(e) {
        const p = e.pt;
        return (p.nom && p.nom.toLowerCase().indexOf(f) !== -1)
            || (p.id && String(p.id).toLowerCase().indexOf(f) !== -1)
            || (p.tags && p.tags.join(" ").toLowerCase().indexOf(f) !== -1);
      }).slice(0, 60);
      if (matches.length === 0) {
        resEl.innerHTML = '<p class="kta-ipl-empty">' +
          _esc(_scanDone ? _t("xps.noResult") : _t("xps.scanning")) + '</p>';
        return;
      }
      // Bouton 🧭 « itinéraire via portail » sur les résultats DISTANTS, seulement si un plan est chargé et hors mode
      // sélection.
      const _planCharge = _planAffiche();
      const _iprDispo = !opts.onSelect && _planCharge
        && window.InterPlanRoute && typeof window.InterPlanRoute.computeEtAfficher === "function";
      const _pidCourant = window._currentLoadedPlanId || null;

      resEl.innerHTML = matches.map(function(e, i) {
        const distant = e.plan.id !== _pidCourant;
        return '<div class="kta-xps-rowwrap">' +
               '<button class="kta-ipl-pt-btn kta-xps-row" type="button" data-i="' + i + '">' +
                 '<span class="kta-ipl-pt-ico">' + (e.pt.source === "session" ? "✏️" : "📄") + '</span>' +
                 '<span class="kta-ipl-pt-name">' + _esc(e.pt.nom || e.pt.id || ("(" + e.pt.x + "," + e.pt.y + ")")) + '</span>' +
                 '<span class="kta-xps-plan-badge" title="' + _esc(e.plan.name || e.plan.id) + '">' +
                   (e.plan.type === "server" ? "🌐" : "📦") + ' ' + _esc(e.plan.name || e.plan.id) +
                 '</span>' +
               '</button>' +
               ((_iprDispo && distant)
                 ? '<button class="kta-popup-btn kta-xps-iti" type="button" data-iti="' + i + '" title="' +
                     _esc(_t("ipr.btn.routeTitle")) + '">🧭</button>' : '') +
               '</div>';
      }).join("");

      function _destDe(e) {
        return {
          planId: e.plan.id, planName: e.plan.name || e.plan.id,
          x: e.pt.x, y: e.pt.y,
          level: e.pt.level,
          tag: (Array.isArray(e.pt.tags) && e.pt.tags[0]) || undefined,
          label: e.pt.nom || e.pt.id || (e.pt.x + "," + e.pt.y)
        };
      }

      resEl.querySelectorAll(".kta-xps-row").forEach(function(btn) {
        btn.addEventListener("click", function() {
          const e = matches[parseInt(btn.getAttribute("data-i"), 10)];
          if (!e) return;
          _fermer();
          // Mode SÉLECTION (modale Itinéraire) → callback.
          if (typeof opts.onSelect === "function") {
            try { opts.onSelect(e.plan, e.pt); } catch(err) { console.warn("[CrossPlanSearch] onSelect :", err); }
            return;
          }
          // Mini-confirmation seulement si un plan est AFFICHÉ (à l'accueil, chargement direct ;
          // un plan peut se charger sous l'accueil : _currentLoadedPlanId seul ne vaut pas preuve).
          // Même arrivée que les portails.
          window.InterPlanLinks.goTo(e.plan.id, {
            x: e.pt.x, y: e.pt.y,
            level: e.pt.level,
            tag: (Array.isArray(e.pt.tags) && e.pt.tags[0]) || undefined,
            planName: e.plan.name || e.plan.id,
            label: e.pt.nom || e.pt.id || (e.pt.x + "," + e.pt.y)
          }, { confirm: _planCharge });
        });
      });
      resEl.querySelectorAll(".kta-xps-iti").forEach(function(btn) {
        btn.addEventListener("click", function() {
          const e = matches[parseInt(btn.getAttribute("data-iti"), 10)];
          if (!e) return;
          _fermer();
          window.InterPlanRoute.computeEtAfficher(_destDe(e));
        });
      });
    }

    // Scan progressif plan par plan (cache RAM, TTL 2 min), rendu rafraîchi au fil de l'eau.
    (async function _scan() {
      let unreachable = 0;   // (U2)
      for (let i = 0; i < plans.length; i++) {
        if (!document.getElementById(MODAL_ID)) return;   // modale fermée → stop
        statusEl.textContent = _t("xps.status.scanning", { n: i + 1, total: plans.length, plan: plans[i].name || plans[i].id });
        const entry = await _pointsDuPlan(plans[i]);
        if (entry.dataError) unreachable++;
        entry.pts.forEach(function(pt) { _index.push({ plan: plans[i], pt: pt }); });
        _renderResults();
      }
      _scanDone = true;
      statusEl.textContent = _t("xps.status.done", { total: plans.length, n: _index.length }) +
        (unreachable > 0 ? " · " + _t("xps.status.unreachable", { u: unreachable }) : "");
      _renderResults();
    })();

    input.addEventListener("input", _renderResults);
    if (initialQuery) input.value = String(initialQuery);
    _renderResults();
    try { input.focus(); } catch(e) {}
  }

  // Recherche SANS UI pour la barre de l'accueil (homeLoader), même cache que la modale (TTL 2 min).
  //   q   : chaîne
  //   max : plafond de résultats points (8 par défaut)
  // → Promise<{ points: [{plan, pt}], scanEnCours: bool }> ; scanEnCours = des plans restaient à lire au plafond
  //   (« … » ; la modale est le chemin exhaustif).
  async function rechercher(q, max) {
    q = String(q || "").toLowerCase().trim();
    max = max || 8;
    const out = [];
    if (!q || !window.PlanRegistry) return { points: out, scanEnCours: false };
    const plans = window.PlanRegistry.getAll() || [];
    for (let i = 0; i < plans.length; i++) {
      if (out.length >= max) return { points: out, scanEnCours: true };
      const entry = await _pointsDuPlan(plans[i]);
      for (const pt of entry.pts) {
        if (out.length >= max) break;
        const ok = (pt.nom && pt.nom.toLowerCase().indexOf(q) !== -1)
                || (pt.id && String(pt.id).toLowerCase().indexOf(q) !== -1)
                || (pt.tags && pt.tags.join(" ").toLowerCase().indexOf(q) !== -1);
        if (ok) out.push({ plan: plans[i], pt: pt });
      }
    }
    return { points: out, scanEnCours: false };
  }

  window.CrossPlanSearch = { ouvrir: ouvrir, rechercher: rechercher };

  console.log("[CrossPlanSearch] Module chargé");
})();
