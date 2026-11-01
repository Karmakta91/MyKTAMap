/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// selectionMulti.js — sélectionner N objets d'un coup : conversion (KtaConvertir) ou suppression en lot
// =====================================================================
// La modale de conversion ouvre ce mode ; l'utilisateur désigne des objets (clic, « tous du type », ou
// ✏️ zone dessinée : js/selectionZone.js), puis ✅ Convertir (la modale revient avec le lot) ou 🗑️ Supprimer.
// 🩸 La compatibilité est l'OUVERTURE, pas la famille : tracés et fronts (lignes) se mêlent ;
//   ligne + surface fermée est refusé au CLIC (aucune cible commune), et le refus est EXPLIQUÉ. Une zone prend
//   tout ce qu'elle contient (points compris) : ✅ Convertir ne passe que les objets de l'ouverture de la graine,
//   son compteur le montre ; 🗑️ Supprimer prend tout le lot. Re-cliquer un objet sélectionné (point compris)
//   le retire.
// 🩸 Surbrillance = calque à part, `interactive: false`, jamais un setStyle sur les layers (pas
//   de registre objet → layer fiable ; un re-rendu écraserait les styles).
// Couleur = accent d'interaction de la charte (état d'interface, pas un style de type).
// Expose : window.SelectionMulti { ouvrir(graine, onValide), fermer, liste, estActif } et les
//   helpers géométriques window.ktaPointInPolygon / ktaDistPointSegment (foyer canonique ; des
//   copies locales anciennes subsistent dans d'autres modules).
// Garde-fou : scripts/check-selection-multi.js
(function () {
  "use strict";

  // Tolérance de visée en px PLAN (pas écran), comme « supprimer au clic ».
  const TOLERANCE_PX = 20;

  const SURBRILLANCE = { color: "#8cb4ff", weight: 6, opacity: 0.95, dashArray: "7 5" };

  function _t(k, p) {
    return (window.I18n && window.I18n.t) ? window.I18n.t(k, p) : k;
  }

  // ── Géométrie ────────────────────────────────────────
  // Ray-casting, comme pathfinder.js > _pointInPolygon.
  function _pointInPolygon(p, poly) {
    if (!p || !Array.isArray(poly) || poly.length < 3) return false;
    let dedans = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > p.y) !== (yj > p.y)) &&
          (p.x < (xj - xi) * (p.y - yi) / ((yj - yi) || 1e-12) + xi)) {
        dedans = !dedans;
      }
    }
    return dedans;
  }

  function _distPointSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  // Distance au CONTOUR ; polygone : boucle fermée, sinon son dernier côté ne se vise pas.
  function _distAuContour(p, points, ferme) {
    if (!Array.isArray(points) || points.length < 2) return Infinity;
    let d = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      d = Math.min(d, _distPointSegment(p, points[i], points[i + 1]));
    }
    if (ferme && points.length >= 3) {
      d = Math.min(d, _distPointSegment(p, points[points.length - 1], points[0]));
    }
    return d;
  }

  window.ktaPointInPolygon   = _pointInPolygon;
  window.ktaDistPointSegment = _distPointSegment;

  // ── Lecture des trois familles ───────────────────────
  // `itinerary` = trajet CALCULÉ, pas une donnée du relevé : exclu comme source aussi. `jonction` : ses niveaux
  // reliés ne survivent pas à une conversion (la fiche ne la propose pas ; KtaConvertir.convertirLot la saute aussi).
  const EXCLUS = { itinerary: true, jonction: true };

  function _lire(famille) {
    const g = { roads: "getRoads", zones: "getZones", structures: "getStructures" }[famille];
    return (g && typeof window[g] === "function") ? (window[g]() || []) : [];
  }

  function _ouvertureDe(famille, type) {
    if (!window.KtaConvertir || typeof window.KtaConvertir.estOuvert !== "function") return null;
    return window.KtaConvertir.estOuvert(famille, type);
  }

  // Le niveau affiché. Hors multi-niveau, tout passe.
  function _niveauVisible(obj) {
    if (!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true)) return true;
    const vis = Array.isArray(window.APP_CONFIG.visibleLevels) ? window.APP_CONFIG.visibleLevels : [0];
    const lvl = Number.isInteger(obj.level) ? obj.level : 0;
    return vis.indexOf(lvl) >= 0;
  }

  // Points de session aussi : un point se retire au re-clic, et s'ajoute (il ne compte que pour 🗑️).
  function _candidats() {
    const out = [];
    ["roads", "zones", "structures"].forEach(function (famille) {
      _lire(famille).forEach(function (obj) {
        if (!obj || EXCLUS[obj.type] || !_niveauVisible(obj)) return;
        if (!Array.isArray(obj.points) || obj.points.length < 2) return;
        out.push({ famille: famille, obj: obj });
      });
    });
    const pts = (typeof window.getEditorPoints === "function") ? (window.getEditorPoints() || []) : [];
    pts.forEach(function (obj) {
      if (!obj || !Number.isFinite(obj.x) || !Number.isFinite(obj.y) || !_niveauVisible(obj)) return;
      out.push({ famille: "editorPoints", obj: obj });
    });
    return out;
  }

  // ── Qui est sous le clic (sans Leaflet, testé en harnais) ──
  // → { cible, refus } : `refus` = objet incompatible visé, pour dire pourquoi.
  function _choisir(candidats, cx, cy, ouvertRef) {
    const p = { x: cx, y: cy };
    let meilleur = null, meilleurD = Infinity;
    candidats.forEach(function (c) {
      let ouvert, d;
      if (c.famille === "editorPoints") {
        ouvert = null;   // un point n'a pas d'ouverture : jamais refusé
        d = Math.hypot(p.x - c.obj.x, p.y - c.obj.y);
      } else {
        ouvert = _ouvertureDe(c.famille, c.obj.type);
        if (ouvert === null) return;
        d = _distAuContour(p, c.obj.points, !ouvert);
        if (!ouvert && _pointInPolygon(p, c.obj.points)) d = 0;   // clic PLEIN dans une surface
      }
      if (d > TOLERANCE_PX) return;
      if (d < meilleurD) { meilleurD = d; meilleur = { famille: c.famille, obj: c.obj, ouvert: ouvert }; }
    });
    if (!meilleur) return { cible: null, refus: null };
    if (ouvertRef !== null && meilleur.ouvert !== null && meilleur.ouvert !== ouvertRef) {
      return { cible: null, refus: meilleur };
    }
    return { cible: meilleur, refus: null };
  }

  // ── État ─────────────────────────────────────────────
  let _actif = false;
  let _sel = [];                 // [{ famille, obj }]
  let _ouvertRef = null;         // ouverture imposée par la graine
  let _dernier = null;           // dernier objet ajouté → cible du « ➕ tous les … »
  let _handler = null;
  let _groupe = null;
  let _floater = null;
  let _onValide = null;
  let _calque = [];              // objets de calque vus dans les zones (ignorés, comptés à la confirmation)

  function _dansSel(obj) {
    for (let i = 0; i < _sel.length; i++) if (_sel[i].obj === obj) return i;
    return -1;
  }

  // ── Surbrillance ─────────────────────────────────────
  function _repeindre() {
    if (!_groupe) return;
    _groupe.clearLayers();
    if (typeof window.convertCoord !== "function" || !window.L) return;
    _sel.forEach(function (s) {
      if (s.famille === "editorPoints") {
        _groupe.addLayer(window.L.circleMarker(window.convertCoord(s.obj.x, s.obj.y),
          Object.assign({}, SURBRILLANCE, { radius: 14, fill: false, interactive: false })));
        return;
      }
      const pts = s.obj.points.map(function (p) { return window.convertCoord(p.x, p.y); });
      const style = Object.assign({}, SURBRILLANCE, { fill: false, interactive: false });
      const ouvert = _ouvertureDe(s.famille, s.obj.type);
      const l = ouvert ? window.L.polyline(pts, style) : window.L.polygon(pts, style);
      _groupe.addLayer(l);
    });
  }

  function _libelleType(famille, type) {
    const cat = { roads: "traces", zones: "zones", structures: "structures" }[famille] || famille;
    const LC = window.LegendCustomization;
    try {
      // 🩸 getLabel ne connaît que les types intégrés : pour un type perso (import SIG) il rend l'id brut.
      const perso = LC && LC.findCustomEntry ? LC.findCustomEntry(type) : null;
      if (perso && perso.label) return perso.label;
      if (LC && LC.getLabel) return LC.getLabel(cat, type) || type;
    } catch (e) {}
    return type;
  }

  // Ce que ✅ Convertir emporte : objets vectoriels de l'ouverture de la graine (ni point, ni l'autre ouverture).
  function _convertibles() {
    return _sel.filter(function (s) {
      return s.famille !== "editorPoints" && _ouvertureDe(s.famille, s.obj.type) === _ouvertRef;
    });
  }

  function _zoneEnCours() {
    return !!(window.KtaSelectionZone && window.KtaSelectionZone.enCours());
  }

  function _majFloater(message) {
    if (!_floater) return;
    const dessin = _zoneEnCours();
    // Deux jeux de boutons : la sélection, ou le tracé de la zone.
    _floater.querySelectorAll("[data-selm-mode]").forEach(function (b) {
      b.style.display = (b.getAttribute("data-selm-mode") === (dessin ? "zone" : "sel")) ? "" : "none";
    });
    const msg = _floater.querySelector(".kta-selm-msg");
    if (dessin) {
      const n = window.KtaSelectionZone.nbSommets();
      if (msg) msg.textContent = message || _t("selm.zone.trace", { n: n });
      const zok = _floater.querySelector("#kta-selm-zone-ok");
      if (zok) zok.disabled = n < 3;
      return;
    }
    if (msg) msg.textContent = message || _t("selm.compte", { n: _sel.length });
    const ok = _floater.querySelector("#kta-selm-ok");
    if (ok) {
      const nc = _convertibles().length;
      ok.textContent = _t("selm.valider", { n: nc });
      ok.disabled = nc === 0;
    }
    const sup = _floater.querySelector("#kta-selm-suppr");
    if (sup) {
      sup.textContent = _t("selm.supprimer", { n: _sel.length });
      sup.disabled = _sel.length === 0;
    }
    const tous = _floater.querySelector("#kta-selm-tous");
    if (tous) {
      if (_dernier) {
        tous.textContent = _t("selm.tousDuType", { type: _libelleType(_dernier.famille, _dernier.obj.type) });
      } else {
        tous.style.display = "none";
      }
    }
  }

  // Tous les objets du MÊME TYPE que le dernier ajouté, au niveau affiché (relevé importé).
  function _ajouterTousDuType() {
    if (!_dernier) return;
    const fam = _dernier.famille, typ = _dernier.obj.type;
    let n = 0;
    _lire(fam).forEach(function (obj) {
      if (!obj || obj.type !== typ || EXCLUS[obj.type]) return;
      if (!Array.isArray(obj.points) || obj.points.length < 2) return;
      if (!_niveauVisible(obj)) return;
      if (_dansSel(obj) >= 0) return;
      _sel.push({ famille: fam, obj: obj });
      n++;
    });
    _repeindre();
    _majFloater(n > 0 ? _t("selm.ajoutes", { n: n }) : _t("selm.aucunAjout"));
  }

  // ── Zone dessinée ────────────────────────────────────
  function _commencerZone() {
    if (!window.KtaSelectionZone || !window.KtaSelectionZone.commencer()) return;
    _majFloater();
  }
  function _prendreZone() {
    const Z = window.KtaSelectionZone;
    if (!Z || !Z.enCours()) return;
    const poly = Z.terminer();
    if (!poly) { _majFloater(_t("selm.zone.tropCourte")); return; }
    const r = Z.dansZone(poly);
    let n = 0;
    r.items.forEach(function (it) {
      if (_dansSel(it.obj) >= 0) return;
      _sel.push(it);
      n++;
    });
    let nc = 0;
    r.calque.forEach(function (c) {
      if (_calque.some(function (x) { return x.ref === c.ref; })) return;
      _calque.push(c);
      nc++;
    });
    _repeindre();
    _majFloater(_t(n ? "selm.zone.ajoutes" : "selm.zone.aucun", { n: n }) +
      (nc ? " " + _t("selm.zone.calques", { n: nc }) : ""));
  }
  function _abandonnerZone() {
    if (window.KtaSelectionZone) window.KtaSelectionZone.abandonner();
    _majFloater();
  }

  function _supprimer() {
    if (!window.KtaSelectionZone || !_sel.length) return;
    window.KtaSelectionZone.confirmerEtSupprimer(_sel.slice(), _calque.length).then(function (bilan) {
      if (bilan && bilan.supprimes) fermer();
    });
  }

  // ── Ouverture / fermeture ────────────────────────────
  function fermer() {
    if (!_actif) return;
    _actif = false;
    // Zone en cours de tracé : la mesure ♦️ d'avant est rendue.
    if (_zoneEnCours()) window.KtaSelectionZone.abandonner();
    if (window.map && _handler) { try { window.map.off("click", _handler); } catch (e) {} }
    _handler = null;
    if (_groupe) {
      try { _groupe.clearLayers(); if (window.map) window.map.removeLayer(_groupe); } catch (e) {}
      _groupe = null;
    }
    if (_floater && _floater.parentNode) _floater.remove();
    _floater = null;
    _sel = [];
    _calque = [];
    _dernier = null;
    _ouvertRef = null;
    _onValide = null;
  }

  // `graine` = { famille, obj } de départ : donne l'ouverture de référence ET compte comme premier
  // sélectionné.
  function ouvrir(graine, onValide) {
    if (!window.map || !graine || !graine.obj) return false;
    const ouvert = _ouvertureDe(graine.famille, graine.obj.type);
    if (ouvert === null) return false;
    fermer();

    _actif = true;
    _ouvertRef = ouvert;
    _sel = [{ famille: graine.famille, obj: graine.obj }];
    _dernier = _sel[0];
    _onValide = (typeof onValide === "function") ? onValide : null;

    if (window.L && window.L.layerGroup) {
      _groupe = window.L.layerGroup().addTo(window.map);
    }

    _handler = function (e) {
      if (!e || !e.latlng) return;
      // Pendant le tracé de la zone, le clic est un sommet (measure.js le pose) : le compteur suit après lui.
      if (_zoneEnCours()) { setTimeout(function () { _majFloater(); }, 0); return; }
      const cx = e.latlng.lng;
      const cy = (window.APP_CONFIG && window.APP_CONFIG.imageHeight)
                   ? (window.APP_CONFIG.imageHeight - e.latlng.lat)
                   : e.latlng.lat;
      const r = _choisir(_candidats(), cx, cy, _ouvertRef);
      if (r.refus) {
        // 🩸 On DIT pourquoi : un clic sans effet ni mot se lit comme un bug.
        _majFloater(_t(_ouvertRef ? "selm.refusFerme" : "selm.refusOuvert"));
        return;
      }
      if (!r.cible) { _majFloater(_t("selm.rien")); return; }
      const i = _dansSel(r.cible.obj);
      if (i >= 0) {
        // Re-cliquer retire l'objet (corrige une erreur de visée).
        _sel.splice(i, 1);
        if (_dernier && _dernier.obj === r.cible.obj) {
          const vecteurs = _sel.filter(function (s) { return s.famille !== "editorPoints"; });
          _dernier = vecteurs[vecteurs.length - 1] || null;
        }
        _repeindre();
        _majFloater(_t("selm.retire"));
        return;
      }
      _sel.push({ famille: r.cible.famille, obj: r.cible.obj });
      // « Tous du type » vise le dernier objet VECTORIEL (un point n'a pas de type de légende).
      if (r.cible.famille !== "editorPoints") _dernier = _sel[_sel.length - 1];
      _repeindre();
      _majFloater();
    };
    window.map.on("click", _handler);

    _floater = document.createElement("div");
    _floater.id = "kta-selm-floater";
    // 🩸 `.kta-iti-floater` n'est pas cosmétique : utils.js > _modeClicCarteActif la reconnaît
    // (pas de popup d'annotation, clic ré-émis en capture même sur un layer interactif).
    _floater.className = "kta-iti-floater kta-selm-floater";
    _floater.innerHTML =
      '<span class="kta-iti-floater-icon">🎯</span>' +
      '<span class="kta-iti-floater-msg kta-selm-msg"></span>' +
      '<button class="kta-btn kta-btn-ghost" id="kta-selm-tous" type="button" data-selm-mode="sel"></button>' +
      '<button class="kta-btn kta-btn-ghost" id="kta-selm-zone" type="button" data-selm-mode="sel"></button>' +
      '<button class="kta-btn kta-btn-primary" id="kta-selm-ok" type="button" data-selm-mode="sel"></button>' +
      '<button class="kta-btn kta-btn-danger" id="kta-selm-suppr" type="button" data-selm-mode="sel"></button>' +
      '<button class="kta-btn kta-btn-ghost" id="kta-selm-annuler" type="button" data-selm-mode="sel"></button>' +
      '<button class="kta-btn kta-btn-primary" id="kta-selm-zone-ok" type="button" data-selm-mode="zone"></button>' +
      '<button class="kta-btn kta-btn-ghost" id="kta-selm-zone-retour" type="button" data-selm-mode="zone"></button>' +
      '<button class="kta-btn kta-btn-ghost" id="kta-selm-zone-annuler" type="button" data-selm-mode="zone"></button>';
    document.body.appendChild(_floater);
    [["#kta-selm-annuler", "selm.annuler"], ["#kta-selm-zone", "selm.zone.bouton"],
     ["#kta-selm-zone-ok", "selm.zone.prendre"], ["#kta-selm-zone-retour", "selm.zone.retour"],
     ["#kta-selm-zone-annuler", "selm.zone.annuler"]].forEach(function (b) {
      _floater.querySelector(b[0]).textContent = _t(b[1]);
    });
    _floater.querySelector("#kta-selm-tous").addEventListener("click", _ajouterTousDuType);
    _floater.querySelector("#kta-selm-annuler").addEventListener("click", fermer);
    _floater.querySelector("#kta-selm-zone").addEventListener("click", _commencerZone);
    _floater.querySelector("#kta-selm-zone-ok").addEventListener("click", _prendreZone);
    _floater.querySelector("#kta-selm-zone-retour").addEventListener("click", function () {
      if (window.KtaSelectionZone) window.KtaSelectionZone.retirerSommet();
      _majFloater();
    });
    _floater.querySelector("#kta-selm-zone-annuler").addEventListener("click", _abandonnerZone);
    _floater.querySelector("#kta-selm-suppr").addEventListener("click", _supprimer);
    _floater.querySelector("#kta-selm-ok").addEventListener("click", function () {
      const lot = _convertibles();
      const cb = _onValide;
      fermer();
      if (cb) cb(lot);
    });

    _repeindre();
    _majFloater();
    return true;
  }

  window.SelectionMulti = {
    ouvrir:   ouvrir,
    fermer:   fermer,
    liste:    function () { return _sel.slice(); },
    estActif: function () { return _actif; },
    // Pour le harnais (sans Leaflet) :
    _choisir: _choisir,
    _TOLERANCE_PX: TOLERANCE_PX
  };
})();
