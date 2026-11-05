/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// raccordsTraces.js — « 🔗 Raccords à vérifier » (Éditeur de données) : les écarts de MIN_PX à MAX_M entre deux morceaux
// du réseau de l'itinéraire aujourd'hui séparés, sur un même niveau, un par paire de morceaux (le plus court). Revue
// sur la carte (bandeau Précédent / Suivant) : Raccorder ou Ignorer. Pourquoi : la règle stricte des jonctions
// (pathfinder.js, bouts seuls à 15 px, sommets intérieurs à 3 px) ne relie plus deux galeries parallèles à travers un
// mur, ni un carrefour dessiné avec deux sommets intérieurs écartés ; la distance seule ne les distingue pas.
// Morceaux = composantes connexes du graphe de l'itinéraire (Pathfinder.grapheDeTraces : types par défaut, sans
// obstacle) ; un écart à l'intérieur d'un morceau n'est jamais proposé.
// Raccorder : le sommet (un bout de préférence, sinon celui du plus petit morceau) va sur le point le plus proche de
// l'autre tracé, qui y gagne un sommet s'il n'en a pas (carrefour exact, fusionné par le graphe). Un tracé de calque
// passe d'abord en session par la question de « 🔄 Modifier » (FilterPanel.rapatrierCalque).
// ⚠️ contrat : une écriture = captureState("roads") → mutation → KtaUid.touch → ktaFormesAjustables.roads.rendre() (un
// `kta:donneesPlanChange`) → record → SessionPersist.save, comme ajusterSommets.js > _ecrire : Ctrl+Z l'annule.
// Ignorer : clé de l'écart retenue par plan (config.js > setPlanRaccordsIgnores) ; une paire de morceaux dont un écart
// est ignoré ne revient plus. 🩸 Clé = géométrie arrondie : redessiner l'endroit fait revenir l'écart (voulu).
// Expose : window.KtaRaccords = { detecter(), ouvrir(), fermer(), raccorder(e), ignorer(e), reafficherIgnores(),
//   seuilsPx(), liste(), etat() }.
// Garde-fou : scripts/smoke/checkup-raccords.js · Doc : docs/architecture/multilevel-pathfinding.md, ui.md §91.5

