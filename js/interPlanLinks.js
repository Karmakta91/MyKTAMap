/*!
 * MyKTAMap — Liaisons inter-plan (v1.57.0)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// INTERPLANLINKS.JS — Liaisons inter-plan (« portails ») (depuis v1.57.0)
// =========================
// Lie un point A d'un plan X à un point B d'un plan Y (ex : deux réseaux
// voisins reliés par une galerie, plan général ↔ plan de détail).
//
// Architecture (décisions KARMA 1:a 2:a 3:a 4:a 5:a 6:a) :
//   - Liaison BIDIRECTIONNELLE, N liaisons par point, tout point liable
//     (session OU datalayer, des 2 côtés).
//   - « DB de croisement » = REGISTRE CENTRAL localStorage
//     `myktamap_interplan_links_v1` — AUCUNE modification des datalayers
//     (le popup d'un point est enrichi au runtime par croisement
//     (planId, pointId/coords) → l'info « remonte » côté destination sans
//     masquage ni point miroir).
//   - Chaque côté porte un SNAPSHOT (planName, pointNom, x, y, level) →
//     affichable même si le plan cible n'est pas présent sur l'appareil.
//   - Ancrage : les ids PlanRegistry sont DÉTERMINISTES (slug nom+version /
//     path) donc portables entre appareils.
//   - Navigation : mini-confirmation → switch de plan (chargerPlanServeur /
//     chargerPlanDuRegistre) → pan + flash sur le point cible.
//   - Badge 🌀 overlay (L.divIcon, non interactif) sur les points liés du
//     plan courant — rafraîchi au chargement du plan (hook main.js >
//     lancerApplication) et à chaque création/suppression.
//   - Mode datalayer « baked » : un point peut embarquer `interPlanLinks`
//     (array de liens) dans son JSON → lu au popup (merge avec le registre,
//     dédup par id). Lecture seule — « l'utiliser » sans l'éditer.
//   - Export session : la clé `interPlanLinks` embarque les liaisons du plan
//     courant (sessionExporter) ; l'import les fusionne dans le registre
//     (interfaceImportExport) → session autoportante (pattern customLegend).
//
// API : window.InterPlanLinks = {
//   getLinksForPoint(planId, point), createLink(a, b), removeLink(id),
//   getLinksForPlan(planId), importLinks(links), buildPopupHtml(point, layerId),
//   ouvrirCreation(id, x, y, nom, source), naviguerVers(linkId, side),
//   supprimerDepuisPopup(linkId), onPlanLoaded(), refreshBadges()
// };
// 100 % local, aucune surface réseau nouvelle (fetch same-origin des plans
// serveur déjà couverts par l'audit ; ZIP locaux lus depuis IndexedDB).
// =========================

(function() {
  "use strict";

  const LS_KEY = "myktamap_interplan_links_v1";

  // ---------------------------------------------------------------
  // i18n + échappement
  // ---------------------------------------------------------------
  function _t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }
  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  // ---------------------------------------------------------------
  // REGISTRE (localStorage)
  // ---------------------------------------------------------------
  function _load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.links)) return d;
      }
    } catch(e) { console.warn("[InterPlanLinks] lecture registre :", e); }
    return { version: 1, links: [] };
  }
  function _save(reg) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(reg)); }
    catch(e) { console.warn("[InterPlanLinks] écriture registre :", e); }
  }

  // Identité d'un point pour le croisement : id si non vide, sinon coords
  // arrondies (les points datalayer n'ont pas toujours d'id).
  function _pointKey(pointIdOrEmpty, x, y) {
    const id = String(pointIdOrEmpty || "").trim();
    if (id) return "id:" + id;
    return "xy:" + Math.round(Number(x) || 0) + ":" + Math.round(Number(y) || 0);
  }
  function _sideKey(side) {
    return _pointKey(side.pointId, side.x, side.y);
  }

  // Toutes les liaisons dont UN côté matche (planId, point). Retourne
  // [{ link, mySide: "a"|"b", other: <ref du côté opposé> }].
  function getLinksForPoint(planId, point) {
    if (!planId || !point) return [];
    const key = _pointKey(point.id, point.x, point.y);
    const out = [];
    _load().links.forEach(function(l) {
      if (l.a && l.a.planId === planId && _sideKey(l.a) === key) {
        out.push({ link: l, mySide: "a", other: l.b });
      } else if (l.b && l.b.planId === planId && _sideKey(l.b) === key) {
        out.push({ link: l, mySide: "b", other: l.a });
      }
    });
    return out;
  }

  function getLinksForPlan(planId) {
    if (!planId) return [];
    return _load().links.filter(function(l) {
      return (l.a && l.a.planId === planId) || (l.b && l.b.planId === planId);
    });
  }

  function createLink(refA, refB) {
    const reg = _load();
    const link = {
      id: "ipl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
      a: refA,
      b: refB,
      createdAt: new Date().toISOString()
    };
    reg.links.push(link);
    _save(reg);
    console.log("[InterPlanLinks] Liaison créée :", link.id,
                refA.planId + "/" + (refA.pointId || refA.x + "," + refA.y), "↔",
                refB.planId + "/" + (refB.pointId || refB.x + "," + refB.y));
    refreshBadges();
    return link;
  }

  function removeLink(linkId) {
    const reg = _load();
    const before = reg.links.length;
    reg.links = reg.links.filter(function(l) { return l.id !== linkId; });
    if (reg.links.length !== before) {
      _save(reg);
      refreshBadges();
      return true;
    }
    return false;
  }

  // Fusionne des liaisons importées (export session / autre appareil).
  // Dédup par id ; les liens sans id valide sont ignorés.
  function importLinks(links) {
    if (!Array.isArray(links) || links.length === 0) return 0;
    const reg = _load();
    const known = {};
    reg.links.forEach(function(l) { known[l.id] = true; });
    let added = 0;
    links.forEach(function(l) {
      if (l && typeof l.id === "string" && l.id && l.a && l.b && !known[l.id]) {
        reg.links.push(l);
        known[l.id] = true;
        added++;
      }
    });
    if (added > 0) { _save(reg); refreshBadges(); }
    console.log("[InterPlanLinks] Import : " + added + " liaison(s) ajoutée(s)");
    return added;
  }

  // ---------------------------------------------------------------
  // CONTEXTE PLAN COURANT
  // ---------------------------------------------------------------
  function _currentPlanId() {
    return window._currentLoadedPlanId || null;
  }
  function _currentPlanName() {
    return (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || _currentPlanId() || "?";
  }

  // ---------------------------------------------------------------
  // SECTION POPUP — appelée par utils.js > buildPointPopupHtml
  // ---------------------------------------------------------------
  // Synchrone (registre en localStorage). Liste les liaisons du point
  // (registre + éventuels liens EMBARQUÉS `point.interPlanLinks` d'un
  // datalayer baked, dédup par id) + bouton « Lier à un autre plan ».
  function buildPopupHtml(point, layerId) {
    const planId = _currentPlanId();
    if (!planId) return "";

    const entries = getLinksForPoint(planId, point);
    // Merge des liens baked du point (lecture seule, mode datalayer)
    if (Array.isArray(point.interPlanLinks)) {
      const seen = {};
      entries.forEach(function(e) { seen[e.link.id] = true; });
      point.interPlanLinks.forEach(function(l) {
        if (l && l.id && !seen[l.id] && l.a && l.b) {
          // Détermine le côté local par croisement planId+point
          const key = _pointKey(point.id, point.x, point.y);
          const mySide = (l.a.planId === planId && _sideKey(l.a) === key) ? "a"
                       : (l.b.planId === planId && _sideKey(l.b) === key) ? "b" : "a";
          entries.push({ link: l, mySide: mySide, other: (mySide === "a") ? l.b : l.a, baked: true });
          seen[l.id] = true;
        }
      });
    }

    let rows = "";
    entries.forEach(function(e) {
      const o = e.other || {};
      const dispo = !!(window.PlanRegistry && window.PlanRegistry.findById(o.planId));
      rows +=
        '<div class="kta-ipl-row">' +
          '<span class="kta-ipl-ico">🌀</span>' +
          '<span class="kta-ipl-label" title="' + _esc(o.planName || o.planId) + '">' +
            _esc(o.planName || o.planId) + ' · ' + _esc(o.pointNom || o.pointId || (o.x + "," + o.y)) +
          '</span>' +
          (dispo
            ? '<button class="kta-popup-btn kta-ipl-go" type="button" ' +
                "onclick=\"window.InterPlanLinks.naviguerVers('" + _esc(e.link.id) + "','" + e.mySide + "'); return false;\" " +
                'title="' + _esc(_t("ipl.popup.goTitle")) + '">➜</button>'
            : '<span class="kta-ipl-absent" title="' + _esc(_t("ipl.popup.planAbsent")) + '">⛔</span>') +
          (e.baked ? '' :
            '<button class="kta-popup-btn kta-ipl-del" type="button" ' +
              "onclick=\"window.InterPlanLinks.supprimerDepuisPopup('" + _esc(e.link.id) + "'); return false;\" " +
              'title="' + _esc(_t("ipl.popup.removeTitle")) + '">🗑️</button>') +
        '</div>';
    });

    // Bouton de création — tout point est liable (6:a), y compris datalayer.
    // 🐛 v1.57.1 : level + 1er tag passés au snapshot (la bascule de niveau à
    // l'arrivée et le check filtre tag en dépendent).
    const jsId  = String(point.id || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const jsNom = String(point.nom || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, " ");
    const source = (layerId === "editor") ? "session" : "data";
    const lvlArg = Number.isInteger(point.level) ? point.level : 0;
    const tagArg = String((Array.isArray(point.tags) && point.tags[0]) || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const addBtn =
      '<button class="kta-popup-btn kta-ipl-add" type="button" ' +
        "onclick=\"window.InterPlanLinks.ouvrirCreation('" + jsId + "'," + (Number(point.x) || 0) + "," + (Number(point.y) || 0) + ",'" + jsNom + "','" + source + "'," + lvlArg + ",'" + tagArg + "'); return false;\" " +
        'title="' + _esc(_t("ipl.popup.addTitle")) + '">' +
        '🌀 ' + _esc(_t("ipl.popup.addBtn")) +
      '</button>';

    return '<div class="kta-ipl-section">' + rows +
             '<div class="kta-popup-actions">' + addBtn + '</div>' +
           '</div>';
  }

  // Suppression depuis le popup (confirmation légère)
  function supprimerDepuisPopup(linkId) {
    const modal = document.createElement("div");
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.innerHTML =
      '<div class="kta-modal" style="max-width:380px;">' +
        '<div class="kta-modal-icon" style="color:#f4c542;">🌀</div>' +
        '<div class="kta-modal-titre">' + _esc(_t("ipl.remove.titre")) + '</div>' +
        '<div class="kta-modal-texte">' + _esc(_t("ipl.remove.texte")) + '</div>' +
        '<div class="kta-modal-actions">' +
          '<button class="kta-btn kta-btn-ghost" id="kta-ipl-rm-no" type="button">' + _esc(_t("ui.btn.cancel")) + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-ipl-rm-yes" type="button">' + _esc(_t("ipl.remove.ok")) + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);
    document.getElementById("kta-ipl-rm-no").addEventListener("click", function() { modal.remove(); });
    document.getElementById("kta-ipl-rm-yes").addEventListener("click", function() {
      removeLink(linkId);
      modal.remove();
      if (window.map) try { window.map.closePopup(); } catch(e) {}
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(_t("ipl.toast.removed"), "info");
      }
    });
    modal.addEventListener("click", function(e) { if (e.target === modal) modal.remove(); });
  }

  // ---------------------------------------------------------------
  // LECTURE DES POINTS D'UN PLAN NON CHARGÉ
  // ---------------------------------------------------------------
  // Session : localStorage myktamap_session_v1_<planId> → editorPoints[].
  // Datalayers : serveur → fetch path/plan-config.json + fichiers ;
  //              local  → ZIP IndexedDB (PlanRegistry.getBlob) via JSZip.
  // Retourne Promise<[{id, nom, x, y, tags, source, level}]>.
  async function _collecterPointsDuPlan(plan) {
    const pts = [];
    // 1) Points de session (toujours lisibles, tous types de plans)
    try {
      const raw = localStorage.getItem("myktamap_session_v1_" + plan.id);
      if (raw) {
        const sess = JSON.parse(raw);
        (sess.editorPoints || []).forEach(function(p) {
          if (p && typeof p.x === "number" && typeof p.y === "number") {
            pts.push({ id: p.id || "", nom: p.nom || "", x: p.x, y: p.y,
                       tags: p.tags || [], source: "session", level: p.level });
          }
        });
      }
    } catch(e) { console.warn("[InterPlanLinks] session " + plan.id + " illisible :", e); }

    // 2) Points des datalayers
    try {
      if (plan.type === "server" && plan.path) {
        const cfg = await (await fetch(plan.path + "/plan-config.json", { cache: "no-cache" })).json();
        const layers = (cfg && cfg.dataLayers) || [];
        for (let i = 0; i < layers.length; i++) {
          try {
            const dj = await (await fetch(plan.path + "/" + layers[i].file, { cache: "no-cache" })).json();
            (dj.data || []).forEach(function(p) {
              if (p && typeof p.x === "number" && typeof p.y === "number") {
                pts.push({ id: p.id || "", nom: p.nom || "", x: p.x, y: p.y,
                           tags: p.tags || [], source: "data", level: p.level });
              }
            });
          } catch(e) { /* layer illisible → skip */ }
        }
      } else if (plan.type === "local" && window.PlanRegistry && window.JSZip) {
        const blob = await window.PlanRegistry.getBlob(plan.id);
        if (blob) {
          const zip = await window.JSZip.loadAsync(blob);
          // plan-config.json à la racine ou 1er trouvé
          let cfgFile = zip.file("plan-config.json");
          if (!cfgFile) {
            const cand = Object.keys(zip.files).find(function(n) { return /(^|\/)plan-config\.json$/.test(n); });
            if (cand) cfgFile = zip.file(cand);
          }
          if (cfgFile) {
            const baseDir = cfgFile.name.replace(/plan-config\.json$/, "");
            const cfg = JSON.parse(await cfgFile.async("string"));
            const layers = (cfg && cfg.dataLayers) || [];
            for (let i = 0; i < layers.length; i++) {
              const f = zip.file(baseDir + layers[i].file) || zip.file(layers[i].file);
              if (!f) continue;
              try {
                const dj = JSON.parse(await f.async("string"));
                (dj.data || []).forEach(function(p) {
                  if (p && typeof p.x === "number" && typeof p.y === "number") {
                    pts.push({ id: p.id || "", nom: p.nom || "", x: p.x, y: p.y,
                               tags: p.tags || [], source: "data", level: p.level });
                  }
                });
              } catch(e) { /* skip */ }
            }
          }
        }
      }
    } catch(e) { console.warn("[InterPlanLinks] datalayers " + plan.id + " illisibles :", e); }

    return pts;
  }

  // ---------------------------------------------------------------
  // MODALE DE CRÉATION — picker plan cible → recherche point → créer
  // ---------------------------------------------------------------
  const MODAL_ID = "kta-ipl-modal";

  function _fermerModale() {
    const m = document.getElementById(MODAL_ID);
    if (m) m.remove();
  }

  function ouvrirCreation(pointId, x, y, nom, source, level, tag) {
    const planId = _currentPlanId();
    if (!planId) {
      alert(_t("ipl.err.noPlan"));
      return;
    }
    _fermerModale();
    if (window.map) try { window.map.closePopup(); } catch(e) {}

    const refA = {
      planId:   planId,
      planName: _currentPlanName(),
      pointId:  String(pointId || ""),
      pointNom: String(nom || ""),
      x: Number(x) || 0,
      y: Number(y) || 0,
      source: source === "session" ? "session" : "data",
      level:  Number.isInteger(level) ? level : 0,
      tag:    String(tag || "") || undefined
    };

    const plans = (window.PlanRegistry ? window.PlanRegistry.getAll() : [])
      .filter(function(p) { return p.id !== planId; });

    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";

    let plansHtml = "";
    if (plans.length === 0) {
      plansHtml = '<p class="kta-ipl-empty">' + _esc(_t("ipl.create.noOtherPlan")) + '</p>';
    } else {
      plans.forEach(function(p, i) {
        plansHtml +=
          '<button class="kta-ipl-plan-btn" type="button" data-idx="' + i + '">' +
            '<span class="kta-ipl-plan-ico">' + (p.type === "server" ? "🌐" : "📦") + '</span>' +
            '<span class="kta-ipl-plan-name">' + _esc(p.name || p.id) + '</span>' +
            (p.version ? '<span class="kta-ipl-plan-ver">' + _esc(p.version) + '</span>' : '') +
          '</button>';
      });
    }

    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-ipl-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">🌀 ' + _esc(_t("ipl.create.titre")) + '</span>' +
          '<button class="kta-readme-modal-close" id="kta-ipl-close" type="button" aria-label="✕">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p class="kta-ipl-src">' + _esc(_t("ipl.create.from", { point: refA.pointNom || refA.pointId || (refA.x + "," + refA.y), plan: refA.planName })) + '</p>' +
          '<div id="kta-ipl-step-plan">' +
            '<p class="kta-ipl-hint">' + _esc(_t("ipl.create.pickPlan")) + '</p>' +
            plansHtml +
          '</div>' +
          '<div id="kta-ipl-step-point" style="display:none;">' +
            '<button class="kta-btn kta-btn-ghost kta-ipl-back" id="kta-ipl-back" type="button">' + _esc(_t("ipl.create.back")) + '</button>' +
            '<p class="kta-ipl-hint" id="kta-ipl-target-plan"></p>' +
            '<input type="text" id="kta-ipl-search" class="kta-ipl-search" placeholder="' + _esc(_t("ipl.create.searchPh")) + '" autocomplete="off">' +
            '<div id="kta-ipl-results" class="kta-ipl-results"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    document.getElementById("kta-ipl-close").addEventListener("click", _fermerModale);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _fermerModale(); });

    let _targetPlan = null;
    let _targetPoints = [];

    function _renderResults(filter) {
      const box = document.getElementById("kta-ipl-results");
      if (!box) return;
      const f = String(filter || "").toLowerCase().trim();
      const matches = _targetPoints.filter(function(p) {
        if (!f) return true;
        return (p.nom && p.nom.toLowerCase().indexOf(f) !== -1)
            || (p.id && String(p.id).toLowerCase().indexOf(f) !== -1)
            || (p.tags && p.tags.join(" ").toLowerCase().indexOf(f) !== -1);
      }).slice(0, 50);
      if (matches.length === 0) {
        box.innerHTML = '<p class="kta-ipl-empty">' + _esc(_t("ipl.create.noResult")) + '</p>';
        return;
      }
      box.innerHTML = matches.map(function(p, i) {
        return '<button class="kta-ipl-pt-btn" type="button" data-i="' + i + '">' +
                 '<span class="kta-ipl-pt-ico">' + (p.source === "session" ? "✏️" : "📄") + '</span>' +
                 '<span class="kta-ipl-pt-name">' + _esc(p.nom || p.id || "(" + p.x + "," + p.y + ")") + '</span>' +
                 '<span class="kta-ipl-pt-meta">' + _esc((p.tags || []).slice(0, 2).join(", ")) + '</span>' +
               '</button>';
      }).join("");
      box.querySelectorAll(".kta-ipl-pt-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
          const p = matches[parseInt(btn.getAttribute("data-i"), 10)];
          if (!p) return;
          const refB = {
            planId:   _targetPlan.id,
            planName: _targetPlan.name || _targetPlan.id,
            pointId:  String(p.id || ""),
            pointNom: String(p.nom || ""),
            x: p.x, y: p.y,
            source: p.source,
            level: Number.isInteger(p.level) ? p.level : 0,
            tag:   (Array.isArray(p.tags) && p.tags[0]) || undefined
          };
          createLink(refA, refB);
          _fermerModale();
          if (window.OOMGuard && window.OOMGuard.showToast) {
            window.OOMGuard.showToast(_t("ipl.toast.created", { plan: refB.planName, point: refB.pointNom || refB.pointId }), "info");
          }
        });
      });
    }

    overlay.querySelectorAll(".kta-ipl-plan-btn").forEach(function(btn) {
      btn.addEventListener("click", async function() {
        _targetPlan = plans[parseInt(btn.getAttribute("data-idx"), 10)];
        if (!_targetPlan) return;
        document.getElementById("kta-ipl-step-plan").style.display = "none";
        const stepPt = document.getElementById("kta-ipl-step-point");
        stepPt.style.display = "";
        document.getElementById("kta-ipl-target-plan").textContent =
          _t("ipl.create.loadingFrom", { plan: _targetPlan.name || _targetPlan.id });
        const box = document.getElementById("kta-ipl-results");
        box.innerHTML = '<div class="kta-load-spinner" style="margin:18px auto;"></div>';
        _targetPoints = await _collecterPointsDuPlan(_targetPlan);
        document.getElementById("kta-ipl-target-plan").textContent =
          _t("ipl.create.targetPlan", { plan: _targetPlan.name || _targetPlan.id, n: _targetPoints.length });
        _renderResults("");
        const inp = document.getElementById("kta-ipl-search");
        inp.addEventListener("input", function() { _renderResults(inp.value); });
        try { inp.focus(); } catch(e) {}
      });
    });

    const backBtn = document.getElementById("kta-ipl-back");
    if (backBtn) backBtn.addEventListener("click", function() {
      document.getElementById("kta-ipl-step-point").style.display = "none";
      document.getElementById("kta-ipl-step-plan").style.display = "";
      _targetPlan = null;
      _targetPoints = [];
    });
  }

  // ---------------------------------------------------------------
  // NAVIGATION — « Y aller » (5:a : mini-confirmation puis switch + flash)
  // ---------------------------------------------------------------
  function naviguerVers(linkId, mySide) {
    const link = _load().links.find(function(l) { return l.id === linkId; })
      || _bakedLinkCache[linkId] || null;
    if (!link) { alert(_t("ipl.err.linkGone")); return; }
    const other = (mySide === "a") ? link.b : link.a;
    if (!other) return;

    const plan = window.PlanRegistry ? window.PlanRegistry.findById(other.planId) : null;
    if (!plan) { alert(_t("ipl.err.planAbsent", { plan: other.planName || other.planId })); return; }

    const modal = document.createElement("div");
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.innerHTML =
      '<div class="kta-modal" style="max-width:400px;">' +
        '<div class="kta-modal-icon" style="color:#8cb4ff;">🌀</div>' +
        '<div class="kta-modal-titre">' + _esc(_t("ipl.nav.titre")) + '</div>' +
        '<div class="kta-modal-texte">' +
          _esc(_t("ipl.nav.texte", { plan: other.planName || other.planId, point: other.pointNom || other.pointId || (other.x + "," + other.y) })) +
          '<br><span style="font-size:12px; color:#8892a4;">' + _esc(_t("ipl.nav.sessionSaved")) + '</span>' +
        '</div>' +
        '<div class="kta-modal-actions">' +
          '<button class="kta-btn kta-btn-ghost" id="kta-ipl-nav-no" type="button">' + _esc(_t("ui.btn.cancel")) + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-ipl-nav-yes" type="button">' + _esc(_t("ipl.nav.go")) + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);
    document.getElementById("kta-ipl-nav-no").addEventListener("click", function() { modal.remove(); });
    modal.addEventListener("click", function(e) { if (e.target === modal) modal.remove(); });
    document.getElementById("kta-ipl-nav-yes").addEventListener("click", async function() {
      modal.remove();
      if (window.map) try { window.map.closePopup(); } catch(e) {}
      try {
        if (plan.type === "server") {
          await window.chargerPlanServeur(plan.path, plan);
        } else if (typeof window.chargerPlanDuRegistre === "function") {
          await window.chargerPlanDuRegistre(plan.id);
        } else {
          alert(_t("ipl.err.loadFailed"));
          return;
        }
      } catch(e) {
        console.warn("[InterPlanLinks] switch plan échoué :", e);
        alert(_t("ipl.err.loadFailed"));
        return;
      }
      _consumePendingTarget();
    });
    // 🐛 v1.57.0-fix : cible posée AVANT le switch — consommée par
    // onPlanLoaded (fin de lancerApplication) ET par le fallback post-await
    // ci-dessus. Sans ça, le recentrage de session post-chargement (restore
    // SessionPersist / tracker « dernière position ») écrasait notre setView
    // → l'user arrivait sur « ma position » au lieu du point lié.
    // 🐛 v1.57.1 : level + tag embarqués → bascule de niveau à l'arrivée +
    // avertissement si un filtre de tags masque le point cible.
    _pendingTarget = { x: other.x, y: other.y, level: other.level, tag: other.tag };
    _pendingConsumed = false;
  }

  // Cible de navigation en attente (posée par naviguerVers, consommée une
  // seule fois après le chargement du plan cible).
  let _pendingTarget = null;
  let _pendingConsumed = false;

  function _consumePendingTarget() {
    if (!_pendingTarget || _pendingConsumed) return;
    _pendingConsumed = true;
    const t = _pendingTarget;
    _pendingTarget = null;

    // 🐛 v1.57.1 — BASCULE DE NIVEAU : un portail amène AU niveau du point
    // cible. Sans ça, arriver sur un plan multi-niveau affiché sur un autre
    // niveau laissait le POI invisible (opacity 0 par le filtre) — l'user ne
    // voyait que le badge 🌀 (« badge sans l'icône »).
    if (Number.isInteger(t.level) && window.APP_CONFIG
        && Array.isArray(window.APP_CONFIG.visibleLevels)
        && window.APP_CONFIG.visibleLevels.indexOf(t.level) === -1
        && typeof window._changerNiveauActif === "function") {
      try {
        window._changerNiveauActif(t.level);
        console.log("[InterPlanLinks] Bascule niveau → " + t.level + " (niveau du point cible)");
      } catch(e) { console.warn("[InterPlanLinks] bascule niveau échouée :", e); }
    }

    // 🐛 v1.57.1 — FILTRE TAG : si un filtre de tags runtime est actif et
    // masque le tag du point cible, on N'Y TOUCHE PAS (jamais de reset de
    // filtre sans avertir — règle projet) mais on prévient l'user par toast.
    if (t.tag && window._ktaRuntimeFilters && window._ktaRuntimeFilters.tags
        && typeof window._ktaRuntimeFilters.tags.has === "function"
        && !window._ktaRuntimeFilters.tags.has(t.tag)) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(_t("ipl.nav.hiddenByFilter"), "warn");
      }
    }

    // Triple passe : le restore de session (SessionPersist) et le tracker
    // (« démarrage sur la dernière position », v1.49.0) recentrent la vue en
    // async APRÈS la fin de lancerApplication. On repasse derrière eux à
    // +600 ms (setView + flash), puis +1600/+2600 ms (setView silencieux)
    // pour garder la main sur la vue finale.
    _panEtFlash(t.x, t.y, true);
    setTimeout(function() { _panEtFlash(t.x, t.y, false); }, 1600);
    setTimeout(function() { _panEtFlash(t.x, t.y, false); }, 2600);
  }

  // Pan (+ flash optionnel) sur le point cible. Retry léger si la map du
  // nouveau plan n'est pas encore opérationnelle.
  function _panEtFlash(x, y, withFlash, attempt) {
    attempt = attempt || 0;
    const mapOk = window.map && typeof window.map.setView === "function"
                  && typeof window.convertCoord === "function";
    if (!mapOk) {
      if (attempt < 10) setTimeout(function() { _panEtFlash(x, y, withFlash, attempt + 1); }, 400);
      return;
    }
    try {
      const latlng = window.convertCoord(x, y);
      window.map.setView(latlng, window.map.getZoom(), { animate: false });
      if (withFlash) {
        const flash = L.circleMarker(latlng, {
          radius: 24, color: "#8cb4ff", fillColor: "#8cb4ff",
          fillOpacity: 0, weight: 3, opacity: 0.9, interactive: false
        }).addTo(window.map);
        setTimeout(function() { try { window.map.removeLayer(flash); } catch(e) {} }, 3500);
      }
    } catch(e) { console.warn("[InterPlanLinks] pan/flash échoué :", e); }
  }

  // Cache des liens baked rencontrés au popup (pour naviguerVers depuis un
  // lien embarqué absent du registre). Rempli par buildPopupHtml.
  const _bakedLinkCache = {};
  const _origBuildPopupHtml = buildPopupHtml;
  buildPopupHtml = function(point, layerId) {
    if (Array.isArray(point && point.interPlanLinks)) {
      point.interPlanLinks.forEach(function(l) {
        if (l && l.id) _bakedLinkCache[l.id] = l;
      });
    }
    return _origBuildPopupHtml(point, layerId);
  };

  // ---------------------------------------------------------------
  // BADGES 🌀 sur les points liés du plan courant (4:a)
  // ---------------------------------------------------------------
  let _badgeLayer = null;

  function refreshBadges() {
    // Guard renforcé : au HOME, window.map peut exister sans être une map
    // Leaflet opérationnelle (shell du script inline) → addLayer absent.
    if (!window.map || typeof window.map.addLayer !== "function"
        || typeof window.map.removeLayer !== "function"
        || typeof window.convertCoord !== "function") return;
    if (_badgeLayer) {
      try { window.map.removeLayer(_badgeLayer); } catch(e) {}
      _badgeLayer = null;
    }
    const planId = _currentPlanId();
    if (!planId) return;
    const links = getLinksForPlan(planId);
    if (links.length === 0) return;

    // 🐛 v1.57.1 — le badge respecte le FILTRE DE NIVEAU courant (comme les
    // markers `_ktaLevel`) : un badge sans son icône était incohérent (« j'ai
    // juste le badge portail sans l'icône »). Re-render au changement de
    // niveau via le hook dans appliquerFiltreNiveau (interfaceConfig.js).
    const visibleLevels = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
      ? window.APP_CONFIG.visibleLevels : null;

    const group = L.layerGroup();
    const seen = {};
    links.forEach(function(l) {
      [l.a, l.b].forEach(function(side) {
        if (!side || side.planId !== planId) return;
        if (visibleLevels && visibleLevels.indexOf(Number.isInteger(side.level) ? side.level : 0) === -1) return;
        const k = _sideKey(side);
        if (seen[k]) return;
        seen[k] = true;
        try {
          // 🐛 v1.57.0-fix : badge CENTRÉ AU-DESSUS de l'icône du point
          // (ancre [11, 56] = le badge 22px flotte au-dessus d'une icône
          // ~40px ancrée bas) + zIndexOffset élevé pour passer PAR-DESSUS
          // tous les markers. Taille/contraste renforcés (CSS .kta-ipl-badge).
          const m = L.marker(window.convertCoord(side.x, side.y), {
            icon: L.divIcon({
              className: "kta-ipl-badge-wrap",
              html: '<div class="kta-ipl-badge">🌀</div>',
              iconSize: [22, 22],
              iconAnchor: [11, 56]
            }),
            interactive: false,
            keyboard: false,
            zIndexOffset: 2000
          });
          group.addLayer(m);
        } catch(e) {}
      });
    });
    group.addTo(window.map);
    _badgeLayer = group;
  }

  // Hook appelé par main.js à la fin de lancerApplication (plan prêt).
  function onPlanLoaded() {
    // Léger différé : laisse la map finir son premier rendu.
    setTimeout(refreshBadges, 400);
    // 🐛 v1.57.0-fix : consomme la cible de navigation pendante (« Y aller »
    // depuis une liaison) — repasse derrière les recentrages de session.
    setTimeout(_consumePendingTarget, 600);
  }

  // 🐛 v1.57.0-fix : purge des liaisons d'un point SUPPRIMÉ (hook appelé par
  // editor.js > supprimerPointEditor). Le lien entier est retiré (une liaison
  // sans l'un de ses deux bouts n'a plus de sens) → le badge disparaît
  // immédiatement, des 2 côtés du registre.
  function onPointDeleted(planId, point) {
    if (!planId || !point) return 0;
    const key = _pointKey(point.id, point.x, point.y);
    const reg = _load();
    const before = reg.links.length;
    reg.links = reg.links.filter(function(l) {
      const matchA = l.a && l.a.planId === planId && _sideKey(l.a) === key;
      const matchB = l.b && l.b.planId === planId && _sideKey(l.b) === key;
      return !matchA && !matchB;
    });
    const removed = before - reg.links.length;
    if (removed > 0) {
      _save(reg);
      refreshBadges();
      console.log("[InterPlanLinks] " + removed + " liaison(s) purgée(s) (point supprimé)");
    }
    return removed;
  }

  // ---------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------
  window.InterPlanLinks = {
    getLinksForPoint:     getLinksForPoint,
    getLinksForPlan:      getLinksForPlan,
    createLink:           createLink,
    removeLink:           removeLink,
    importLinks:          importLinks,
    buildPopupHtml:       function(point, layerId) { return buildPopupHtml(point, layerId); },
    ouvrirCreation:       ouvrirCreation,
    naviguerVers:         naviguerVers,
    supprimerDepuisPopup: supprimerDepuisPopup,
    onPlanLoaded:         onPlanLoaded,
    onPointDeleted:       onPointDeleted,
    refreshBadges:        refreshBadges
  };

  console.log("[InterPlanLinks] Module chargé (" + _load().links.length + " liaison(s))");
})();
