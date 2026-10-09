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
//   - Marquage visuel : CHOIX UTILISATEUR via le tag builtin « portail »
//     (icône vortex icon/portail.png, cf TAGS_BUILTIN map.js) — l'ex-badge
//     🌀 overlay automatique a été RETIRÉ en v1.59.0 (décision KARMA).
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

  // 🐛 v1.69.0 — « un plan est-il AFFICHÉ ? ». Le test historique
  // `PLAN_CONFIG && PLAN_CONFIG.plan` restait VRAI au HOME (afficherLoader ne
  // remet pas PLAN_CONFIG à null) : confirmation « changer de plan ? » posée
  // depuis l'accueil, et surtout chemin court « déjà sur ce plan » emprunté à
  // tort dans goTo → le clic sur une liaison vers le dernier plan ouvert ne
  // chargeait rien. Source de vérité unique : window.ktaPlanAffiche (utils.js).
  function _planAffiche() {
    return (typeof window.ktaPlanAffiche === "function")
      ? window.ktaPlanAffiche()
      : !!(window.PLAN_CONFIG && window.PLAN_CONFIG.plan);
  }

  const LS_KEY = "myktamap_interplan_links_v1";

  // ---------------------------------------------------------------
  // i18n + échappement
  // ---------------------------------------------------------------
  function _t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }
  function _esc(s) {
    // 🧹 v1.61.0 (B6) : délègue au helper canonique window.ktaEsc (utils.js) ;
    // fallback inline si utils pas encore chargé (ordre defer sûr, ceinture).
    if (typeof window.ktaEsc === "function") return window.ktaEsc(s);
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
  // 🆔 v2.4.0 (ETUDE_UID lot C2) — un côté de liaison désigne-t-il CE point ?
  // L'uid d'abord (`pointUid`) : avec la clé par nom, supprimer un point
  // effaçait aussi les liaisons de ses HOMONYMES. Repli par nom / coords pour
  // un côté ancien ou un point sans uid (calque d'un vieux plan).
  // `ancX/ancY` : position à utiliser pour le repli par coords (déplacement).
  function _coteDuPoint(side, planId, point, ancX, ancY) {
    if (!side || side.planId !== planId || !point) return false;
    if (side.pointUid && point.uid) return side.pointUid === point.uid;
    const x = (ancX !== undefined) ? ancX : point.x, y = (ancY !== undefined) ? ancY : point.y;
    return _sideKey(side) === _pointKey(point.id, x, y);
  }

  // Toutes les liaisons dont UN côté matche (planId, point). Retourne
  // [{ link, mySide: "a"|"b", other: <ref du côté opposé> }].
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

  // 🌀 v1.64.0 (multi-hop) : registre complet en lecture — le méta-graphe des
  // plans d'interPlanRoute en a besoin pour construire l'adjacence sans
  // crawler plan par plan. Copie défensive.
  function getAllLinks() {
    return _load().links.slice();
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

  // Les liaisons d'un plan passent sous un autre id (copie locale remplacée par
  // sa version publiée). → nombre de côtés réécrits.
  function transfererPlan(ancienId, nouveauId) {
    if (!ancienId || !nouveauId || ancienId === nouveauId) return 0;
    const reg = _load();
    let n = 0;
    reg.links.forEach(function(l) {
      ["a", "b"].forEach(function(k) { if (l[k] && l[k].planId === ancienId) { l[k].planId = nouveauId; n++; } });
    });
    if (n) _save(reg);
    return n;
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
          (e.baked ? '' :
            '<button class="kta-popup-btn kta-ipl-del" type="button" data-kta-act="ipl-del" ' +
              'data-kta-lien="' + _esc(e.link.id) + '" ' +
              'title="' + _esc(_t("ipl.popup.removeTitle")) + '">🗑️</button>') +
        '</div>';
    });

    // Bouton de création — tout point est liable (6:a), y compris datalayer.
    // 🐛 v1.57.1 : level + 1er tag passés au snapshot (la bascule de niveau à
    // l'arrivée et le check filtre tag en dépendent).
    // 🔒 Valeurs en data-* échappés, action par l'écouteur de la fiche (utils.js > _ktaPopupAction) :
    // jamais de donnée du point ou du plan dans un onclick (faille XSS du 05/10/2026).
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

  // 🆕 v1.59.0 (A3) — Confirmation de suppression FACTORISÉE (popup +
  // gestionnaire). onDone appelé après suppression effective.
  function _confirmerSuppression(linkId, onDone) {
    const modal = document.createElement("div");
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.style.zIndex = "100002";   // au-dessus du gestionnaire (99999)
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
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(_t("ipl.toast.removed"), "info");
      }
      if (typeof onDone === "function") { try { onDone(); } catch(e) {} }
    });
    modal.addEventListener("click", function(e) { if (e.target === modal) modal.remove(); });
  }

  // Suppression depuis le popup (confirmation légère)
  function supprimerDepuisPopup(linkId) {
    _confirmerSuppression(linkId, function() {
      if (window.map) try { window.map.closePopup(); } catch(e) {}
    });
  }

  // ---------------------------------------------------------------
  // 📐 v1.81.0 (D5) — ÉCART DE CALAGE D'UNE LIAISON
  // ---------------------------------------------------------------
  // Les deux bouts d'un portail désignent LE MÊME endroit physique, vu depuis
  // deux plans. Projetés en GPS via le géoréf de LEUR plan respectif, ils
  // devraient donc tomber au même point. La distance qui les sépare mesure
  // directement la qualité du calage — et c'est la seule mesure de ce genre
  // que l'app puisse produire, puisqu'il faut DEUX géoréfs pour la révéler.
  //
  // Retourne null (et non 0) quand la mesure est IMPOSSIBLE : plan absent de
  // l'appareil, ou pas de géoréf. `0` voudrait dire « calage parfait » — le
  // contraire de « je ne sais pas ». Les deux cas ne doivent jamais se
  // confondre à l'affichage.
  //
  // ⚠️ Fonction UNIQUE, exposée en `InterPlanLinks.ecartCalage` : la Vue OSM
  // la consomme au lieu d'en refaire une copie. C'est la leçon du bug des
  // icônes portail du 02/09 — une copie locale finit toujours par diverger.
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
    // Haversine. Leaflet ferait l'affaire, mais ce module est appelé depuis le
    // HOME où aucune carte n'existe : pas de dépendance à `L` ici.
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (pb.lat - pa.lat) * rad, dLng = (pb.lng - pa.lng) * rad;
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(pa.lat * rad) * Math.cos(pb.lat * rad) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // ---------------------------------------------------------------
  // 🆕 v1.59.0 (A3) — GESTIONNAIRE DE LIAISONS (vue globale du registre)
  // ---------------------------------------------------------------
  // Modale listant TOUTES les liaisons (tous plans confondus, triées par date
  // desc) : A ⇄ B avec état de disponibilité (⛔ si un plan est absent de
  // l'appareil), bouton ➜ vers chaque côté disponible, 🗑️ suppression.
  // Accessible depuis le HOME (bouton « 🌀 Mes liaisons ») — opère sans plan
  // chargé (la navigation ➜ charge le plan cible, pipeline goTo).
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
          // 🕸️ v1.65.0 (A7, reco 1:a) : toggle Liste ⇄ Graphe
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

    // 🕸️ v1.65.0 (A7, reco 3:a) : filtre de FRONTIÈRE — clic sur une arête du
    // graphe → la liste ne montre que les liaisons entre ces 2 plans (chip ✕).
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

    // 📐 v1.81.0 (D5) — écart de calage, affiché SEULEMENT quand il est
    // mesurable (les deux plans présents ET géoréférencés). Pas de « — » ni
    // de « n/a » : une colonne vide sur la plupart des lignes ferait croire à
    // un défaut, alors que l'immense majorité des plans n'est pas géoréférencée.
    // Volontairement AUCUN seuil de couleur : 20 m, c'est énorme sur une petite
    // carrière et négligeable sur un réseau de 5 km. On donne le chiffre,
    // l'utilisateur juge avec son échelle en tête.
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
      listEl.innerHTML = links.map(function(l, i) {
        const dispoA = !!(window.PlanRegistry && window.PlanRegistry.findById(l.a.planId));
        const dispoB = !!(window.PlanRegistry && window.PlanRegistry.findById(l.b.planId));
        return '<div class="kta-ipl-mgr-row" data-i="' + i + '">' +
                 '<div class="kta-ipl-mgr-sides">' +
                   _sideHtml(l.a) + '<span class="kta-ipl-mgr-arrow">⇄</span>' + _sideHtml(l.b) +
                 '</div>' +
                 _ecartHtml(l) +
                 '<div class="kta-ipl-mgr-actions">' +
                   (dispoA ? '<button class="kta-popup-btn kta-ipl-go" type="button" data-go="a" title="' +
                     _esc(_t("ipl.mgr.goSide", { plan: l.a.planName || l.a.planId })) + '">➜ A</button>' : '') +
                   (dispoB ? '<button class="kta-popup-btn kta-ipl-go" type="button" data-go="b" title="' +
                     _esc(_t("ipl.mgr.goSide", { plan: l.b.planName || l.b.planId })) + '">➜ B</button>' : '') +
                   '<button class="kta-popup-btn kta-ipl-del" type="button" data-del="1" title="' +
                     _esc(_t("ipl.popup.removeTitle")) + '">🗑️</button>' +
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
      });
    }

    // 🕸️ v1.65.0 (A7) : bascule Liste ⇄ Graphe. Le graphe est re-rendu à
    // chaque bascule (données fraîches + layout adapté à la taille réelle).
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
          // reco 2:a — clic nœud = ouvrir le plan (ancré sur son premier
          // portail si dispo, sinon simple switch sans pan)
          onOpenPlan: function(planId, anchorSide) {
            // 🐛 v1.77.0 (KARMA « clic sur un nœud → fenêtre de chargement de
            // fichier ») — GHOST CLICK : le nœud du graphe se déclenche au
            // pointerup ; retirer l'overlay ICI fait atterrir le click que le
            // navigateur génère juste après sur le HOME découvert — pile sur
            // la drop-zone « 📦 Charger un plan », dont TOUT click ouvre le
            // sélecteur de fichier (homeLoader). On avale ce click en phase
            // capture (once) avec un filet 350 ms si aucun click ne suit.
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
          // reco 3:a — clic arête = détail de la frontière (liste filtrée)
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

    _render();
  }

  // ---------------------------------------------------------------
  // LECTURE DES POINTS D'UN PLAN NON CHARGÉ
  // ---------------------------------------------------------------
  // Session : localStorage myktamap_session_v1_<planId> → editorPoints[].
  // Datalayers : serveur → fetch path/plan-config.json + fichiers ;
  //              local  → ZIP IndexedDB (PlanRegistry.getBlob) via JSZip.
  // Retourne Promise<[{id, nom, x, y, tags, source, level}]>.
  // 🆕 v1.59.0 (U2) : `stats` optionnel — objet rempli par la collecte :
  // { dataError: bool } → true si les DATALAYERS du plan sont inaccessibles
  // (serveur injoignable/404, ZIP absent d'IndexedDB) alors que la session
  // reste lisible. Les appelants (picker liaison, recherche cross-plan)
  // affichent alors un avertissement au lieu d'un « 0 points » muet.
  // 🐛 v1.64.0 — Résolution d'URL de datalayer à DOUBLE essai. Les
  // plan-config mélangent 2 conventions pour `dataLayers[].file` : chemin
  // RELATIF au dossier du plan (« chemin.json ») et chemin COMPLET depuis la
  // racine web (« data/test2/chemin.json » — cas des plans serveur
  // historiques). L'ancien code ne tentait que `path + "/" + file` → URL
  // doublée (« data/test2/data/test2/chemin.json ») → 404 silencieux → la
  // recherche multi-plans perdait les points datalayer ET le leg distant de
  // l'itinéraire inter-plan voyait « 0 tracés » sur ces plans serveur.
  // (Les plans ZIP locaux avaient déjà leur fallback `|| zip.file(file)`.)
  async function _fetchLayerJson(basePath, file) {
    const essais = [basePath + "/" + file];
    if (String(file).indexOf("/") >= 0) essais.push(file);
    for (let i = 0; i < essais.length; i++) {
      try {
        const resp = await fetch(essais[i], { cache: "no-cache" });
        if (resp.ok) return await resp.json();
      } catch(e) { /* essai suivant */ }
    }
    throw new Error("datalayer introuvable : " + file);
  }

  async function _collecterPointsDuPlan(plan, stats) {
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
      if (plan.type === "server" && plan.path && !plan.zip) {
        const cfg = await (await fetch(plan.path + "/plan-config.json", { cache: "no-cache" })).json();
        const layers = (cfg && cfg.dataLayers) || [];
        for (let i = 0; i < layers.length; i++) {
          try {
            const dj = await _fetchLayerJson(plan.path, layers[i].file);   // 🐛 v1.64.0 : double essai
            (dj.data || []).forEach(function(p) {
              if (p && typeof p.x === "number" && typeof p.y === "number") {
                pts.push({ id: p.id || "", nom: p.nom || "", x: p.x, y: p.y,
                           tags: p.tags || [], source: "data", level: p.level });
              }
            });
          } catch(e) { /* layer illisible → skip */ }
        }
      } else if ((plan.type === "local" || plan.zip) && window.PlanRegistry && window.JSZip) {
        const blob = await window.PlanRegistry.getBlob(plan.id);
        if (!blob && stats) stats.dataError = true;   // 🆕 v1.59.0 (U2) : ZIP absent d'IDB
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
    } catch(e) {
      console.warn("[InterPlanLinks] datalayers " + plan.id + " illisibles :", e);
      if (stats) stats.dataError = true;   // 🆕 v1.59.0 (U2) : serveur injoignable / config illisible
    }

    // 🆕 A5 : resync opportuniste — on vient de lire les points frais de ce
    // plan (picker liaison / recherche cross-plan), autant en profiter pour
    // rafraîchir les snapshots des liaisons qui le référencent. Skip si la
    // lecture des datalayers a échoué (données partielles → un point data
    // introuvable ne doit pas être interprété — les côtés retrouvés via la
    // session restent resyncables sans risque, mais on privilégie la
    // prudence : resync uniquement sur lecture complète).
    if (!stats || !stats.dataError) {
      try { _resyncSnapshotsForPlan(plan.id, pts); } catch(e) {}
    }

    return pts;
  }

  // ---------------------------------------------------------------
  // 🆕 v1.60.0 (A6) — LECTURE ROUTING d'un plan NON chargé
  // ---------------------------------------------------------------
  // Même mécanique que _collecterPointsDuPlan mais pour les ROADS + ZONES
  // (nécessaires au Dijkstra du leg distant : graphe + zones inaccessibles
  // dures + zones évitables). Session localStorage (state.roads/zones) +
  // datalayers (json.roads/zones, serveur fetch ou ZIP IndexedDB).
  // stats.dataError = datalayers inaccessibles (le leg distant serait
  // calculé sur un réseau PARTIEL → l'appelant doit refuser, pas deviner).
  async function _collecterRoutingDuPlan(plan, stats) {
    const roads = [], zones = [];
    let scale = null;   // px/mètre du plan distant (cfg.tracking.scale) — nécessaire
                        // pour sommer les distances des legs en MÈTRES (⚠️ les px
                        // de 2 plans n'ont pas la même échelle)
    function _absorber(objRoads, objZones) {
      (objRoads || []).forEach(function(r) {
        if (r && Array.isArray(r.points) && r.points.length >= 2 && r.type !== "itinerary") roads.push(r);
      });
      (objZones || []).forEach(function(z) {
        if (z && Array.isArray(z.points) && z.points.length >= 3) zones.push(z);
      });
    }
    // 1) Session du plan
    try {
      const raw = localStorage.getItem("myktamap_session_v1_" + plan.id);
      if (raw) {
        const sess = JSON.parse(raw);
        _absorber(sess.roads, sess.zones);
      }
    } catch(e) { console.warn("[InterPlanLinks] session routing " + plan.id + " illisible :", e); }
    // 2) Datalayers
    try {
      if (plan.type === "server" && plan.path && !plan.zip) {
        const cfg = await (await fetch(plan.path + "/plan-config.json", { cache: "no-cache" })).json();
        if (cfg && cfg.tracking && Number.isFinite(cfg.tracking.scale) && cfg.tracking.scale > 0) scale = cfg.tracking.scale;
        const layers = (cfg && cfg.dataLayers) || [];
        for (let i = 0; i < layers.length; i++) {
          try {
            const dj = await _fetchLayerJson(plan.path, layers[i].file);   // 🐛 v1.64.0 : double essai
            _absorber(dj.roads, dj.zones);
          } catch(e) { /* layer illisible → skip */ }
        }
      } else if ((plan.type === "local" || plan.zip) && window.PlanRegistry && window.JSZip) {
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
    return { roads: roads, zones: zones, scale: scale };
  }

  // ---------------------------------------------------------------
  // MODALE DE CRÉATION — picker plan cible → recherche point → créer
  // ---------------------------------------------------------------
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
      pointUid: pointUid ? String(pointUid) : undefined,   // 🆔 v2.4.0
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
            pointUid: p.uid ? String(p.uid) : undefined,   // 🆔 v2.4.0
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
        // 🆕 v1.59.0 (U2) : stats de collecte — si les datalayers du plan sont
        // injoignables (serveur off, ZIP absent), on le DIT au lieu de laisser
        // un « 0 points » muet.
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

  // ---------------------------------------------------------------
  // NAVIGATION — goTo générique + pile de retour (v1.58.0)
  // ---------------------------------------------------------------
  // goTo(planId, target, opts) : navigation inter-plan RÉUTILISABLE —
  // consommée par les liaisons (naviguerVers), le bouton ↩️ Retour et la
  // recherche cross-plan. target = { x, y, level?, tag?, zoom?, label?,
  // planName? }. opts = { confirm: bool (mini-modale avant switch),
  // noStack: bool (ne pas empiler l'origine — cas du retour lui-même) }.
  function goTo(planId, target, opts) {
    opts = opts || {};
    const plan = window.PlanRegistry ? window.PlanRegistry.findById(planId) : null;
    if (!plan) {
      window.ktaAlerte(_t("ipl.err.planAbsent", { plan: (target && target.planName) || planId }), { type: "erreur" });
      return;
    }

    // 🐛 v1.58.1 (KARMA « si je sélectionne un point du plan en cours, pas de
    // bouton retour ») : cible sur le PLAN COURANT → chemin court. Pas de
    // rechargement du plan (inutile et lent), pas de confirmation (« changer
    // de plan ? » n'a pas de sens), pas d'empilement ni de bouton Retour (on
    // reste sur place) — juste bascule de niveau éventuelle + pan/flash
    // immédiat (samePlan : une seule passe, rien ne recentre derrière).
    const planCharge = _planAffiche();
    if (planCharge && planId === _currentPlanId()) {
      if (!target) return;   // 🕸️ v1.65.0 : « ouvrir le plan » sans cible → déjà dessus
      if (window.map) try { window.map.closePopup(); } catch(e) {}
      _pendingTarget = { x: target.x, y: target.y, level: target.level,
                         tag: target.tag, zoom: target.zoom, samePlan: true };
      _pendingConsumed = false;
      _consumePendingTarget();
      return;
    }

    const doGo = async function() {
      // ↩️ v1.58.0 (A2, décisions 1:a 3:a) : empile l'ORIGINE (vue courante :
      // plan + centre + niveau + zoom) avant de partir — pile N niveaux en
      // RAM. Le retour (noStack) ne ré-empile pas (sinon ping-pong infini).
      if (!opts.noStack) _empilerOrigine();
      if (window.map) try { window.map.closePopup(); } catch(e) {}
      _retirerBoutonRetour();
      // 🐛 v1.57.0-fix : cible posée AVANT le switch — consommée par
      // onPlanLoaded (fin de lancerApplication) ET par le fallback
      // post-await. Sans ça, le recentrage de session post-chargement
      // écrasait notre setView (« j'arrive sur ma position »).
      // 🆕 v1.61.0 (KARMA) : opts.recalerTracker → à l'arrivée, le TRACKER
      // est recalé sur le point cible (traversée PHYSIQUE d'un portail —
      // l'user y est réellement). Jamais posé par la recherche « voir ».
      // 🕸️ v1.65.0 (A7) : target peut être NULL (« ouvrir le plan » depuis le
      // graphe, plan sans liaison → pas de point d'ancrage) → simple switch,
      // pas de cible pendante ni de pan.
      _pendingTarget = target
        ? { x: target.x, y: target.y, level: target.level,
            tag: target.tag, zoom: target.zoom,
            recale: !!opts.recalerTracker }
        : null;
      _pendingConsumed = false;
      try {
        if (plan.type === "server" && !plan.zip) {   // 📦 plan ZIP : chargerPlanDuRegistre
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
        '<div class="kta-modal-icon" style="color:#8cb4ff;">🌀</div>' +
        '<div class="kta-modal-titre">' + _esc(_t("ipl.nav.titre")) + '</div>' +
        '<div class="kta-modal-texte">' +
          _esc(_t("ipl.nav.texte", { plan: plan.name || planId,
                                     point: (target && (target.label || (target.x + "," + target.y))) || (plan.name || planId) })) +
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
    document.getElementById("kta-ipl-nav-yes").addEventListener("click", function() {
      modal.remove();
      doGo();
    });
  }

  // « Y aller » depuis une liaison (5:a : mini-confirmation puis switch).
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
    }, { confirm: true, recalerTracker: true });   // 🆕 v1.61.0 : traversée physique → tracker recalé
  }

  // ---------------------------------------------------------------
  // ↩️ PILE DE RETOUR (A2 — décisions 1:a 2:a 3:a)
  // ---------------------------------------------------------------
  // Pile en MÉMOIRE VIVE uniquement (perdue au reload — voulu). Chaque saut
  // goTo (hors retour) empile l'origine ; le bouton flottant temporaire
  // (15 s) dépile. Enchaîner 3 portails = 3 retours possibles.
  const _navStack = [];
  let _backBtnTimer = null;

  // 🧹 v1.68.0 (audit KARMA « fermetures à la sortie du plan ») — purge des
  // flottants de navigation. contexte :
  //   "home"   : sortie vers le HOME (afficherLoader) → bouton Retour retiré
  //              (mini-pastille comprise — elle n'a pas de timer) + pile vidée
  //              (partir du home rompt la chaîne, cohérent v1.58.1).
  //   "switch" : teardown d'un changement de plan. Si un _pendingTarget existe,
  //              c'est un goTo (navigation intentionnelle qui gère déjà bouton
  //              et pile) → no-op. Sinon = switch DIRECT (sélecteur du titre) →
  //              la pile pointe vers un contexte périmé : bouton retiré + pile
  //              vidée (bug bench : mini-pastille avec retour obsolète).
  function onPlanExit(contexte) {
    if (contexte === "switch" && _pendingTarget) return;   // goTo en cours → géré
    _retirerBoutonRetour();
    _navStack.length = 0;
  }

  function _empilerOrigine() {
    // 🐛 v1.58.1 (KARMA « depuis une recherche du home, pas de bouton
    // retour ») : au HOME, _currentLoadedPlanId ET window.map PERSISTENT du
    // dernier plan chargé (le retour au loader ne les purge pas) → on
    // empilait une fausse origine. Le marqueur fiable du home est
    // PLAN_CONFIG === null (resetRuntimeAssets). Partir du home ROMPT aussi
    // la chaîne de navigation : on vide la pile (pas de « retour » vers un
    // vieux saut d'avant le passage au home).
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

  // Bouton flottant « ↩️ Retour : <plan> » affiché après l'arrivée (2:a :
  // temporaire, 15 s ou clic). La pile reste en RAM après expiration — le
  // bouton réapparaîtra au prochain saut si des niveaux restent à dépiler.
  //
  // 🆕 v1.61.0 (U4, KARMA « pouvoir réduire ou supprimer ce bouton ») :
  //   - [✕] ferme le bouton SANS déclencher le retour. 🆕 v1.73.0 (KARMA
  //     « supprime les retours possibles — éviter un empilement inutile ») :
  //     ✕ VIDE AUSSI LA PILE — fermer = renoncer à la chaîne de retours,
  //     le bouton ne réapparaîtra pas au prochain saut avec du périmé ;
  //   - [–] RÉDUIT en mini-pastille ↩️ discrète (clic pastille = ré-expansion,
  //     jamais de retour direct depuis la pastille — anti-mauvais-clic).
  //     Le choix « réduit » est MÉMORISÉ (localStorage) : les prochains sauts
  //     affichent directement la pastille ; ré-expandre re-mémorise « plein ».
  //   - En mode réduit, PAS de timer 15 s : la pastille ne pollue pas, elle
  //     peut rester jusqu'au prochain événement.
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
      // Pastille discrète : clic = ré-expansion (jamais de retour direct).
      wrap.innerHTML = '<button type="button" class="kta-ipl-back-minibtn" title="' +
        _esc(_t("ipl.back.expandTitle")) + '">↩️' +
        (_navStack.length > 1 ? '<span class="kta-ipl-back-depth">' + _navStack.length + '</span>' : '') +
        '</button>';
      wrap.querySelector(".kta-ipl-back-minibtn").addEventListener("click", function() {
        _setBackBtnMode("full");
        _afficherBoutonRetour("full");
      });
      document.documentElement.appendChild(wrap);
      // Pas de timer en mode mini (la pastille ne pollue pas).
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
      _navStack.length = 0;   // v1.73.0 : fermer = abandonner la chaîne de retours
    });
    document.documentElement.appendChild(wrap);
    _backBtnTimer = setTimeout(_retirerBoutonRetour, 15000);
  }

  // Cible de navigation en attente (posée par goTo, consommée une
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

    // 🐛 v1.58.1 — cible sur le PLAN COURANT (samePlan) : une seule passe
    // immédiate (aucun restore de session ne recentre derrière puisqu'il n'y
    // a pas eu de rechargement) et PAS de bouton Retour (on n'a pas bougé de
    // plan — et des restes de pile d'anciens sauts ne doivent pas réapparaître
    // après un simple recentrage).
    if (t.samePlan) {
      _panEtFlash(t, true);
      return;
    }

    // Triple passe : le restore de session (SessionPersist) et le tracker
    // (« démarrage sur la dernière position », v1.49.0) recentrent la vue en
    // async APRÈS la fin de lancerApplication. On repasse derrière eux à
    // +600 ms (setView + flash), puis +1600/+2600 ms (setView silencieux)
    // pour garder la main sur la vue finale.
    _panEtFlash(t, true);
    setTimeout(function() { _panEtFlash(t, false); }, 1600);
    setTimeout(function() { _panEtFlash(t, false); }, 2600);

    // ↩️ v1.58.0 : propose le retour vers l'origine (bouton flottant 15 s)
    // une fois l'arrivée peinte. Vaut pour TOUTES les navigations goTo (lien,
    // recherche cross-plan) — après un retour, s'il reste des niveaux dans la
    // pile, le bouton réapparaît pour continuer à dépiler.
    setTimeout(_afficherBoutonRetour, 900);

    // 🆕 v1.61.0 (KARMA « recalage de position sur le point d'arrivée ») :
    // traversée PHYSIQUE d'un portail → recale le tracker sur le point
    // d'arrivée du plan cible, IMMÉDIATEMENT (le restore de session tracker
    // est synchrone dans lancerApplication → déjà passé quand on consomme ;
    // vérifié au bench t+3s). Re-assertion à +2.8 s UNIQUEMENT si quelque
    // chose a bougé la position entre-temps (ceinture — évite double
    // vibration/ancre timeline dans le cas nominal).
    if (t.recale) {
      const _recaler = function() {
        if (typeof window.recalerTrackerSurPoint !== "function") return;
        try {
          // `teleport` : une traversée de portail n'est PAS une distance
          // parcourue sur CE plan — sans ce marqueur, elle gonflerait la
          // distance estimée du Carnet (cf. tracking.js > _estimerSegmentDepuisAncre).
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

  // Pan (+ flash optionnel) sur la cible t = {x, y, zoom?}. Retry léger si la
  // map du nouveau plan n'est pas encore opérationnelle. Le zoom n'est fourni
  // que par le RETOUR (restauration de la vue d'origine) — les autres
  // navigations conservent le zoom courant.
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
  // (Ex-BADGES 🌀 — RETIRÉS en v1.59.0, décision KARMA « enlève le badge
  // portail ») : le marquage visuel d'un point lié est désormais un CHOIX
  // UTILISATEUR via le tag builtin « portail » (icône vortex dédiée,
  // icon/portail.png — cf TAGS_BUILTIN dans map.js). Un point lié peut
  // garder n'importe quel tag (aucun marquage) ou prendre le tag portail.
  // refreshBadges reste exposée en NO-OP (compat : hook historique dans
  // interfaceConfig.js > appliquerFiltreNiveau, anciens callers éventuels).
  // ---------------------------------------------------------------
  function refreshBadges() { /* no-op depuis v1.59.0 — cf commentaire */ }

  // ---------------------------------------------------------------
  // 🆕 v1.59.x (A5) — RESYNC des SNAPSHOTS de liaisons
  // ---------------------------------------------------------------
  // Un snapshot (nom/coords/level/tag d'un côté) peut se périmer si le point
  // est renommé ou déplacé après la création de la liaison. Principe : « le
  // plan qui SAIT met à jour ses propres côtés » — resync silencieux :
  //   1. au CHARGEMENT d'un plan (ses points en mémoire font autorité sur
  //      les côtés qui le référencent — zéro fetch supplémentaire) ;
  //   2. opportunistement quand collectPointsForPlan lit un plan distant
  //      (picker liaison / recherche cross-plan — les points frais sont là).
  // Au fil de l'usage normal, tous les snapshots convergent.
  // Matching : par pointId (stable, suit un point déplacé) sinon par coords
  // arrondies (points sans id — un déplacement change alors l'identité, on
  // ne peut resynchroniser que le nom/level/tag d'un point retrouvé sur place).
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
        }
      });
    });
    if (changed > 0) {
      _save(reg);
      console.log("[InterPlanLinks] Resync snapshots « " + planId + " » : " + changed + " côté(s) mis à jour");
    }
    return changed;
  }

  // Resync au chargement du plan courant : points session + datalayers déjà
  // en mémoire via SearchPoints.getAllPoints (format [{point, layerId}]).
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

  // Hook appelé par main.js à la fin de lancerApplication (plan prêt).
  function onPlanLoaded() {
    // 🐛 v1.57.0-fix : consomme la cible de navigation pendante (« Y aller »
    // depuis une liaison) — repasse derrière les recentrages de session.
    setTimeout(_consumePendingTarget, 600);
    // 🆕 A5 : resync différé des snapshots des côtés locaux (laisse les
    // datalayers async finir leur chargement — même délai que les stats plan).
    setTimeout(_resyncPlanCourant, 2000);
  }

  // 🐛 v1.57.0-fix : purge des liaisons d'un point SUPPRIMÉ (hook appelé par
  // editor.js > supprimerPointEditor). Le lien entier est retiré (une liaison
  // sans l'un de ses deux bouts n'a plus de sens) → le badge disparaît
  // immédiatement, des 2 côtés du registre.
  function onPointDeleted(planId, point) {
    if (!planId || !point) return 0;
    const reg = _load();
    const before = reg.links.length;
    reg.links = reg.links.filter(function(l) {
      return !_coteDuPoint(l.a, planId, point) && !_coteDuPoint(l.b, planId, point);
    });
    const removed = before - reg.links.length;
    if (removed > 0) {
      _save(reg);
      refreshBadges();
      console.log("[InterPlanLinks] " + removed + " liaison(s) purgée(s) (point supprimé)");
    }
    return removed;
  }

  // 🆔 v2.4.0 — Migration douce des côtés de liaison du plan courant (ETUDE_UID
  // décision 12) : un côté sans pointUid reçoit l'uid du point s'il le désigne
  // sans ambiguïté — un seul point de ce nom, sinon l'homonyme à la même
  // position (1 px). Ambigu : inchangé (reconnu par son nom). Les côtés des
  // AUTRES plans ne sont pas touchés : leurs points ne sont pas chargés.
  function migrerVersUid(planId, points) {
    if (!planId || !Array.isArray(points)) return 0;
    const reg = _load();
    let n = 0;
    reg.links.forEach(function(l) {
      ["a", "b"].forEach(function(cote) {
        const side = l[cote];
        if (!side || side.planId !== planId || side.pointUid || !side.pointId) return;
        let c = points.filter(function(p) { return p && String(p.id || "") === side.pointId; });
        if (c.length > 1) {
          c = c.filter(function(p) { return Math.abs((p.x || 0) - (side.x || 0)) < 1 && Math.abs((p.y || 0) - (side.y || 0)) < 1; });
        }
        if (c.length === 1 && typeof c[0].uid === "string" && c[0].uid) { side.pointUid = c[0].uid; n++; }
      });
    });
    if (n > 0) { _save(reg); console.log("[InterPlanLinks] " + n + " côté(s) de liaison rattaché(s) à l'uid de leur point (v2.4.0)"); }
    return n;
  }

  // 📌 v1.85.0 — un point de session REPOSITIONNÉ (cf. editor.js >
  // repositionnerPointEditor). La liaison SURVIT au déplacement : elle est
  // indexée par `id:<id>` et un point de session en a toujours un.
  //
  // 🩸 Mais les coordonnées STOCKÉES dans le lien, elles, deviendraient
  // périmées — et elles servent ailleurs : le tracé du lien à l'export KMZ
  // (`planToGps(t, link.a.x, link.a.y)`) et le repli d'affichage quand le
  // point n'a pas de nom. Sans ce recalage, déplacer un point relié ferait
  // partir sa liaison de l'ancienne position dans le KMZ, sans rien dire.
  //
  // `ancX/ancY` = la position AVANT le clic : c'est la seule clé valable si
  // le point n'a pas d'id (cas data layer) ; avec un id elle est ignorée.
  function onPointMoved(planId, point, ancX, ancY) {
    if (!planId || !point) return 0;
    const reg = _load();
    let recales = 0;
    reg.links.forEach(function(l) {
      ["a", "b"].forEach(function(cote) {
        const side = l[cote];
        if (!_coteDuPoint(side, planId, point, ancX, ancY)) return;
        side.x = Number(point.x) || 0;
        side.y = Number(point.y) || 0;
        recales++;
      });
    });
    if (recales > 0) {
      _save(reg);
      refreshBadges();
      console.log("[InterPlanLinks] " + recales + " côté(s) de liaison recalé(s) (point déplacé)");
    }
    return recales;
  }
  // ---------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------
  window.InterPlanLinks = {
    getLinksForPoint:     getLinksForPoint,
    getLinksForPlan:      getLinksForPlan,
    getAllLinks:          getAllLinks,
    onPlanExit:           onPlanExit,   // 🧹 v1.68.0 : purge flottants sortie/switch
    createLink:           createLink,
    removeLink:           removeLink,
    importLinks:          importLinks,
    transfererPlan:       transfererPlan,
    buildPopupHtml:       function(point, layerId) { return buildPopupHtml(point, layerId); },
    ouvrirCreation:       ouvrirCreation,
    naviguerVers:         naviguerVers,
    supprimerDepuisPopup: supprimerDepuisPopup,
    onPlanLoaded:         onPlanLoaded,
    // 🌀 01/10/2026 — vrai pendant le changement de plan d'une traversée
    // PHYSIQUE de portail (goTo recalerTracker) : interPlanRoute n'y poursuit
    // l'itinéraire que dans ce cas (un plan ouvert autrement l'abandonne).
    traverseePhysiqueEnCours: function() { return !!(_pendingTarget && _pendingTarget.recale); },
    onPointDeleted:       onPointDeleted,
    migrerVersUid:        migrerVersUid,   // 🆔 v2.4.0
    onPointMoved:         onPointMoved,   // 📌 v1.85.0 : recale les coords d'un point déplacé
    refreshBadges:        refreshBadges,
    // 🆕 v1.58.0 — navigation générique (liaisons, retour, recherche
    // cross-plan) + lecture des points d'un plan non chargé (réutilisée par
    // js/crossPlanSearch.js — zéro duplication du lecteur session/ZIP/serveur).
    goTo:                 goTo,
    collectPointsForPlan: _collecterPointsDuPlan,
    collectRoutingDataForPlan: _collecterRoutingDuPlan,   // 🆕 v1.60.0 (A6) — roads+zones d'un plan non chargé
    // 🆕 v1.59.0 (A3) — gestionnaire global (bouton HOME « 🌀 Mes liaisons »)
    ouvrirGestionnaire:   ouvrirGestionnaire,
    // 📐 v1.81.0 (D5) — écart de calage en mètres, ou null si non mesurable.
    // Consommée par la Vue OSM : ne PAS en refaire une copie ailleurs.
    ecartCalage:          ecartCalage
  };

  console.log("[InterPlanLinks] Module chargé (" + _load().links.length + " liaison(s))");
})();
