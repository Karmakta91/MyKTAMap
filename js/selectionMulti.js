/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// 🎯 selectionMulti.js — sélectionner N objets vectoriels d'un coup
// =====================================================================
// KARMA, 05/09/2026 : « au lieu de cliquer sur un truc, le convertir, je veux
// pouvoir sélectionner N vecteurs et les convertir d'un coup ».
//
// Sert `KtaConvertir` : la modale de conversion ouvre ce mode, l'utilisateur
// désigne des objets sur la carte, et la modale revient avec le lot.
//
// 🩸 LA RÈGLE DE COMPATIBILITÉ EST L'OUVERTURE, PAS LA FAMILLE. Un tracé et un
// front de taille sont tous deux des LIGNES : les mélanger est légitime, et
// c'est même LE cas utile (convertir 40 fronts mal typés en galeries). Ce
// qu'on refuse, c'est de mêler une ligne et une surface fermée — la
// conversion n'aurait aucune cible commune, puisqu'on ne peut pas refermer un
// trait ni ouvrir un polygone. Le refus est EXPLIQUÉ : un clic qui « ne prend
// pas » sans message se lit comme un bug.
//
// 🩸 LA SURBRILLANCE EST UN CALQUE À PART, pas un `setStyle` sur les layers
// existants. Deux raisons : il n'existe pas de registre objet → layer fiable
// pour les trois familles, et un re-render (déclenché par n'importe quoi
// d'autre) écraserait des styles modifiés à la main sans qu'on le sache. Un
// calque d'overlay se contente d'être vidé à la sortie. Il est
// `interactive: false` — sinon il mangerait les clics qu'il est censé aider à
// viser.
//
// 🎨 La couleur vient de la charte (accent d'interaction `#8cb4ff`) et de
// nulle part ailleurs : `scripts/check-style-canon.js` refuse toute table de
// couleurs locale. Ce n'est pas un style de TYPE, c'est un état d'interface.
//
// 🧭 GÉOMÉTRIE — FOYER CANONIQUE. `_pointInPolygon` vivait déjà en QUATRE
// copies locales (interface.js, pathfinder.js, secoursMode.js…). On n'en fait
// pas une cinquième muette : les deux helpers sont exposés ici
// (`window.ktaPointInPolygon`, `window.ktaDistPointSegment`) pour que le code
// à venir ait un foyer. Migrer les quatre existantes est au BACKLOG — pas
// ici : elles servent trois chemins de suppression qui marchent, et on ne les
// rouvre pas dans une version non déployée.
// =====================================================================
(function () {
  "use strict";

  // Tolérance de visée, en pixels PLAN (pas écran) — même valeur que les
  // modes « supprimer au clic » existants : bon compromis doigt / souris.
  const TOLERANCE_PX = 20;

  // Couleur d'ÉTAT d'interface (charte : interaction), pas un style de type.
  const SURBRILLANCE = { color: "#8cb4ff", weight: 6, opacity: 0.95, dashArray: "7 5" };

  function _t(k, p) {
    return (window.I18n && window.I18n.t) ? window.I18n.t(k, p) : k;
  }

  // ───────── géométrie ─────────
  // Ray-casting, cohérent avec pathfinder.js > _pointInPolygon.
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

  // Distance au CONTOUR d'une suite de points. Pour un polygone on ferme la
  // boucle : sans ça, cliquer sur le dernier côté d'un pilier ne le viserait
  // pas alors qu'il est bien dessiné.
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

  // ───────── lecture des trois familles ─────────
  // `itinerary` est le trajet CALCULÉ, pas une donnée du relevé : déjà interdit
  // comme cible par KtaConvertir, il doit l'être comme SOURCE.
  const EXCLUS = { itinerary: true };

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

  function _candidats() {
    const out = [];
    ["roads", "zones", "structures"].forEach(function (famille) {
      _lire(famille).forEach(function (obj) {
        if (!obj || EXCLUS[obj.type]) return;
        if (!Array.isArray(obj.points) || obj.points.length < 2) return;
        out.push({ famille: famille, obj: obj });
      });
    });
    return out;
  }

  // ───────── le cœur testable : qui est sous le clic ─────────
  // Rendu séparé de tout Leaflet pour être éprouvé en harnais. Retourne
  // { cible, refus } — `refus` porte l'objet incompatible qu'on a visé, pour
  // pouvoir DIRE pourquoi on refuse au lieu d'ignorer le clic.
  function _choisir(candidats, cx, cy, ouvertRef) {
    const p = { x: cx, y: cy };
    let meilleur = null, meilleurD = Infinity;
    candidats.forEach(function (c) {
      const ouvert = _ouvertureDe(c.famille, c.obj.type);
      if (ouvert === null) return;
      let d = _distAuContour(p, c.obj.points, !ouvert);
      if (!ouvert && _pointInPolygon(p, c.obj.points)) d = 0;   // clic PLEIN dans une surface
      if (d > TOLERANCE_PX) return;
      if (d < meilleurD) { meilleurD = d; meilleur = { famille: c.famille, obj: c.obj, ouvert: ouvert }; }
    });
    if (!meilleur) return { cible: null, refus: null };
    if (ouvertRef !== null && meilleur.ouvert !== ouvertRef) {
      return { cible: null, refus: meilleur };
    }
    return { cible: meilleur, refus: null };
  }

  // ───────── état ─────────
  let _actif = false;
  let _sel = [];                 // [{ famille, obj }]
  let _ouvertRef = null;         // ouverture imposée par la graine
  let _dernier = null;           // dernier objet ajouté → cible du « ➕ tous les … »
  let _handler = null;
  let _groupe = null;
  let _floater = null;
  let _onValide = null;

  function _dansSel(obj) {
    for (let i = 0; i < _sel.length; i++) if (_sel[i].obj === obj) return i;
    return -1;
  }

  // ───────── surbrillance ─────────
  function _repeindre() {
    if (!_groupe) return;
    _groupe.clearLayers();
    if (typeof window.convertCoord !== "function" || !window.L) return;
    _sel.forEach(function (s) {
      const pts = s.obj.points.map(function (p) { return window.convertCoord(p.x, p.y); });
      const style = Object.assign({}, SURBRILLANCE, { fill: false, interactive: false });
      const ouvert = _ouvertureDe(s.famille, s.obj.type);
      const l = ouvert ? window.L.polyline(pts, style) : window.L.polygon(pts, style);
      _groupe.addLayer(l);
    });
  }

  function _libelleType(famille, type) {
    const cat = { roads: "traces", zones: "zones", structures: "structures" }[famille] || famille;
    if (window.LegendCustomization && window.LegendCustomization.getLabel) {
      try { return window.LegendCustomization.getLabel(cat, type) || type; } catch (e) {}
    }
    return type;
  }

  function _majFloater(message) {
    if (!_floater) return;
    const msg = _floater.querySelector(".kta-selm-msg");
    if (msg) msg.textContent = message || _t("selm.compte", { n: _sel.length });
    const ok = _floater.querySelector("#kta-selm-ok");
    if (ok) {
      ok.textContent = _t("selm.valider", { n: _sel.length });
      ok.disabled = _sel.length === 0;
    }
    const tous = _floater.querySelector("#kta-selm-tous");
    if (tous) {
      if (_dernier) {
        tous.style.display = "";
        tous.textContent = _t("selm.tousDuType", { type: _libelleType(_dernier.famille, _dernier.obj.type) });
      } else {
        tous.style.display = "none";
      }
    }
  }

  // ➕ Étend la sélection à tous les objets du MÊME TYPE que le dernier ajouté,
  // bornée au niveau affiché. C'est ce qui rend le mode utilisable sur un
  // relevé importé : cliquer 200 objets un par un coûterait autant qu'avant.
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

  // ───────── ouverture / fermeture ─────────
  function fermer() {
    if (!_actif) return;
    _actif = false;
    if (window.map && _handler) { try { window.map.off("click", _handler); } catch (e) {} }
    _handler = null;
    if (_groupe) {
      try { _groupe.clearLayers(); if (window.map) window.map.removeLayer(_groupe); } catch (e) {}
      _groupe = null;
    }
    if (_floater && _floater.parentNode) _floater.remove();
    _floater = null;
    _sel = [];
    _dernier = null;
    _ouvertRef = null;
    _onValide = null;
  }

  // `graine` = { famille, obj } : l'objet depuis lequel on est parti. Il donne
  // l'ouverture de référence ET compte comme premier sélectionné — repartir
  // d'une sélection vide obligerait à re-cliquer l'objet qu'on vient d'ouvrir.
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
      const cx = e.latlng.lng;
      const cy = (window.APP_CONFIG && window.APP_CONFIG.imageHeight)
                   ? (window.APP_CONFIG.imageHeight - e.latlng.lat)
                   : e.latlng.lat;
      const r = _choisir(_candidats(), cx, cy, _ouvertRef);
      if (r.refus) {
        // 🩸 On DIT pourquoi. Un clic sans effet et sans mot se lit comme un bug.
        _majFloater(_t(_ouvertRef ? "selm.refusFerme" : "selm.refusOuvert"));
        return;
      }
      if (!r.cible) { _majFloater(_t("selm.rien")); return; }
      const i = _dansSel(r.cible.obj);
      if (i >= 0) {
        // Re-cliquer un objet le retire : c'est la seule façon de corriger une
        // erreur de visée sans tout recommencer.
        _sel.splice(i, 1);
        if (_dernier && _dernier.obj === r.cible.obj) _dernier = _sel[_sel.length - 1] || null;
        _repeindre();
        _majFloater(_t("selm.retire"));
        return;
      }
      _sel.push({ famille: r.cible.famille, obj: r.cible.obj });
      _dernier = _sel[_sel.length - 1];
      _repeindre();
      _majFloater();
    };
    window.map.on("click", _handler);

    _floater = document.createElement("div");
    _floater.id = "kta-selm-floater";
    // `.kta-iti-floater` n'est pas cosmétique : `_modeClicCarteActif()`
    // (utils.js) la reconnaît, donc aucune popup d'annotation ne s'ouvre
    // pendant le mode et le clic est ré-émis en phase capture — il porte même
    // si on vise pile un layer interactif.
    _floater.className = "kta-iti-floater kta-selm-floater";
    _floater.innerHTML =
      '<span class="kta-iti-floater-icon">🎯</span>' +
      '<span class="kta-iti-floater-msg kta-selm-msg"></span>' +
      '<button class="kta-btn kta-btn-ghost" id="kta-selm-tous" type="button"></button>' +
      '<button class="kta-btn kta-btn-primary" id="kta-selm-ok" type="button"></button>' +
      '<button class="kta-btn kta-btn-ghost" id="kta-selm-annuler" type="button"></button>';
    document.body.appendChild(_floater);
    _floater.querySelector("#kta-selm-annuler").textContent = _t("selm.annuler");
    _floater.querySelector("#kta-selm-tous").addEventListener("click", _ajouterTousDuType);
    _floater.querySelector("#kta-selm-annuler").addEventListener("click", fermer);
    _floater.querySelector("#kta-selm-ok").addEventListener("click", function () {
      const lot = _sel.slice();
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
    // Exposés pour le harnais : le cœur de la visée et du refus s'éprouve
    // sans Leaflet.
    _choisir: _choisir,
    _TOLERANCE_PX: TOLERANCE_PX
  };
})();
