/*!
 * MyKTAMap — Recherche cross-plan (v1.58.0)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// CROSSPLANSEARCH.JS — Recherche dans TOUS les plans de la bibliothèque
// =========================
// Décisions KARMA (A1 : 1:c 2:a 3:a 4:a) :
//   - 2 points d'entrée : bouton HOME (« 🌐 Recherche multi-plans ») + pont
//     depuis la recherche unifiée Ctrl+K (bouton « 🌐 Tous les plans » qui
//     reprend la saisie en cours).
//   - Périmètre V1 : POINTS uniquement (session + datalayers de chaque plan).
//   - Clic sur un résultat : mini-confirmation (si un plan est chargé) puis
//     switch + bascule niveau + pan/flash — pipeline InterPlanLinks.goTo.
//   - Perf : scan à la demande + cache RAM de session (TTL par plan), aucun
//     index persistant.
//
// Dépendances : InterPlanLinks.collectPointsForPlan (lecture des points d'un
// plan NON chargé : session localStorage + datalayers serveur fetch / ZIP
// IndexedDB) et InterPlanLinks.goTo (navigation avec cible pendante).
// 100 % local, aucune nouvelle surface réseau.
// =========================

(function() {
  "use strict";

  const MODAL_ID = "kta-xps-modal";
  const CACHE_TTL_MS = 120000;   // 2 min — le temps d'une session de recherche

  // Cache RAM : planId → { pts: [...], ts }
  const _cache = {};

  function _t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }
  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  // 🆕 v1.59.0 (U2) : retourne { pts, dataError } — dataError = datalayers du
  // plan injoignables (serveur off, ZIP absent) → compteur ⚠️ dans le statut.
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

  function _fermer() {
    const m = document.getElementById(MODAL_ID);
    if (m) m.remove();
  }

  // Entrée principale. initialQuery optionnel (pont depuis la recherche Ctrl+K).
  // 🆕 v1.60.0 (A6) : opts.onSelect(plan, pt) — mode SÉLECTION : le clic sur un
  // résultat appelle le callback au lieu de naviguer (utilisé par la modale
  // Itinéraire pour choisir une destination sur un autre plan).
  function ouvrir(initialQuery, opts) {
    opts = opts || {};
    _fermer();
    const plans = (window.PlanRegistry ? window.PlanRegistry.getAll() : []);
    if (plans.length === 0) {
      alert(_t("xps.err.noPlan"));
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
          '<div class="kta-xps-status" id="kta-xps-status"></div>' +
          '<div class="kta-ipl-results kta-xps-results" id="kta-xps-results"></div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    document.getElementById("kta-xps-close").addEventListener("click", _fermer);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _fermer(); });

    const input    = document.getElementById("kta-xps-input");
    const statusEl = document.getElementById("kta-xps-status");
    const resEl    = document.getElementById("kta-xps-results");

    // Index en construction : [{plan, pt}] — rempli par le scan progressif.
    let _index = [];
    let _scanDone = false;

    function _renderResults() {
      const f = String(input.value || "").toLowerCase().trim();
      if (!f) {
        resEl.innerHTML = '<p class="kta-ipl-empty">' + _esc(_t("xps.hintType")) + '</p>';
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
      // 🆕 v1.60.0 (A6) : bouton 🧭 « itinéraire via portail » sur les
      // résultats DISTANTS — seulement si un plan est chargé (le calcul part
      // de la position tracker sur le plan courant) et hors mode sélection.
      const _planCharge = !!(window.PLAN_CONFIG && window.PLAN_CONFIG.plan);
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
          // 🆕 v1.60.0 : mode SÉLECTION (modale Itinéraire) → callback.
          if (typeof opts.onSelect === "function") {
            try { opts.onSelect(e.plan, e.pt); } catch(err) { console.warn("[CrossPlanSearch] onSelect :", err); }
            return;
          }
          // 3:a — mini-confirmation seulement si un plan est chargé (au HOME,
          // rien à interrompre → chargement direct). Même pipeline d'arrivée
          // que les portails : bascule niveau + pan/flash + bouton retour.
          // 🐛 v1.58.1 : le marqueur « plan chargé » est PLAN_CONFIG (null au
          // home) — _currentLoadedPlanId PERSISTE au retour home et affichait
          // la confirmation à tort depuis l'accueil.
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

    // Scan progressif : plan par plan (cache RAM par plan, TTL 2 min).
    // Le rendu se rafraîchit au fil de l'eau — pas d'attente bloquante.
    (async function _scan() {
      let unreachable = 0;   // 🆕 v1.59.0 (U2)
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

  window.CrossPlanSearch = { ouvrir: ouvrir };

  console.log("[CrossPlanSearch] Module chargé");
})();
