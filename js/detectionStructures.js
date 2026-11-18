/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// detectionStructures.js — « Détecter » les piliers sur l'image du plan (mode plan) : exemples à la pipette, cadre
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
// Expose : window.KtaDetectionUI = { ouvrir, fermer, etat, PREFIXE }.
// Garde-fous : scripts/smoke/checkup-detection.js, scripts/check-detection.js · Doc : plans-loader.md (Détecter).

window.KtaDetectionUI = (function () {
  "use strict";

  const PREFIXE = "myktamap_detect_couleurs_v1_";
  const MAX_EXEMPLES = 6;
  const TOLERANCE = 14;                 // écart ΔE accepté autour d'un exemple
  const SURFACE_PLEINE = 4096 * 4096;   // au-delà, « Tout le plan » se calcule à mi-résolution
  const CLASSES = ["a", "b"];

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
      const out = { a: [], b: [] };
      CLASSES.forEach(function (c) {
        if (o && Array.isArray(o[c])) {
          out[c] = o[c].filter(function (q) { return Array.isArray(q) && q.length === 3; }).slice(-MAX_EXEMPLES);
        }
      });
      return out;
    } catch (err) { return { a: [], b: [] }; }
  }
  function _ecrireCouleurs(c) {
    try {
      if (!c.a.length && !c.b.length) localStorage.removeItem(PREFIXE + _planId());
      else localStorage.setItem(PREFIXE + _planId(), JSON.stringify({ a: c.a, b: c.b }));
    } catch (err) { console.warn("[Detection] couleurs non retenues :", err && err.name); }
  }

  // ── Lecture de l'image ──
  function _niveau() {
    const c = window.APP_CONFIG || {};
    return c.multiLevel === true ? (c.activeLevel || 0) : 0;
  }
  async function _lireBloc(x, y, w, h, e) {
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
  // Couleur sous un point du plan : médiane d'un carré de 5 × 5 px (bruit de compression).
  async function _couleurEn(x, y) {
    const b = await _lireBloc(Math.floor(x) - 2, Math.floor(y) - 2, 5, 5, 1);
    const med = function (k) {
      const v = [];
      for (let i = 0; i < 25; i++) if (b.data[i * 4 + 3] > 127) v.push(b.data[i * 4 + k]);
      v.sort(function (p, q) { return p - q; });
      return v.length ? v[v.length >> 1] : null;
    };
    const r = med(0), g = med(1), bl = med(2);
    return r === null ? null : [r, g, bl];
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
    a.masses.forEach(function (m, i) {
      const pol = L.polygon(m.points.map(function (p) { return window.convertCoord(p.x, p.y); }), {
        pane: "ktaDetection", renderer: _e.rendu, bubblingMouseEvents: false,
        className: "kta-detect-apercu kta-detect-classe-" + m.classe + (a.retires.has(i) ? " kta-detect-retire" : "")
      });
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
      return '<span class="kta-detect-pastille" data-rgb="' + q.join(",") + '"></span>';
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
      const a = _e.apercu, gardes = a.masses.length - a.retires.size;
      const sel = function (c) {
        return '<label class="kta-detect-type">' + _esc(_t("detect.classe.court." + c)) +
          ' <select data-detect-type="' + c + '">' + ["pilier-1", "pilier-2"].map(function (ty) {
            return '<option value="' + ty + '"' + (a.types[c] === ty ? " selected" : "") + ">" +
              _esc(_t("struct.label." + ty)) + "</option>";
          }).join("") + "</select></label>";
      };
      html = '<span class="kta-racc-info">' + _esc(_t("detect.apercu.bilan", { n: a.masses.length, d: a.deja,
        g: a.tropGrands })) + " " + _esc(_t("detect.apercu.aide")) + "</span>" +
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
    if (valider && _e.apercu) valider.disabled = _e.apercu.masses.length - _e.apercu.retires.size === 0;
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
      _e.couleurs = { a: [], b: [] }; _ecrireCouleurs(_e.couleurs); _e.pipette = null;
    } else if (act === "zone") {
      if (!_e.couleurs.a.length && !_e.couleurs.b.length) { _toast(_t("detect.toast.sansExemple"), "warn"); return; }
      _e.pipette = null; _e.etape = "zone"; _e.coins = []; _e.apercu = null; _viderCouche();
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
      const c = _e.pipette, rgb = await _couleurEn(x, y);
      if (!_e) return;
      if (!rgb) { _toast(_t("detect.toast.horsImage"), "warn"); return; }
      _e.couleurs[c] = _e.couleurs[c].concat([rgb]).slice(-MAX_EXEMPLES);
      _ecrireCouleurs(_e.couleurs);
      _majBandeau();
    } else if (_e.etape === "zone") {
      _e.coins.push({ x: x, y: y });
      if (_e.coins.length < 2) { _dessinerCadre(); _majBandeau(); return; }
      const a = _e.coins[0], b = _e.coins[1];
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
    _lancer({ x: 0, y: 0, w: W, h: H }, grand ? 0.5 : 1);
  }

  async function _lancer(region, echelle) {
    if (region.w < 4 || region.h < 4) {
      _e.coins = []; _toast(_t("detect.toast.cadreVide"), "warn"); _majBandeau();
      return;
    }
    const classes = CLASSES.filter(function (c) { return _e.couleurs[c].length; }).map(function (c) {
      return { id: c, couleurs: _e.couleurs[c], tolerance: TOLERANCE };
    });
    const fin = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
    _e.etape = "calcul"; _e.progres = [0, 1]; _e.ctrl = new AbortController(); _viderCouche(); _majBandeau();
    const ex = window.KtaDetection.executeurWorker();
    const e = _e;
    try {
      const res = await window.KtaDetection.detecter({
        lireBloc: _lireBloc, region: region, echelle: echelle,
        limites: { w: window.APP_CONFIG.imageWidth, h: window.APP_CONFIG.imageHeight },
        classes: classes, reglages: { bloc: fin ? 2048 : 1024 }, executer: ex ? ex.executer : undefined,
        signal: e.ctrl.signal,
        onProgres: function (i, n) { if (_e === e) { e.progres = [i, n]; _majBandeau(); } }
      });
      if (_e !== e) return;
      const types = { a: "pilier-1", b: "pilier-2" };
      const existantes = {};
      const nouvelles = [];
      let deja = 0;
      res.masses.forEach(function (m) {
        const niv = window.ktaNiveauNouvelleStructure(types[m.classe]);
        const cle = String(niv);
        if (!existantes[cle]) existantes[cle] = _existantes(niv);
        if (_dejaPresente(m, existantes[cle])) deja++; else nouvelles.push(m);
      });
      e.apercu = { masses: nouvelles, retires: new Set(), types: types, deja: deja, tropGrands: res.tropGrands.length };
      e.etape = "apercu";
      _dessinerApercu();
    } catch (err) {
      if (_e !== e) return;
      e.etape = "zone"; e.coins = [];
      if (!err || err.name !== "AbortError") {
        console.warn("[Detection] échec :", err);
        _toast(_t("detect.toast.echec"), "warn");
      }
    } finally {
      if (ex) ex.fermer();
      if (_e === e) { e.ctrl = null; _majBandeau(); }
    }
  }

  // ── Validation : une étape d'historique, puis la session ──
  function _valider() {
    const a = _e && _e.apercu;
    if (!a) return;
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;   // 🔒 lecture seule
    const avant = window.HistoryManager ? window.HistoryManager.captureState("structures") : null;
    const arr = window.getStructures().slice(), poses = [];
    a.masses.forEach(function (m, i) {
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
           ctrl: null, progres: [0, 1] };
    if (!_e.couleurs.a.length && !_e.couleurs.b.length) _e.pipette = "a";
    const b = document.createElement("div");
    b.id = "kta-detect-bandeau";
    b.className = "kta-racc-bandeau kta-detect-bandeau";
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", _t("detect.titre"));
    b.addEventListener("click", _onBandeau);
    b.addEventListener("change", _onType);
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
    return { etape: _e.etape, exemples: { a: _e.couleurs.a.length, b: _e.couleurs.b.length }, pipette: _e.pipette,
             coins: _e.coins.length, apercu: _e.apercu ? { n: _e.apercu.masses.length, retires: _e.apercu.retires.size,
             deja: _e.apercu.deja, tropGrands: _e.apercu.tropGrands } : null };
  }

  return { ouvrir: ouvrir, fermer: fermer, etat: etat, PREFIXE: PREFIXE };
})();
