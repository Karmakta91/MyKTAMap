/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// poiPrecis.js — point précis d'un POI : le vrai lieu (le mur de la plaque…) quand l'icône est décalée pour lire.
// Modèle : `precis: { x, y }` (px du plan, même niveau que le POI) ; chatière (tag `chatiere`) : `{ x, y, x2, y2 }` =
// début et fin. `x`, `y` du POI restent la place de l'icône. Absent = rien ne change nulle part.
// ⚠️ contrat : les passages entre niveaux (poiJonction.js > porteNiveaux : jes, jpe, jps, peo, eso, pa) n'en ont
// pas (leurs raccords validés jouent ce rôle) : pas de bouton, champ ignoré partout (lire → null).
// Lecteurs : vue 3D (galerieEmprise.js > _departPassage, vue3d.js > _dimAcces, panneau), itinéraire (cible : « Y
// aller », étape, repère du guidage), « 📍 Je suis ici » (cible, utils.js > _ktaPopupAction, emergencyMode.js).
// Exports KMZ / GPX / GeoJSON / PNG / PDF : l'icône (décision produit).
// Saisie depuis la fiche seulement (utils.js > buildPointPopupHtml, mêmes droits que ✏️ Modifier) : armer() pose un
// bandeau `.kta-iti-floater` (utils.js > _modeClicCarteActif : aucune fiche, clic ré-émis par map.js), un tap pose le
// point (chatière : début puis fin), Échap ou ✕ annule. Une écriture = une entrée d'historique (Ctrl+Z).
// Affichage 2D : pointillé de l'icône au point et petit carré (chatière : deux carrés reliés, pointillé vers le
// milieu), jeton --kta-accent par classe CSS (renderer SVG), jamais interactif ; visible à partir de SEUIL_PX_PAR_M
// px d'écran par mètre (sans échelle : ZOOM_SANS_ECHELLE) et toujours pendant que la fiche du POI est ouverte.
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
  function deuxPoints(p) { return _tag(p) === "chatiere"; }

  // Point précis lisible du POI → { x, y } ou { x, y, x2, y2 } (chatière à deux points) | null.
  function lire(p) {
    const q = p && p.precis;
    if (!q || !applicable(p) || !_num(q.x) || !_num(q.y)) return null;
    if (deuxPoints(p) && _num(q.x2) && _num(q.y2)) return { x: q.x, y: q.y, x2: q.x2, y2: q.y2 };
    return { x: q.x, y: q.y };
  }
  // Centre du point précis (chatière à deux points : le milieu) | null.
  function centre(p) {
    const q = lire(p);
    if (!q) return null;
    return q.x2 === undefined ? { x: q.x, y: q.y } : { x: (q.x + q.x2) / 2, y: (q.y + q.y2) / 2 };
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
  let _mode = null;   // { genre, id, x, y, nom, deux, debut, carte, handler, temp }

  function enCours() {
    if (!_mode) return null;
    return { genre: _mode.genre, deux: _mode.deux,
      etape: _mode.debut ? "fin" : (_mode.deux ? "debut" : "point") };
  }

  // 🩸 Sur window en capture : avant l'écouteur de document de la vue 3D, qui fermerait la fiche ou la vue.
  function _surTouche(e) {
    if (!e || e.key !== "Escape" || !_mode) return;
    e.stopPropagation(); e.preventDefault();
    annuler();
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
    const k = _mode.genre === "deplacer" ? "poiPrecis.bandeauDeplacer" : !_mode.deux ? "poiPrecis.bandeau"
      : _mode.debut ? "poiPrecis.bandeauFin" : "poiPrecis.bandeauDebut";
    return _t(k, { nom: _mode.nom });
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
      deux: genre === "precis" && deuxPoints(pt), debut: null, carte: carte, temp: null };
    _mode.handler = function (e) {
      if (!_mode || !e || !e.latlng) return;
      // Un outil armé depuis (bouton de la barre) : il garde ses clics, le mode tombe.
      if (window.modeRoad || window.modeZone || window.modeStructure || window.modeEdition || window.modeMesure) {
        annuler(); return;
      }
      const H = window.APP_CONFIG && window.APP_CONFIG.imageHeight;
      // Chemin INVERSE de convertCoord(x, y) = [imageHeight - y, x].
      const px = _r(e.latlng.lng), py = _r(H ? H - e.latlng.lat : e.latlng.lat);
      if (_mode.deux && !_mode.debut) {
        _mode.debut = { x: px, y: py };
        _mode.temp = _calqueTemp(carte, px, py);
        const msg = document.querySelector("#kta-precis-floater .kta-iti-floater-msg");
        if (msg) msg.textContent = _texteBandeau();
        return;
      }
      // 🩸 Recherché AU TAP : la session a pu changer depuis l'armement (annulation, suppression, plan rechargé).
      const cible = _point(_mode.id, _mode.x, _mode.y);
      const g = _mode.genre, nom = _mode.nom;
      const valeur = _mode.debut ? { x: _mode.debut.x, y: _mode.debut.y, x2: px, y2: py } : { x: px, y: py };
      annuler();
      if (!cible || _refuse()) return;
      if (g === "deplacer") {
        if (typeof window.ktaDeplacerPointSession === "function") window.ktaDeplacerPointSession(cible, px, py);
        return;
      }
      _ecrire(cible, valeur, "poiPrecis.undo.pose");
      _toast(_t("poiPrecis.toast.pose", { nom: nom }), "success");
    };
    carte.on("click", _mode.handler);

    const fl = document.createElement("div");
    fl.id = "kta-precis-floater";
    fl.className = "kta-iti-floater kta-precis-floater";
    fl.innerHTML = '<span class="kta-iti-floater-icon"></span><span class="kta-iti-floater-msg"></span>' +
      '<button class="kta-btn kta-btn-ghost" id="kta-precis-cancel" type="button"></button>';
    fl.querySelector(".kta-iti-floater-icon").textContent = genre === "deplacer" ? "📍" : "🎯";
    // Le nom vient de l'utilisateur : en TEXTE, jamais en HTML.
    fl.querySelector(".kta-iti-floater-msg").textContent = _texteBandeau();
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
  function _calqueTemp(m, x, y) {
    try { return _carre(window.convertCoord(x, y)).addTo(m); } catch (e) { return null; }
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
    if (q.x2 !== undefined) {
      L.polyline([cv(q.x, q.y), cv(q.x2, q.y2)], { renderer: rd, weight: 3, interactive: false,
        className: "kta-precis-segment" }).addTo(g);
      _carre(cv(q.x2, q.y2)).addTo(g);
    }
    _carre(cv(q.x, q.y)).addTo(g);
    return g;
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
    deuxPoints: deuxPoints,
    lire: lire,
    centre: centre,
    cible: cible,
    htmlFiche: htmlFiche,
    armer: armer,
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
