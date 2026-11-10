/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// poiPrecis.js — point précis d'un POI : le vrai lieu (le mur de la plaque…) quand l'icône est décalée pour lire.
// Modèle : `precis: { x, y }` (px du plan, même niveau que le POI) ; chatière (tag `chatiere`) : `{ pts: [{ x, y },
// …] }`, 2 points au moins, du début à la fin. 🩸 L'ancienne chatière `{ x, y, x2, y2 }` se lit telle quelle (lire()
// normalise, aucune migration) : tout lecteur passe par lire(), jamais par `precis` brut. `x`, `y` du POI restent la
// place de l'icône. Absent = rien ne change nulle part.
// ⚠️ contrat : les passages entre niveaux (poiJonction.js > porteNiveaux : jes, jpe, jps, peo, eso, pa) n'en ont
// pas (leurs raccords validés jouent ce rôle) : pas de bouton, champ ignoré partout (lire → null).
// Lecteurs : vue 3D (galerieEmprise.js > _departPassage, vue3d.js > _segmentsChatiere, panneau), itinéraire (cible :
// « Y aller », étape, repère du guidage), « 📍 Je suis ici » (cible, utils.js > _ktaPopupAction, emergencyMode.js) ;
// cible d'une chatière = le milieu de son tracé mesuré en longueur (centre). Exports KMZ / GPX / GeoJSON / PNG / PDF :
// l'icône (décision produit).
// Saisie depuis la fiche seulement (utils.js > buildPointPopupHtml, mêmes droits que ✏️ Modifier) : armer() pose un
// bandeau `.kta-iti-floater` (utils.js > _modeClicCarteActif : aucune fiche, clic ré-émis par map.js), un tap pose le
// point ; chatière : un tap par point, « Terminer » (ou Entrée) à partir de 2. Échap ou ✕ annule. Une écriture = une
// entrée d'historique (Ctrl+Z).
// Affichage 2D : pointillé de l'icône au point et petit carré (chatière : un carré par point reliés par la
// polyligne, pointillé vers le milieu), jeton --kta-accent par classe CSS (renderer SVG), jamais interactif ; visible
// à partir de SEUIL_PX_PAR_M px d'écran par mètre (sans échelle : ZOOM_SANS_ECHELLE) et toujours fiche ouverte.
// Expose window.KtaPoiPrecis. Garde-fou : scripts/smoke/checkup-point-precis.js · Doc : data-formats.md § Format
// point, ui.md § Point précis.

