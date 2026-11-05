/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// ajusterSommets.js — ajuster la suite de points d'une forme déjà dessinée, sur la carte 2D. Appui long (APPUI_MS)
// sur un sommet puis glisser : il se déplace ; au milieu d'un segment : un sommet naît là et se glisse aussitôt ;
// sur un sommet sans bouger : ＋ et 🗑️ au point (🗑️ refusé sous le minimum, un toast le dit) ; ＋ ouvre l'insertion
// (_debuterInsertion : chaque tap insère un sommet après le dernier posé, jusqu'à ✓, Échap ou le sommet suivant).
// Familles : prises `window.ktaFormesAjustables.<roads|zones|structures|mesure>` = { cat (HistoryManager, null =
// hors historique, lu à chaque geste), objets() (modifiables ET visibles, hors objet en cours), ferme(o), minimum(o),
// libelle(o), rendre(), aimanter?(x, y, o, exclus, tol?) → {x, y} | null, etiquette?(action, o) → libellé d'historique
// } (road.js, zones.js, structures.js, measure.js). Outil 📐 seul armé : seule la mesure s'ajuste (_mesureSeule).
// Expose : window.KtaAjusterSommets = { enCours(), etat(), annuler(), viser(), insertion*, plan (vue 3D), APPUI_MS… }.
// ⚠️ contrat : un geste (un point inséré aussi) = une écriture : captureState → mutation → KtaUid.touch → rendre() (un
// seul `kta:donneesPlanChange`) → record → SessionPersist.save. Pendant le glisser, rien n'est écrit : aperçu seul.
// 🩸 Écoutes en CAPTURE sur window. Appui en attente puis glisser : pointermove / mousemove / touchmove avalés ; ni
// le drag de Leaflet, ni le pan manuel, ni la rotation à deux doigts (mapBearing.js > _panSuivre, _rotPointerMove)
// ne bougent la carte ; `enCours()` est le drapeau neutre pour tout autre geste. Le clic qui suit un appui long est
// avalé (pas de fiche), le menu contextuel aussi. Un 2e doigt, plus de BOUGE_PX avant l'appui long : rien n'est fait.
// ⚠️ contrat : tout geste se ferme et rend le drag de la carte, même mal terminé : pointercancel, appli repliée, fenêtre
// quittée, lâcher jamais reçu (l'appui primaire suivant le ferme).
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
  // Insertion ouverte par ＋ : { a, f, cle, o, x (sommet de départ), L0 (sommets à l'ouverture), prolonge, ferme,
  // bandeau, marques, down }. Le compte inséré se relit sur la forme (longueur − L0) : une annulation le fait baisser.
  let _ins = null;
  let _permisSoi = false;      // _permis en cours : l'insertion ne compte pas comme mode « clic carte » contre elle
  const INSERE_PX = 4;         // tap à moins de ça du dernier point posé : rien (pas de sommet en double)
  const _stats = { gestes: 0, ecritures: 0, annules: 0, refus: 0, inseres: 0 };

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
  // 🩸 L'insertion ouverte est elle-même un mode « clic carte » (utils.js > _modeClicCarteActif) : ignorée ici, sinon
  // elle se refuserait ses propres points.
  function _permis() {
    _permisSoi = true;
    try { return _permisBrut(); } finally { _permisSoi = false; }
  }
  function _permisBrut() {
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
  // `garder(famille, o)` facultatif : ce que l'appelant montre (vue 3D : son niveau, ses filtres).
  function _chercher(m, x, y, tol, garder) {
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
        if (garder && !garder(f, o)) continue;
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

  // ── Menu ＋ / 🗑️ au sommet ──
  function _fermerMenu() {
    if (!_menu) return;
    clearTimeout(_menu.timer);
    try { _menu.marker.remove(); } catch (err) { /* carte déjà détruite */ }
    _menu = null;
  }
  function _dansMenu(t) { return !!(t && t.closest && t.closest(".kta-ajuster-menu")); }

  // Sous le minimum de la forme : ＋ seul (le toast dit pourquoi pas de 🗑️).
  function _ouvrirMenu(c, sansSuppr) {
    _fermerMenu();
    const m = _map();
    if (!m) return;
    const icon = L.divIcon({
      className: "kta-ajuster-menu",
      html: htmlMenu(null, sansSuppr),
      iconSize: [sansSuppr ? 44 : MENU_LARGE, 44], iconAnchor: [sansSuppr ? 22 : MENU_LARGE / 2, 58]
    });
    const marker = L.marker(_ll(c), { icon: icon, interactive: true, keyboard: false, zIndexOffset: 1000 }).addTo(m);
    marker.on("click", function (ev) {
      const t = ev.originalEvent && ev.originalEvent.target, b = t && t.closest && t.closest("button");
      if (!b) return;
      _fermerMenu();
      if (b.classList.contains("kta-ajuster-inserer")) _debuterInsertion(c);
      else _ecrire("supprimer", c, null);
    });
    _menu = { marker: marker, c: c, timer: setTimeout(_fermerMenu, MENU_MS) };
  }
  // Les deux boutons du menu (carte et vue 3D) ; `attr(action)` = attributs en plus (vue 3D : data-v3d).
  const MENU_LARGE = 96;       // deux cibles de 44 px et leur écart (style.css > .kta-ajuster-boutons)
  function htmlMenu(attr, sansSuppr) {
    const bouton = function (classe, cle, action, icone) {
      const titre = window.ktaEsc(_t(cle));
      return '<button type="button" class="' + classe + '"' + (attr ? attr(action) : "") + ' aria-label="' + titre +
        '" title="' + titre + '">' + icone + '</button>';
    };
    return '<div class="kta-ajuster-boutons">' + bouton("kta-ajuster-inserer", "ajuster.inserer", "inserer", "＋") +
      (sansSuppr ? "" : bouton("kta-ajuster-suppr", "ajuster.supprimer", "supprimer", "🗑️")) + '</div>';
  }

  // ── Écriture : un geste = une entrée d'historique, un rendu ──
  function _ecrire(action, c, p, tol) {
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
        const s = a.aimanter(np.x, np.y, o, exclus.filter(Boolean), tol);
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

  // ── Insertion (＋) : chaque tap insère un sommet entre le dernier posé et le sommet suivant de départ (X + 1) ──
  // ⚠️ contrat (décision produit) : le n-ième point va à l'indice X + 1 + n (n = longueur − L0) : la suite de la
  // forme garde son ordre. Forme fermée, X dernier : X + 1 = le premier (le point s'ajoute en fin de liste, sur le
  // côté de fermeture). Ligne, X dernier : on prolonge au-delà du bout, aucun sommet suivant. Fin : ✓ du bandeau,
  // Échap (shortcuts.js > _echapCarte, vue3d.js), tap sur X + 1, droit perdu, forme disparue ou raccourcie sous L0
  // (annulations au-delà du premier point).
  // 🩸 Une annulation rend des COPIES (HistoryManager > _applyState) : la forme est retrouvée par sa clé (uid ; type
  // pour la mesure) à chaque tap, jamais gardée par référence.
  function _cle(o) { return o.uid || "§" + (o.type || ""); }
  function _retrouver(ins) {
    let objs = [];
    try { objs = ins.a.objets() || []; } catch (err) { return null; }
    for (let k = 0; k < objs.length; k++) if (objs[k] && _cle(objs[k]) === ins.cle) return objs[k];
    return null;
  }
  // État de l'insertion lu sur la forme : { o, n, pose (indice du prochain point), ancre (dernier posé, ou X), cible
  // (X + 1, null en prolongement) } ; null : forme disparue ou raccourcie.
  function _etatIns() {
    const ins = _ins, o = ins && _retrouver(ins);
    if (!o || !Array.isArray(o.points)) return null;
    const n = o.points.length - ins.L0;
    if (n < 0) return null;
    return { o: o, n: n, pose: ins.x + 1 + n, ancre: ins.x + n,
      cible: ins.prolonge ? null : (ins.x + 1 < ins.L0 ? ins.x + 1 + n : 0) };
  }

  function _debuterInsertion(c) {
    terminerInsertion();
    if (!c || c.genre !== "sommet" || !_permis() || !_encorePresent(c)) return false;
    const o = c.o, L0 = o.points.length, ferme = L0 >= 3 && c.a.ferme(o);
    _abonnerHisto();
    _ins = { a: c.a, f: c.f, cle: _cle(o), x: c.i, L0: L0, ferme: ferme, prolonge: !ferme && c.i === L0 - 1,
      bandeau: null, marques: [], down: null };
    _bandeau();
    _majInsertion();
    const m = _map();
    try { if (m) m.closePopup(); } catch (err) { /* aucune */ }
    return true;
  }

  function terminerInsertion() {
    const ins = _ins;
    if (!ins) return false;
    _ins = null;
    if (ins.bandeau && ins.bandeau.parentNode) ins.bandeau.parentNode.removeChild(ins.bandeau);
    ins.marques.forEach(function (l) { try { l.remove(); } catch (err) { /* carte détruite */ } });
    return true;
  }

  // Bandeau « ＋ Insertion · N point(s) · ✓ Terminer » : hors de la carte (posé sur body, au-dessus de la vue 3D), le
  // tap qui le touche n'insère rien.
  function _bandeau() {
    const b = document.createElement("div");
    b.className = "kta-ajuster-bandeau";
    b.setAttribute("role", "status");
    b.innerHTML = '<span class="kta-ajuster-bandeau-titre">' + window.ktaEsc(_t("ajuster.insertion.titre")) +
      '</span><span class="kta-ajuster-bandeau-n"></span>' +
      '<button type="button" class="kta-btn kta-btn-primary" data-ajuster="terminer">' +
      window.ktaEsc(_t("ajuster.insertion.terminer")) + '</button>';
    b.addEventListener("click", function (ev) {
      if (ev.target.closest && ev.target.closest('[data-ajuster="terminer"]')) terminerInsertion();
    });
    document.body.appendChild(b);
    _ins.bandeau = b;
  }

  // Après chaque point, annulation ou rendu : compte du bandeau et marques (point d'ancrage doré, X + 1 en pointillé :
  // le toucher termine). Droit perdu, forme disparue : l'insertion se ferme.
  function _majInsertion() {
    const ins = _ins;
    if (!ins) return;
    const st = _etatIns();
    if (!st || !_permis()) { terminerInsertion(); return; }
    const sp = ins.bandeau && ins.bandeau.querySelector(".kta-ajuster-bandeau-n");
    const txt = _t("ajuster.insertion.points", { n: st.n });
    if (sp && sp.textContent !== txt) sp.textContent = txt;
    ins.marques.forEach(function (l) { try { l.remove(); } catch (err) { /* carte détruite */ } });
    ins.marques = [];
    const m = _map();
    if (!m) return;
    const pose = function (p, classe) {
      ins.marques.push(L.circleMarker(_ll(p), { renderer: _renderer(m), radius: 10, weight: 3, interactive: false,
        className: classe }).addTo(m));
    };
    pose(st.o.points[st.ancre], "kta-ajuster-poignee");
    if (st.cible !== null && st.o.points[st.cible]) {
      pose(st.o.points[st.cible], "kta-ajuster-poignee kta-ajuster-poignee-attente");
    }
  }

  // Un tap (px plan) : "ajoute" | "fin" (sommet suivant touché, droit perdu) | "rien" (sur le dernier point posé).
  // `tolAimant` : rayon d'aimantation déjà converti (vue 3D), sinon celui de la prise ; `tolFin` : rayon du toucher.
  function _poser(p, tolAimant, tolFin) {
    if (!_ins) return "rien";
    const st = _etatIns();
    if (!st || !_permis() || !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      terminerInsertion();
      return "fin";
    }
    const a = _ins.a, o = st.o, pts = o.points, H = window.HistoryManager;
    if (st.cible !== null && pts[st.cible] && Math.hypot(p.x - pts[st.cible].x, p.y - pts[st.cible].y) <= tolFin) {
      terminerInsertion();
      return "fin";
    }
    const anc = pts[st.ancre];
    if (anc && Math.hypot(p.x - anc.x, p.y - anc.y) <= tolFin * INSERE_PX / RAYON_PX) return "rien";
    let np = { x: p.x, y: p.y };
    if (typeof a.aimanter === "function") {
      const s = a.aimanter(np.x, np.y, o, [anc, st.cible !== null ? pts[st.cible] : null].filter(Boolean), tolAimant);
      if (s) np = { x: s.x, y: s.y };
    }
    const avant = (a.cat && H && typeof H.captureState === "function") ? H.captureState(a.cat) : null;
    pts.splice(st.pose, 0, np);
    if (o.uid && window.KtaUid && typeof window.KtaUid.touch === "function") window.KtaUid.touch(o);
    try { a.rendre(); } catch (err) { console.warn("[Ajuster] rendu :", err); }
    if (avant) {
      H.record(typeof a.etiquette === "function" ? a.etiquette("ajouter", o)
        : _t("ajuster.histo.ajouter", { type: a.libelle(o) }), avant, a.cat);
    }
    if (a.cat && window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch (err) { /* le poll de SessionPersist rattrape */ }
    }
    _stats.ecritures++;
    _stats.inseres++;
    _majInsertion();
    return "ajoute";
  }

  // Tap sur la carte pendant l'insertion (click avalé en capture) : un pan (plus de BOUGE_PX depuis l'appui) n'insère
  // rien.
  function _tapInsertion(e) {
    const d = _ins.down, m = _map();
    _ins.down = null;
    if (!m || (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > BOUGE_PX)) return;
    _poser(_plan(m, e), undefined, _pxEnPlan(m, RAYON_PX));
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
    // 🩸 Un appui primaire (premier doigt posé, ou la souris) pendant un geste ouvert, ou le même pointerId reposé :
    // le lâcher de ce geste n'est jamais arrivé. Il est fermé en silence (drag rendu, rien d'écrit) et l'appui compte
    // pour lui-même ; sinon les mouvements restaient avalés et la carte ne suivait plus le doigt.
    if (_g && (e.isPrimary || e.pointerId === _g.id)) { _stats.annules++; _nettoyer(); }
    if (!_g) _lacherAvale = null;
    // Insertion ouverte : un appui ne fait que noter d'où part le tap (seuil du pan, _tapInsertion), aucun ajustement.
    if (_ins) {
      if (e.isPrimary) _ins.down = { x: e.clientX, y: e.clientY };
      return;
    }
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
      _ouvrirMenu(c, true);
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
    // ⚠️ contrat : insertion ouverte, tout clic sur la carte est un point (ni fiche, ni outil, ni double-clic qui
    // zoome) ; un outil armé entre-temps ferme l'insertion et garde son clic.
    if (_ins && _surCarte(e.target)) {
      if (!_permis()) { terminerInsertion(); return; }
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      if (e.type === "click") _tapInsertion(e);
      return;
    }
    if (_g ? _g.arme : (_now() < _avalerJusqua && _surCarte(e.target))) {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    }
  }
  function _onContexte(e) {
    if (_g || _now() < _avalerJusqua || (_ins && _surCarte(e.target))) {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    }
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
  // Appli repliée, fenêtre quittée : le lâcher ne viendra peut-être jamais, le geste est fermé et le drag rendu.
  function _horsFocus(e) {
    if (e.type === "visibilitychange" && document.visibilityState === "visible") return;
    annuler();
    _fermerMenu();
  }
  window.addEventListener("blur", _horsFocus);
  window.addEventListener("pagehide", _horsFocus);
  document.addEventListener("visibilitychange", _horsFocus);
  window.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    // ⚠️ contrat : l'Échap qui annule un appui en cours ou ferme le menu s'arrête là, sinon il désarmerait aussi
    // l'outil (shortcuts.js > _echapCarte).
    const pris = !!_g || !!_menu;
    if (_g) annuler();
    _fermerMenu();
    if (pris) e.stopPropagation();
  }, true);
  // Forme rendue (point posé, annulation ⏪ ou ↪, autre écriture) : compte et marques de l'insertion relus.
  window.addEventListener("kta:donneesPlanChange", function () { if (_ins) _majInsertion(); });
  let _abonneHisto = false;
  function _abonnerHisto() {
    const H = window.HistoryManager;
    if (_abonneHisto || !H || typeof H.onChange !== "function") return;
    _abonneHisto = true;
    H.onChange(function () { if (_ins) _majInsertion(); });
  }

  // ── Le même geste mené hors de la carte (vue 3D : vue3d.js > _ajusterAppui) ──
  // ⚠️ contrat : l'appelant mène appui long, seuils et aperçu ; il donne des coordonnées plan (px image) et une
  // tolérance plan (son rayon d'écran converti à la profondeur). Familles, droits (_permis : outil armé, lecture seule,
  // calque non rapatrié), refus sous le minimum, aimantation et écriture (une entrée d'historique, un rendu) restent
  // ceux de la carte. La cible rendue par `saisir` est opaque : repassée telle quelle à forme / lacher / supprimer.
  function _saisirPlan(x, y, tol, garder) {
    const m = _map();
    if (!m || _g || _ins || !_permis() || !Number.isFinite(x) || !Number.isFinite(y) || !(tol > 0)) return null;
    const c = _chercher(m, x, y, tol, garder);
    if (c) _stats.gestes++;
    return c;
  }
  // Points de l'aperçu (copie, sommet né au milieu inséré) → { pts, idx, ferme } ; null : droit perdu, cible disparue.
  function _formePlan(c) {
    if (!c || !_permis() || !_encorePresent(c)) return null;
    const pts = c.o.points.map(function (p) { return { x: p.x, y: p.y }; });
    if (c.genre === "milieu") pts.splice(c.i, 0, { x: c.x, y: c.y });
    return { pts: pts, idx: c.i, ferme: c.o.points.length >= 3 && c.a.ferme(c.o) };
  }
  // Lâcher : p = point d'arrivée (px plan), null sans glisser → "ajoute" | "deplace" | "refus" (minimum, toast dit) |
  // "menu" (à l'appelant de proposer 🗑️, puis `supprimer`) | "rien" (droit perdu, cible disparue).
  function _lacherPlan(c, p, tol) {
    if (!c) return "rien";
    if (c.genre === "milieu") return _ecrire("ajouter", c, p || { x: c.x, y: c.y }, tol) ? "ajoute" : "rien";
    if (p) return _ecrire("deplacer", c, p, tol) ? "deplace" : "rien";
    if (!_permis() || !_encorePresent(c)) return "rien";
    if (c.o.points.length - 1 < c.a.minimum(c.o)) {
      _stats.refus++;
      _toast(_t("ajuster.toast.minimum", { n: c.a.minimum(c.o) }), "warn");
      return "refus";
    }
    return "menu";
  }

  return {
    enCours: function () { return !!_g; },
    etat: function () {
      return { enCours: !!_g, arme: !!(_g && _g.arme), menu: !!_menu, gestes: _stats.gestes,
        ecritures: _stats.ecritures, annules: _stats.annules, refus: _stats.refus, inseres: _stats.inseres,
        insertion: !!_ins };
    },
    // Drapeau neutre (utils.js > _modeClicCarteActif) : l'insertion prend chaque clic de la carte.
    insertionEnCours: function () { return !!_ins && !_permisSoi; },
    // Insertion ouverte : { famille, n, pts (copie), ancre, cible (null : prolongement), ferme } ; sinon null.
    insertion: function () {
      const st = _ins && _etatIns();
      return st ? { famille: _ins.f, n: st.n, ancre: st.ancre, cible: st.cible, ferme: _ins.ferme,
        pts: st.o.points.map(function (p) { return { x: p.x, y: p.y }; }) } : null;
    },
    terminerInsertion: terminerInsertion,
    htmlMenu: htmlMenu,
    annuler: function () { _fermerMenu(); return annuler(); },
    // Ce qu'un appui viserait au point d'écran (clientX, clientY) : { famille, genre, i, uid } ou null (harnais,
    // diagnostic).
    viser: function (cx, cy) {
      const m = _map(), p = m && _plan(m, { clientX: cx, clientY: cy });
      const c = p && _permis() ? _chercher(m, p.x, p.y, _pxEnPlan(m, RAYON_PX)) : null;
      return c ? { famille: c.f, genre: c.genre, i: c.i, uid: c.o.uid || c.o.type } : null;
    },
    plan: {
      saisir: _saisirPlan,
      forme: _formePlan,
      lacher: _lacherPlan,
      supprimer: function (c) { return !!c && _ecrire("supprimer", c, null); },
      // ＋ du menu : ouvre l'insertion depuis ce sommet ; puis chaque toucher au sol → poser(x, y, tolAimant, tolFin).
      inserer: _debuterInsertion,
      poser: _poser,
      annule: function () { _stats.annules++; }
    },
    APPUI_MS: APPUI_MS,
    VISUEL_MS: VISUEL_MS,
    RAYON_PX: RAYON_PX,
    BOUGE_PX: BOUGE_PX,
    GLISSE_PX: GLISSE_PX,
    MENU_MS: MENU_MS
  };
})();
