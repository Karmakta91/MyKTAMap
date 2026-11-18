/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// detectionStructures.js — « Détecter » piliers et fronts sur l'image du plan (mode plan) : exemples à la pipette,
// cadre
// (deux coins) ou tout le plan, calcul par js/ktaDetection.js (worker), aperçu superposé, « Valider ».
// Ouvert depuis l'outil Structures et depuis l'📊 Éditeur de données : un seul parcours (décision produit).
// ⚠️ contrat (décision produit) : rien n'est écrit avant « Valider » ; puis UNE étape ⏪ pour tout annuler. Niveau de
//   chaque structure posée : structures.js > ktaNiveauNouvelleStructure (même règle que le tracé à la main).
// ⚠️ contrat : couleurs retenues PAR PLAN sur l'appareil (PREFIXE + id du plan), jamais dans la session ni dans
//   l'export du profil (profileExportImport.js les exclut) ; retirées avec le plan (planRegistry.js >
//   purgeAssociatedData).
// 🩸 Image lue par tiling.js > ktaDessinerRegionPlan (calques du niveau actif, tuiles V2, image du fond) en pixels du
//   plan : aucune conversion ; convertCoord seulement pour l'aperçu.
// 🩸 La vue tourne-t-elle ? Redressée et rotation bloquée pendant le parcours (MapBearing.suspend) : le cadre se
//   trace droit dans le repère du plan.
// Écarte ce qui recouvre déjà une structure du même niveau (session et calques) : relancer ne double rien.
// Réglages déduits des exemples touchés ; deux curseurs dans l'aperçu (tolérance, taille minimale) recalculent sur
// les blocs déjà lus. Expose : window.KtaDetectionUI = { ouvrir, fermer, etat, PREFIXE }.
// Garde-fous : scripts/smoke/checkup-detection.js, scripts/check-detection.js · Doc : plans-loader.md (Détecter).

