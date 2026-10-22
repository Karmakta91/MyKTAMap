/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERPLANLINKS.JS — Liaisons inter-plan (« portails »)
// =========================
// Lie un point A d'un plan X à un point B d'un plan Y (réseaux voisins reliés par une galerie, plan général ↔
// plan de détail).
//   - Liaison BIDIRECTIONNELLE, N liaisons par point, tout point liable (session OU calque, des deux côtés).
//   - Registre central localStorage `myktamap_interplan_links_v1` : AUCUNE modification des calques ; le popup
//     d'un point est enrichi au runtime par croisement (planId, pointId/coords).
//   - Chaque côté porte un SNAPSHOT (planName, pointNom, x, y, level) : affichable même si le plan cible n'est
//     pas sur l'appareil. Les ids PlanRegistry sont DÉTERMINISTES (slug nom+version / path) donc portables.
//   - Navigation : mini-confirmation → changement de plan → pan + flash sur le point cible.
//   - Marquage visuel : CHOIX de l'utilisateur par le tag intégré « portail » (pas de badge automatique).
//   - Calque « baked » : un point peut embarquer `interPlanLinks` (lecture seule, fusionné au popup, dédup par id).
//   - Export de session : la clé `interPlanLinks` emporte les liaisons du plan ; l'import les fusionne.
//   - Extension (contrat community-server-line.md §3) : `mktm:liaisons-changees` après chaque écriture,
//     `appliquerExterne` pour ce qu'elle dépose, prises liaisonInfo / liaisonActions / liaisonModifiable. Sans
//     extension : rien n'écoute, rien ne change.
// API : window.InterPlanLinks = {
//   getLinksForPoint(planId, point), createLink(a, b), removeLink(id),
//   getLinksForPlan(planId), importLinks(links), buildPopupHtml(point, layerId),
//   ouvrirCreation(id, x, y, nom, source), naviguerVers(linkId, side),
//   supprimerDepuisPopup(linkId), onPlanLoaded(), refreshBadges(), onPointMoved / onPointLevelChanged,
//   appliquerExterne({ liens, retirer })
// };
// Local, aucune surface réseau nouvelle (fetch same-origin des plans serveur, ZIP locaux en IndexedDB).
// Garde-fous : check-uid.js, check-repositionner.js, check-xss.js. Doc : docs/architecture/multilevel-pathfinding.md.