window.KtaRaccords = (function () {
  "use strict";

  const MAX_M = 6;                     // écart le plus grand proposé, en mètres (plan à l'échelle)
  // Plus petit écart proposé = seuil de fusion : un écart déjà relié par le graphe est dans le même morceau, donc exclu ;
  // en dessous de 1,5 px, deux sommets sont le même nœud. MAX_PX : plan sans échelle (tolérance des bouts).
  const MIN_PX = 1.5, MAX_PX = 15;
  const FUSION_PX = 1.5;               // pathfinder.js > SPATIAL_MERGE_THRESHOLD : sous ce seuil, c'est le même nœud
  const EGAL_PX = 1;                   // écarts d'une paire à 1 px près : le bout, puis le petit morceau, gagnent
  const TYPES = ["principal", "secondaire", "chemin"];   // réseau de l'itinéraire par défaut (pathfinder.js)

  let _liste = [];
  let _index = 0;
  let _nbIgnores = 0;
  let _bandeau = null;
  let _calque = null;
  let _renderer = null;
  let _recalcTimer = 0;

  function _t(k, p) { return window.I18n && typeof window.I18n.t === "function" ? window.I18n.t(k, p) : k; }
  function _esc(s) { return window.ktaEsc(String(s)); }
  function _toast(msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, type);
  }
  function _niveauDe(r) { return Number.isInteger(r && r.level) ? r.level : 0; }
  function _multi() { return !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true); }
  function _r1(v) { return Math.round(v * 10) / 10; }

  function seuilsPx() {
    const s = Number(window.APP_CONFIG && window.APP_CONFIG.scale);
    return s > 0 ? { min: MIN_PX, max: MAX_M * s, echelle: s } : { min: MIN_PX, max: MAX_PX, echelle: 0 };
  }

  function _ecartTexte(px, echelle) {
    if (echelle > 0 && typeof window.formatDistance === "function") return window.formatDistance(px / echelle, 1);
    return _t("raccords.px", { n: Math.round(px) });
  }

  function _ignores() {
    return typeof window.getPlanRaccordsIgnores === "function" ? window.getPlanRaccordsIgnores() : [];
  }

  // Clé d'un écart : niveau + ses deux extrémités arrondies au dixième de px, dans un ordre fixe.
  function _cle(niveau, a, b) {
    const pa = _r1(a.x) + "," + _r1(a.y), pb = _r1(b.x) + "," + _r1(b.y);
    return niveau + "|" + (pa < pb ? pa + "|" + pb : pb + "|" + pa);
  }

  // Composantes connexes : comp[nœud] = n° du morceau, taille[n°] = nombre de nœuds.
  function _composantes(graph) {
    const n = graph.nodes.length, comp = new Int32Array(n).fill(-1), taille = [];
    for (let i = 0; i < n; i++) {
      if (comp[i] >= 0) continue;
      const c = taille.length, pile = [i];
      let k = 0;
      comp[i] = c;
      while (pile.length) {
        const u = pile.pop();
        k++;
        const e = graph.edges[u] || [];
        for (let j = 0; j < e.length; j++) {
          if (comp[e[j].to] < 0) { comp[e[j].to] = c; pile.push(e[j].to); }
        }
      }
      taille.push(k);
    }
    return { comp: comp, taille: taille };
  }

  function _projeter(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    let t = l2 < 1e-9 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const x = a.x + t * dx, y = a.y + t * dy;
    return { x: x, y: y, t: t, d: Math.hypot(p.x - x, p.y - y) };
  }

  // ── Détection ──────────
  // → { liste: [{ cle, niveau, ecartPx, a:{x,y} (sommet déplacé), b:{x,y} (point visé), mobile:{road,i,layerId,uid},
  //   cible:{road,k,layerId,uid} }], ignores } ; trié par niveau puis écart.
  function detecter() {
    const PF = window.Pathfinder;
    if (!PF || typeof PF.grapheDeTraces !== "function") return { liste: [], ignores: 0 };
    const roads = PF.collecterTraces();
    const graph = PF.grapheDeTraces(roads, { allowedTypes: TYPES });
    const cc = _composantes(graph);
    const S = seuilsPx();
    const ignores = new Set(_ignores());

    // Grille des segments : chaque segment dans les cellules de sa boîte élargie de S.max ; un sommet ne lit que la
    // sienne.
    const cell = Math.max(S.max, 8), grille = new Map();
    const eligible = function (r) {
      const road = roads[r];
      return !!(road && road.type !== "jonction" && graph.noeudsTrace[r] && TYPES.indexOf(road.type) >= 0);
    };
    for (let r = 0; r < roads.length; r++) {
      if (!eligible(r)) continue;
      const pts = roads[r].points;
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1];
        const x0 = Math.floor((Math.min(a.x, b.x) - S.max) / cell);
        const x1 = Math.floor((Math.max(a.x, b.x) + S.max) / cell);
        const y0 = Math.floor((Math.min(a.y, b.y) - S.max) / cell);
        const y1 = Math.floor((Math.max(a.y, b.y) + S.max) / cell);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cy = y0; cy <= y1; cy++) {
            const cle = cx + ":" + cy;
            let l = grille.get(cle);
            if (!l) { l = []; grille.set(cle, l); }
            l.push(r, k);
          }
        }
      }
    }

    const paires = new Map();   // "cA:cB" → { ignore, cands: [] }
    for (let r = 0; r < roads.length; r++) {
      if (!eligible(r)) continue;
      const pts = roads[r].points, noeuds = graph.noeudsTrace[r], niv = _niveauDe(roads[r]);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], cA = cc.comp[noeuds[i]];
        const l = grille.get(Math.floor(p.x / cell) + ":" + Math.floor(p.y / cell));
        if (!l) continue;
        for (let j = 0; j < l.length; j += 2) {
          const s = l[j], k = l[j + 1];
          if (s === r || _niveauDe(roads[s]) !== niv) continue;
          const cB = cc.comp[graph.noeudsTrace[s][k]];
          if (cB === cA) continue;
          const pr = _projeter(p, roads[s].points[k], roads[s].points[k + 1]);
          if (pr.d < S.min || pr.d > S.max) continue;
          const pk = cA < cB ? cA + ":" + cB : cB + ":" + cA;
          let e = paires.get(pk);
          if (!e) { e = { ignore: false, cands: [] }; paires.set(pk, e); }
          const b = { x: pr.x, y: pr.y };
          if (ignores.has(_cle(niv, p, b))) e.ignore = true;
          e.cands.push({ r: r, i: i, s: s, k: k, d: pr.d, b: b, niveau: niv,
            bout: i === 0 || i === pts.length - 1, taille: cc.taille[cA] });
        }
      }
    }

    const liste = [];
    let nIgn = 0;
    paires.forEach(function (e) {
      if (e.ignore) { nIgn++; return; }
      let min = Infinity;
      e.cands.forEach(function (c) { if (c.d < min) min = c.d; });
      const proches = e.cands.filter(function (c) { return c.d <= min + EGAL_PX; });
      proches.sort(function (u, v) {
        if (u.bout !== v.bout) return u.bout ? -1 : 1;
        if (u.taille !== v.taille) return u.taille - v.taille;
        return u.d - v.d;
      });
      const c = proches[0], R = roads[c.r], Sr = roads[c.s], a = R.points[c.i];
      liste.push({
        cle: _cle(c.niveau, a, c.b), niveau: c.niveau, ecartPx: c.d,
        a: { x: a.x, y: a.y }, b: c.b,
        mobile: { road: R, i: c.i, layerId: R.layerId == null ? null : R.layerId, uid: R.uid || null },
        cible: { road: Sr, k: c.k, layerId: Sr.layerId == null ? null : Sr.layerId, uid: Sr.uid || null }
      });
    });
    liste.sort(function (u, v) { return (u.niveau - v.niveau) || (u.ecartPx - v.ecartPx); });
    return { liste: liste, ignores: nIgn };
  }

  function _recalculer() {
    const r = detecter();
    _liste = r.liste;
    _nbIgnores = r.ignores;
    if (_index >= _liste.length) _index = Math.max(0, _liste.length - 1);
    return r;
  }

  // ── Écriture ──────────
  function _session() { return (typeof window.getRoads === "function" ? window.getRoads() : null) || []; }

  // Objet de session d'un tracé de la liste : lui-même s'il est en session, sinon sa copie rapatriée (même uid, sinon
  // même géométrie). null : introuvable.
  function _enSession(ref) {
    const ses = _session();
    if (ses.indexOf(ref.road) >= 0) return ref.road;
    const CS = window.CalqueSession, src = CS && CS.CLE_SOURCE;
    const geo = JSON.stringify((ref.road.points || []).map(function (p) { return [p.x, p.y]; }));
    for (let i = 0; i < ses.length; i++) {
      const o = ses[i];
      if (!o || (src && o[src] !== ref.layerId)) continue;
      if (ref.uid ? o.uid === ref.uid
        : JSON.stringify((o.points || []).map(function (p) { return [p.x, p.y]; })) === geo) return o;
    }
    return null;
  }

  // Calques à passer en session avant d'écrire : ceux des tracés de l'écart qui n'y sont pas encore.
  async function _rapatrierSiBesoin(e) {
    const CS = window.CalqueSession, ses = _session(), ids = [];
    [e.mobile, e.cible].forEach(function (ref) {
      if (ses.indexOf(ref.road) >= 0 || ref.layerId == null) return;
      if (!(CS && CS.estRapatrie(ref.layerId)) && ids.indexOf(ref.layerId) < 0) ids.push(ref.layerId);
    });
    for (let i = 0; i < ids.length; i++) {
      const FP = window.FilterPanel;
      if (!FP || typeof FP.rapatrierCalque !== "function" || ids[i] === "editor") {
        window.ktaAlerte(_t("raccords.err.calque"), { type: "erreur" });
        return false;
      }
      if (!(await FP.rapatrierCalque(ids[i]))) return false;
    }
    return true;
  }

  function _proche(p, q) { return Math.hypot(p.x - q.x, p.y - q.y) <= FUSION_PX; }

  async function raccorder(e) {
    if (!e) return false;
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return false;
    if (window.modeRoad || (typeof window._modeClicCarteActif === "function" && window._modeClicCarteActif())) {
      _toast(_t("raccords.err.outil"), "warn");
      return false;
    }
    if (!(await _rapatrierSiBesoin(e))) return false;
    const R = _enSession(e.mobile), S = _enSession(e.cible);
    const pa = R && R.points[e.mobile.i], s0 = S && S.points[e.cible.k], s1 = S && S.points[e.cible.k + 1];
    if (!R || !S || R === S || !pa || !s0 || !s1 || !_proche(pa, e.a) ||
        _projeter(e.b, s0, s1).d > 0.01) {
      window.ktaAlerte(_t("raccords.err.change"));
      _rafraichir();
      return false;
    }
    const H = window.HistoryManager;
    const avant = (H && typeof H.captureState === "function") ? H.captureState("roads") : null;
    let p = { x: e.b.x, y: e.b.y };
    if (_proche(p, s0)) p = { x: s0.x, y: s0.y };
    else if (_proche(p, s1)) p = { x: s1.x, y: s1.y };
    else S.points.splice(e.cible.k + 1, 0, { x: p.x, y: p.y });
    R.points[e.mobile.i] = Object.assign({}, pa, { x: p.x, y: p.y });
    if (window.KtaUid && typeof window.KtaUid.touch === "function") {
      if (R.uid) window.KtaUid.touch(R);
      if (S.uid) window.KtaUid.touch(S);
    }
    const prise = window.ktaFormesAjustables && window.ktaFormesAjustables.roads;
    try {
      if (prise) prise.rendre();
      else if (typeof window.renderRoads === "function") window.renderRoads();
    } catch (err) { console.warn("[Raccords] rendu :", err); }
    if (avant) H.record(_t("raccords.histo"), avant, "roads");
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch (err) { /* le poll de SessionPersist rattrape */ }
    }
    console.log("[Raccords] raccord posé, écart", e.ecartPx.toFixed(1), "px");
    return true;
  }

  function ignorer(e) {
    if (!e || typeof window.setPlanRaccordsIgnores !== "function") return false;
    const l = _ignores();
    if (l.indexOf(e.cle) < 0) l.push(e.cle);
    window.setPlanRaccordsIgnores(null, l);
    return true;
  }

  function reafficherIgnores() {
    const n = _ignores().length;
    if (typeof window.setPlanRaccordsIgnores === "function") window.setPlanRaccordsIgnores(null, []);
    return n;
  }

  // ── Carte : deux points entourés et l'écart en tireté (SVG : classes → jetons --kta-* du CSS) ──────────
  function _map() { return window.map && typeof window.map.fitBounds === "function" ? window.map : null; }

  function _effacerMarque() {
    if (_calque) { try { _calque.remove(); } catch (err) { /* carte détruite */ } }
    _calque = null;
  }

  function _montrer(e) {
    const m = _map();
    if (!m || !e) return;
    if (_multi() && window.APP_CONFIG.activeLevel !== e.niveau && typeof window.ktaSetActiveLevel === "function") {
      try { window.ktaSetActiveLevel(e.niveau, { source: "raccords" }); } catch (err) { /* niveau absent */ }
    }
    _effacerMarque();
    if (!_renderer || _renderer._map && _renderer._map !== m) _renderer = L.svg({ padding: 0.5 });
    const la = window.convertCoord(e.a.x, e.a.y), lb = window.convertCoord(e.b.x, e.b.y);
    const cercle = { renderer: _renderer, radius: 14, weight: 3, interactive: false, className: "kta-racc-cercle" };
    _calque = L.layerGroup([
      L.polyline([la, lb], { renderer: _renderer, weight: 3, dashArray: "5 5", interactive: false,
        className: "kta-racc-ecart" }),
      L.circleMarker(la, cercle),
      L.circleMarker(lb, cercle)
    ]).addTo(m);
    const marge = Math.max(seuilsPx().max * 2, 40);
    const x0 = Math.min(e.a.x, e.b.x) - marge, x1 = Math.max(e.a.x, e.b.x) + marge;
    const y0 = Math.min(e.a.y, e.b.y) - marge, y1 = Math.max(e.a.y, e.b.y) + marge;
    try {
      m.fitBounds(L.latLngBounds([window.convertCoord(x0, y0), window.convertCoord(x1, y1)]), { animate: false });
    } catch (err) { console.warn("[Raccords] cadrage :", err); }
  }

  // ── Bandeau de revue ──────────
  function _fermerBandeau() {
    if (_bandeau) { _bandeau.remove(); _bandeau = null; }
    document.removeEventListener("keydown", _onKey, true);
    window.removeEventListener("kta:donneesPlanChange", _onDonnees);
    clearTimeout(_recalcTimer);
    _effacerMarque();
  }

  function _onKey(ev) {
    if (ev.key !== "Escape" || !_bandeau) return;
    // Une fenêtre ouverte par-dessus (question du rapatriement, alerte) garde son Échap.
    if (document.querySelector(".kta-readme-modal-overlay, [aria-modal='true']")) return;
    ev.stopPropagation();
    _fermerBandeau();
    ouvrir();
  }

  // Données changées pendant la revue (Ctrl+Z, autre outil) : liste recalculée, une fois par rafale.
  function _onDonnees() {
    clearTimeout(_recalcTimer);
    _recalcTimer = setTimeout(function () { if (_bandeau) _rafraichir(); }, 300);
  }

  function _rafraichir() {
    _recalculer();
    if (!_bandeau) return;
    if (!_liste.length) {
      _toast(_t("raccords.toast.fini"), "success");
      _fermerBandeau();
      ouvrir();
      return;
    }
    _majBandeau();
  }

  function _majBandeau() {
    const e = _liste[_index];
    if (!_bandeau || !e) return;
    const S = seuilsPx();
    _bandeau.querySelector(".kta-racc-pos").textContent =
      _t("raccords.position", { i: _index + 1, n: _liste.length });
    _bandeau.querySelector(".kta-racc-info").textContent = _libelle(e, _index) + " · " +
      _t("raccords.ecart", { d: _ecartTexte(e.ecartPx, S.echelle) });
    _bandeau.querySelector('[data-racc="prec"]').disabled = _liste.length < 2;
    _bandeau.querySelector('[data-racc="suiv"]').disabled = _liste.length < 2;
    _montrer(e);
  }

  function _libelle(e, i) {
    return _multi()
      ? _t("raccords.niveau", { n: typeof window.ktaFormatNiveau === "function" ? window.ktaFormatNiveau(e.niveau)
        : String(e.niveau) })
      : _t("raccords.numero", { n: i + 1 });
  }

  function _ouvrirBandeau(i) {
    _fermerListe();
    _fermerBandeau();
    _index = i;
    const b = document.createElement("div");
    b.id = "kta-racc-bandeau";
    b.className = "kta-racc-bandeau";
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", _t("raccords.titre"));
    b.innerHTML =
      '<div class="kta-racc-nav">' +
        '<button type="button" class="kta-btn kta-btn-ghost" data-racc="prec">' + _esc(_t("raccords.prec")) +
          '</button>' +
        '<span class="kta-racc-pos"></span>' +
        '<button type="button" class="kta-btn kta-btn-ghost" data-racc="suiv">' + _esc(_t("raccords.suiv")) +
          '</button>' +
      '</div>' +
      '<span class="kta-racc-info"></span>' +
      '<div class="kta-racc-actions">' +
        '<button type="button" class="kta-btn kta-btn-primary" data-racc="raccorder">' +
          _esc(_t("raccords.raccorder")) + '</button>' +
        '<button type="button" class="kta-btn kta-btn-ghost" data-racc="ignorer">' + _esc(_t("raccords.ignorer")) +
          '</button>' +
        '<button type="button" class="kta-btn kta-btn-ghost" data-racc="fermer">' + _esc(_t("raccords.fermer")) +
          '</button>' +
      '</div>';
    document.body.appendChild(b);
    _bandeau = b;
    let occupe = false;
    b.addEventListener("click", async function (ev) {
      const btn = ev.target.closest && ev.target.closest("[data-racc]");
      if (!btn || occupe) return;
      const act = btn.getAttribute("data-racc"), n = _liste.length;
      if (act === "fermer") { _fermerBandeau(); ouvrir(); return; }
      if (act === "prec" && n) { _index = (_index - 1 + n) % n; _majBandeau(); return; }
      if (act === "suiv" && n) { _index = (_index + 1) % n; _majBandeau(); return; }
      const e = _liste[_index];
      if (act === "ignorer" && e) {
        ignorer(e);
        _toast(_t("raccords.toast.ignore"), "success");
        _rafraichir();
        return;
      }
      if (act === "raccorder" && e) {
        occupe = true;
        try {
          if (await raccorder(e)) {
            _toast(_t("raccords.toast.raccorde"), "success");
            clearTimeout(_recalcTimer);
            _rafraichir();
          }
        } finally { occupe = false; }
      }
    });
    document.addEventListener("keydown", _onKey, true);
    window.addEventListener("kta:donneesPlanChange", _onDonnees);
    _majBandeau();
  }

  // ── Fenêtre de la liste ──────────
  function _fermerListe() {
    const m = document.getElementById("kta-racc-modal");
    if (m) { if (m.__ktaOnKey) document.removeEventListener("keydown", m.__ktaOnKey); m.remove(); }
  }

  function fermer() { _fermerListe(); _fermerBandeau(); }

  function ouvrir() {
    _fermerListe();
    if (!_map() || !(typeof window.ktaPlanAffiche !== "function" || window.ktaPlanAffiche())) {
      window.ktaAlerte(_t("raccords.err.aucunPlan"), { type: "info" });
      return;
    }
    _recalculer();
    const S = seuilsPx();
    const nIgn = _ignores().length;
    const note = _t("raccords.note", { min: _ecartTexte(S.min, S.echelle), max: _ecartTexte(S.max, S.echelle) });
    let corps = '<p class="kta-racc-note">' + _esc(note) + '</p>';
    if (_liste.length) {
      corps += '<ul class="kta-racc-liste">' + _liste.map(function (e, i) {
        return '<li><button type="button" class="kta-racc-ligne" data-racc-i="' + i + '">' +
          '<span class="kta-racc-ligne-nom">' + _esc(_libelle(e, i)) + '</span>' +
          '<span class="kta-racc-ligne-ecart">' + _esc(_ecartTexte(e.ecartPx, S.echelle)) + '</span>' +
          '</button></li>';
      }).join("") + '</ul>';
    } else {
      corps += '<p class="kta-racc-vide">' + _esc(_t("raccords.vide")) + '</p>';
    }
    if (nIgn > 0) {
      corps += '<div class="kta-racc-pied"><button type="button" class="kta-btn kta-btn-ghost kta-btn-small" ' +
        'data-racc="reafficher">' + _esc(_t("raccords.reafficher", { n: nIgn })) + '</button></div>';
    }
    const ov = document.createElement("div");
    ov.id = "kta-racc-modal";
    ov.className = "kta-readme-modal-overlay";
    ov.innerHTML =
      '<div class="kta-readme-modal-boite kta-racc-boite" role="dialog" aria-modal="true">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">🔗 ' + _esc(_t("raccords.titre")) + '</span>' +
          '<button type="button" class="kta-panneau-close" data-racc="fermer-liste" aria-label="' +
            _esc(_t("raccords.fermer")) + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-racc-corps">' + corps + '</div>' +
      '</div>';
    document.documentElement.appendChild(ov);
    const onKey = function (ev) { if (ev.key === "Escape") _fermerListe(); };
    ov.__ktaOnKey = onKey;
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", function (ev) {
      if (ev.target === ov) { _fermerListe(); return; }
      const ligne = ev.target.closest && ev.target.closest("[data-racc-i]");
      if (ligne) { _ouvrirBandeau(parseInt(ligne.getAttribute("data-racc-i"), 10) || 0); return; }
      const btn = ev.target.closest && ev.target.closest("[data-racc]");
      if (!btn) return;
      const act = btn.getAttribute("data-racc");
      if (act === "fermer-liste") _fermerListe();
      if (act === "reafficher") {
        const n = reafficherIgnores();
        _toast(_t("raccords.toast.reaffiches", { n: n }), "success");
        ouvrir();
      }
    });
  }

  // Plan quitté ou changé pendant la revue : le bandeau et sa marque partent avec lui.
  window.addEventListener("mktm:plan-ferme", fermer);

  return {
    detecter: detecter,
    ouvrir: ouvrir,
    fermer: fermer,
    raccorder: raccorder,
    ignorer: ignorer,
    reafficherIgnores: reafficherIgnores,
    seuilsPx: seuilsPx,
    // Copie de la liste courante (harnais, diagnostic) : rang, niveau, écart, extrémités, clé.
    liste: function () {
      return _liste.map(function (e, i) {
        return { i: i, niveau: e.niveau, ecartPx: e.ecartPx, a: { x: e.a.x, y: e.a.y }, b: { x: e.b.x, y: e.b.y },
          cle: e.cle };
      });
    },
    etat: function () {
      return { liste: _liste.length, index: _index, bandeau: !!_bandeau, ignores: _nbIgnores };
    },
    MIN_PX: MIN_PX,
    MAX_M: MAX_M
  };
})();
