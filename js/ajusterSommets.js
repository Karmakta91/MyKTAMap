/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// ajusterSommets.js — ajuster la suite de points d'une forme déjà dessinée, sur la carte 2D. Appui long (APPUI_MS)
// sur un sommet puis glisser : il se déplace ; au milieu d'un segment : un sommet naît là et se glisse aussitôt ;
// sur un sommet sans bouger : 🗑️ au point (refusé sous le minimum de la forme, un toast le dit).
// Familles : prises `window.ktaFormesAjustables.<roads|zones|structures|mesure>` = { cat (HistoryManager, null =
// hors historique, lu à chaque geste), objets() (modifiables ET visibles, hors objet en cours), ferme(o), minimum(o),
// libelle(o), rendre(), aimanter?(x, y, o, exclus) → {x, y} | null, etiquette?(action, o) → libellé d'historique }
// (road.js, zones.js, structures.js, measure.js). Outil 📐 seul armé : seule la mesure s'ajuste (_mesureSeule).
// Expose : window.KtaAjusterSommets = { enCours(), etat(), annuler(), APPUI_MS, RAYON_PX }.
// ⚠️ contrat : un geste = une écriture : captureState → mutation → KtaUid.touch → rendre() (un seul rendu, donc un
// seul `kta:donneesPlanChange`) → record → SessionPersist.save. Pendant le glisser, rien n'est écrit : aperçu seul.
// 🩸 Écoutes en CAPTURE sur window. Appui en attente puis glisser : pointermove / mousemove / touchmove avalés ; ni
// le drag de Leaflet, ni le pan manuel, ni la rotation à deux doigts (mapBearing.js > _panSuivre, _rotPointerMove)
// ne bougent la carte ; `enCours()` est le drapeau neutre pour tout autre geste. Le clic qui suit un appui long est
// avalé (pas de fiche), le menu contextuel aussi. Un 2e doigt, plus de BOUGE_PX avant l'appui long : rien n'est fait.
// 🩸 Position par map.mouseEventToLatLng : la rotation du plan orienté y est défaite (mapBearing.js >
// _installerPatchConversions) ; clientX ne sert qu'aux seuils de mouvement.
// Rien sans droit : lecture seule (ktaEditionRefusee), outil ou mode « clic carte » armé, calque non rapatrié (ses
// objets ne sont pas en session). Repérage : un balayage des objets visibles au pointerdown, jamais au pointermove.
// Garde-fou : scripts/smoke/checkup-ajuster-sommets.js · Doc : docs/architecture/ui.md § Ajuster une forme