(function() {
  "use strict";

  // « Un plan est-il AFFICHÉ ? » : source unique window.ktaPlanAffiche (utils.js). 🩸 `PLAN_CONFIG.plan` reste
  // VRAI à l'accueil (afficherLoader ne le remet pas à null) : confirmation « changer de plan ? » depuis l'accueil
  // et chemin court « déjà sur ce plan » pris à tort dans goTo (le clic ne chargeait rien).
  function _planAffiche() {
    return (typeof window.ktaPlanAffiche === "function")
      ? window.ktaPlanAffiche()
      : !!(window.PLAN_CONFIG && window.PLAN_CONFIG.plan);
  }

  const LS_KEY = "myktamap_interplan_links_v1";

  // ── i18n + échappement ──────────
  function _t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }
  function _esc(s) { return window.ktaEsc(s); }   // échappeur unique (js/langManager.js)

  // ── Registre (localStorage) ──────────
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

  // ⚠️ Contrat : `mktm:liaisons-changees` { ids, action: "creation" | "modification" | "suppression", source? },
  // émis APRÈS l'écriture du registre. `source: "extension"` = déposé par appliquerExterne (à ne pas renvoyer) ;
  // `"import"` = fusion d'un export (pas un geste de création). Sans écouteur : sans effet.
  function _annoncer(ids, action, source) {
    if (!ids || ids.length === 0) return;
    const detail = { ids: ids.slice(), action: action };
    if (source) detail.source = source;
    try { window.dispatchEvent(new CustomEvent("mktm:liaisons-changees", { detail: detail })); } catch(e) { /* rien */ }
  }
  // Date de la dernière écriture d'une liaison (ms) : une extension qui la synchronise fusionne dessus.
  function _toucher(l) { l.updatedAt = Date.now(); }

  // Prises d'extension (js/ktaExtensions.js). Sans extension : info vide, aucune action, tout est modifiable.
  function _ext() { return window.KtaExtensions || null; }
  function _modifiable(l) {
    const K = _ext();
    return !K || typeof K.liaisonModifiable !== "function" || K.liaisonModifiable(l) !== false;
  }
  function _infoExt(l) {
    const K = _ext();
    return (K && typeof K.liaisonInfo === "function") ? (K.liaisonInfo(l) || "") : "";
  }
  function _actionsExt(l) {
    const K = _ext();
    return (K && typeof K.liaisonActions === "function") ? (K.liaisonActions(l) || []) : [];
  }

  // Identité d'un point pour le croisement : id si non vide, sinon coords arrondies (les points de calque n'ont
  // pas toujours d'id).
  function _pointKey(pointIdOrEmpty, x, y) {
    const id = String(pointIdOrEmpty || "").trim();
    if (id) return "id:" + id;
    return "xy:" + Math.round(Number(x) || 0) + ":" + Math.round(Number(y) || 0);
  }
  function _sideKey(side) {
    return _pointKey(side.pointId, side.x, side.y);
  }
  // Un côté de liaison désigne-t-il CE point ? L'uid d'abord (`pointUid`) : par le nom, supprimer un point
  // effacerait aussi les liaisons de ses HOMONYMES. Repli nom / coords pour un côté ancien ou un point sans uid.
  // `ancX/ancY` : position du repli par coords (déplacement).
  function _coteDuPoint(side, planId, point, ancX, ancY) {
    if (!side || side.planId !== planId || !point) return false;
    if (side.pointUid && point.uid) return side.pointUid === point.uid;
    const x = (ancX !== undefined) ? ancX : point.x, y = (ancY !== undefined) ? ancY : point.y;
    return _sideKey(side) === _pointKey(point.id, x, y);
  }

  // Liaisons dont UN côté correspond à (planId, point) : [{ link, mySide: "a"|"b", other }].
  function getLinksForPoint(planId, point) {
    if (!planId || !point) return [];
    const out = [];
    _load().links.forEach(function(l) {
      if (_coteDuPoint(l.a, planId, point)) {
        out.push({ link: l, mySide: "a", other: l.b });
      } else if (_coteDuPoint(l.b, planId, point)) {
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

  // Registre complet en lecture (copie défensive) : le méta-graphe d'interPlanRoute construit l'adjacence sans
  // parcourir plan par plan.
  function getAllLinks() {
    return _load().links.slice();
  }

  function createLink(refA, refB) {
    const reg = _load();
    const link = {
      id: "ipl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
      a: refA,
      b: refB,
      createdAt: new Date().toISOString(),
      updatedAt: Date.now()
    };
    reg.links.push(link);
    _save(reg);
    _annoncer([link.id], "creation");
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
      _annoncer([linkId], "suppression");
      refreshBadges();
      return true;
    }
    return false;
  }

  // Dépôt d'une extension : `liens` remplacent ou ajoutent (par id), `retirer` = ids à enlever. N'annonce qu'avec
  // `source: "extension"` (elle ne se renvoie pas ses propres dépôts). Lien sans id ou sans ses deux côtés : ignoré.
  // Rend { ecrites, retirees }.
  function appliquerExterne(lot) {
    const liens = (lot && Array.isArray(lot.liens)) ? lot.liens : [];
    const retirer = (lot && Array.isArray(lot.retirer)) ? lot.retirer : [];
    const reg = _load();
    const ecrits = [], retires = [];
    liens.forEach(function(l) {
      if (!l || typeof l.id !== "string" || !l.id || !l.a || !l.b ||
          typeof l.a.planId !== "string" || typeof l.b.planId !== "string") return;
      const i = reg.links.findIndex(function(x) { return x.id === l.id; });
      if (i >= 0) reg.links[i] = l; else reg.links.push(l);
      ecrits.push(l.id);
    });
    if (retirer.length) {
      const set = {};
      retirer.forEach(function(id) { set[String(id)] = true; });
      reg.links = reg.links.filter(function(l) {
        if (!set[l.id]) return true;
        retires.push(l.id);
        return false;
      });
    }
    if (ecrits.length || retires.length) {
      _save(reg);
      _annoncer(ecrits, "modification", "extension");
      _annoncer(retires, "suppression", "extension");
    }
    return { ecrites: ecrits.length, retirees: retires.length };
  }

  // Les liaisons d'un plan passent sous un autre id (copie locale remplacée par sa version publiée). Rend le
  // nombre de côtés réécrits.
  function transfererPlan(ancienId, nouveauId) {
    if (!ancienId || !nouveauId || ancienId === nouveauId) return 0;
    const reg = _load();
    let n = 0;
    const ids = [];
    reg.links.forEach(function(l) {
      let touche = false;
      ["a", "b"].forEach(function(k) { if (l[k] && l[k].planId === ancienId) { l[k].planId = nouveauId; n++; touche = true; } });
      if (touche) { _toucher(l); ids.push(l.id); }
    });
    if (n) { _save(reg); _annoncer(ids, "modification"); }
    return n;
  }

  // Fusionne des liaisons importées (export de session, autre appareil) ; dédup par id, liens sans id ignorés.
  function importLinks(links) {
    if (!Array.isArray(links) || links.length === 0) return 0;
    const reg = _load();
    const known = {};
    reg.links.forEach(function(l) { known[l.id] = true; });
    const ids = [];
    links.forEach(function(l) {
      if (l && typeof l.id === "string" && l.id && l.a && l.b && !known[l.id]) {
        reg.links.push(l);
        known[l.id] = true;
        ids.push(l.id);
      }
    });
    const added = ids.length;
    if (added > 0) { _save(reg); _annoncer(ids, "creation", "import"); refreshBadges(); }
    console.log("[InterPlanLinks] Import : " + added + " liaison(s) ajoutée(s)");
    return added;
  }

  // ── Contexte plan courant ──────────
  function _currentPlanId() {
    return window._currentLoadedPlanId || null;
  }
  function _currentPlanName() {
    return (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || _currentPlanId() || "?";
  }

  // ── Section popup (utils.js > buildPointPopupHtml) ──────────
  // Synchrone : liaisons du point (registre + liens EMBARQUÉS `point.interPlanLinks`, dédup par id) + bouton
  // « Lier à un autre plan ».
  function buildPopupHtml(point, layerId) {
    const planId = _currentPlanId();
    if (!planId) return "";

    const entries = getLinksForPoint(planId, point);
    if (Array.isArray(point.interPlanLinks)) {
      const seen = {};
      entries.forEach(function(e) { seen[e.link.id] = true; });
      point.interPlanLinks.forEach(function(l) {
        if (l && l.id && !seen[l.id] && l.a && l.b) {
          // Côté local par croisement planId + point.
          const mySide = _coteDuPoint(l.a, planId, point) ? "a"
                       : _coteDuPoint(l.b, planId, point) ? "b" : "a";
          entries.push({ link: l, mySide: mySide, other: (mySide === "a") ? l.b : l.a, baked: true });
          seen[l.id] = true;
        }
      });
    }

    let rows = "";
    entries.forEach(function(e) {
      const o = e.other || {};
      const dispo = !!(window.PlanRegistry && window.PlanRegistry.findById(o.planId));
      const info = e.baked ? "" : _infoExt(e.link);
      rows +=
        '<div class="kta-ipl-row">' +
          '<span class="kta-ipl-ico">🌀</span>' +
          '<span class="kta-ipl-label" title="' + _esc(o.planName || o.planId) + '">' +
            _esc(o.planName || o.planId) + ' · ' + _esc(o.pointNom || o.pointId || (o.x + "," + o.y)) +
          '</span>' +
          (dispo
            ? '<button class="kta-popup-btn kta-ipl-go" type="button" data-kta-act="ipl-go" ' +
                'data-kta-lien="' + _esc(e.link.id) + '" data-kta-cote="' + (e.mySide === "b" ? "b" : "a") + '" ' +
                'title="' + _esc(_t("ipl.popup.goTitle")) + '">➜</button>'
            : '<span class="kta-ipl-absent" title="' + _esc(_t("ipl.popup.planAbsent")) + '">⛔</span>') +
          ((e.baked || !_modifiable(e.link)) ? '' :
            '<button class="kta-popup-btn kta-ipl-del" type="button" data-kta-act="ipl-del" ' +
              'data-kta-lien="' + _esc(e.link.id) + '" ' +
              'title="' + _esc(_t("ipl.popup.removeTitle")) + '">🗑️</button>') +
        '</div>' +
        (info ? '<div class="kta-popup-ext-info kta-ipl-ext-info">' + _esc(info) + '</div>' : '');
    });

    // Création : tout point est liable, calques compris. level + 1er tag vont au snapshot (bascule de niveau à
    // l'arrivée, contrôle du filtre de tags).
    // 🔒 Valeurs en data-* échappées, action par l'écouteur de la fiche (utils.js > _ktaPopupAction) : jamais
    // de donnée du point ou du plan dans un onclick (XSS).
    const source = (layerId === "editor") ? "session" : "data";
    const lvlArg = Number.isInteger(point.level) ? point.level : 0;
    const tagArg = String((Array.isArray(point.tags) && point.tags[0]) || "");
    const addBtn =
      '<button class="kta-popup-btn kta-ipl-add" type="button" data-kta-act="ipl-add" ' +
        'data-kta-id="' + _esc(point.id || "") + '" data-kta-x="' + (Number(point.x) || 0) + '" data-kta-y="' + (Number(point.y) || 0) + '" ' +
        'data-kta-nom="' + _esc(point.nom || "") + '" data-kta-source="' + source + '" data-kta-niveau="' + lvlArg + '" ' +
        'data-kta-tag="' + _esc(tagArg) + '" data-kta-point-uid="' + _esc(point.uid || "") + '" ' +   // pas data-kta-uid : réservé à la fiche (prises d'extension)
        'title="' + _esc(_t("ipl.popup.addTitle")) + '">' +
        '🌀 ' + _esc(_t("ipl.popup.addBtn")) +
      '</button>';

    return '<div class="kta-ipl-section">' + rows +
             '<div class="kta-popup-actions">' + addBtn + '</div>' +
           '</div>';
  }

  // Confirmation de suppression partagée (popup + gestionnaire) ; onDone après suppression effective.
  function _confirmerSuppression(linkId, onDone) {
    const lienVise = _load().links.find(function(l) { return l.id === linkId; });
    const infoExt = lienVise ? _infoExt(lienVise) : "";
    const modal = document.createElement("div");
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.style.zIndex = "100002";   // au-dessus du gestionnaire (99999)
    modal.innerHTML =
      '<div class="kta-modal" style="max-width:380px;">' +
        '<div class="kta-modal-icon" style="color:var(--kta-accent-texte);">🌀</div>' +
        '<div class="kta-modal-titre">' + _esc(_t("ipl.remove.titre")) + '</div>' +
        '<div class="kta-modal-texte">' + _esc(_t("ipl.remove.texte")) + '</div>' +
        (infoExt ? '<div class="kta-modal-texte kta-popup-ext-info">' + _esc(infoExt) + '</div>' : '') +
        '<div class="kta-modal-actions">' +
          '<button class="kta-btn kta-btn-ghost" id="kta-ipl-rm-no" type="button">' + _esc(_t("ui.btn.cancel")) + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-ipl-rm-yes" type="button">' + _esc(_t("ipl.remove.ok")) + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);
    document.getElementById("kta-ipl-rm-no").addEventListener("click", function() { modal.remove(); });
    document.getElementById("kta-ipl-rm-yes").addEventListener("click", function() {
      // 🔒 L'extension peut refuser (liaison qu'elle synchronise sans droit de la modifier) : rien n'est retiré.
      const lien = _load().links.find(function(l) { return l.id === linkId; });
      if (lien && !_modifiable(lien)) {
        modal.remove();
        if (window.OOMGuard && window.OOMGuard.showToast) window.OOMGuard.showToast(_t("ipl.remove.refuse"), "warn");
        return;
      }
      removeLink(linkId);
      modal.remove();
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(_t("ipl.toast.removed"), "info");
      }
      if (typeof onDone === "function") { try { onDone(); } catch(e) {} }
    });
    modal.addEventListener("click", function(e) { if (e.target === modal) modal.remove(); });
  }

  function supprimerDepuisPopup(linkId) {
    _confirmerSuppression(linkId, function() {
      if (window.map) try { window.map.closePopup(); } catch(e) {}
    });
  }

  // ── Écart de calage d'une liaison ──────────
  // Les deux bouts d'un portail désignent LE MÊME endroit vu depuis deux plans : projetés en GPS par le géoréf
  // de LEUR plan, ils devraient coïncider. Leur distance mesure la qualité du calage.
  // ⚠️ null (pas 0) quand la mesure est IMPOSSIBLE (plan absent, pas de géoréf) : 0 voudrait dire « calage
  // parfait ». Les deux cas ne doivent jamais se confondre.
  // ⚠️ Fonction UNIQUE, exposée en `InterPlanLinks.ecartCalage` : la Vue OSM la consomme au lieu d'en faire une
  // copie (une copie locale finit toujours par diverger).
  function ecartCalage(link) {
    if (!link || !link.a || !link.b) return null;
    if (!window.KmzExport || typeof window.KmzExport.getCalibration !== "function") return null;
    const gA = window.KmzExport.getCalibration(link.a.planId);
    const gB = window.KmzExport.getCalibration(link.b.planId);
    if (!gA || !gB) return null;
    let pa, pb;
    try {
      const tA = window.KmzExport.buildTransformCalib(gA);
      const tB = window.KmzExport.buildTransformCalib(gB);
      pa = window.KmzExport.planToGps(tA, Number(link.a.x) || 0, Number(link.a.y) || 0);
      pb = window.KmzExport.planToGps(tB, Number(link.b.x) || 0, Number(link.b.y) || 0);
    } catch (e) { return null; }
    if (!pa || !pb) return null;
    if (![pa.lat, pa.lng, pb.lat, pb.lng].every(Number.isFinite)) return null;
    // Haversine sans Leaflet : appelé depuis l'accueil, où aucune carte n'existe.
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (pb.lat - pa.lat) * rad, dLng = (pb.lng - pa.lng) * rad;
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(pa.lat * rad) * Math.cos(pb.lat * rad) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // ── Gestionnaire de liaisons (vue globale du registre) ──────────
  // Toutes les liaisons (tous plans, date décroissante) : A ⇄ B, disponibilité (⛔ plan absent de l'appareil),
  // ➜ vers chaque côté disponible, 🗑️ suppression. Ouvert depuis l'accueil, sans plan chargé (➜ passe par goTo).
  const MGR_ID = "kta-ipl-mgr-modal";

  function ouvrirGestionnaire() {
    const ex = document.getElementById(MGR_ID);
    if (ex) ex.remove();

    const overlay = document.createElement("div");
    overlay.id = MGR_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-ipl-boite kta-ipl-mgr-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">🌀 ' + _esc(_t("ipl.mgr.titre")) + '</span>' +
          '<button class="kta-readme-modal-close" id="kta-ipl-mgr-close" type="button" aria-label="✕">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          // Bascule Liste ⇄ Graphe.
          '<div class="kta-ipl-mgr-toggle">' +
            '<button class="kta-btn kta-btn-primary" id="kta-ipl-mgr-vlist" type="button">📋 ' + _esc(_t("ipl.mgr.viewList")) + '</button>' +
            '<button class="kta-btn kta-btn-ghost" id="kta-ipl-mgr-vgraph" type="button">🕸️ ' + _esc(_t("ipl.mgr.viewGraph")) + '</button>' +
          '</div>' +
          '<p class="kta-ipl-hint" id="kta-ipl-mgr-count"></p>' +
          '<div id="kta-ipl-mgr-filter"></div>' +
          '<div class="kta-ipl-results" id="kta-ipl-mgr-list"></div>' +
          '<div class="kta-pnet-wrap" id="kta-ipl-mgr-graph" style="display:none;"></div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    document.getElementById("kta-ipl-mgr-close").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });

    function _sideHtml(side) {
      const dispo = !!(window.PlanRegistry && window.PlanRegistry.findById(side.planId));
      return '<span class="kta-ipl-mgr-side' + (dispo ? '' : ' kta-ipl-mgr-absent') + '">' +
               (dispo ? '' : '⛔ ') +
               _esc(side.planName || side.planId) + ' · ' +
               _esc(side.pointNom || side.pointId || (side.x + "," + side.y)) +
             '</span>';
    }

    // Filtre de FRONTIÈRE : clic sur une arête du graphe → seules les liaisons entre ces 2 plans (chip ✕).
    let _filterPair = null;   // { a: planId, b: planId } ou null

    function _renderFilterChip() {
      const el = document.getElementById("kta-ipl-mgr-filter");
      if (!el) return;
      if (!_filterPair) { el.innerHTML = ""; return; }
      const nomPlan = function(pid) {
        const p = window.PlanRegistry && window.PlanRegistry.findById(pid);
        return (p && p.name) || pid;
      };
      el.innerHTML =
        '<span class="kta-ipl-mgr-chip">' +
          _esc(_t("ipl.mgr.filterPair", { a: nomPlan(_filterPair.a), b: nomPlan(_filterPair.b) })) +
          ' <button type="button" id="kta-ipl-mgr-chip-x" title="' + _esc(_t("ipl.mgr.filterClear")) + '">✕</button>' +
        '</span>';
      const x = document.getElementById("kta-ipl-mgr-chip-x");
      if (x) x.addEventListener("click", function() { _filterPair = null; _render(); });
    }

    // Écart de calage affiché SEULEMENT s'il est mesurable (pas de « — » qui ferait croire à un défaut sur la
    // plupart des lignes). AUCUN seuil de couleur (décision produit) : 20 m, énorme sur une petite carrière,
    // négligeable sur 5 km ; l'utilisateur juge.
    function _ecartHtml(l) {
      const m = (typeof ecartCalage === "function") ? ecartCalage(l) : null;
      if (m === null || !isFinite(m)) return "";
      const txt = window.formatDistance ? window.formatDistance(m, 0) : (Math.round(m) + " m");
      return '<div class="kta-ipl-mgr-ecart" title="' + _esc(_t("ipl.mgr.ecartTitre")) + '">' +
               '📐 ' + _esc(_t("ipl.mgr.ecart", { d: txt })) +
             '</div>';
    }

    function _render() {
      let links = _load().links.slice().sort(function(a, b) {
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
      if (_filterPair) {
        links = links.filter(function(l) {
          if (!l.a || !l.b) return false;
          return (l.a.planId === _filterPair.a && l.b.planId === _filterPair.b)
              || (l.a.planId === _filterPair.b && l.b.planId === _filterPair.a);
        });
      }
      _renderFilterChip();
      const countEl = document.getElementById("kta-ipl-mgr-count");
      const listEl  = document.getElementById("kta-ipl-mgr-list");
      if (!countEl || !listEl) return;
      countEl.textContent = _t("ipl.mgr.count", { n: links.length });
      if (links.length === 0) {
        listEl.innerHTML = '<p class="kta-ipl-empty">' + _esc(_t("ipl.mgr.empty")) + '</p>';
        return;
      }
      const actionsExt = [];
      listEl.innerHTML = links.map(function(l, i) {
        const dispoA = !!(window.PlanRegistry && window.PlanRegistry.findById(l.a.planId));
        const dispoB = !!(window.PlanRegistry && window.PlanRegistry.findById(l.b.planId));
        const info = _infoExt(l);
        const acts = _actionsExt(l);
        actionsExt[i] = acts;
        return '<div class="kta-ipl-mgr-row" data-i="' + i + '" data-kta-lien="' + _esc(l.id) + '">' +
                 '<div class="kta-ipl-mgr-sides">' +
                   _sideHtml(l.a) + '<span class="kta-ipl-mgr-arrow">⇄</span>' + _sideHtml(l.b) +
                 '</div>' +
                 _ecartHtml(l) +
                 (info ? '<div class="kta-popup-ext-info kta-ipl-ext-info">' + _esc(info) + '</div>' : '') +
                 '<div class="kta-ipl-mgr-actions">' +
                   (dispoA ? '<button class="kta-popup-btn kta-ipl-go" type="button" data-go="a" title="' +
                     _esc(_t("ipl.mgr.goSide", { plan: l.a.planName || l.a.planId })) + '">➜ A</button>' : '') +
                   (dispoB ? '<button class="kta-popup-btn kta-ipl-go" type="button" data-go="b" title="' +
                     _esc(_t("ipl.mgr.goSide", { plan: l.b.planName || l.b.planId })) + '">➜ B</button>' : '') +
                   acts.map(function(a, j) {
                     return '<button class="kta-popup-btn kta-ipl-ext" type="button" data-ext="' + j + '">' +
                       _esc(a.libelle) + '</button>';
                   }).join("") +
                   (_modifiable(l) ? '<button class="kta-popup-btn kta-ipl-del" type="button" data-del="1" title="' +
                     _esc(_t("ipl.popup.removeTitle")) + '">🗑️</button>' : '') +
                 '</div>' +
               '</div>';
      }).join("");
      listEl.querySelectorAll(".kta-ipl-mgr-row").forEach(function(row) {
        const l = links[parseInt(row.getAttribute("data-i"), 10)];
        if (!l) return;
        row.querySelectorAll("[data-go]").forEach(function(btn) {
          btn.addEventListener("click", function() {
            const side = (btn.getAttribute("data-go") === "a") ? l.a : l.b;
            overlay.remove();
            goTo(side.planId, {
              x: side.x, y: side.y, level: side.level, tag: side.tag,
              planName: side.planName,
              label: side.pointNom || side.pointId || (side.x + "," + side.y)
            }, { confirm: _planAffiche() });
          });
        });
        const del = row.querySelector("[data-del]");
        if (del) del.addEventListener("click", function() {
          _confirmerSuppression(l.id, _render);
        });
        const acts = actionsExt[Number.parseInt(row.getAttribute("data-i"), 10)] || [];
        row.querySelectorAll("[data-ext]").forEach(function(btn) {
          const a = acts[Number.parseInt(btn.getAttribute("data-ext"), 10)];
          if (a) btn.addEventListener("click", function() {
            try { a.action(); } catch(e) { console.warn("[InterPlanLinks] action d'extension :", e); }
          });
        });
      });
    }

    // Bascule Liste ⇄ Graphe : graphe re-rendu à chaque bascule (données fraîches, taille réelle).
    const vList  = document.getElementById("kta-ipl-mgr-vlist");
    const vGraph = document.getElementById("kta-ipl-mgr-vgraph");
    const listEl  = document.getElementById("kta-ipl-mgr-list");
    const graphEl = document.getElementById("kta-ipl-mgr-graph");
    function _basculer(graphe) {
      listEl.style.display  = graphe ? "none" : "";
      graphEl.style.display = graphe ? "" : "none";
      document.getElementById("kta-ipl-mgr-filter").style.display = graphe ? "none" : "";
      vList.className  = "kta-btn " + (graphe ? "kta-btn-ghost" : "kta-btn-primary");
      vGraph.className = "kta-btn " + (graphe ? "kta-btn-primary" : "kta-btn-ghost");
      if (graphe && window.PlanNetwork) {
        window.PlanNetwork.render(graphEl, {
          // Clic nœud = ouvrir le plan (ancré sur son premier portail si possible, sinon simple changement).
          onOpenPlan: function(planId, anchorSide) {
            // 🩸 GHOST CLICK : le nœud réagit au pointerup ; retirer l'overlay ICI fait tomber le click suivant
            // sur l'accueil découvert, pile sur la zone « Charger un plan » (tout click y ouvre le sélecteur de
            // fichier). On avale ce click en capture (once), filet de 350 ms si aucun ne suit.
            const avaler = function(ev) { ev.stopPropagation(); ev.preventDefault(); };
            document.addEventListener("click", avaler, { capture: true, once: true });
            setTimeout(function() {
              document.removeEventListener("click", avaler, { capture: true });
            }, 350);
            overlay.remove();
            const cible = anchorSide ? {
              x: anchorSide.x, y: anchorSide.y, level: anchorSide.level,
              tag: anchorSide.tag, planName: anchorSide.planName,
              label: anchorSide.pointNom || anchorSide.pointId || ""
            } : null;
            goTo(planId, cible, { confirm: _planAffiche() });
          },
          // Clic arête = détail de la frontière (liste filtrée).
          onEdgeClick: function(a, b) {
            _filterPair = { a: a, b: b };
            _basculer(false);
            _render();
          }
        });
      }
    }
    vList.addEventListener("click", function() { _basculer(false); });
    vGraph.addEventListener("click", function() { _basculer(true); });

    // Liste redessinée quand le registre change pendant qu'elle est ouverte (dépôt d'une extension, partage) ;
    // l'écouteur part avec la fenêtre.
    const _surChangement = function() {
      if (!overlay.isConnected) { window.removeEventListener("mktm:liaisons-changees", _surChangement); return; }
      if (listEl.style.display !== "none") _render();
    };
    window.addEventListener("mktm:liaisons-changees", _surChangement);

    _render();
  }

  // ── Lecture des points d'un plan non chargé ──────────
  // Session : KtaSessionStore.lire(planId) (js/sessionStore.js) → editorPoints[]. Calques : serveur → fetch
  // path/plan-config.json + fichiers ; local → ZIP IndexedDB (PlanRegistry.getBlob) via JSZip.
  // Rend Promise<[{id, nom, x, y, tags, source, level}]>. `stats` optionnel : { dataError: true } si les
  // CALQUES sont inaccessibles (serveur injoignable / 404, ZIP absent) alors que la session est lisible ; les
  // appelants avertissent au lieu d'un « 0 points » muet.
  // 🩸 URL de calque à DOUBLE essai : `dataLayers[].file` est soit RELATIF au dossier du plan (« chemin.json »),
  // soit COMPLET depuis la racine web (« data/test2/chemin.json »). `path + "/" + file` seul doublerait l'URL
  // (404 silencieux : points de calque et tracés distants perdus).
  async function _fetchLayerJson(basePath, file) {
    // Chemin déjà complet (commence par le dossier du plan) : pris tel quel, sans l'URL doublée (404 en console).
    let base = String(basePath);
    while (base.endsWith("/")) base = base.slice(0, -1);   // boucle, pas /\/+$/ (retour arrière, Sonar S8786)
    const f = String(file);
    const essais = f.indexOf(base + "/") === 0 ? [f] : [base + "/" + f];
    if (f.indexOf("/") >= 0 && essais.indexOf(f) < 0) essais.push(f);
    for (let i = 0; i < essais.length; i++) {
      try {
        const resp = await fetch(essais[i], { cache: "no-cache" });
        if (resp.ok) return await resp.json();
      } catch(e) { /* essai suivant */ }
    }
    throw new Error("datalayer introuvable : " + file);
  }

  // Plan lu dans sa copie ZIP de l'appareil : local, ZIP de l'index, et plan d'extension (« ext », gardé après sa
  // 1re ouverture). 🩸 Un type oublié ici est ignoré EN SILENCE (ni lu, ni signalé en dataError).
  function _planLuParZip(plan) {
    return plan.type === "local" || plan.type === "ext" || !!plan.zip;
  }

  async function _collecterPointsDuPlan(plan, stats) {
    const pts = [];
    // 1) Points de session (toujours lisibles).
    try {
      const raw = window.KtaSessionStore.lire(plan.id);
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

    // 2) Points des calques.
    try {
      if (plan.type === "server" && plan.path && !plan.zip) {
        const cfg = await (await fetch(plan.path + "/plan-config.json", { cache: "no-cache" })).json();
        const layers = (cfg && cfg.dataLayers) || [];
        for (let i = 0; i < layers.length; i++) {
          try {
            const dj = await _fetchLayerJson(plan.path, layers[i].file);   // double essai
            (dj.data || []).forEach(function(p) {
              if (p && typeof p.x === "number" && typeof p.y === "number") {
                pts.push({ id: p.id || "", nom: p.nom || "", x: p.x, y: p.y,
                           tags: p.tags || [], source: "data", level: p.level });
              }
            });
          } catch(e) { /* layer illisible → skip */ }
        }
      } else if (_planLuParZip(plan) && window.PlanRegistry && window.JSZip) {
        const blob = await window.PlanRegistry.getBlob(plan.id);
        if (!blob && stats) stats.dataError = true;   // (U2) : ZIP absent d'IDB
        if (blob) {
          const zip = await window.JSZip.loadAsync(blob);
          // plan-config.json à la racine, ou le 1er trouvé.
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
    } catch(e) {
      console.warn("[InterPlanLinks] datalayers " + plan.id + " illisibles :", e);
      if (stats) stats.dataError = true;   // (U2) : serveur injoignable / config illisible
    }

    // Resync opportuniste des snapshots des liaisons qui référencent ce plan (points frais), seulement sur une
    // lecture COMPLÈTE : sur des données partielles, un point introuvable ne doit pas être interprété.
    if (!stats || !stats.dataError) {
      try { _resyncSnapshotsForPlan(plan.id, pts); } catch(e) {}
    }

    return pts;
  }

  // ── Lecture du routage d'un plan non chargé ──────────
  // Comme _collecterPointsDuPlan, pour ROADS + ZONES (Dijkstra du leg distant : graphe, zones inaccessibles et
  // évitables) depuis la session et les calques. stats.dataError = calques inaccessibles : le leg serait
  // calculé sur un réseau PARTIEL, l'appelant doit refuser, pas deviner.
  async function _collecterRoutingDuPlan(plan, stats) {
    const roads = [], zones = [];
    let scale = null;   // px/mètre du plan distant (cfg.tracking.scale) — nécessaire
                        // pour sommer les legs en MÈTRES (⚠️ les px de deux plans n'ont pas la même échelle)
    let profondeursCfg = null;   // cfg.plan.niveauxProfondeur du plan distant
    function _absorber(objRoads, objZones) {
      (objRoads || []).forEach(function(r) {
        if (r && Array.isArray(r.points) && r.points.length >= 2 && r.type !== "itinerary") roads.push(r);
      });
      (objZones || []).forEach(function(z) {
        if (z && Array.isArray(z.points) && z.points.length >= 3) zones.push(z);
      });
    }
    try {
      const raw = window.KtaSessionStore.lire(plan.id);
      if (raw) {
        const sess = JSON.parse(raw);
        _absorber(sess.roads, sess.zones);
      }
    } catch(e) { console.warn("[InterPlanLinks] session routing " + plan.id + " illisible :", e); }
    try {
      if (plan.type === "server" && plan.path && !plan.zip) {
        const cfg = await (await fetch(plan.path + "/plan-config.json", { cache: "no-cache" })).json();
        if (cfg && cfg.tracking && Number.isFinite(cfg.tracking.scale) && cfg.tracking.scale > 0) scale = cfg.tracking.scale;
        if (cfg && cfg.plan) profondeursCfg = cfg.plan.niveauxProfondeur;
        const layers = (cfg && cfg.dataLayers) || [];
        for (let i = 0; i < layers.length; i++) {
          try {
            const dj = await _fetchLayerJson(plan.path, layers[i].file);   // double essai
            _absorber(dj.roads, dj.zones);
          } catch(e) { /* layer illisible → skip */ }
        }
      } else if (_planLuParZip(plan) && window.PlanRegistry && window.JSZip) {
        const blob = await window.PlanRegistry.getBlob(plan.id);
        if (!blob && stats) stats.dataError = true;
        if (blob) {
          const zip = await window.JSZip.loadAsync(blob);
          let cfgFile = zip.file("plan-config.json");
          if (!cfgFile) {
            const cand = Object.keys(zip.files).find(function(n) { return /(^|\/)plan-config\.json$/.test(n); });
            if (cand) cfgFile = zip.file(cand);
          }
          if (cfgFile) {
            const baseDir = cfgFile.name.replace(/plan-config\.json$/, "");
            const cfg = JSON.parse(await cfgFile.async("string"));
            if (cfg && cfg.tracking && Number.isFinite(cfg.tracking.scale) && cfg.tracking.scale > 0) scale = cfg.tracking.scale;
            if (cfg && cfg.plan) profondeursCfg = cfg.plan.niveauxProfondeur;
            const layers = (cfg && cfg.dataLayers) || [];
            for (let i = 0; i < layers.length; i++) {
              const f = zip.file(baseDir + layers[i].file) || zip.file(layers[i].file);
              if (!f) continue;
              try {
                const dj = JSON.parse(await f.async("string"));
                _absorber(dj.roads, dj.zones);
              } catch(e) { /* skip */ }
            }
          }
        }
      }
    } catch(e) {
      console.warn("[InterPlanLinks] routing datalayers " + plan.id + " illisibles :", e);
      if (stats) stats.dataError = true;
    }
    // 3) Échelle et profondeurs de niveau du plan DISTANT, même cascade que le plan ouvert (préférence par plan >
    //    plan-config). 🩸 Lecture directe de la préférence : getPlanProfondeurs(id) retombe sur le plan-config
    //    du plan OUVERT, faux pour les jonctions du réseau distant.
    let prefs = {};
    try {
      const rawPrefs = localStorage.getItem("myktamap_plan_prefs_" + plan.id);
      const o = rawPrefs ? JSON.parse(rawPrefs) : null;
      if (o && typeof o === "object") prefs = o;
    } catch(e) { /* préférence illisible → plan-config seul */ }
    if (typeof prefs.scale === "number" && Number.isFinite(prefs.scale) && prefs.scale > 0) scale = prefs.scale;
    let profondeurs = {};
    if (prefs.niveauxProfondeur && typeof prefs.niveauxProfondeur === "object") {
      profondeurs = prefs.niveauxProfondeur;
    } else if (profondeursCfg && typeof profondeursCfg === "object") {
      profondeurs = profondeursCfg;
    }
    return { roads: roads, zones: zones, scale: scale, profondeurs: profondeurs };
  }

  // ── Modale de création : plan cible → recherche du point → créer ──────────
  const MODAL_ID = "kta-ipl-modal";

  function _fermerModale() {
    const m = document.getElementById(MODAL_ID);
    if (m) m.remove();
  }

  function ouvrirCreation(pointId, x, y, nom, source, level, tag, pointUid) {
    const planId = _currentPlanId();
    if (!planId) {
      window.ktaAlerte(_t("ipl.err.noPlan"));
      return;
    }
    _fermerModale();
    if (window.map) try { window.map.closePopup(); } catch(e) {}

    const refA = {
      planId:   planId,
      planName: _currentPlanName(),
      pointId:  String(pointId || ""),
      pointUid: pointUid ? String(pointUid) : undefined,
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
            pointUid: p.uid ? String(p.uid) : undefined,
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
        // Calques du plan injoignables (serveur off, ZIP absent) : on le DIT au lieu d'un « 0 points » muet.
        const _stats = {};
        _targetPoints = await _collecterPointsDuPlan(_targetPlan, _stats);
        document.getElementById("kta-ipl-target-plan").textContent =
          _t("ipl.create.targetPlan", { plan: _targetPlan.name || _targetPlan.id, n: _targetPoints.length }) +
          (_stats.dataError ? " — " + _t("ipl.picker.dataUnreachable") : "");
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

  // ── Navigation : goTo générique + pile de retour ──────────
  // goTo(planId, target, opts), utilisé par les liaisons (naviguerVers), le bouton ↩️ Retour et la recherche
  // multi-plans. target = { x, y, level?, tag?, zoom?, label?, planName? } ; opts = { confirm: bool
  // (mini-modale avant changement), noStack: bool (ne pas empiler l'origine : le retour lui-même) }.
  function goTo(planId, target, opts) {
    opts = opts || {};
    const plan = window.PlanRegistry ? window.PlanRegistry.findById(planId) : null;
    if (!plan) {
      window.ktaAlerte(_t("ipl.err.planAbsent", { plan: (target && target.planName) || planId }), { type: "erreur" });
      return;
    }

    // Cible sur le PLAN COURANT → chemin court : ni rechargement, ni confirmation, ni pile, ni bouton Retour ;
    // seulement bascule de niveau éventuelle + pan/flash immédiat (samePlan : une seule passe).
    const planCharge = _planAffiche();
    if (planCharge && planId === _currentPlanId()) {
      if (!target) return;   // « ouvrir le plan » sans cible → déjà dessus
      if (window.map) try { window.map.closePopup(); } catch(e) {}
      _pendingTarget = { x: target.x, y: target.y, level: target.level,
                         tag: target.tag, zoom: target.zoom, samePlan: true };
      _pendingConsumed = false;
      _consumePendingTarget();
      return;
    }

    const doGo = async function() {
      // L'ORIGINE (plan + centre + niveau + zoom) est empilée avant de partir (pile en RAM). Le retour (noStack)
      // ne ré-empile pas (sinon ping-pong infini).
      if (!opts.noStack) _empilerOrigine();
      if (window.map) try { window.map.closePopup(); } catch(e) {}
      _retirerBoutonRetour();
      // Cible posée AVANT le changement, consommée par onPlanLoaded (fin de lancerApplication) ET par le repli
      // après await : sinon le recentrage de session écrase notre setView.
      // opts.recalerTracker → à l'arrivée, le TRACKER est recalé sur la cible (traversée PHYSIQUE d'un portail ;
      // jamais par la recherche « voir »). target NULL (ouvrir un plan sans liaison depuis le graphe) = simple
      // changement, sans cible ni pan.
      _pendingTarget = target
        ? { x: target.x, y: target.y, level: target.level,
            tag: target.tag, zoom: target.zoom,
            recale: !!opts.recalerTracker }
        : null;
      _pendingConsumed = false;
      try {
        if (plan.type === "server" && !plan.zip) {   // plan ZIP : chargerPlanDuRegistre
          await window.chargerPlanServeur(plan.path, plan);
        } else if (typeof window.chargerPlanDuRegistre === "function") {
          await window.chargerPlanDuRegistre(plan.id);
        } else {
          window.ktaAlerte(_t("ipl.err.loadFailed"), { type: "erreur" });
          _pendingTarget = null;
          return;
        }
      } catch(e) {
        console.warn("[InterPlanLinks] switch plan échoué :", e);
        window.ktaAlerte(_t("ipl.err.loadFailed"), { type: "erreur" });
        _pendingTarget = null;
        return;
      }
      _consumePendingTarget();
    };

    if (!opts.confirm) { doGo(); return; }

    const modal = document.createElement("div");
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.innerHTML =
      '<div class="kta-modal" style="max-width:400px;">' +
        '<div class="kta-modal-icon" style="color:var(--kta-interaction);">🌀</div>' +
        '<div class="kta-modal-titre">' + _esc(_t("ipl.nav.titre")) + '</div>' +
        '<div class="kta-modal-texte">' +
          _esc(_t("ipl.nav.texte", { plan: plan.name || planId,
                                     point: (target && (target.label || (target.x + "," + target.y))) || (plan.name || planId) })) +
          '<br><span style="font-size:12px; color:var(--kta-texte-3);">' + _esc(_t("ipl.nav.sessionSaved")) + '</span>' +
        '</div>' +
        '<div class="kta-modal-actions">' +
          '<button class="kta-btn kta-btn-ghost" id="kta-ipl-nav-no" type="button">' + _esc(_t("ui.btn.cancel")) + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-ipl-nav-yes" type="button">' + _esc(_t("ipl.nav.go")) + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);
    document.getElementById("kta-ipl-nav-no").addEventListener("click", function() { modal.remove(); });
    modal.addEventListener("click", function(e) { if (e.target === modal) modal.remove(); });
    document.getElementById("kta-ipl-nav-yes").addEventListener("click", function() {
      modal.remove();
      doGo();
    });
  }

  // « Y aller » depuis une liaison (mini-confirmation puis changement).
  function naviguerVers(linkId, mySide) {
    const link = _load().links.find(function(l) { return l.id === linkId; })
      || _bakedLinkCache[linkId] || null;
    if (!link) { window.ktaAlerte(_t("ipl.err.linkGone"), { type: "erreur" }); return; }
    const other = (mySide === "a") ? link.b : link.a;
    if (!other) return;
    goTo(other.planId, {
      x: other.x, y: other.y, level: other.level, tag: other.tag,
      planName: other.planName,
      label: other.pointNom || other.pointId || (other.x + "," + other.y)
    }, { confirm: true, recalerTracker: true });   // traversée physique → tracker recalé
  }

  // ── Pile de retour ──────────
  // En MÉMOIRE VIVE seulement (perdue au rechargement, voulu). Chaque goTo (hors retour) empile l'origine ; le
  // bouton flottant temporaire (15 s) dépile. 3 portails enchaînés = 3 retours.
  const _navStack = [];
  let _backBtnTimer = null;

  // Purge des flottants de navigation à la sortie du plan. contexte :
  //   "home"   : retour à l'accueil → bouton Retour retiré (mini-pastille comprise, elle n'a pas de minuterie) +
  //              pile vidée (partir de l'accueil rompt la chaîne).
  //   "switch" : changement de plan. _pendingTarget présent = goTo (qui gère bouton et pile) → rien. Sinon
  //              changement DIRECT (sélecteur du titre) : la pile pointe vers un contexte périmé → bouton retiré
  //              + pile vidée.
  function onPlanExit(contexte) {
    if (contexte === "switch" && _pendingTarget) return;   // goTo en cours → géré
    _retirerBoutonRetour();
    _navStack.length = 0;
  }

  function _empilerOrigine() {
    // 🩸 À l'accueil, _currentLoadedPlanId et window.map PERSISTENT du dernier plan (le retour au loader ne les
    // purge pas) : on empilerait une fausse origine. Marqueur fiable de l'accueil : PLAN_CONFIG === null
    // (resetRuntimeAssets). Partir de l'accueil vide aussi la pile.
    if (!window.PLAN_CONFIG || !window.PLAN_CONFIG.plan) {
      _navStack.length = 0;
      return;
    }
    const pid = _currentPlanId();
    if (!pid || !window.map || typeof window.map.getCenter !== "function") return;
    try {
      const c = window.map.getCenter();
      const h = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
      _navStack.push({
        planId:   pid,
        planName: _currentPlanName(),
        x: c.lng,
        y: h - c.lat,
        level: (window.APP_CONFIG && Number.isInteger(window.APP_CONFIG.activeLevel))
                 ? window.APP_CONFIG.activeLevel : undefined,
        zoom: window.map.getZoom()
      });
    } catch(e) { console.warn("[InterPlanLinks] empilerOrigine :", e); }
  }

  function _retirerBoutonRetour() {
    if (_backBtnTimer) { clearTimeout(_backBtnTimer); _backBtnTimer = null; }
    const b = document.getElementById("kta-ipl-back-float");
    if (b) try { b.remove(); } catch(e) {}
  }

  // Bouton flottant « ↩️ Retour : <plan> » après l'arrivée, temporaire (15 s ou clic). La pile reste en RAM :
  // le bouton revient au prochain saut s'il reste des niveaux.
  //   - [✕] ferme SANS revenir et VIDE LA PILE (renoncer à la chaîne : pas de retour périmé au prochain saut) ;
  //   - [–] RÉDUIT en mini-pastille ↩️ (clic = ré-expansion, jamais de retour direct : anti-mauvais-clic). Choix
  //     MÉMORISÉ (localStorage) ; ré-expandre mémorise « plein » ;
  //   - en mode réduit, PAS de minuterie de 15 s.
  const BACKBTN_MODE_KEY = "myktamap_backbtn_mode";   // "full" (défaut) | "mini"

  function _backBtnMode() {
    try { return localStorage.getItem(BACKBTN_MODE_KEY) === "mini" ? "mini" : "full"; }
    catch(e) { return "full"; }
  }
  function _setBackBtnMode(m) {
    try { localStorage.setItem(BACKBTN_MODE_KEY, m); } catch(e) {}
  }

  function _faireRetour() {
    _retirerBoutonRetour();
    const o = _navStack.pop();
    if (o) {
      goTo(o.planId, { x: o.x, y: o.y, level: o.level, zoom: o.zoom, planName: o.planName },
           { confirm: false, noStack: true });
    }
  }

  function _afficherBoutonRetour(forceMode) {
    _retirerBoutonRetour();
    if (_navStack.length === 0) return;
    const top = _navStack[_navStack.length - 1];
    const mode = forceMode || _backBtnMode();

    const wrap = document.createElement("div");
    wrap.id = "kta-ipl-back-float";
    wrap.className = "kta-ipl-back-float" + (mode === "mini" ? " kta-ipl-back-mini" : "");

    if (mode === "mini") {
      wrap.innerHTML = '<button type="button" class="kta-ipl-back-minibtn" title="' +
        _esc(_t("ipl.back.expandTitle")) + '">↩️' +
        (_navStack.length > 1 ? '<span class="kta-ipl-back-depth">' + _navStack.length + '</span>' : '') +
        '</button>';
      wrap.querySelector(".kta-ipl-back-minibtn").addEventListener("click", function() {
        _setBackBtnMode("full");
        _afficherBoutonRetour("full");
      });
      document.documentElement.appendChild(wrap);
      return;
    }

    wrap.innerHTML =
      '<button type="button" class="kta-ipl-back-main" title="' + _esc(_t("ipl.back.title")) + '">' +
        '↩️ ' + _esc(_t("ipl.back.btn", { plan: top.planName || top.planId })) +
        (_navStack.length > 1 ? ' <span class="kta-ipl-back-depth">' + _navStack.length + '</span>' : '') +
      '</button>' +
      '<button type="button" class="kta-ipl-back-ctrl" data-act="mini" title="' + _esc(_t("ipl.back.miniTitle")) + '">–</button>' +
      '<button type="button" class="kta-ipl-back-ctrl" data-act="close" title="' + _esc(_t("ipl.back.closeTitle")) + '">✕</button>';

    wrap.querySelector(".kta-ipl-back-main").addEventListener("click", _faireRetour);
    wrap.querySelector('[data-act="mini"]').addEventListener("click", function() {
      _setBackBtnMode("mini");
      _afficherBoutonRetour("mini");
    });
    wrap.querySelector('[data-act="close"]').addEventListener("click", function() {
      _retirerBoutonRetour();
      _navStack.length = 0;   // fermer = abandonner la chaîne de retours
    });
    document.documentElement.appendChild(wrap);
    _backBtnTimer = setTimeout(_retirerBoutonRetour, 15000);
  }

  // Cible de navigation en attente (posée par goTo, consommée une seule fois après le chargement du plan cible).
  let _pendingTarget = null;
  let _pendingConsumed = false;

  function _consumePendingTarget() {
    if (!_pendingTarget || _pendingConsumed) return;
    _pendingConsumed = true;
    const t = _pendingTarget;
    _pendingTarget = null;

    // Bascule de niveau : un portail amène AU niveau du point cible (sinon, sur un plan multi-niveau affiché à un
    // autre niveau, le POI reste invisible, opacité 0).
    if (Number.isInteger(t.level) && window.APP_CONFIG
        && Array.isArray(window.APP_CONFIG.visibleLevels)
        && window.APP_CONFIG.visibleLevels.indexOf(t.level) === -1
        && typeof window._changerNiveauActif === "function") {
      try {
        window._changerNiveauActif(t.level);
        console.log("[InterPlanLinks] Bascule niveau → " + t.level + " (niveau du point cible)");
      } catch(e) { console.warn("[InterPlanLinks] bascule niveau échouée :", e); }
    }

    // Filtre de tags actif qui masque le tag de la cible : on N'Y TOUCHE PAS (jamais de reset de filtre sans
    // avertir), on prévient par un toast.
    if (t.tag && window._ktaRuntimeFilters && window._ktaRuntimeFilters.tags
        && typeof window._ktaRuntimeFilters.tags.has === "function"
        && !window._ktaRuntimeFilters.tags.has(t.tag)) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(_t("ipl.nav.hiddenByFilter"), "warn");
      }
    }

    // Cible sur le PLAN COURANT : une seule passe immédiate (aucun restore ne recentre derrière) et PAS de bouton
    // Retour (des restes de pile ne doivent pas réapparaître après un simple recentrage).
    if (t.samePlan) {
      _panEtFlash(t, true);
      return;
    }

    // Triple passe : le restore de session (SessionPersist) et le tracker (« démarrage sur la dernière position »)
    // recentrent en async APRÈS lancerApplication. On repasse à +600 ms (setView + flash), puis +1600 / +2600 ms
    // (setView silencieux) pour garder la vue finale.
    _panEtFlash(t, true);
    setTimeout(function() { _panEtFlash(t, false); }, 1600);
    setTimeout(function() { _panEtFlash(t, false); }, 2600);

    // Retour vers l'origine proposé (bouton 15 s) une fois l'arrivée peinte, pour TOUTES les navigations goTo ;
    // après un retour, il revient s'il reste des niveaux à dépiler.
    setTimeout(_afficherBoutonRetour, 900);

    // Traversée PHYSIQUE d'un portail : tracker recalé sur le point d'arrivée IMMÉDIATEMENT (le restore du tracker
    // est synchrone dans lancerApplication, déjà passé). Réassertion à +2,8 s SEULEMENT si la position a bougé
    // entre-temps (évite double vibration / ancre de timeline).
    if (t.recale) {
      const _recaler = function() {
        if (typeof window.recalerTrackerSurPoint !== "function") return;
        try {
          // `teleport` : une traversée n'est PAS une distance parcourue sur CE plan (sinon elle gonfle la
          // distance estimée du Carnet, cf. tracking.js > _estimerSegmentDepuisAncre).
          window.recalerTrackerSurPoint(t.x, t.y,
            Number.isInteger(t.level) ? t.level : undefined, { teleport: true });
          console.log("[InterPlanLinks] Tracker recalé sur le point d'arrivée du portail (" +
                      Math.round(t.x) + "," + Math.round(t.y) + ")");
        } catch(e) { console.warn("[InterPlanLinks] recalage tracker échoué :", e); }
      };
      _recaler();
      setTimeout(function() {
        try {
          const p = window.getTrackingPosition ? window.getTrackingPosition() : null;
          if (p && (Math.round(p.x) !== Math.round(t.x) || Math.round(p.y) !== Math.round(t.y))) {
            console.log("[InterPlanLinks] Position tracker écrasée après recalage → re-assertion");
            _recaler();
          }
        } catch(e) {}
      }, 2800);
    }
  }

  // Pan (+ flash optionnel) sur t = {x, y, zoom?}, nouvel essai si la carte du plan n'est pas prête. Le zoom
  // n'est fourni que par le RETOUR (vue d'origine) ; ailleurs le zoom courant est gardé.
  function _panEtFlash(t, withFlash, attempt) {
    attempt = attempt || 0;
    const mapOk = window.map && typeof window.map.setView === "function"
                  && typeof window.convertCoord === "function";
    if (!mapOk) {
      if (attempt < 10) setTimeout(function() { _panEtFlash(t, withFlash, attempt + 1); }, 400);
      return;
    }
    try {
      const latlng = window.convertCoord(t.x, t.y);
      const z = (typeof t.zoom === "number") ? t.zoom : window.map.getZoom();
      window.map.setView(latlng, z, { animate: false });
      if (withFlash) {
        const flash = L.circleMarker(latlng, {
          radius: 24, color: "#8cb4ff", fillColor: "#8cb4ff",
          fillOpacity: 0, weight: 3, opacity: 0.9, interactive: false
        }).addTo(window.map);
        setTimeout(function() { try { window.map.removeLayer(flash); } catch(e) {} }, 3500);
      }
    } catch(e) { console.warn("[InterPlanLinks] pan/flash échoué :", e); }
  }

  // Liens embarqués vus au popup (rempli par buildPopupHtml), pour naviguerVers vers un lien absent du registre.
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

  // ── Badges ──────────
  // Pas de badge automatique : le marquage d'un point lié est un CHOIX via le tag intégré « portail » (icône
  // icon/portail.png, cf. map.js > TAGS_BUILTIN). refreshBadges reste exposée en no-op (appelée par
  // interfaceConfig.js > appliquerFiltreNiveau).
  function refreshBadges() { /* no-op, cf. ci-dessus */ }

  // ── Resync des snapshots de liaisons ──────────
  // Un snapshot (nom, coords, level, tag) se périme si le point est renommé ou déplacé. « Le plan qui SAIT met à
  // jour ses propres côtés », en silence : au CHARGEMENT d'un plan (ses points font autorité, zéro fetch) et quand
  // collectPointsForPlan lit un plan distant. Les snapshots convergent à l'usage.
  // Correspondance par pointId (stable, suit un déplacement), sinon par coords arrondies (seuls nom / level / tag
  // d'un point retrouvé sur place se resynchronisent).
  function _resyncSnapshotsForPlan(planId, pts) {
    if (!planId || !Array.isArray(pts) || pts.length === 0) return 0;
    const byId = {}, byXy = {};
    pts.forEach(function(p) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
      const id = String(p.id || "").trim();
      if (id && !byId[id]) byId[id] = p;
      const xy = "xy:" + Math.round(p.x) + ":" + Math.round(p.y);
      if (!byXy[xy]) byXy[xy] = p;
    });
    const reg = _load();
    let changed = 0;
    const ids = [];
    reg.links.forEach(function(l) {
      ["a", "b"].forEach(function(s) {
        const side = l[s];
        if (!side || side.planId !== planId) return;
        const id = String(side.pointId || "").trim();
        const p = (id && byId[id]) || byXy[_sideKey(side)] || null;
        if (!p) return;   // point disparu / plan partiel → snapshot conservé tel quel
        const nom = String(p.nom || "");
        const lvl = Number.isInteger(p.level) ? p.level : 0;
        const tag = (Array.isArray(p.tags) && p.tags[0]) || undefined;
        if (side.pointNom !== nom || side.x !== p.x || side.y !== p.y
            || (side.level || 0) !== lvl || side.tag !== tag) {
          side.pointNom = nom;
          side.x = p.x;
          side.y = p.y;
          side.level = lvl;
          side.tag = tag;
          changed++;
          if (ids.indexOf(l.id) < 0) { _toucher(l); ids.push(l.id); }
        }
      });
    });
    if (changed > 0) {
      _save(reg);
      _annoncer(ids, "modification");
      console.log("[InterPlanLinks] Resync snapshots « " + planId + " » : " + changed + " côté(s) mis à jour");
    }
    return changed;
  }

  // Resync au chargement : points de session + calques déjà en mémoire (SearchPoints.getAllPoints, [{point, layerId}]).
  async function _resyncPlanCourant() {
    const pid = _currentPlanId();
    if (!pid || !window.SearchPoints || typeof window.SearchPoints.getAllPoints !== "function") return;
    if (getLinksForPlan(pid).length === 0) return;   // rien à resyncer → zéro travail
    try {
      const items = await window.SearchPoints.getAllPoints();
      const pts = (items || []).map(function(it) { return it && it.point; }).filter(Boolean);
      _resyncSnapshotsForPlan(pid, pts);
    } catch(e) { console.warn("[InterPlanLinks] resync plan courant échoué :", e); }
  }

  // Appelé par main.js à la fin de lancerApplication (plan prêt).
  function onPlanLoaded() {
    // Cible pendante consommée après les recentrages de session.
    setTimeout(_consumePendingTarget, 600);
    // Resync différé des snapshots locaux (les calques async finissent de charger, même délai que les stats).
    setTimeout(_resyncPlanCourant, 2000);
  }

  // Point SUPPRIMÉ (editor.js > supprimerPointEditor) : la liaison entière est retirée (sans l'un de ses bouts
  // elle n'a plus de sens), des deux côtés du registre. Une liaison que l'extension dit non modifiable reste (elle
  // reviendrait à sa prochaine synchro).
  function onPointDeleted(planId, point) {
    if (!planId || !point) return 0;
    const reg = _load();
    const ids = [];
    reg.links = reg.links.filter(function(l) {
      const touche = _coteDuPoint(l.a, planId, point) || _coteDuPoint(l.b, planId, point);
      if (!touche || !_modifiable(l)) return true;
      ids.push(l.id);
      return false;
    });
    const removed = ids.length;
    if (removed > 0) {
      _save(reg);
      _annoncer(ids, "suppression");
      refreshBadges();
      console.log("[InterPlanLinks] " + removed + " liaison(s) purgée(s) (point supprimé)");
    }
    return removed;
  }

  // Migration douce des côtés du plan courant (ETUDE_UID décision 12) : un côté sans pointUid reçoit l'uid du
  // point s'il le désigne sans ambiguïté (un seul point de ce nom, sinon l'homonyme à 1 px près). Ambigu :
  // inchangé. Les côtés des AUTRES plans ne sont pas touchés (leurs points ne sont pas chargés).
  function migrerVersUid(planId, points) {
    if (!planId || !Array.isArray(points)) return 0;
    const reg = _load();
    let n = 0;
    const ids = [];
    reg.links.forEach(function(l) {
      ["a", "b"].forEach(function(cote) {
        const side = l[cote];
        if (!side || side.planId !== planId || side.pointUid || !side.pointId) return;
        let c = points.filter(function(p) { return p && String(p.id || "") === side.pointId; });
        if (c.length > 1) {
          c = c.filter(function(p) { return Math.abs((p.x || 0) - (side.x || 0)) < 1 && Math.abs((p.y || 0) - (side.y || 0)) < 1; });
        }
        if (c.length === 1 && typeof c[0].uid === "string" && c[0].uid) {
          side.pointUid = c[0].uid; n++;
          if (ids.indexOf(l.id) < 0) { _toucher(l); ids.push(l.id); }
        }
      });
    });
    if (n > 0) { _save(reg); _annoncer(ids, "modification"); console.log("[InterPlanLinks] " + n + " côté(s) de liaison rattaché(s) à l'uid de leur point (v2.4.0)"); }
    return n;
  }

  // Point de session REPOSITIONNÉ (editor.js > repositionnerPointEditor) : la liaison survit (indexée par
  // `id:<id>`).
  // 🩸 Mais les coordonnées STOCKÉES dans le lien deviendraient périmées, et elles servent : tracé du lien à
  // l'export KMZ (`planToGps(t, link.a.x, link.a.y)`) et repli d'affichage d'un point sans nom. Sans recalage,
  // le lien partirait de l'ancienne position dans le KMZ, sans rien dire.
  // `ancX/ancY` = position AVANT le clic : seule clé valable pour un point sans id (calque) ; ignorée avec un id.
  function onPointMoved(planId, point, ancX, ancY) {
    if (!planId || !point) return 0;
    const reg = _load();
    let recales = 0;
    const ids = [];
    reg.links.forEach(function(l) {
      ["a", "b"].forEach(function(cote) {
        const side = l[cote];
        if (!_coteDuPoint(side, planId, point, ancX, ancY)) return;
        side.x = Number(point.x) || 0;
        side.y = Number(point.y) || 0;
        recales++;
        if (ids.indexOf(l.id) < 0) { _toucher(l); ids.push(l.id); }
      });
    });
    if (recales > 0) {
      _save(reg);
      _annoncer(ids, "modification");
      refreshBadges();
      console.log("[InterPlanLinks] " + recales + " côté(s) de liaison recalé(s) (point déplacé)");
    }
    return recales;
  }

  // NIVEAU d'un point de session changé (editor.js > afficherFormulaire) : le snapshot `level` d'un côté sert à
  // l'arrivée par le portail (bascule sur le niveau du point cible) ; périmé, il ouvrirait l'ancien étage.
  // 🩸 Un ⏪ ne repasse pas ici : le resync du chargement (_resyncSnapshotsForPlan) rattrape au plan suivant.
  function onPointLevelChanged(planId, point) {
    if (!planId || !point) return 0;
    const lvl = Number.isInteger(point.level) ? point.level : 0;
    const reg = _load();
    let n = 0;
    const ids = [];
    reg.links.forEach(function(l) {
      ["a", "b"].forEach(function(cote) {
        const side = l[cote];
        if (!_coteDuPoint(side, planId, point) || (side.level || 0) === lvl) return;
        side.level = lvl;
        n++;
        if (ids.indexOf(l.id) < 0) { _toucher(l); ids.push(l.id); }
      });
    });
    if (n > 0) {
      _save(reg);
      _annoncer(ids, "modification");
      console.log("[InterPlanLinks] " + n + " côté(s) de liaison mis au niveau " + lvl);
    }
    return n;
  }
  // ── Export ──────────
  window.InterPlanLinks = {
    getLinksForPoint:     getLinksForPoint,
    getLinksForPlan:      getLinksForPlan,
    getAllLinks:          getAllLinks,
    onPlanExit:           onPlanExit,   // purge flottants sortie/switch
    createLink:           createLink,
    removeLink:           removeLink,
    importLinks:          importLinks,
    appliquerExterne:     appliquerExterne,   // dépôt d'une extension (annoncé avec source « extension »)
    transfererPlan:       transfererPlan,
    buildPopupHtml:       function(point, layerId) { return buildPopupHtml(point, layerId); },
    ouvrirCreation:       ouvrirCreation,
    naviguerVers:         naviguerVers,
    supprimerDepuisPopup: supprimerDepuisPopup,
    onPlanLoaded:         onPlanLoaded,
    // Vrai pendant le changement de plan d'une traversée PHYSIQUE (goTo recalerTracker) : interPlanRoute ne
    // poursuit l'itinéraire que dans ce cas.
    traverseePhysiqueEnCours: function() { return !!(_pendingTarget && _pendingTarget.recale); },
    onPointDeleted:       onPointDeleted,
    migrerVersUid:        migrerVersUid,
    onPointMoved:         onPointMoved,   // recale les coords d'un point déplacé
    onPointLevelChanged:  onPointLevelChanged,   // recale le niveau d'un point changé d'étage
    refreshBadges:        refreshBadges,
    // Navigation générique + lecture des points d'un plan non chargé (aussi pour js/crossPlanSearch.js : un seul
    // lecteur session / ZIP / serveur).
    goTo:                 goTo,
    collectPointsForPlan: _collecterPointsDuPlan,
    collectRoutingDataForPlan: _collecterRoutingDuPlan,   // (A6) — roads+zones d'un plan non chargé
    // Gestionnaire global (bouton d'accueil « Mes liaisons »).
    ouvrirGestionnaire:   ouvrirGestionnaire,
    // Écart de calage en mètres, ou null si non mesurable. Consommé par la Vue OSM : pas de copie ailleurs.
    ecartCalage:          ecartCalage
  };

  console.log("[InterPlanLinks] Module chargé (" + _load().links.length + " liaison(s))");
})();