window.KtaDetectionUI = (function () {
  "use strict";

  const PREFIXE = "myktamap_detect_couleurs_v1_";
  const MAX_EXEMPLES = 6;
  const FENETRE_EXEMPLE = [192, 640];  // px plan lus autour d'un toucher de pipette (puis plus grand si coupé)
  const RECALCUL_MS = 200;             // curseur relâché : recalcul après ce délai sans autre mouvement
  const SURFACE_PLEINE = 4096 * 4096;   // au-delà, « Tout le plan » se calcule à mi-résolution
  // Masse A, masse B (piliers), front (trait) ; types proposés dans l'aperçu et type par défaut.
  const CLASSES = ["a", "b", "f"];
  const TYPES = { a: ["pilier-1", "pilier-2"], b: ["pilier-1", "pilier-2"], f: ["front-1", "front-2"] };
  const DEFAUT = { a: "pilier-1", b: "pilier-2", f: "front-1" };
  const ECART_TRAIT = 3;                // px : un front détecté à moins de cet écart d'un front existant est déjà là

  const _t = function (k, v) { return window.I18n.t(k, v); };
  const _esc = function (s) { return window.ktaEsc(s); };
  const _toast = function (msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, type);
  };
  let _e = null;   // parcours ouvert : { etape, couleurs, pipette, coins, couche, bandeau, apercu, ctrl }

  // ── Couleurs par plan (appareil) ──
  function _planId() { return window._currentLoadedPlanId || "default"; }
  function _lireCouleurs() {
    try {
      const o = JSON.parse(localStorage.getItem(PREFIXE + _planId()) || "null");
      const out = { a: [], b: [], f: [], curseurs: null };
      CLASSES.forEach(function (c) {
        if (o && Array.isArray(o[c])) {
          // ancien format : [r, g, b] seul (sans mesure de taille)
          out[c] = o[c].map(function (q) { return Array.isArray(q) ? { rgb: q } : q; })
            .filter(function (q) { return q && Array.isArray(q.rgb) && q.rgb.length === 3; }).slice(-MAX_EXEMPLES);
        }
      });
      if (o && o.curseurs && o.curseurs.tolerance > 0 && o.curseurs.taille > 0) {
        out.curseurs = { tolerance: Number(o.curseurs.tolerance), taille: Number(o.curseurs.taille) };
      }
      return out;
    } catch (err) { return { a: [], b: [], f: [], curseurs: null }; }
  }
  function _ecrireCouleurs(c) {
    try {
      if (!_aDesExemples(c)) localStorage.removeItem(PREFIXE + _planId());
      else localStorage.setItem(PREFIXE + _planId(), JSON.stringify({ a: c.a, b: c.b, f: c.f, curseurs: c.curseurs }));
    } catch (err) { console.warn("[Detection] couleurs non retenues :", err && err.name); }
  }

  function _aDesExemples(c) { return CLASSES.some(function (k) { return c[k].length > 0; }); }

  // ── Lecture de l'image ──
  function _niveau() {
    const c = window.APP_CONFIG || {};
    return c.multiLevel === true ? (c.activeLevel || 0) : 0;
  }
  async function _lireBloc(x, y, w, h, e) {
    if (_e) _e.lectures++;
    const bw = Math.max(1, Math.round(w * e)), bh = Math.max(1, Math.round(h * e));
    const cv = document.createElement("canvas");
    cv.width = bw; cv.height = bh;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";   // fond d'image (hors charte : jamais affiché, seulement lu)
    ctx.fillRect(0, 0, bw, bh);
    await window.ktaDessinerRegionPlan(ctx, { x: x, y: y, w: w, h: h }, e, { niveau: _niveau() });
    const d = ctx.getImageData(0, 0, bw, bh);
    return { data: d.data, w: bw, h: bh };
  }
  // Exemple sous un point du plan : couleur, taille et étalement de la composante touchée (ktaDetection.js >
  // mesurerExemple), lus dans une fenêtre autour du doigt, agrandie une fois si la composante la dépasse.
  async function _exempleEn(x, y) {
    let m = null;
    for (let k = 0; k < FENETRE_EXEMPLE.length; k++) {
      const n = FENETRE_EXEMPLE[k], x0 = Math.floor(x - n / 2), y0 = Math.floor(y - n / 2);
      const b = await _lireBloc(x0, y0, n, n, 1);
      m = window.KtaDetection.mesurerExemple(b, x - x0, y - y0);
      if (!m || !m.coupe) break;
    }
    return m;
  }

  // ── Doublons : recouvre une structure existante du même niveau ? ──
  function _dedans(p, pts) {
    let d = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) d = !d;
    }
    return d;
  }
  function _centre(pts) {
    let x = 0, y = 0;
    pts.forEach(function (p) { x += p.x; y += p.y; });
    return { x: x / pts.length, y: y / pts.length };
  }
  function _existantes(niveau) {
    const multi = window.APP_CONFIG && window.APP_CONFIG.multiLevel === true;
    const out = [];
    const prendre = function (s) {
      if (!s || !Array.isArray(s.points) || s.points.length < 3) return;
      if (multi && niveau !== null && (Number.isInteger(s.level) ? s.level : 0) !== niveau) return;
      out.push({ points: s.points, c: _centre(s.points) });
    };
    (typeof window.getStructures === "function" ? window.getStructures() : []).forEach(prendre);
    (window._ktaDataStructurePolygons || []).forEach(prendre);
    return out;
  }
  // Fronts existants du même niveau (polylignes, session et calques) ; un front détecté est « déjà là » si ses
  // sommets et milieux de segments sont TOUS à moins d'ECART_TRAIT d'un même front existant.
  function _distSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function _existantsTraits(niveau) {
    const multi = window.APP_CONFIG && window.APP_CONFIG.multiLevel === true;
    const ligne = function (t) {
      return typeof window.isStructurePolylineType === "function" && window.isStructurePolylineType(t);
    };
    return (typeof window.getStructures === "function" ? window.getStructures() : [])
      .concat(window._ktaDataStructurePolygons || [])
      .filter(function (s) {
        return s && ligne(s.type) && Array.isArray(s.points) && s.points.length >= 2 &&
          !(multi && niveau !== null && (Number.isInteger(s.level) ? s.level : 0) !== niveau);
      });
  }
  function _traitDejaPresent(m, existants) {
    const pts = [];
    m.points.forEach(function (p, i) {
      pts.push(p);
      if (i) pts.push({ x: (p.x + m.points[i - 1].x) / 2, y: (p.y + m.points[i - 1].y) / 2 });
    });
    return existants.some(function (s) {
      return pts.every(function (p) {
        for (let i = 1; i < s.points.length; i++) {
          if (_distSeg(p, s.points[i - 1], s.points[i]) <= ECART_TRAIT) return true;
        }
        return false;
      });
    });
  }
  function _dejaPresente(m, existantes) {
    const c = _centre(m.points);
    return existantes.some(function (s) { return _dedans(c, s.points) || _dedans(s.c, m.points); });
  }

  // ── Calque d'aperçu (son pane, hors registres des structures) ──
  // 🩸 Renderer SVG propre : la carte est en canvas (preferCanvas), où className ne fait rien et aucun élément ne
  //   reçoit le toucher ; l'aperçu doit être touchable objet par objet et stylé par la feuille de style.
  function _couche() {
    const map = window.map;
    if (!map.getPane("ktaDetection")) {
      const p = map.createPane("ktaDetection");
      p.style.zIndex = "650";
    }
    if (!_e.rendu) _e.rendu = L.svg({ pane: "ktaDetection", padding: 0.5 });
    if (!_e.couche) _e.couche = L.layerGroup().addTo(map);
    return _e.couche;
  }
  function _viderCouche() { if (_e && _e.couche) _e.couche.clearLayers(); }
  function _dessinerCadre() {
    _viderCouche();
    if (_e.coins.length !== 1) return;
    const p = _e.coins[0];
    const c = _couche();
    L.circleMarker(window.convertCoord(p.x, p.y), { pane: "ktaDetection", renderer: _e.rendu, radius: 6,
      className: "kta-detect-coin", interactive: false }).addTo(c);
  }
  function _dessinerApercu() {
    _viderCouche();
    const a = _e.apercu, c = _couche();
    a.objets.forEach(function (m, i) {
      const ll = m.points.map(function (p) { return window.convertCoord(p.x, p.y); });
      const opts = { pane: "ktaDetection", renderer: _e.rendu, bubblingMouseEvents: false,
        className: "kta-detect-apercu kta-detect-classe-" + m.classe + (m.trait ? " kta-detect-trait" : "") +
          (a.retires.has(i) ? " kta-detect-retire" : "") };
      const pol = m.trait ? L.polyline(ll, Object.assign({ weight: 6 }, opts)) : L.polygon(ll, opts);
      pol.on("click", function () {
        if (a.retires.has(i)) a.retires.delete(i); else a.retires.add(i);
        _dessinerApercu();
        _majBandeau();
      });
      pol.addTo(c);
    });
  }

  // ── Bandeau ──
  function _btn(act, cle, cls, vars) {
    return '<button type="button" class="kta-btn ' + (cls || "kta-btn-ghost") + '" data-detect="' + act + '">' +
      _esc(_t(cle, vars)) + "</button>";
  }
  function _pastilles(c) {
    return _e.couleurs[c].map(function (q) {
      return '<span class="kta-detect-pastille" data-rgb="' + q.rgb.join(",") + '"></span>';
    }).join("");
  }
  function _majBandeau() {
    const b = _e.bandeau;
    if (!b) return;
    let html = "";
    if (_e.etape === "exemples") {
      html = '<span class="kta-racc-info">' + _esc(_t(_e.pipette ? "detect.pipette.toucher" : "detect.exemples.aide")) +
        "</span>" + '<div class="kta-racc-actions">' +
        CLASSES.map(function (c) {
          return '<button type="button" class="kta-btn ' + (_e.pipette === c ? "kta-btn-primary" : "kta-btn-ghost") +
            '" data-detect="pipette-' + c + '">' + _esc(_t("detect.classe." + c, { n: _e.couleurs[c].length })) +
            " " + _pastilles(c) + "</button>";
        }).join("") +
        _btn("effacer", "detect.exemples.effacer") +
        _btn("zone", "detect.exemples.suivant", "kta-btn-primary") + _btn("fermer", "detect.fermer") + "</div>";
    } else if (_e.etape === "zone") {
      html = '<span class="kta-racc-info">' + _esc(_t(_e.coins.length ? "detect.zone.second" : "detect.zone.aide")) +
        "</span>" + '<div class="kta-racc-actions">' + _btn("tout", "detect.zone.tout", "kta-btn-primary") +
        _btn("exemples", "detect.retour") + _btn("fermer", "detect.fermer") + "</div>";
    } else if (_e.etape === "calcul") {
      html = '<span class="kta-racc-info">' + _esc(_t("detect.calcul", { i: _e.progres[0], n: _e.progres[1] })) +
        "</span>" + '<div class="kta-racc-actions">' + _btn("annuler", "detect.annuler") + "</div>";
    } else if (_e.etape === "apercu") {
      const a = _e.apercu, gardes = a.objets.length - a.retires.size;
      const sel = function (c) {
        return '<label class="kta-detect-type">' + _esc(_t("detect.classe.court." + c)) +
          ' <select data-detect-type="' + c + '">' + TYPES[c].map(function (ty) {
            return '<option value="' + ty + '"' + (a.types[c] === ty ? " selected" : "") + ">" +
              _esc(_t("struct.label." + ty)) + "</option>";
          }).join("") + "</select></label>";
      };
      const cur = function (nom, min, max) {
        return '<label class="kta-detect-curseur">' + _esc(_t("detect.curseur." + nom)) +
          ' <input type="range" data-detect-curseur="' + nom + '" min="' + min + '" max="' + max +
          '" step="1" value="' +
          _e.curseurs[nom] + '"> <span class="kta-detect-valeur">' + _e.curseurs[nom] + "</span></label>";
      };
      html = '<span class="kta-racc-info">' + _esc(_bilan()) + "</span>" +
        '<div class="kta-racc-actions">' + cur("tolerance", 8, 60) + cur("taille", 2, 80) + "</div>" +
        '<div class="kta-racc-actions">' +
        CLASSES.filter(function (c) { return _e.couleurs[c].length; }).map(sel).join("") +
        _btn("valider", "detect.valider", "kta-btn-primary", { n: gardes }) + _btn("zone", "detect.recommencer") +
        _btn("fermer", "detect.fermer") + "</div>";
    }
    b.innerHTML = html;
    b.querySelectorAll(".kta-detect-pastille").forEach(function (s) {
      s.style.backgroundColor = "rgb(" + s.getAttribute("data-rgb") + ")";   // couleur lue sur le plan, hors charte
    });
    const valider = b.querySelector('[data-detect="valider"]');
    if (valider && _e.apercu) valider.disabled = _e.apercu.objets.length - _e.apercu.retires.size === 0;
  }

  function _bilan() {
    const a = _e.apercu;
    return _t("detect.apercu.bilan", { n: a.objets.length, d: a.deja, g: a.tropGrands }) + " " +
      _t("detect.apercu.aide");
  }
  // Après un recalcul : seuls le bilan et « Ajouter » changent (refaire le bandeau lâcherait le curseur tenu).
  function _majBilan() {
    const b = _e && _e.bandeau, a = _e && _e.apercu;
    if (!b || !a) return;
    const info = b.querySelector(".kta-racc-info"), valider = b.querySelector('[data-detect="valider"]');
    if (info) info.textContent = _bilan();
    if (valider) {
      valider.textContent = _t("detect.valider", { n: a.objets.length - a.retires.size });
      valider.disabled = a.objets.length - a.retires.size === 0;
    }
  }

  function _onBandeau(ev) {
    const el = ev.target.closest && ev.target.closest("[data-detect]");
    if (!el || !_e) return;
    const act = el.getAttribute("data-detect");
    if (act === "fermer") { fermer(); return; }
    if (act.indexOf("pipette-") === 0) {
      const c = act.slice(8);
      _e.pipette = _e.pipette === c ? null : c;
    } else if (act === "effacer") {
      _e.couleurs = { a: [], b: [], f: [], curseurs: null }; _ecrireCouleurs(_e.couleurs); _e.pipette = null;
    } else if (act === "zone") {
      if (!_aDesExemples(_e.couleurs)) { _toast(_t("detect.toast.sansExemple"), "warn"); return; }
      _e.pipette = null; _e.etape = "zone"; _e.coins = []; _e.apercu = null; _viderCouche(); _lacherExecuteur();
    } else if (act === "exemples") {
      _e.etape = "exemples"; _e.coins = []; _viderCouche();
    } else if (act === "tout") {
      _toutLePlan(); return;
    } else if (act === "annuler") {
      if (_e.ctrl) _e.ctrl.abort();
      return;
    } else if (act === "valider") {
      _valider(); return;
    }
    _majBandeau();
  }
  // Curseurs : valeur affichée tout de suite, recalcul sur les blocs déjà lus après RECALCUL_MS sans mouvement.
  function _onCurseur(ev) {
    const el = ev.target.closest && ev.target.closest("[data-detect-curseur]");
    if (!el || !_e || !_e.apercu) return;
    const nom = el.getAttribute("data-detect-curseur");
    _e.curseurs[nom] = Number(el.value);
    const v = el.parentNode && el.parentNode.querySelector(".kta-detect-valeur");
    if (v) v.textContent = el.value;
    _e.couleurs.curseurs = { tolerance: _e.curseurs.tolerance, taille: _e.curseurs.taille };
    _ecrireCouleurs(_e.couleurs);
    clearTimeout(_e.minuteur);
    _e.minuteur = setTimeout(_recalculer, RECALCUL_MS);
  }
  function _onType(ev) {
    const el = ev.target.closest && ev.target.closest("[data-detect-type]");
    if (!el || !_e || !_e.apercu) return;
    _e.apercu.types[el.getAttribute("data-detect-type")] = el.value;
  }

  // ── Carte : pipette et coins du cadre ──
  async function _onClic(ev) {
    if (!_e || !ev || !ev.latlng) return;
    const x = ev.latlng.lng, y = window.APP_CONFIG.imageHeight - ev.latlng.lat;
    if (_e.etape === "exemples" && _e.pipette) {
      const c = _e.pipette, ex = await _exempleEn(x, y);
      if (!_e) return;
      if (!ex) { _toast(_t("detect.toast.horsImage"), "warn"); return; }
      _e.couleurs[c] = _e.couleurs[c].concat([ex]).slice(-MAX_EXEMPLES);
      _e.couleurs.curseurs = null;   // nouvel exemple : les réglages repartent des exemples
      _ecrireCouleurs(_e.couleurs);
      _majBandeau();
    } else if (_e.etape === "zone") {
      _e.coins.push({ x: x, y: y });
      if (_e.coins.length < 2) { _dessinerCadre(); _majBandeau(); return; }
      const a = _e.coins[0], b = _e.coins[1];
      _initCurseurs();
      _lancer({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }, 1);
    }
  }

  async function _toutLePlan() {
    const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
    const grand = W * H > SURFACE_PLEINE;
    if (grand) {
      const ok = await window.ktaConfirm(_t("detect.tout.confirm"), { titre: _t("detect.titre") });
      if (!ok || !_e) return;
    }
    _initCurseurs();
    _lancer({ x: 0, y: 0, w: W, h: H }, grand ? 0.5 : 1);
  }

  async function _lancer(region, echelle) {
    if (region.w < 4 || region.h < 4) {
      _e.coins = []; _toast(_t("detect.toast.cadreVide"), "warn"); _majBandeau();
      return;
    }
    const fin = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
    _lacherExecuteur();
    _e.etape = "calcul"; _e.progres = [0, 1]; _e.ctrl = new AbortController(); _viderCouche(); _majBandeau();
    // Blocs gardés (worker, sinon page) : les curseurs de l'aperçu recalculent sans relire l'image.
    const ex = window.KtaDetection.executeurWorker() || window.KtaDetection.executeurLocal();
    const e = _e;
    e.ex = ex; e.region = region; e.echelle = echelle; e.bloc = fin ? 2048 : 1024;
    try {
      const res = await window.KtaDetection.detecter({
        lireBloc: _lireBloc, region: region, echelle: echelle,
        limites: { w: window.APP_CONFIG.imageWidth, h: window.APP_CONFIG.imageHeight },
        classes: _classes(), reglages: _reglages(), executeur: ex, garder: true,
        signal: e.ctrl.signal,
        onProgres: function (i, n) { if (_e === e) { e.progres = [i, n]; _majBandeau(); } }
      });
      if (_e !== e) return;
      e.recalculable = !!res.recalculable;
      _construireApercu(res);
      e.etape = "apercu";
      _dessinerApercu();
    } catch (err) {
      if (_e !== e) return;
      e.etape = "zone"; e.coins = [];
      _lacherExecuteur();
      if (!err || err.name !== "AbortError") {
        console.warn("[Detection] échec :", err);
        _toast(_t("detect.toast.echec"), "warn");
      }
    } finally {
      if (_e === e) { e.ctrl = null; _majBandeau(); }
    }
  }

  // ── Réglages : déduits des exemples (ktaDetection.js > reglagesDepuisExemples), sinon ceux des curseurs ──
  // ⚠️ contrat (décision produit) : chaque toucher de pipette mesure la composante touchée ; tolérance et taille
  //   minimale en découlent. Un curseur bougé l'emporte, retenu avec les couleurs du plan, jusqu'au prochain exemple.
  function _natures() { return { a: "masse", b: "masse", f: "trait" }; }
  function _pxParM() {
    const tr = window.PLAN_CONFIG && window.PLAN_CONFIG.tracking;   // échelle écrite dans le plan seulement
    return tr && Number(tr.scale) > 0 ? Number(tr.scale) : null;
  }
  function _deduits() {
    const ex = {};
    CLASSES.forEach(function (c) { ex[c] = _e.couleurs[c]; });
    return window.KtaDetection.reglagesDepuisExemples(ex, _natures());
  }
  function _initCurseurs() {
    const d = _deduits(), sauves = _e.couleurs.curseurs;
    let tol = 0;
    Object.keys(d.tolerances).forEach(function (c) { tol = Math.max(tol, d.tolerances[c]); });
    _e.curseurs = sauves ? { tolerance: sauves.tolerance, taille: sauves.taille }
      : { tolerance: tol || 22, taille: d.taille || 13 };
    _e.deduits = d;
  }
  // Tolérance par classe : celle du curseur si l'utilisateur l'a bougé, sinon celle déduite de ses exemples.
  function _classes() {
    const d = _e.deduits, choisi = !!_e.couleurs.curseurs;
    return CLASSES.filter(function (c) { return _e.couleurs[c].length; }).map(function (c) {
      return { id: c, nature: _natures()[c], tolerance: choisi ? _e.curseurs.tolerance : (d.tolerances[c] || 22),
               couleurs: _e.couleurs[c].map(function (q) { return q.rgb; }) };
    });
  }
  function _reglages() {
    return Object.assign({ bloc: _e.bloc }, window.KtaDetection.reglagesPourTaille(_e.curseurs.taille, _pxParM()));
  }
  function _lacherExecuteur() {
    if (!_e) return;
    clearTimeout(_e.minuteur);
    if (_e.ex) { _e.ex.fermer(); _e.ex = null; }
    _e.recalculable = false;
  }
  // Recalcul au curseur : blocs déjà lus si l'exécuteur les a tous gardés, sinon nouvelle lecture de la zone.
  async function _recalculer() {
    const e = _e;
    if (!e || !e.apercu) return;
    if (e.calculEnCours) { e.relancer = true; return; }   // curseur bougé pendant le calcul : refait à la fin
    if (!e.recalculable || !e.ex) { _lancer(e.region, e.echelle); return; }
    e.calculEnCours = true;
    try {
      const res = await window.KtaDetection.recalculer(e.ex, { classes: _classes(), reglages: _reglages(),
        echelle: e.echelle });
      if (_e !== e) return;
      e.recalculs++;
      _construireApercu(res);
      _dessinerApercu();
      _majBilan();
    } catch (err) {
      console.warn("[Detection] recalcul :", err);
    } finally {
      e.calculEnCours = false;
      if (e.relancer && _e === e) { e.relancer = false; _recalculer(); }
    }
  }
  // Résultat → objets de l'aperçu, sans ce qui est déjà dessiné ; types choisis gardés d'un recalcul à l'autre.
  function _construireApercu(res) {
    const types = (_e.apercu && _e.apercu.types) || Object.assign({}, DEFAUT);
    const surfaces = {}, lignes = {};
    const objets = [];
    let deja = 0;
    res.masses.forEach(function (m) {
      const niv = window.ktaNiveauNouvelleStructure(types[m.classe]), cle = String(niv);
      if (!surfaces[cle]) surfaces[cle] = _existantes(niv);
      if (_dejaPresente(m, surfaces[cle])) deja++; else objets.push({ classe: m.classe, points: m.points });
    });
    (res.traits || []).forEach(function (m) {
      const niv = window.ktaNiveauNouvelleStructure(types[m.classe]), cle = String(niv);
      if (!lignes[cle]) lignes[cle] = _existantsTraits(niv);
      if (_traitDejaPresent(m, lignes[cle])) deja++;
      else objets.push({ classe: m.classe, points: m.points, trait: true });
    });
    _e.apercu = { objets: objets, retires: new Set(), types: types, deja: deja, tropGrands: res.tropGrands.length };
  }

  // ── Validation : une étape d'historique, puis la session ──
  function _valider() {
    const a = _e && _e.apercu;
    if (!a) return;
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;   // 🔒 lecture seule
    const avant = window.HistoryManager ? window.HistoryManager.captureState("structures") : null;
    const arr = window.getStructures().slice(), poses = [];
    a.objets.forEach(function (m, i) {
      if (a.retires.has(i)) return;
      const s = { type: a.types[m.classe], points: m.points.map(function (p) { return { x: p.x, y: p.y }; }) };
      const niv = window.ktaNiveauNouvelleStructure(s.type);
      if (niv !== null) s.level = niv;
      window.KtaUid.ensure(s, "st");
      window.KtaUid.touch(s);
      arr.push(s);
      poses.push(s);
    });
    if (!poses.length) return;
    _lacherExecuteur();
    window.setStructures(arr);
    if (window.HistoryManager && avant) {
      window.HistoryManager.record(_t("detect.historique", { n: poses.length }), avant, "structures");
    }
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") window.SessionPersist.save();
    // Posées mais masquées (filtres, niveau) : le dire, sinon « rien n'est apparu ».
    // 🩸 Les filtres de niveau et de type passent l'opacité à 0 sans retirer la couche : la couche sur la carte ne
    //   suffit pas, il faut son opacité et les niveaux affichés.
    const multi = window.APP_CONFIG.multiLevel === true;
    const vis = Array.isArray(window.APP_CONFIG.visibleLevels) ? window.APP_CONFIG.visibleLevels
      : [window.APP_CONFIG.activeLevel || 0];
    const masquees = poses.filter(function (s) {
      if (multi && vis.indexOf(Number.isInteger(s.level) ? s.level : 0) < 0) return true;
      const f = typeof window.ktaFicheObjetDe === "function" ? window.ktaFicheObjetDe(s) : null;
      const op = f && f.layer && f.layer._map ? f.layer.options : null;
      return !!f && !(op && ((op.opacity === undefined ? 1 : op.opacity) > 0 || op.fillOpacity > 0));
    }).length;
    fermer();
    _toast(_t("detect.toast.poses", { n: poses.length }), "success");
    if (masquees) _toast(_t("detect.toast.masquees", { n: masquees }), "warn");
  }

  // ── Ouverture / fermeture ──
  function ouvrir() {
    if (_e) return true;
    if (!window.map || !window.APP_CONFIG || !window.KtaDetection ||
        typeof window.ktaDessinerRegionPlan !== "function") {
      return false;
    }
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return false;   // 🔒 lecture seule
    if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
    if (typeof window.ktaFermerOutils === "function") window.ktaFermerOutils();
    if (window.MapBearing && typeof window.MapBearing.suspend === "function") window.MapBearing.suspend("detection");
    _e = { etape: "exemples", couleurs: _lireCouleurs(), pipette: null, coins: [], couche: null, apercu: null,
           ctrl: null, progres: [0, 1], lectures: 0, recalculs: 0, ex: null, curseurs: null };
    if (!_aDesExemples(_e.couleurs)) _e.pipette = "a";
    const b = document.createElement("div");
    b.id = "kta-detect-bandeau";
    b.className = "kta-racc-bandeau kta-detect-bandeau";
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", _t("detect.titre"));
    b.addEventListener("click", _onBandeau);
    b.addEventListener("change", _onType);
    b.addEventListener("input", _onCurseur);
    document.body.appendChild(b);
    _e.bandeau = b;
    window.map.on("click", _onClic);
    document.addEventListener("keydown", _onKey, true);
    _majBandeau();
    return true;
  }
  function _onKey(ev) {
    if (ev.key !== "Escape" || !_e) return;
    // une fenêtre AFFICHÉE au-dessus garde son Échap (une fenêtre masquée reste parfois dans le DOM)
    const fenetres = document.querySelectorAll(".kta-readme-modal-overlay, [aria-modal='true']");
    const dessus = Array.prototype.some.call(fenetres, function (el) { return el.getClientRects().length > 0; });
    if (dessus) return;
    ev.stopPropagation();
    fermer();
  }
  function fermer() {
    if (!_e) return;
    if (_e.ctrl) _e.ctrl.abort();
    _lacherExecuteur();
    if (_e.couche) _e.couche.remove();
    if (_e.bandeau) _e.bandeau.remove();
    if (window.map) window.map.off("click", _onClic);
    document.removeEventListener("keydown", _onKey, true);
    _e = null;
    if (window.MapBearing && typeof window.MapBearing.resume === "function") window.MapBearing.resume("detection");
  }
  // Harnais : état lisible sans DOM.
  function etat() {
    if (!_e) return null;
    const a = _e.apercu;
    return { etape: _e.etape, exemples: { a: _e.couleurs.a.length, b: _e.couleurs.b.length, f: _e.couleurs.f.length },
             pipette: _e.pipette, coins: _e.coins.length, curseurs: _e.curseurs, lectures: _e.lectures,
             recalculs: _e.recalculs, recalculable: !!_e.recalculable,
             apercu: a ? { n: a.objets.length, traits: a.objets.filter(function (o) { return o.trait; }).length,
                           retires: a.retires.size, deja: a.deja, tropGrands: a.tropGrands } : null };
  }

  return { ouvrir: ouvrir, fermer: fermer, etat: etat, PREFIXE: PREFIXE };
})();
