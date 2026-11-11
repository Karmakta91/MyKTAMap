/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// verifierPlan.js — « Vérifier le plan » (Éditeur de données) : contrôles des données du plan ouvert (session et
// calques), liste groupée par gravité, revue sur la carte (bandeau Précédent / Suivant), fiche de l'objet, « Vu,
// normal ». Contrôles : C1 tracé coupé par un obstacle dur (zone d'un type dur, mur en ligne), C2 passage entre
// niveaux (POI) sans raccord validé à un de ses niveaux (niveau intermédiaire traversé : info), C3 tracé jonction mal
// posé. Avertit aussi à la saisie (C1).
// ⚠️ contrat : C1 et C3 lisent les tests du graphe (Pathfinder.controle, PROXIMITY_TOLERANCE), jamais une copie :
// sinon l'outil annonce un problème que l'itinéraire n'a pas, ou en tait un. C2 lit KtaPoiJonction.
// Moteur PUR : analyser(donnees?) → { liste, vus } ; sans argument, il lit le plan ouvert (collecter()). Éprouvé en
// Node par scripts/check-verifier-plan.js, en navigateur par scripts/smoke/checkup-verifier-plan.js.
// « Vu, normal » : clé « contrôle|identité[|identité|détail] » (identité = uid, sinon empreinte de la géométrie)
// retenue par plan sur l'appareil (config.js > get/setPlanVerifVus) ; modifier l'objet ne le fait pas revenir.
// 🩸 Un objet de calque sans uid (plan ancien) a pour identité sa géométrie : le redessiner fait revenir le constat.
// Lecture seule : aucun contrôle n'écrit dans les données.
// Expose : window.KtaVerifierPlan = { analyser, collecter, ouvrir, fermer, marquerVu, retablir, retablirTout,
//   seuilBordPx, liste, etat, montrer }.
// Doc : docs/architecture/multilevel-pathfinding.md § Vérifier le plan, ui.md §91.6 · Étude : ETUDE_VERIFIER_PLAN.md