window.KtaAjusterSommets = (function () {
  "use strict";

  const APPUI_MS = 500;        // appui long
  const VISUEL_MS = 150;       // la poignée d'attente paraît après ce délai (un tap ne la fait pas clignoter)
  const RAYON_PX = 24;         // rayon de toucher, px d'écran
  const BOUGE_PX = 6;          // avant l'appui long, au-delà : c'est un pan (seuil du pan manuel du plan orienté)
  const GLISSE_PX = 3;         // après l'appui long, au-delà : c'est un glisser, sinon le menu 🗑️
  const AVALER_MS = 700;       // clic qui suit le lâcher, avalé
  const MENU_MS = 6000;        // 🗑️ se retire seul
  const FAMILLES = ["roads", "zones", "structures", "mesure"];

  let _g = null;               // geste en cours
  let _avalerJusqua = 0;
  // Geste armé annulé (Échap, molette) doigt encore posé : son lâcher est traité comme celui d'un geste, le clic qui
  // suit est avalé (sinon il pose un point de mesure ou ouvre une fiche). Oublié au pointerdown suivant.
  let _lacherAvale = null;
  let _menu = null;            // { marker, timer, c }
  const _stats = { gestes: 0, ecritures: 0, annules: 0, refus: 0 };

  function _t(k, p) { return window.I18n && typeof window.I18n.t === "function" ? window.I18n.t(k, p) : k; }
  function _now() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }
  function _map() { return window.map && typeof window.map.mouseEventToLatLng === "function" ? window.map : null; }
  function _toast(msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, type);
  }

  // Outil 📐 seul armé (measure.js > ktaMesureAnnulable) : ses sommets s'ajustent, et rien d'autre.
  function _mesureSeule() {
    return typeof window.ktaMesureAnnulable === "function" && window.ktaMesureAnnulable() &&
      !window.modeRoad && !window.modeZone && !window.modeStructure && !window.modeEdition && !window.modeRecalage;
  }

  // Un outil, un picker ou une sélection armés passent avant (sauf l'outil 📐 pour ses propres sommets) ; lecture
  // seule : rien, en silence (l'appui long n'a rien demandé d'explicite).
  function _permis() {
    if (!_map()) return false;
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee(true)) return false;
    if (_mesureSeule()) {
      // un picker de position ou le choix d'emplacement d'une légende ouvert par-dessus garde la main
      if (document.querySelector(".kta-iti-floater, #kta-export-pick-banner")) return false;
    } else if (typeof window._modeClicCarteActif === "function") {
      if (window._modeClicCarteActif()) return false;
    } else if (window.modeRoad || window.modeZone || window.modeStructure || window.modeMesure) {
      return false;
    }
    if (window.modeEdition) return false;
    if (window.SelectionMulti && typeof window.SelectionMulti.estActif === "function" &&
        window.SelectionMulti.estActif()) return false;
    if (window.KtaSelectionZone && typeof window.KtaSelectionZone.enCours === "function" &&
        window.KtaSelectionZone.enCours()) return false;
    return true;
  }

  function _plan(m, e) {
    try {
      const ll = m.mouseEventToLatLng(e);
      const H = window.APP_CONFIG && window.APP_CONFIG.imageHeight;
      if (!ll || !Number.isFinite(H)) return null;
      return { x: ll.lng, y: H - ll.lat };
    } catch (err) { return null; }
  }

  // Px d'écran → unités plan (CRS.Simple : 1 unité = crs.scale(zoom) px ; la rotation garde les longueurs).
  function _pxEnPlan(m, px) {
    let s = 0;
    try { s = m.options.crs.scale(m.getZoom()); } catch (err) { s = 0; }
    return s > 0 ? px / s : 0;
  }

  // Sommet le plus proche dans le rayon, sinon milieu de segment le plus proche ; parmi les prises seulement.
  function _chercher(m, x, y, tol) {
    const reg = window.ktaFormesAjustables || {};
    const annotations = !window.layerEditor || m.hasLayer(window.layerEditor), seule = _mesureSeule();
    let s = null, mi = null;
    FAMILLES.forEach(function (f) {
      const a = reg[f];
      if (!a || typeof a.objets !== "function" || (f !== "mesure" && (!annotations || seule))) return;
      let objs = [];
      try { objs = a.objets() || []; } catch (err) { console.warn("[Ajuster] prise « " + f + " » :", err); return; }
      for (let k = 0; k < objs.length; k++) {
        const o = objs[k], pts = o && o.points, n = pts ? pts.length : 0;
        for (let i = 0; i < n; i++) {
          const d = Math.hypot(pts[i].x - x, pts[i].y - y);
          if (d <= tol && (!s || d < s.d)) {
            s = { genre: "sommet", f: f, a: a, o: o, i: i, x: pts[i].x, y: pts[i].y, d: d };
          }
        }
        if (s && s.d === 0) continue;
        const nSeg = (n >= 3 && a.ferme(o)) ? n : n - 1;
        for (let i = 0; i < nSeg; i++) {
          const p = pts[i], q = pts[(i + 1) % n];
          const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, d = Math.hypot(mx - x, my - y);
          if (d <= tol && (!mi || d < mi.d)) mi = { genre: "milieu", f: f, a: a, o: o, i: i + 1, x: mx, y: my, d: d };
        }
      }
    });
    return s || mi;
  }

  // L'objet visé est-il encore là (annulation, suppression, filtre changé entre l'appui et l'écriture) ?
  function _encorePresent(c) {
    try {
      return (c.a.objets() || []).some(function (o) { return o.points === c.o.points; });
    } catch (err) { return false; }
  }

  // ── Calques du geste : poignée et aperçu, SVG (classe → jetons --kta-* du CSS), un renderer par carte ──
  function _renderer(m) {
    if (!m._ktaAjusterRendu) m._ktaAjusterRendu = L.svg({ padding: 0.5 });
    return m._ktaAjusterRendu;
  }
  function _ll(p) { return window.convertCoord(p.x, p.y); }

  function _poignee(g, classe) {
    const m = _map();
    if (!m) return;
    const p = g.pts ? g.pts[g.idx] : g.c;
    if (!g.poignee) {
      g.poignee = L.circleMarker(_ll(p), { renderer: _renderer(m), radius: 10, weight: 3, interactive: false,
        className: classe }).addTo(m);
    } else {
      g.poignee.setLatLng(_ll(p));
      const el = g.poignee.getElement && g.poignee.getElement();
      if (el) el.setAttribute("class", classe);
    }
  }

  function _majApercu() {
    const g = _g, m = _map();
    if (!g || !m || !g.pts) return;
    g.raf = 0;
    const lls = g.pts.map(_ll);
    if (g.ferme && lls.length >= 3) lls.push(lls[0]);
    if (!g.apercu) {
      g.apercu = L.polyline(lls, { renderer: _renderer(m), weight: 3, dashArray: "6 5", interactive: false,
        className: "kta-ajuster-apercu" }).addTo(m);
    } else {
      g.apercu.setLatLngs(lls);
    }
    _poignee(g, "kta-ajuster-poignee");
  }
  function _planifierApercu() {
    if (!_g || _g.raf) return;
    _g.raf = (typeof requestAnimationFrame === "function") ? requestAnimationFrame(_majApercu)
      : setTimeout(_majApercu, 16);
  }

  // ── Menu 🗑️ au sommet ──
  function _fermerMenu() {
    if (!_menu) return;
    clearTimeout(_menu.timer);
    try { _menu.marker.remove(); } catch (err) { /* carte déjà détruite */ }
    _menu = null;
  }
  function _dansMenu(t) { return !!(t && t.closest && t.closest(".kta-ajuster-menu")); }

  function _ouvrirMenu(c) {
    _fermerMenu();
    const m = _map();
    if (!m) return;
    const titre = _t("ajuster.supprimer");
    const icon = L.divIcon({
      className: "kta-ajuster-menu",
      html: '<button type="button" class="kta-ajuster-suppr" aria-label="' + window.ktaEsc(titre) +
        '" title="' + window.ktaEsc(titre) + '">🗑️</button>',
      iconSize: [44, 44], iconAnchor: [22, 58]
    });
    const marker = L.marker(_ll(c), { icon: icon, interactive: true, keyboard: false, zIndexOffset: 1000 }).addTo(m);
    marker.on("click", function () { _fermerMenu(); _ecrire("supprimer", c, null); });
    _menu = { marker: marker, c: c, timer: setTimeout(_fermerMenu, MENU_MS) };
  }

  // ── Écriture : un geste = une entrée d'historique, un rendu ──
  function _ecrire(action, c, p) {
    if (!_permis() || !_encorePresent(c)) return false;
    const a = c.a, o = c.o, H = window.HistoryManager;
    if (action === "supprimer" && o.points.length - 1 < a.minimum(o)) {
      _stats.refus++;
      _toast(_t("ajuster.toast.minimum", { n: a.minimum(o) }), "warn");
      return false;
    }
    const avant = (a.cat && H && typeof H.captureState === "function") ? H.captureState(a.cat) : null;
    if (action === "supprimer") {
      o.points.splice(c.i, 1);
    } else {
      let np = { x: p.x, y: p.y };
      if (typeof a.aimanter === "function") {
        const exclus = action === "ajouter" ? [o.points[c.i - 1], o.points[c.i % o.points.length]]
          : [o.points[c.i], o.points[c.i - 1], o.points[c.i + 1]];
        const s = a.aimanter(np.x, np.y, o, exclus.filter(Boolean));
        if (s) np = { x: s.x, y: s.y };
      }
      if (action === "ajouter") o.points.splice(c.i, 0, np);
      else o.points[c.i] = Object.assign({}, o.points[c.i], np);
    }
    if (o.uid && window.KtaUid && typeof window.KtaUid.touch === "function") window.KtaUid.touch(o);
    try { a.rendre(); } catch (err) { console.warn("[Ajuster] rendu :", err); }
    if (avant) {
      H.record(typeof a.etiquette === "function" ? a.etiquette(action, o)
        : _t("ajuster.histo." + action, { type: a.libelle(o) }), avant, a.cat);
    }
    if (a.cat && window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch (err) { /* le poll de SessionPersist rattrape */ }
    }
    _stats.ecritures++;
    return true;
  }

  // ── Geste ──
  function _nettoyer() {
    const g = _g;
    _g = null;
    if (!g) return;
    clearTimeout(g.timer);
    clearTimeout(g.timerVisuel);
    if (g.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(g.raf);
    [g.poignee, g.apercu].forEach(function (l) { if (l) { try { l.remove(); } catch (err) { /* détruite */ } } });
    const m = _map();
    if (m) {
      if (g.dragAvant && m.dragging) { try { m.dragging.enable(); } catch (err) { /* carte détruite */ } }
      const cont = m.getContainer();
      if (cont) cont.classList.remove("kta-ajuster-attente", "kta-ajuster-geste");
    }
  }
  function annuler() {
    if (!_g) return false;
    if (_g.arme) _lacherAvale = _g.id;
    _stats.annules++;
    _nettoyer();
    return true;
  }

  function _armer() {
    const g = _g, m = _map();
    if (!g || !m) return;
    g.timer = null;
    if (!_permis() || !_encorePresent(g.c)) { annuler(); return; }
    g.arme = true;
    g.dragAvant = !!(m.dragging && m.dragging.enabled());
    if (g.dragAvant) m.dragging.disable();
    m.getContainer().classList.add("kta-ajuster-geste");
    try { m.closePopup(); } catch (err) { /* aucune */ }
    const o = g.c.o;
    g.ferme = o.points.length >= 3 && g.c.a.ferme(o);
    g.pts = o.points.map(function (p) { return { x: p.x, y: p.y }; });
    if (g.c.genre === "milieu") g.pts.splice(g.c.i, 0, { x: g.c.x, y: g.c.y });
    g.idx = g.c.i;
    g.decalage = { x: g.pts[g.idx].x - g.depart.x, y: g.pts[g.idx].y - g.depart.y };
    _majApercu();
    if (window.kta_vibrate && typeof window.kta_vibrate.light === "function") window.kta_vibrate.light();
  }

  function _onDown(e) {
    if (!_g) _lacherAvale = null;
    if (_menu && !_dansMenu(e.target)) {
      _fermerMenu();
      _avalerJusqua = _now() + AVALER_MS;   // le tap qui referme 🗑️ ne fait rien d'autre
      return;
    }
    if (_g) { if (e.pointerId !== _g.id) annuler(); return; }   // 2e doigt : pinch, rotation
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    const m = _map();
    const cont = m && m.getContainer();
    if (!cont || !cont.contains(e.target)) return;
    if (e.target.closest && e.target.closest(".leaflet-marker-icon, .leaflet-popup, .leaflet-control")) return;
    if (!_permis()) return;
    const p = _plan(m, e);
    if (!p) return;
    const c = _chercher(m, p.x, p.y, _pxEnPlan(m, RAYON_PX));
    if (!c) return;
    _stats.gestes++;
    _g = { id: e.pointerId, cx: e.clientX, cy: e.clientY, depart: p, c: c, arme: false, bouge: false,
      timer: setTimeout(_armer, APPUI_MS), timerVisuel: 0, dragAvant: false };
    _g.timerVisuel = setTimeout(function () {
      if (_g && !_g.arme) _poignee(_g, "kta-ajuster-poignee kta-ajuster-poignee-attente");
    }, VISUEL_MS);
    cont.classList.add("kta-ajuster-attente");
  }

  function _onMove(e) {
    const g = _g;
    if (!g) return;
    if (e.type === "pointermove" && e.pointerId !== g.id) return;
    const t = (e.touches && e.touches.length) ? e.touches[0] : e;
    if (e.touches && e.touches.length > 1) { annuler(); return; }
    const d = Math.hypot(t.clientX - g.cx, t.clientY - g.cy);
    if (!g.arme) {
      if (d > BOUGE_PX) { annuler(); return; }   // un pan : la carte le reçoit
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
    if (e.type !== "pointermove") return;
    if (!g.bouge && d > GLISSE_PX) g.bouge = true;
    if (!g.bouge) return;
    const m = _map(), p = m && _plan(m, e);
    if (!p) return;
    g.pts[g.idx] = { x: p.x + g.decalage.x, y: p.y + g.decalage.y };
    _planifierApercu();
  }

  function _onUp(e) {
    const g = _g;
    if (!g && _lacherAvale !== null && e.pointerId === _lacherAvale) {
      _lacherAvale = null;
      _avalerJusqua = _now() + AVALER_MS;
      return;
    }
    if (!g || e.pointerId !== g.id) return;
    // ⚠️ pointerup n'est jamais avalé : Leaflet et le pan manuel y referment leur propre suivi des doigts.
    if (!g.arme) { _nettoyer(); return; }
    _avalerJusqua = _now() + AVALER_MS;
    const c = g.c;
    if (c.genre === "milieu") {
      _ecrire("ajouter", c, g.pts[g.idx]);
    } else if (g.bouge) {
      _ecrire("deplacer", c, g.pts[g.idx]);
    } else if (c.o.points.length - 1 < c.a.minimum(c.o)) {
      _stats.refus++;
      _toast(_t("ajuster.toast.minimum", { n: c.a.minimum(c.o) }), "warn");
    } else {
      _ouvrirMenu(c);
    }
    _nettoyer();
  }

  // ⚠️ contrat : après le lâcher, seul le clic qui retombe SUR LA CARTE (conteneur, vecteurs, marqueurs) est avalé ;
  // un bouton de barre (.leaflet-control, dans le conteneur), une fiche ou une fenêtre restent cliquables aussitôt.
  function _surCarte(t) {
    const m = _map(), cont = m && m.getContainer();
    return !!(cont && t && cont.contains(t) && !(t.closest && t.closest(".leaflet-control, .leaflet-popup")));
  }
  function _avaler(e) {
    if (_dansMenu(e.target)) return;
    if (_g ? _g.arme : (_now() < _avalerJusqua && _surCarte(e.target))) {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    }
  }
  function _onContexte(e) {
    if (_g || _now() < _avalerJusqua) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); }
  }

  const CAPTURE = { capture: true, passive: false };
  window.addEventListener("pointerdown", _onDown, CAPTURE);
  ["pointermove", "mousemove", "touchmove"].forEach(function (t) { window.addEventListener(t, _onMove, CAPTURE); });
  window.addEventListener("pointerup", _onUp, CAPTURE);
  window.addEventListener("pointercancel", function (e) { if (_g && e.pointerId === _g.id) annuler(); }, CAPTURE);
  ["click", "dblclick"].forEach(function (t) { window.addEventListener(t, _avaler, CAPTURE); });
  window.addEventListener("contextmenu", _onContexte, CAPTURE);
  window.addEventListener("selectstart", function (e) { if (_g && e.cancelable) e.preventDefault(); }, CAPTURE);
  window.addEventListener("wheel", function () { annuler(); }, { capture: true, passive: true });
  window.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    // ⚠️ contrat : l'Échap qui annule un appui en cours ou ferme le menu s'arrête là, sinon il désarmerait aussi
    // l'outil (shortcuts.js > _echapCarte).
    const pris = !!_g || !!_menu;
    if (_g) annuler();
    _fermerMenu();
    if (pris) e.stopPropagation();
  }, true);

  return {
    enCours: function () { return !!_g; },
    etat: function () {
      return { enCours: !!_g, arme: !!(_g && _g.arme), menu: !!_menu, gestes: _stats.gestes,
        ecritures: _stats.ecritures, annules: _stats.annules, refus: _stats.refus };
    },
    annuler: function () { _fermerMenu(); return annuler(); },
    // Ce qu'un appui viserait au point d'écran (clientX, clientY) : { famille, genre, i, uid } ou null (harnais,
    // diagnostic).
    viser: function (cx, cy) {
      const m = _map(), p = m && _plan(m, { clientX: cx, clientY: cy });
      const c = p && _permis() ? _chercher(m, p.x, p.y, _pxEnPlan(m, RAYON_PX)) : null;
      return c ? { famille: c.f, genre: c.genre, i: c.i, uid: c.o.uid || c.o.type } : null;
    },
    APPUI_MS: APPUI_MS,
    RAYON_PX: RAYON_PX
  };
})();