(function () {
  "use strict";

  const SEUIL_PX_PAR_M = 4;       // zoom « moyen » : 100 m font 400 px d'écran
  const ZOOM_SANS_ECHELLE = -1;   // plan sans échelle : 1 px du plan = 0,5 px d'écran
  const CARRE_PX = 9;

  function _t(k, p) { return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k; }
  function _r(v) { return Math.round(v * 100) / 100; }
  function _num(v) { return typeof v === "number" && Number.isFinite(v); }
  function _tag(p) { return (p && Array.isArray(p.tags) && p.tags[0]) ? String(p.tags[0]) : ""; }

  // ── Modèle ──────────
  function applicable(p) {
    const J = window.KtaPoiJonction;
    return !!p && !(J && J.porteNiveaux(_tag(p)));
  }
  function multiPoints(p) { return _tag(p) === "chatiere"; }

  // Points rangés dans `precis`, quelle que soit sa forme : { pts } ou l'ancienne { x, y[, x2, y2] }.
  function _ptsBruts(q) {
    if (Array.isArray(q.pts)) {
      return q.pts.filter(function (a) { return a && _num(a.x) && _num(a.y); })
        .map(function (a) { return { x: a.x, y: a.y }; });
    }
    if (!_num(q.x) || !_num(q.y)) return [];
    const out = [{ x: q.x, y: q.y }];
    if (_num(q.x2) && _num(q.y2)) out.push({ x: q.x2, y: q.y2 });
    return out;
  }

  // Point précis lisible du POI → { x, y } ou { x, y, pts } (chatière à 2 points ou plus ; x, y = le début) | null.
  // Un POI qui n'est plus une chatière garde son premier point.
  function lire(p) {
    const q = p && p.precis;
    if (!q || typeof q !== "object" || !applicable(p)) return null;
    const pts = _ptsBruts(q);
    if (!pts.length) return null;
    if (multiPoints(p) && pts.length >= 2) return { x: pts[0].x, y: pts[0].y, pts: pts };
    return { x: pts[0].x, y: pts[0].y };
  }

  // Point de la polyligne à mi-longueur (le premier point si elle est de longueur nulle).
  function milieu(pts) {
    let tot = 0;
    for (let i = 1; i < pts.length; i++) tot += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    let reste = tot / 2;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l > 0 && reste <= l) return { x: a.x + (b.x - a.x) * reste / l, y: a.y + (b.y - a.y) * reste / l };
      reste -= l;
    }
    return { x: pts[0].x, y: pts[0].y };
  }

  // Centre du point précis (chatière : le milieu de son tracé mesuré en longueur) | null.
  function centre(p) {
    const q = lire(p);
    if (!q) return null;
    return q.pts ? milieu(q.pts) : { x: q.x, y: q.y };
  }
  // Où vise l'itinéraire : le point précis s'il existe, sinon le POI.
  function cible(p) {
    return centre(p) || { x: Number(p && p.x) || 0, y: Number(p && p.y) || 0 };
  }

  // ── Fiche (utils.js > buildPointPopupHtml) ──────────
  // `act(action)` = attributs data-kta-* du point (identification par id + coordonnées de l'icône).
  function htmlFiche(point, editable, act) {
    if (!editable || !applicable(point) || typeof act !== "function") return "";
    const a = lire(point);
    // `ico` : icône SVG devant le libellé (ktaIcones.js), comme les autres boutons de la fiche.
    const bouton = function (action, cle, titre, ico) {
      const svg = ico && typeof window.ktaIcone === "function" ? window.ktaIcone(ico) + " " : "";
      return '<button class="kta-popup-btn kta-popup-btn-precis" type="button" ' + act(action) +
        'title="' + window.ktaEsc(_t(titre)) + '">' + svg + window.ktaEsc(_t(cle)) + '</button>';
    };
    return '<div class="kta-popup-actions kta-popup-precis">' +
      (a ? bouton("precis", "poiPrecis.refaire", "poiPrecis.titre", "crosshair") + bouton("precis-retirer", "poiPrecis.retirer",
        "poiPrecis.retirerTitre")
        : bouton("precis", "poiPrecis.augmenter", "poiPrecis.titre", "crosshair")) +
      '</div>';
  }

  // ── Écriture ──────────
  function _point(id, x, y) {
    return (typeof window.ktaPointSession === "function") ? window.ktaPointSession(id, x, y) : null;
  }
  function _refuse() { return typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee(); }
  function _toast(msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, type);
  }

  // ⚠️ contrat : captureState → mutation en place → KtaUid.touch → renderEditorPoints → record → save.
  function _ecrire(pt, valeur, cleUndo) {
    const H = window.HistoryManager;
    const avant = H ? H.captureState("editorPoints") : null;
    if (valeur) pt.precis = valeur; else delete pt.precis;
    if (window.KtaUid) window.KtaUid.touch(pt);
    if (typeof window.renderEditorPoints === "function") window.renderEditorPoints();
    if (H && avant) H.record(_t(cleUndo, { nom: String(pt.nom || pt.id || "") }), avant, "editorPoints");
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch (e) { /* le poll de SessionPersist rattrape */ }
    }
  }

  function retirer(id, x, y) {
    if (_refuse()) return false;
    const pt = _point(id, Number(x), Number(y));
    if (!pt || !pt.precis) return false;
    if (window.map) try { window.map.closePopup(); } catch (e) { /* carte détruite */ }
    _ecrire(pt, null, "poiPrecis.undo.retire");
    _toast(_t("poiPrecis.toast.retire", { nom: String(pt.nom || pt.id || "") }), "success");
    return true;
  }

  // ── Mode « Touchez le point exact » (genre « precis ») ou « Touchez le nouvel emplacement » (« deplacer ») ──────
  // 📍 Déplacer (fiche de la vue 3D) repose l'ICÔNE par editor.js > ktaDeplacerPointSession (la règle de
  // Repositionner) ; la vue 3D change son toucher au sol en clic de la carte (vue3d.js > _poserAuSol).
  let _mode = null;   // { genre, id, x, y, nom, multi, pts, carte, handler, temp }

  function enCours() {
    if (!_mode) return null;
    return { genre: _mode.genre, multi: _mode.multi, points: _mode.pts.length,
      etape: !_mode.multi ? "point" : _mode.pts.length ? "suivant" : "debut" };
  }

  // 🩸 Sur window en capture : avant l'écouteur de document de la vue 3D, qui fermerait la fiche ou la vue.
  // Entrée termine une chatière qui a ses 2 points (sinon elle ne fait rien de plus que d'habitude).
  function _surTouche(e) {
    if (!e || !_mode) return;
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); annuler(); return; }
    if (e.key === "Enter" && _mode.multi && _mode.pts.length >= 2) {
      e.stopPropagation(); e.preventDefault(); terminer();
    }
  }

  function annuler() {
    if (!_mode) return;
    const m = _mode;
    _mode = null;
    if (m.carte && m.handler) { try { m.carte.off("click", m.handler); } catch (e) { /* carte remplacée */ } }
    if (m.temp) { try { m.temp.remove(); } catch (e) { /* idem */ } }
    const fl = document.getElementById("kta-precis-floater");
    if (fl) fl.remove();
    window.removeEventListener("keydown", _surTouche, true);
  }

  function _texteBandeau() {
    const n = _mode.pts.length;
    const k = _mode.genre === "deplacer" ? "poiPrecis.bandeauDeplacer" : !_mode.multi ? "poiPrecis.bandeau"
      : n === 0 ? "poiPrecis.bandeauDebut" : n === 1 ? "poiPrecis.bandeauSuivant" : "poiPrecis.bandeauSuite";
    return _t(k, { nom: _mode.nom, n: n });
  }

  // Bandeau et bouton « Terminer » (présent dès le début d'une chatière, actif à partir de 2 points).
  function _majBandeau() {
    if (!_mode) return;
    const msg = document.querySelector("#kta-precis-floater .kta-iti-floater-msg");
    if (msg) msg.textContent = _texteBandeau();
    const fin = document.getElementById("kta-precis-terminer");
    if (fin) fin.disabled = _mode.pts.length < 2;
  }

  // 🩸 Le POI est recherché à l'écriture : la session a pu changer depuis l'armement (annulation, suppression, plan
  // rechargé).
  function _poser(valeur, px, py) {
    const cible = _point(_mode.id, _mode.x, _mode.y);
    const g = _mode.genre, nom = _mode.nom;
    annuler();
    if (!cible || _refuse()) return false;
    if (g === "deplacer") {
      if (typeof window.ktaDeplacerPointSession === "function") window.ktaDeplacerPointSession(cible, px, py);
      return true;
    }
    _ecrire(cible, valeur, "poiPrecis.undo.pose");
    _toast(_t("poiPrecis.toast.pose", { nom: nom }), "success");
    return true;
  }

  // Chatière : écrit les points posés (2 au moins) en une seule entrée d'historique. → true si écrit.
  function terminer() {
    if (!_mode || !_mode.multi || _mode.pts.length < 2) return false;
    return _poser({ pts: _mode.pts.slice() });
  }

  // `genre` : "precis" (défaut) | "deplacer". → true si le mode est armé.
  function armer(id, x, y, genre) {
    genre = genre === "deplacer" ? "deplacer" : "precis";
    if (_refuse() || !window.map) return false;
    const pt = _point(id, Number(x), Number(y));
    if (!pt || (genre === "precis" && !applicable(pt))) return false;
    annuler();
    if (typeof window.repositionnerAnnuler === "function") window.repositionnerAnnuler();
    // 🩸 Les autres modes « clic carte » tombent AVANT d'armer, sinon le même tap pose aussi un sommet ou ouvre
    // la fiche d'un point neuf (editor.js > repositionnerPointEditor, même règle).
    try { if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes(); } catch (e) {}
    window.modeEdition = false; window.modeMesure = false; window.modeRecalage = false;
    window.modeRoad = false; window.modeZone = false; window.modeStructure = false;
    try { window.map.closePopup(); } catch (e) { /* rien d'ouvert */ }

    const carte = window.map;
    _mode = { genre: genre, id: id, x: Number(x), y: Number(y), nom: String(pt.nom || id || ""),
      multi: genre === "precis" && multiPoints(pt), pts: [], carte: carte, temp: null };
    _mode.handler = function (e) {
      if (!_mode || !e || !e.latlng) return;
      // Un outil armé depuis (bouton de la barre) : il garde ses clics, le mode tombe.
      if (window.modeRoad || window.modeZone || window.modeStructure || window.modeEdition || window.modeMesure) {
        annuler(); return;
      }
      const H = window.APP_CONFIG && window.APP_CONFIG.imageHeight;
      // Chemin INVERSE de convertCoord(x, y) = [imageHeight - y, x].
      const px = _r(e.latlng.lng), py = _r(H ? H - e.latlng.lat : e.latlng.lat);
      if (_mode.multi) {
        _mode.pts.push({ x: px, y: py });
        if (_mode.temp) { try { _mode.temp.remove(); } catch (err) { /* carte remplacée */ } }
        _mode.temp = _calqueTemp(carte, _mode.pts);
        _majBandeau();
        return;
      }
      _poser({ x: px, y: py }, px, py);
    };
    carte.on("click", _mode.handler);

    const fl = document.createElement("div");
    fl.id = "kta-precis-floater";
    fl.className = "kta-iti-floater kta-precis-floater";
    fl.innerHTML = '<span class="kta-iti-floater-icon"></span><span class="kta-iti-floater-msg"></span>' +
      (_mode.multi ? '<button class="kta-btn kta-btn-primary" id="kta-precis-terminer" type="button"></button>' : "") +
      '<button class="kta-btn kta-btn-ghost" id="kta-precis-cancel" type="button"></button>';
    // Icône SVG figée (ktaIcones.js), jamais une donnée de l'utilisateur.
    if (typeof window.ktaIcone === "function") {
      const ico = genre === "deplacer" ? "map-pin" : "crosshair";
      fl.querySelector(".kta-iti-floater-icon").innerHTML = window.ktaIcone(ico);
    }
    // Le nom vient de l'utilisateur : en TEXTE, jamais en HTML.
    fl.querySelector(".kta-iti-floater-msg").textContent = _texteBandeau();
    const fin = fl.querySelector("#kta-precis-terminer");
    if (fin) {
      fin.innerHTML = (typeof window.ktaIcone === "function" ? window.ktaIcone("check") + " " : "") +
        window.ktaEsc(_t("poiPrecis.terminer"));
      fin.title = _t("poiPrecis.terminerTitre");
      fin.disabled = true;
      fin.addEventListener("click", terminer);
    }
    const b = fl.querySelector("#kta-precis-cancel");
    b.textContent = _t("poiPrecis.annuler");
    b.addEventListener("click", annuler);
    document.body.appendChild(fl);
    window.addEventListener("keydown", _surTouche, true);
    return true;
  }

  // ── Affichage 2D ──────────
  function _renderer(m) {
    if (!m._ktaPrecisRendu) m._ktaPrecisRendu = L.svg({ padding: 0.5 });
    return m._ktaPrecisRendu;
  }
  function _carre(ll) {
    return L.marker(ll, { interactive: false, keyboard: false,
      icon: L.divIcon({ className: "kta-precis-carre", iconSize: [CARRE_PX, CARRE_PX] }) });
  }
  // Carré à chaque point et polyligne qui les relie (affichage et points provisoires de la saisie).
  function _trace(g, pts, rd) {
    const cv = window.convertCoord, ll = pts.map(function (a) { return cv(a.x, a.y); });
    if (ll.length > 1) {
      L.polyline(ll, { renderer: rd, weight: 3, interactive: false, className: "kta-precis-segment" }).addTo(g);
    }
    ll.forEach(function (c) { _carre(c).addTo(g); });
    return g;
  }
  function _calqueTemp(m, pts) {
    try { return _trace(L.layerGroup(), pts, _renderer(m)).addTo(m); } catch (e) { return null; }
  }

  function zoomSuffit(m) {
    m = m || window.map;
    if (!m || typeof m.getZoom !== "function") return false;
    const e = window.APP_CONFIG && Number(window.APP_CONFIG.scale);
    const z = m.getZoom();
    return e > 0 ? e * Math.pow(2, z) >= SEUIL_PX_PAR_M : z >= ZOOM_SANS_ECHELLE;
  }

  const _suivis = new Set();   // marqueurs d'un POI à point précis, sur la carte
  let _fiche = null;           // marqueur dont la fiche est ouverte

  function _construire(marker, point, m) {
    const q = lire(point);
    if (!q) return null;
    const cv = window.convertCoord, rd = _renderer(m), g = L.layerGroup();
    const c = centre(point);
    L.polyline([cv(point.x, point.y), cv(c.x, c.y)], { renderer: rd, weight: 2, dashArray: "4 4",
      interactive: false, className: "kta-precis-trait" }).addTo(g);
    return _trace(g, q.pts || [{ x: q.x, y: q.y }], rd);
  }

  function maj(marker) {
    if (!marker || !marker._ktaPrecisPoint) return;
    const m = marker._map || null;
    const voir = !!m && !marker._ktaMasque && (marker === _fiche || zoomSuffit(m));
    if (!voir) {
      if (marker._ktaPrecisGuide) { try { marker._ktaPrecisGuide.remove(); } catch (e) {} }
      marker._ktaPrecisGuide = null;
      return;
    }
    if (marker._ktaPrecisGuide && marker._ktaPrecisGuide._map === m) return;
    if (marker._ktaPrecisGuide) { try { marker._ktaPrecisGuide.remove(); } catch (e) {} }
    const g = _construire(marker, marker._ktaPrecisPoint, m);
    marker._ktaPrecisGuide = g ? g.addTo(m) : null;
  }
  function rafraichir() { _suivis.forEach(maj); }

  function _brancherCarte(m) {
    if (!m || m._ktaPrecisZoomBound) return;
    m._ktaPrecisZoomBound = true;
    m.on("zoomend", rafraichir);
  }

  // Appelé à la création de chaque marqueur de POI (editor.js > _ajouterMarker, utils.js > ajouterPointsDepuisJSON),
  // AVANT son ajout à la carte. Rien n'est posé pour un POI sans point précis.
  function brancherMarqueur(marker, point) {
    if (!marker || typeof marker.on !== "function" || !lire(point)) return;
    marker._ktaPrecisPoint = point;
    marker.on("add", function () { _suivis.add(marker); _brancherCarte(marker._map); maj(marker); });
    marker.on("remove", function () {
      _suivis.delete(marker);
      if (_fiche === marker) _fiche = null;
      if (marker._ktaPrecisGuide) { try { marker._ktaPrecisGuide.remove(); } catch (e) {} }
      marker._ktaPrecisGuide = null;
    });
    marker.on("popupopen", function () { _fiche = marker; maj(marker); });
    marker.on("popupclose", function () { if (_fiche === marker) _fiche = null; maj(marker); });
  }

  // Ce que le checkup lit : guides posés, mode en cours, seuil.
  function etat() {
    let n = 0;
    _suivis.forEach(function (mk) { if (mk._ktaPrecisGuide) n++; });
    return { suivis: _suivis.size, guides: n, mode: enCours(), zoomSuffit: zoomSuffit() };
  }

  window.KtaPoiPrecis = {
    SEUIL_PX_PAR_M: SEUIL_PX_PAR_M,
    ZOOM_SANS_ECHELLE: ZOOM_SANS_ECHELLE,
    applicable: applicable,
    multiPoints: multiPoints,
    lire: lire,
    milieu: milieu,
    centre: centre,
    cible: cible,
    htmlFiche: htmlFiche,
    armer: armer,
    terminer: terminer,
    annuler: annuler,
    retirer: retirer,
    enCours: enCours,
    zoomSuffit: zoomSuffit,
    brancherMarqueur: brancherMarqueur,
    maj: maj,
    rafraichir: rafraichir,
    etat: etat
  };
})();