window.KtaVerifierPlan = (function () {
  "use strict";

  const BORD_M = 0.5;                  // en deçà, l'obstacle n'est touché que « au bord » (souvent un dessin raté)
  const GRAVITES = ["bloquant", "revoir", "info"];
  const CONTROLES = { C1: "bloquant", C2: "bloquant", C3: "bloquant" };
  // C2 sur un niveau INTERMÉDIAIRE sans raccord : le pathfinder traverse ce niveau sans y déboucher (puits de 0 à 2
  // sans sortie au 1), l'itinéraire n'est pas trompé (décision produit).
  const GRAVITE_C2_TRAVERSE = "info";
  const ORDRE_CONTROLES = ["C1", "C2", "C3"];
  const SAISIE_MS = 700;               // rafale de rendus (dessin, annulation) : une vérification à la fin

  let _liste = [];
  let _vus = [];
  let _index = 0;
  let _bandeau = null;
  let _calque = null;
  let _renderer = null;
  let _recalcTimer = 0;
  let _voirVus = false;

  function _t(k, p) { return window.I18n && typeof window.I18n.t === "function" ? window.I18n.t(k, p) : k; }
  function _esc(s) { return window.ktaEsc(String(s)); }
  function _toast(msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, type);
  }
  function _multi() { return !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true); }
  function _niv(o) { return Number.isInteger(o && o.level) ? o.level : 0; }
  function _echelle() {
    const s = Number(window.APP_CONFIG && window.APP_CONFIG.scale);
    return s > 0 ? s : 0;
  }
  function _ctl() { return window.Pathfinder && window.Pathfinder.controle; }

  // Seuil « au bord » en px : 0,5 m à l'échelle du plan, sinon à l'échelle supposée du pathfinder (10 px/m).
  function seuilBordPx(echelle) {
    const e = echelle > 0 ? echelle : _echelle();
    const C = _ctl();
    return BORD_M * (e > 0 ? e : (C ? C.ECHELLE_SANS_CALAGE : 10));
  }

  // ── Identité d'un objet ──────────
  // uid, sinon empreinte de la géométrie (type + sommets au dixième de px) : stable d'une ouverture à l'autre.
  function _identite(o) {
    if (o && typeof o.uid === "string" && o.uid) return o.uid;
    let h = 2166136261;
    const txt = String(o && (o.type || (Array.isArray(o.tags) && o.tags[0]) || "")) + ":" +
      (Array.isArray(o && o.points) ? o.points : [o || {}]).map(function (p) {
        return Math.round((p && p.x) * 10) + "," + Math.round((p && p.y) * 10);
      }).join(";");
    for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return "g" + h.toString(36);
  }

  // ── Données ──────────
  function _registre(l) {
    if (typeof window.ktaHorsCalquesEnModification === "function") return window.ktaHorsCalquesEnModification(l);
    return Array.isArray(l) ? l : [];
  }
  function _appel(nom) {
    try { return (typeof window[nom] === "function" ? window[nom]() : null) || []; } catch (e) { return []; }
  }

  // Plan ouvert : ce que lisent l'itinéraire et la carte (session + calques, sans les calques en modification, dont
  // la copie de session est déjà dans getRoads / getZones / getStructures).
  function collecter() {
    const PF = window.Pathfinder;
    return {
      roads: PF && typeof PF.collecterTraces === "function" ? PF.collecterTraces() : _appel("getRoads"),
      zones: _appel("getZones").concat(_registre(window._ktaDataPolygons)),
      structures: _appel("getStructures").concat(_registre(window._ktaDataStructurePolygons)),
      points: _appel("getEditorPoints").concat(_appel("getAllEmbeddedPoints")),
      multiLevel: _multi(),
      echelle: _echelle(),
      planOuvert: true
    };
  }

  function _galerie(r) {
    return !!(r && r.type !== "jonction" && r.type !== "itinerary" && !r._preview &&
      Array.isArray(r.points) && r.points.length >= 2);
  }
  function _etendre(b, p) {
    if (p.x < b.x0) b.x0 = p.x;
    if (p.x > b.x1) b.x1 = p.x;
    if (p.y < b.y0) b.y0 = p.y;
    if (p.y > b.y1) b.y1 = p.y;
  }
  function _boite(p, r) { return { x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r }; }

  // ── C1 : tracé coupé par un obstacle dur ──────────
  // Un constat par paire (tracé, obstacle), segments coupés cumulés. Zone : longueur du tracé dans la zone ; « au
  // bord » sous BORD_M. Mur : « au bord » si le croisement est à moins de BORD_M d'un bout du tracé (tracé qui
  // dépasse à peine le mur, ou finit dessus : le dernier segment sort du graphe).
  // `seulement` (Set d'objets, facultatif) : seules les paires dont un des deux objets en fait partie (saisie).
  function _c1(d, seulement) {
    const C = _ctl();
    if (!C) return [];
    // Plan ouvert : la collecte même de l'itinéraire ; données fournies : le même filtre sur elles.
    const obstacles = d.planOuvert ? C.obstaclesDuPlan() : C.obstaclesDe(d.zones, d.structures);
    if (!obstacles.length) return [];
    const prep = C.preparer(obstacles);
    const grille = C.grilleZones(prep.polys);
    const bord = seuilBordPx(d.echelle);
    const paires = new Map();
    let obstacleSaisi = false;
    if (seulement) obstacles.forEach(function (o) { if (seulement.has(o.objet)) obstacleSaisi = true; });

    function _paire(road, obst, famille, type, niveau) {
      const cle = "C1|" + _identite(road) + "|" + _identite(obst);
      let e = paires.get(cle);
      if (!e) {
        e = { controle: "C1", gravite: CONTROLES.C1, cle: cle, motif: type, niveau: niveau,
          objet: road, famille: "roads", autre: obst, autreFamille: famille,
          longueurPx: 0, bordPx: Infinity, segments: 0, ancre: null,
          boite: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity } };
        paires.set(cle, e);
      }
      return e;
    }

    (d.roads || []).forEach(function (road) {
      if (!_galerie(road)) return;
      if (seulement && !obstacleSaisi && !seulement.has(road)) return;
      const lvl = _niv(road), pts = road.points, n = pts.length;
      for (let i = 1; i < n; i++) {
        const p1 = pts[i - 1], p2 = pts[i];
        C.zonesQuiBloquent(p1, p2, lvl, C.zonesCandidates(grille, p1, p2)).forEach(function (z) {
          if (seulement && !seulement.has(road) && !seulement.has(z.objet)) return;
          const e = _paire(road, z.objet, "zones", "zone", lvl);
          e.longueurPx += C.longueurDansPolygone(p1, p2, z.points);
          e.segments++;
          _etendre(e.boite, p1); _etendre(e.boite, p2);
          if (!e.ancre) e.ancre = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        });
        C.mursQuiCoupent(p1, p2, lvl, prep.grille).forEach(function (m) {
          if (seulement && !seulement.has(road) && !seulement.has(m.mur)) return;
          const e = _paire(road, m.mur, "structures", "mur", lvl);
          const ip = m.croise;
          const aBout = Math.min(Math.hypot(ip.x - pts[0].x, ip.y - pts[0].y),
            Math.hypot(ip.x - pts[n - 1].x, ip.y - pts[n - 1].y));
          if (aBout < e.bordPx) e.bordPx = aBout;
          e.segments++;
          _etendre(e.boite, p1); _etendre(e.boite, p2);
          if (!e.ancre) e.ancre = { x: ip.x, y: ip.y };
        });
      }
    });
    const out = [];
    paires.forEach(function (e) {
      e.auBord = e.motif === "zone" ? e.longueurPx < bord : e.bordPx < bord;
      out.push(e);
    });
    return out;
  }

  // Segments des galeries d'un niveau (tous niveaux confondus hors multi-niveau) → [{a, b}].
  function _segmentsNiveau(d, lvl, cache) {
    const k = d.multiLevel ? String(lvl) : "*";
    if (cache[k]) return cache[k];
    const out = [];
    (d.roads || []).forEach(function (r) {
      if (!_galerie(r) || (d.multiLevel && _niv(r) !== lvl)) return;
      for (let i = 1; i < r.points.length; i++) out.push({ a: r.points[i - 1], b: r.points[i] });
    });
    cache[k] = out;
    return out;
  }
  function _distReseau(C, p, segs) {
    let min = Infinity;
    for (let i = 0; i < segs.length; i++) {
      const dd = C.projeter(p, segs[i].a, segs[i].b).dist;
      if (dd < min) min = dd;
    }
    return min;
  }

  // ── C2 : passage entre niveaux (POI) sans raccord validé à un de ses niveaux ──────────
  // L'itinéraire n'emprunte que les raccords validés (pathfinder.js > _injecterJonctionsPoi) ; un raccord qui ne
  // retombe plus sur une galerie de son niveau à PROXIMITY_TOLERANCE près est ignoré (« perdu »). Un tag sans moyen de
  // passage (puits d'aération) n'est jamais emprunté : rien à signaler.
  function _c2(d) {
    const C = _ctl(), PJ = window.KtaPoiJonction;
    if (!C || !PJ || !d.multiLevel) return [];
    const cache = {}, out = [];
    (d.points || []).forEach(function (p) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number" || !PJ.estJonction(p)) return;
      if (!PJ.moyen((Array.isArray(p.tags) && p.tags[0]) || "")) return;
      const niveaux = PJ.niveaux(p), acc = PJ.accroches(p);
      const bas = niveaux[0], haut = niveaux[niveaux.length - 1];
      niveaux.forEach(function (n) {
        const an = acc.filter(function (a) { return a.level === n; });
        let motif = null;
        if (!an.length) motif = "aucun";
        else {
          const segs = _segmentsNiveau(d, n, cache);
          if (an.every(function (a) { return _distReseau(C, a, segs) > C.PROXIMITY_TOLERANCE; })) motif = "perdu";
        }
        if (!motif) return;
        let proposes = 0;
        try {
          const pr = PJ.proposerRaccords(p.x, p.y, [n]);
          proposes = (pr && pr.parNiveau && pr.parNiveau[String(n)] || []).length;
        } catch (e) { proposes = 0; }
        const traverse = motif === "aucun" && n > bas && n < haut;
        out.push({ controle: "C2", gravite: traverse ? GRAVITE_C2_TRAVERSE : CONTROLES.C2, cle: "C2|" + _identite(p) + "|" + n, motif: motif,
          niveau: n, objet: p, famille: "editorPoints", intermediaire: n > bas && n < haut, proposes: proposes,
          ancre: { x: p.x, y: p.y }, boite: _boite(p, 30) });
      });
    });
    return out;
  }

  // ── C3 : tracé jonction mal posé ──────────
  // Même niveau aux deux bouts, ou un bout à plus de PROXIMITY_TOLERANCE de toute galerie de son niveau : le graphe ne
  // le raccroche à rien (pathfinder.js > _boutsLibres, tolérance des bouts libres).
  function _c3(d) {
    const C = _ctl();
    if (!C || !d.multiLevel) return [];
    const cache = {}, out = [];
    (d.roads || []).forEach(function (r) {
      if (!r || r.type !== "jonction" || !Array.isArray(r.points) || r.points.length < 2) return;
      const de = Number.isInteger(r.fromLevel) ? r.fromLevel : 0;
      const vers = Number.isInteger(r.toLevel) ? r.toLevel : 0;
      const pts = r.points, a = pts[0], b = pts[pts.length - 1];
      const base = { controle: "C3", gravite: CONTROLES.C3, objet: r, famille: "roads", de: de, vers: vers };
      if (de === vers) {
        const bx = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        pts.forEach(function (p) { _etendre(bx, p); });
        out.push(Object.assign({ cle: "C3|" + _identite(r) + "|meme", motif: "meme", niveau: de, ancre: a,
          boite: bx }, base));
        return;
      }
      [[a, de, 0], [b, vers, 1]].forEach(function (x) {
        const dist = _distReseau(C, x[0], _segmentsNiveau(d, x[1], cache));
        if (dist <= C.PROXIMITY_TOLERANCE) return;
        out.push(Object.assign({ cle: "C3|" + _identite(r) + "|bout" + x[2], motif: "bout", bout: x[2],
          niveau: x[1], distPx: dist, ancre: { x: x[0].x, y: x[0].y }, boite: _boite(x[0], 40) }, base));
      });
    });
    return out;
  }

  // ── Analyse ──────────
  function _vusDuPlan() {
    return typeof window.getPlanVerifVus === "function" ? window.getPlanVerifVus() : [];
  }
  function _trier(l) {
    return l.sort(function (u, v) {
      return (GRAVITES.indexOf(u.gravite) - GRAVITES.indexOf(v.gravite)) ||
        (ORDRE_CONTROLES.indexOf(u.controle) - ORDRE_CONTROLES.indexOf(v.controle)) ||
        (u.niveau - v.niveau) || (u.cle < v.cle ? -1 : u.cle > v.cle ? 1 : 0);
    });
  }

  // → { liste: constats à revoir, vus: constats déclarés « vu, normal » } ; triés par gravité, contrôle, niveau.
  // `opts.vus` : clés vues (sinon celles du plan ouvert).
  function analyser(donnees, opts) {
    const d = donnees || collecter();
    const vus = new Set((opts && Array.isArray(opts.vus)) ? opts.vus : _vusDuPlan());
    const tous = _c1(d).concat(_c2(d), _c3(d));
    return {
      liste: _trier(tous.filter(function (c) { return !vus.has(c.cle); })),
      vus: _trier(tous.filter(function (c) { return vus.has(c.cle); }))
    };
  }

  function _recalculer() {
    const r = analyser();
    _liste = r.liste;
    _vus = r.vus;
    if (_index >= _liste.length) _index = Math.max(0, _liste.length - 1);
    return r;
  }

  // ── « Vu, normal » ──────────
  function marquerVu(c) {
    if (!c || !c.cle || typeof window.setPlanVerifVus !== "function") return false;
    const l = _vusDuPlan();
    if (l.indexOf(c.cle) < 0) l.push(c.cle);
    window.setPlanVerifVus(null, l);
    return true;
  }
  function retablir(cle) {
    if (typeof window.setPlanVerifVus !== "function") return false;
    window.setPlanVerifVus(null, _vusDuPlan().filter(function (k) { return k !== cle; }));
    return true;
  }
  function retablirTout() {
    const n = _vusDuPlan().length;
    if (typeof window.setPlanVerifVus === "function") window.setPlanVerifVus(null, []);
    return n;
  }

  // ── Textes ──────────
  function _distTexte(px) {
    const e = _echelle();
    if (e > 0 && typeof window.formatDistance === "function") return window.formatDistance(px / e, 1);
    return _t("verif.px", { n: Math.round(px) });
  }
  function _fmtNiv(n) { return typeof window.ktaFormatNiveau === "function" ? window.ktaFormatNiveau(n) : String(n); }
  function _libType(famille, o) {
    const cat = { editorPoints: "icones", roads: "traces", zones: "zones", structures: "structures" }[famille];
    const cle = famille === "editorPoints" ? (Array.isArray(o.tags) && o.tags[0]) : o.type;
    let lib = "";
    try {
      const LC = window.LegendCustomization;
      if (cle && LC && typeof LC.findCustomEntry === "function") {
        const e = LC.findCustomEntry(cle);
        if (e && e.label) lib = e.label;
      }
      if (!lib && cle && LC && typeof LC.getLabel === "function") lib = LC.getLabel(cat, cle) || "";
    } catch (e) { lib = ""; }
    return lib || String(cle || "?");
  }
  function _nomObjet(famille, o) {
    const nom = o && (o.nom || o.name || o.label);
    const type = _libType(famille, o);
    return nom ? type + " « " + String(nom).slice(0, 60) + " »" : type;
  }
  function _titreControle(id) { return _t("verif.controle." + id); }

  // Ligne d'un constat : objet, puis ce qui ne va pas.
  function _libelle(c) {
    const objet = _nomObjet(c.famille, c.objet);
    let detail = "";
    if (c.controle === "C1") {
      const obst = _nomObjet(c.autreFamille, c.autre);
      detail = c.motif === "zone"
        ? _t("verif.c1.zone", { obstacle: obst, d: _distTexte(c.longueurPx) })
        : _t("verif.c1.mur", { obstacle: obst });
      if (c.auBord) detail += " · " + _t("verif.c1.auBord");
    } else if (c.controle === "C2") {
      detail = _t(c.motif === "perdu" ? "verif.c2.perdu" : (c.intermediaire ? "verif.c2.traverse" : "verif.c2.aucun"),
        { n: _fmtNiv(c.niveau) });
      if (c.proposes > 0) detail += " · " + _t("verif.c2.proposes", { n: c.proposes });
    } else if (c.controle === "C3") {
      detail = c.motif === "meme"
        ? _t("verif.c3.meme", { n: _fmtNiv(c.niveau) })
        : _t("verif.c3.bout", { n: _fmtNiv(c.niveau), d: _distTexte(c.distPx) });
    }
    const niveau = _multi() && c.controle === "C1" ? " · " + _t("verif.niveau", { n: _fmtNiv(c.niveau) }) : "";
    return { objet: objet + niveau, detail: detail };
  }

  // ── Carte ──────────
  function _map() { return window.map && typeof window.map.fitBounds === "function" ? window.map : null; }

  function _effacerMarque() {
    if (_calque) { try { _calque.remove(); } catch (err) { /* carte détruite */ } }
    _calque = null;
  }

  function _latlngs(pts) {
    return (pts || []).map(function (p) { return window.convertCoord(p.x, p.y); });
  }

  // Niveau du constat affiché, objet surligné, obstacle cerné, vue cadrée sur l'endroit.
  function montrer(c) {
    const m = _map();
    if (!m || !c) return;
    if (_multi() && window.APP_CONFIG.activeLevel !== c.niveau && typeof window.ktaSetActiveLevel === "function") {
      try { window.ktaSetActiveLevel(c.niveau, { source: "verifierPlan" }); } catch (err) { /* niveau absent */ }
    }
    _effacerMarque();
    if (!_renderer || _renderer._map && _renderer._map !== m) _renderer = L.svg({ padding: 0.5 });
    const couches = [];
    const base = { renderer: _renderer, interactive: false };
    if (c.autre && Array.isArray(c.autre.points)) {
      const ll = _latlngs(c.autre.points);
      couches.push(c.autreFamille === "zones"
        ? L.polygon(ll, Object.assign({ weight: 3, dashArray: "6 4", className: "kta-verif-obstacle" }, base))
        : L.polyline(ll, Object.assign({ weight: 4, dashArray: "6 4", className: "kta-verif-obstacle" }, base)));
    }
    if (Array.isArray(c.objet.points)) {
      couches.push(L.polyline(_latlngs(c.objet.points),
        Object.assign({ weight: 6, opacity: 0.55, className: "kta-verif-objet" }, base)));
    }
    if (c.ancre) {
      couches.push(L.circleMarker(window.convertCoord(c.ancre.x, c.ancre.y),
        Object.assign({ radius: 14, weight: 3, className: "kta-verif-cercle" }, base)));
    }
    _calque = L.layerGroup(couches).addTo(m);
    const marge = Math.max(seuilBordPx() * 20, 40);
    const b = c.boite;
    try {
      m.fitBounds(L.latLngBounds([window.convertCoord(b.x0 - marge, b.y0 - marge),
        window.convertCoord(b.x1 + marge, b.y1 + marge)]), { animate: false });
    } catch (err) { console.warn("[VerifierPlan] cadrage :", err); }
  }

  // Fiche d'un objet : celle que la carte lui a attachée (utils.js > ktaFicheObjetDe) pour un tracé, une zone, une
  // structure ; le marqueur à sa position pour un point. Ouverte après le rendu du déplacement (couches hors vue
  // rattachées au mouvement). false : objet masqué (filtres, niveau), aucune fiche sur la carte.
  function _ouvrirFiche(o, famille, ancre) {
    const m = _map();
    if (!m || !o) return false;
    let couche = null, ll = null;
    if (famille === "editorPoints") {
      ll = L.latLng(window.convertCoord(o.x, o.y));   // convertCoord rend [lat, lng], pas un LatLng
      m.eachLayer(function (l) {
        if (couche || !l || typeof l.getLatLng !== "function") return;
        if (typeof l.getPopup !== "function" || !l.getPopup()) return;
        const q = l.getLatLng();
        if (q && Math.abs(q.lat - ll.lat) < 0.5 && Math.abs(q.lng - ll.lng) < 0.5) couche = l;
      });
    } else {
      const f = typeof window.ktaFicheObjetDe === "function" ? window.ktaFicheObjetDe(o) : null;
      couche = f && f.layer && f.layer._map ? f.layer : null;
      const a = ancre || (Array.isArray(o.points) && o.points[0]);
      if (a) ll = window.convertCoord(a.x, a.y);
    }
    if (!couche || typeof couche.openPopup !== "function") return false;
    try { if (ll && famille !== "editorPoints") couche.openPopup(ll); else couche.openPopup(); }
    catch (err) { console.warn("[VerifierPlan] fiche :", err); return false; }
    return true;
  }
  function _ficheDiffere(o, famille, ancre) {
    setTimeout(function () {
      if (!_ouvrirFiche(o, famille, ancre)) _toast(_t("verif.toast.ficheMasquee"), "warn");
    }, 150);
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
    if (document.querySelector(".kta-readme-modal-overlay, [aria-modal='true']")) return;
    ev.stopPropagation();
    _fermerBandeau();
    ouvrir();
  }

  function _onDonnees() {
    clearTimeout(_recalcTimer);
    _recalcTimer = setTimeout(function () { if (_bandeau) _rafraichir(); }, 300);
  }

  function _rafraichir() {
    _recalculer();
    if (!_bandeau) return;
    if (!_liste.length) {
      _toast(_t("verif.toast.fini"), "success");
      _fermerBandeau();
      ouvrir();
      return;
    }
    _majBandeau(false);
  }

  function _majBandeau(fiche) {
    const c = _liste[_index];
    if (!_bandeau || !c) return;
    const lib = _libelle(c);
    _bandeau.querySelector(".kta-verif-pos").textContent = _t("verif.position", { i: _index + 1, n: _liste.length });
    _bandeau.querySelector(".kta-verif-info").textContent = lib.objet + " — " + lib.detail;
    _bandeau.querySelector('[data-verif="prec"]').disabled = _liste.length < 2;
    _bandeau.querySelector('[data-verif="suiv"]').disabled = _liste.length < 2;
    // style et non `hidden` : l'affichage de .kta-btn l'emporterait sur l'attribut.
    _bandeau.querySelector('[data-verif="fiche-autre"]').style.display = c.autre ? "" : "none";
    montrer(c);
    if (fiche) _ficheDiffere(c.objet, c.famille, c.ancre);
  }

  function _ouvrirBandeau(i) {
    _fermerListe();
    _fermerBandeau();
    _index = i;
    const b = document.createElement("div");
    b.id = "kta-verif-bandeau";
    b.className = "kta-racc-bandeau kta-verif-bandeau";
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", _t("verif.titre"));
    const btn = function (act, cle, cls) {
      return '<button type="button" class="kta-btn ' + (cls || "kta-btn-ghost") + '" data-verif="' + act + '">' +
        _esc(_t(cle)) + '</button>';
    };
    b.innerHTML =
      '<div class="kta-racc-nav">' + btn("prec", "verif.prec") + '<span class="kta-verif-pos"></span>' +
        btn("suiv", "verif.suiv") + '</div>' +
      '<span class="kta-verif-info"></span>' +
      '<div class="kta-racc-actions">' + btn("fiche", "verif.fiche", "kta-btn-primary") +
        btn("fiche-autre", "verif.ficheObstacle") + btn("vu", "verif.vu") + btn("fermer", "verif.fermer") + '</div>';
    document.body.appendChild(b);
    _bandeau = b;
    b.addEventListener("click", function (ev) {
      const el = ev.target.closest && ev.target.closest("[data-verif]");
      if (!el) return;
      const act = el.getAttribute("data-verif"), n = _liste.length, c = _liste[_index];
      if (act === "fermer") { _fermerBandeau(); ouvrir(); return; }
      if (act === "prec" && n) { _index = (_index - 1 + n) % n; _majBandeau(true); return; }
      if (act === "suiv" && n) { _index = (_index + 1) % n; _majBandeau(true); return; }
      if (!c) return;
      if (act === "fiche") { _ficheDiffere(c.objet, c.famille, c.ancre); return; }
      if (act === "fiche-autre" && c.autre) { _ficheDiffere(c.autre, c.autreFamille, c.ancre); return; }
      if (act === "vu") {
        marquerVu(c);
        _toast(_t("verif.toast.vu"), "success");
        _rafraichir();
      }
    });
    document.addEventListener("keydown", _onKey, true);
    window.addEventListener("kta:donneesPlanChange", _onDonnees);
    _majBandeau(true);
  }

  // ── Fenêtre de la liste ──────────
  function _fermerListe() {
    const m = document.getElementById("kta-verif-modal");
    if (m) { if (m.__ktaOnKey) document.removeEventListener("keydown", m.__ktaOnKey); m.remove(); }
  }

  function fermer() { _fermerListe(); _fermerBandeau(); }

  function _ligneHtml(c, attr) {
    const lib = _libelle(c);
    return '<button type="button" class="kta-verif-ligne" ' + attr + '>' +
      '<span class="kta-verif-ligne-objet">' + _esc(lib.objet) + '</span>' +
      '<span class="kta-verif-ligne-detail">' + _esc(lib.detail) + '</span></button>';
  }

  function _corpsHtml() {
    let h = '<p class="kta-racc-note">' + _esc(_t("verif.note")) + '</p>';
    h += '<p class="kta-verif-compte">' + _esc(_t("verif.compte", { n: _liste.length, v: _vus.length })) + '</p>';
    if (!_liste.length) h += '<p class="kta-racc-vide">' + _esc(_t("verif.vide")) + '</p>';
    GRAVITES.forEach(function (g) {
      const lg = _liste.filter(function (c) { return c.gravite === g; });
      if (!lg.length) return;
      h += '<h3 class="kta-verif-gravite kta-verif-g-' + g + '">' + window.ktaIcone("triangle-alert") + ' ' +
        _esc(_t("verif.gravite." + g, { n: lg.length })) + '</h3>';
      ORDRE_CONTROLES.forEach(function (id) {
        const lc = lg.filter(function (c) { return c.controle === id; });
        if (!lc.length) return;
        h += '<div class="kta-verif-controle">' + _esc(_titreControle(id)) + ' (' + lc.length + ')</div>' +
          '<ul class="kta-racc-liste">' + lc.map(function (c) {
            return '<li>' + _ligneHtml(c, 'data-verif-i="' + _liste.indexOf(c) + '"') + '</li>';
          }).join("") + '</ul>';
      });
    });
    if (_vus.length) {
      h += '<div class="kta-racc-pied"><button type="button" class="kta-btn kta-btn-ghost kta-btn-small" ' +
        'data-verif="voir-vus" aria-expanded="' + (_voirVus ? "true" : "false") + '">' +
        _esc(_t("verif.vus", { n: _vus.length })) + '</button></div>';
      if (_voirVus) {
        h += '<ul class="kta-racc-liste kta-verif-vus">' + _vus.map(function (c, i) {
          const lib = _libelle(c);
          return '<li class="kta-verif-vu"><span class="kta-verif-vu-txt">' + _esc(lib.objet + " — " + lib.detail) +
            '</span><button type="button" class="kta-btn kta-btn-ghost kta-btn-small" data-verif-retablir="' + i +
            '">' + _esc(_t("verif.retablir")) + '</button></li>';
        }).join("") + '</ul><button type="button" class="kta-btn kta-btn-ghost kta-btn-small" ' +
          'data-verif="retablir-tout">' + _esc(_t("verif.retablirTout")) + '</button>';
      }
    }
    return h;
  }

  function ouvrir() {
    _fermerListe();
    if (!_map() || !(typeof window.ktaPlanAffiche !== "function" || window.ktaPlanAffiche())) {
      window.ktaAlerte(_t("verif.err.aucunPlan"), { type: "info" });
      return;
    }
    _recalculer();
    const ov = document.createElement("div");
    ov.id = "kta-verif-modal";
    ov.className = "kta-readme-modal-overlay";
    ov.innerHTML =
      '<div class="kta-readme-modal-boite kta-racc-boite kta-verif-boite" role="dialog" aria-modal="true">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + window.ktaIcone("clipboard-list") + ' ' + _esc(_t("verif.titre")) +
          '</span><button type="button" class="kta-panneau-close" data-verif="fermer-liste" aria-label="' +
            _esc(_t("verif.fermer")) + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-racc-corps kta-verif-corps">' + _corpsHtml() + '</div>' +
      '</div>';
    document.documentElement.appendChild(ov);
    const onKey = function (ev) { if (ev.key === "Escape") _fermerListe(); };
    ov.__ktaOnKey = onKey;
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", function (ev) {
      if (ev.target === ov) { _fermerListe(); return; }
      const ligne = ev.target.closest && ev.target.closest("[data-verif-i]");
      if (ligne) { _ouvrirBandeau(Number.parseInt(ligne.getAttribute("data-verif-i"), 10) || 0); return; }
      const ret = ev.target.closest && ev.target.closest("[data-verif-retablir]");
      if (ret) {
        const c = _vus[Number.parseInt(ret.getAttribute("data-verif-retablir"), 10)];
        if (c) { retablir(c.cle); _toast(_t("verif.toast.retabli"), "success"); }
        ouvrir();
        return;
      }
      const el = ev.target.closest && ev.target.closest("[data-verif]");
      if (!el) return;
      const act = el.getAttribute("data-verif");
      if (act === "fermer-liste") _fermerListe();
      if (act === "voir-vus") { _voirVus = !_voirVus; ouvrir(); }
      if (act === "retablir-tout") {
        const n = retablirTout();
        _toast(_t("verif.toast.retablis", { n: n }), "success");
        ouvrir();
      }
    });
  }

  // ── Avertissement à la saisie (C1) ──────────
  // Après une écriture de session (rendu des tracés, zones, structures), seuls les objets SAISIS sont vérifiés : un
  // tracé qui traverse un obstacle dur, un obstacle posé sur un tracé. Saisi = signature changée depuis la dernière
  // lecture ET `updatedAt` récent (KtaUid.touch à chaque sommet, conversion, changement de type). 🩸 Sans la
  // condition de date, la session restaurée à l'ouverture du plan ou rejouée par Ctrl+Z passerait pour saisie : un
  // toast pour des constats anciens, que seule une passe au chargement doit annoncer. Un toast par constat, une fois
  // par plan ouvert ; un constat « vu, normal » se tait. Clé de la signature : uid (Ctrl+Z recrée les objets).
  const SAISIE_RECENTE_MS = 60000;
  let _sigPlan = null;
  let _sig = new Map();
  let _avertis = new Set();
  let _saisieTimer = 0;

  function _signature(o) {
    const p = o.points || [], a = p[0] || {}, z = p[p.length - 1] || {};
    return [o.updatedAt || "", o.type, _niv(o), (Array.isArray(o.niveaux) ? o.niveaux.join(",") : ""), p.length,
      a.x, a.y, z.x, z.y].join("|");
  }
  function _sessionObjets() {
    const out = [];
    [_appel("getRoads"), _appel("getZones"), _appel("getStructures")].forEach(function (l) {
      l.forEach(function (o) { if (o && Array.isArray(o.points) && !o._preview) out.push(o); });
    });
    return out;
  }
  function _pertinent(o) {
    const PF = window.Pathfinder;
    if (_galerie(o)) return true;
    if (o.type === "mur-ligne") return true;
    return !!(PF && typeof PF.estZoneDure === "function" && PF.estZoneDure(o.type));
  }

  function _verifierSaisie() {
    if (!_map() || (typeof window.ktaPlanAffiche === "function" && !window.ktaPlanAffiche())) return;
    const plan = window._currentLoadedPlanId || null;
    const objets = _sessionObjets(), cur = new Map();
    objets.forEach(function (o) { cur.set(o.uid || o, _signature(o)); });
    if (_sigPlan !== plan) { _sigPlan = plan; _sig = new Map(); _avertis = new Set(); }
    const changes = new Set(), recent = Date.now() - SAISIE_RECENTE_MS;
    objets.forEach(function (o) {
      if (_sig.get(o.uid || o) !== cur.get(o.uid || o) && Number(o.updatedAt) >= recent && _pertinent(o)) {
        changes.add(o);
      }
    });
    _sig = cur;
    if (!changes.size) return;
    const vus = new Set(_vusDuPlan());
    const nouveaux = _c1(collecter(), changes).filter(function (c) {
      return !vus.has(c.cle) && !_avertis.has(c.cle);
    });
    if (!nouveaux.length) return;
    nouveaux.forEach(function (c) { _avertis.add(c.cle); });
    _toast(_t(nouveaux.length > 1 ? "verif.saisie.n" : "verif.saisie.un", { n: nouveaux.length }), "warn");
  }

  window.addEventListener("kta:donneesPlanChange", function (ev) {
    const src = ev && ev.detail && ev.detail.source;
    if (src !== "roads" && src !== "zones" && src !== "structures" && src !== "calques") return;
    clearTimeout(_saisieTimer);
    _saisieTimer = setTimeout(function () {
      try { _verifierSaisie(); } catch (err) { console.warn("[VerifierPlan] saisie :", err); }
    }, SAISIE_MS);
  });

  // Plan quitté ou changé pendant la revue : le bandeau et sa marque partent avec lui, l'état de saisie aussi.
  window.addEventListener("mktm:plan-ferme", function () { fermer(); _sigPlan = null; _sig = new Map(); });

  return {
    analyser: analyser,
    collecter: collecter,
    ouvrir: ouvrir,
    fermer: fermer,
    montrer: montrer,
    marquerVu: marquerVu,
    retablir: retablir,
    retablirTout: retablirTout,
    seuilBordPx: seuilBordPx,
    // Copie de la liste courante (harnais, diagnostic) : rang, contrôle, motif, niveau, clé, au bord.
    liste: function () {
      return _liste.map(function (c, i) {
        return { i: i, controle: c.controle, motif: c.motif, niveau: c.niveau, cle: c.cle, auBord: !!c.auBord };
      });
    },
    etat: function () {
      return { liste: _liste.length, vus: _vus.length, index: _index, bandeau: !!_bandeau,
        avertis: _avertis.size };
    },
    BORD_M: BORD_M,
    CONTROLES: Object.assign({}, CONTROLES)
  };
})();
