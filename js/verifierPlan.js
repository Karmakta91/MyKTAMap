/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// verifierPlan.js — « Vérifier le plan » (Éditeur de données) : contrôles des données du plan ouvert (session et
// calques), liste groupée par gravité, revue sur la carte (bandeau Précédent / Suivant), fiche, « Vu, normal ».
// Contrôles : C1 tracé coupé par un obstacle dur, C2 passage entre niveaux sans raccord validé, C3 tracé jonction mal
// posé, C4 objets en double, C5 écarts du réseau (KtaRaccords), C6 contour fermé dégénéré ou qui se recoupe, C7 hors
// de l'image, C8 niveau inconnu, C9 type absent de la légende, C10 sommets en double (dédoublonnage, compte seul),
// C12 tracé qui traverse une zone à coût ; renvoi C11 (liaisons vers un plan absent) au gestionnaire des liaisons.
// ⚠️ contrat : C1, C3, C12 lisent les tests du graphe (Pathfinder.controle), C5 KtaRaccords.detecter, C9
// ktaResolveStyle, C10 ktaDedupliquerFichier (tableEditor.js) : jamais une copie, sinon deux vérités.
// Moteur PUR : analyser(donnees?) → { liste, vus } ; sans argument, le plan ouvert (collecter()). C4, C6 à C10 sont
// linéaires (hachage, bornes ; C6 balaie les arêtes d'un contour triées en x). Éprouvé par
// scripts/check-verifier-plan.js (Node) et scripts/smoke/checkup-verifier-plan.js. C5 est gardé en cache tant que
// ce qu'il lit ne change pas (_c5 : signature des tracés et des points ; C10, linéaire, n'en a pas besoin).
// « Vu, normal » : clé « contrôle|identité[|identité|détail] » (identité = uid, sinon empreinte de la géométrie)
// retenue par plan sur l'appareil (config.js > get/setPlanVerifVus). C5 : c'est « Ignorer » des Raccords (une seule
// mémoire, celle de la carte Raccords). 🩸 Un objet sans uid revient s'il est redessiné.
// Lecture seule : seul « Raccorder » (C5, chemin de raccordsTraces.js) écrit.
// Expose : window.KtaVerifierPlan = { analyser, collecter, ouvrir, fermer, marquerVu, retablir, retablirTout,
//   seuilBordPx, liaisonsAbsentes, liste, etat, montrer }.
// Doc : docs/architecture/multilevel-pathfinding.md § Vérifier le plan, ui.md §91.6 · Étude : ETUDE_VERIFIER_PLAN.md

window.KtaVerifierPlan = (function () {
  "use strict";

  const BORD_M = 0.5;                  // en deçà, l'obstacle n'est touché que « au bord » (souvent un dessin raté)
  const GRAVITES = ["bloquant", "revoir", "info"];
  // C12 n'est pas une erreur : un tracé posé exprès à travers un Comblé dit que ça passe (l'itinéraire l'évite
  // seulement) ; il est à confirmer (décision produit).
  const CONTROLES = { C1: "bloquant", C2: "bloquant", C3: "bloquant", C4: "revoir", C5: "revoir", C6: "revoir",
    C7: "info", C8: "revoir", C9: "info", C10: "info", C12: "revoir" };
  // C2 sur un niveau INTERMÉDIAIRE sans raccord : le pathfinder traverse ce niveau sans y déboucher (puits de 0 à 2
  // sans sortie au 1), l'itinéraire n'est pas trompé (décision produit).
  const GRAVITE_C2_TRAVERSE = "info";
  const ORDRE_CONTROLES = ["C1", "C2", "C3", "C12", "C4", "C5", "C6", "C8", "C7", "C9", "C10"];
  // C4 : champs hors comparaison « identiques en tout » (identité, date, provenance) ; un champ `_…` est interne.
  // polygon, origOpacity, origFillOpacity : affichage des registres de calque (utils.js, _ktaDataPolygons et
  // _ktaDataStructurePolygons), pas des données.
  const HORS_COMPARAISON = { uid: 1, updatedAt: 1, id: 1, layerId: 1, polygon: 1, origOpacity: 1, origFillOpacity: 1 };
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
    // 🩸 FNV-1a sur les unités UTF-16 : codePointAt changerait l'identité des objets ignorés dont le type a un emoji.
    for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } // NOSONAR
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
    const PF = window.Pathfinder, C = window.APP_CONFIG || {};
    return {
      roads: PF && typeof PF.collecterTraces === "function" ? PF.collecterTraces() : _appel("getRoads"),
      zones: _appel("getZones").concat(_registre(window._ktaDataPolygons)),
      structures: _appel("getStructures").concat(_registre(window._ktaDataStructurePolygons)),
      points: _appel("getEditorPoints").concat(_appel("getAllEmbeddedPoints")),
      multiLevel: _multi(),
      echelle: _echelle(),
      image: { w: Number(C.imageWidth) || 0, h: Number(C.imageHeight) || 0 },
      niveaux: Array.isArray(C.availableLevels) ? C.availableLevels.slice() : null,
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
    // ⚠️ Obstacle « galerie volontairement condamnée » (`condamne: true`, écrit sur l'objet) : il bloque toujours
    // l'itinéraire, il ne fait que taire C1 (décision produit).
    return _traversees(d, seulement, "C1", d.planOuvert ? C.obstaclesDuPlan() : C.obstaclesDe(d.zones, d.structures))
      .filter(function (e) { return !(e.autre && e.autre.condamne === true); });
  }

  // ── C12 : tracé qui traverse une zone à coût (Comblé, effondrement) ──────────
  // Mêmes paires et même mesure que C1, sur les zones à coût que lit le graphe : l'itinéraire les évite quand il peut
  // et dit quand il y passe ; ici on confirme le tracé (galerie creusée dans le remblai) ou on corrige la zone.
  // ⚠️ contrat : même tolérance que le graphe (Pathfinder.controle.toleranceZonePx, traverseesTrace) — une traversée
  // continue de moins d'1 m est un contour un peu large, ignoré ici comme par l'itinéraire.
  function _c12(d) {
    const C = _ctl();
    if (!C || typeof C.zonesCoutDuPlan !== "function") return [];
    const paires = _traversees(d, null, "C12", d.planOuvert ? C.zonesCoutDuPlan() : C.zonesCoutDe(d.zones));
    const tol = typeof C.toleranceZonePx === "function" ? C.toleranceZonePx(d.echelle) : 0;
    if (!(tol > 0)) return paires;
    const bord = seuilBordPx(d.echelle);
    return paires.filter(function (e) {
      const zone = e.autre && Array.isArray(e.autre.points) ? e.autre.points : null;
      if (!zone || !e.objet || !Array.isArray(e.objet.points)) return true;
      const gardees = C.traverseesTrace(e.objet.points, zone).filter(function (t) { return t.px >= tol; });
      if (!gardees.length) return false;
      e.longueurPx = gardees.reduce(function (s, t) { return s + t.px; }, 0);
      e.auBord = e.longueurPx < bord;
      return true;
    });
  }

  // Paires (tracé, obstacle) d'un contrôle de traversée (C1, C12).
  function _traversees(d, seulement, controle, obstacles) {
    const C = _ctl();
    if (!obstacles.length) return [];
    const prep = C.preparer(obstacles);
    const grille = C.grilleZones(prep.polys);
    const bord = seuilBordPx(d.echelle);
    const paires = new Map();
    let obstacleSaisi = false;
    if (seulement) obstacles.forEach(function (o) { if (seulement.has(o.objet)) obstacleSaisi = true; });

    function _paire(road, obst, famille, type, niveau) {
      const cle = controle + "|" + _identite(road) + "|" + _identite(obst);
      let e = paires.get(cle);
      if (!e) {
        e = { controle: controle, gravite: CONTROLES[controle], cle: cle, motif: type, niveau: niveau,
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

  // ── Objets du plan (C4, C6 à C10) ──────────
  // [{ o, f }] : tracés (sauf itinéraire et aperçu), zones, structures, points. f = famille de la fiche.
  function _objets(d) {
    const out = [];
    const geo = function (o) { return o && Array.isArray(o.points) && !o._preview; };
    (d.roads || []).forEach(function (o) { if (geo(o) && o.type !== "itinerary") out.push({ o: o, f: "roads" }); });
    (d.zones || []).forEach(function (o) { if (geo(o)) out.push({ o: o, f: "zones" }); });
    (d.structures || []).forEach(function (o) { if (geo(o)) out.push({ o: o, f: "structures" }); });
    (d.points || []).forEach(function (o) {
      if (o && typeof o.x === "number" && typeof o.y === "number") out.push({ o: o, f: "editorPoints" });
    });
    return out;
  }
  function _sommets(e) { return e.f === "editorPoints" ? [e.o] : e.o.points; }
  function _boiteDe(e) {
    const pts = _sommets(e);
    if (e.f === "editorPoints" || !pts.length) return _boite(pts[0] || { x: 0, y: 0 }, 30);
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    pts.forEach(function (p) { _etendre(b, p); });
    return b;
  }
  function _ancre(p) { return p ? { x: p.x, y: p.y } : null; }
  // Contour fermé : zone, ou structure d'un type non linéaire (structures.js > isStructurePolylineType).
  function _ferme(e) {
    if (e.f === "zones") return true;
    if (e.f !== "structures") return false;
    return !(typeof window.isStructurePolylineType === "function" && window.isStructurePolylineType(e.o.type));
  }
  function _constat(controle, e, motif, extra) {
    return Object.assign({ controle: controle, gravite: CONTROLES[controle], cle: controle + "|" + _identite(e.o),
      motif: motif, niveau: _niv(e.o), objet: e.o, famille: e.f, ancre: _ancre(_sommets(e)[0]), boite: _boiteDe(e) },
    extra || {});
  }

  // ── C4 : objets en double ──────────
  // Même famille, même type, même niveau, même géométrie au cm près (contour fermé : même départ et même sens
  // quelconques) ; points : même position, même tag et même nom. Un constat par groupe ; `identiques` = égaux en tout
  // hors identité et date (la seule copie qu'on pourra retirer sans perte, décision 7a).
  // 🩸 Arrondi au cm : deux copies de part et d'autre d'une frontière d'arrondi (écart < 1 cm) ne sont pas vues.
  // ✂️ (ajusterSommets.js > _couper) partage le sommet de coupe entre deux morceaux : géométries différentes, rien.
  function _niveauxCle(o) {
    const nv = Array.isArray(o.niveaux) ? o.niveaux.slice().sort(function (a, b) { return a - b; }).join(",") : "";
    return _niv(o) + "/" + (o.fromLevel == null ? "" : o.fromLevel) + "/" + (o.toLevel == null ? "" : o.toLevel) +
      "/" + nv;
  }
  function _forme(pts, q, ferme) {
    const l = [];
    pts.forEach(function (p) {
      const k = Math.round(p.x / q) + "," + Math.round(p.y / q);
      if (l[l.length - 1] !== k) l.push(k);
    });
    if (!ferme) return l.join(";");
    if (l.length > 1 && l[0] === l[l.length - 1]) l.pop();
    const n = l.length;
    if (!n) return "";
    let i0 = 0;
    for (let i = 1; i < n; i++) if (l[i] < l[i0]) i0 = i;
    const av = [], ar = [];
    for (let k = 0; k < n; k++) { av.push(l[(i0 + k) % n]); ar.push(l[(i0 - k + n) % n]); }
    const a = av.join(";"), b = ar.join(";");
    return a < b ? a : b;
  }
  // 🩸 Ne descend que dans les tableaux et les objets simples (prototype Object ou null) : une couche Leaflet (ou
  // tout champ d'affichage ajouté plus tard à un registre) compte comme un jeton fixe, et un cycle aussi — sans
  // cette garde, deux doublons d'un calque faisaient déborder la pile et toute l'analyse tombait.
  // Objet simple de n'importe quel contexte (JSON.parse, autre fenêtre) : son prototype est un Object.prototype,
  // qui n'a lui-même aucun prototype ; une instance de classe en a toujours un de plus.
  function _simple(v) {
    const pr = Object.getPrototypeOf(v);
    return pr === null || Object.getPrototypeOf(pr) === null;
  }
  function _stable(v, chemin) {
    if (v && typeof v === "object") {
      const vus = chemin || new WeakSet();
      if (vus.has(v)) return '"~cycle"';
      if (!Array.isArray(v) && !_simple(v)) return '"~objet"';
      vus.add(v);
      const txt = Array.isArray(v)
        ? "[" + v.map(function (x) { return _stable(x, vus); }).join(",") + "]"
        : "{" + Object.keys(v).sort(function (x, y) { return x.localeCompare(y); }).map(function (k) {
          return JSON.stringify(k) + ":" + _stable(v[k], vus);
        }).join(",") + "}";
      vus.delete(v);
      return txt;
    }
    return v === undefined ? "null" : JSON.stringify(v);
  }
  function _contenu(o) {
    const c = {};
    Object.keys(o).forEach(function (k) { if (!HORS_COMPARAISON[k] && k.charAt(0) !== "_") c[k] = o[k]; });
    return _stable(c);
  }
  function _c4(d, objs) {
    const C = _ctl();
    const q = (d.echelle > 0 ? d.echelle : (C ? C.ECHELLE_SANS_CALAGE : 10)) / 100;
    const groupes = new Map();
    objs.forEach(function (e) {
      const o = e.o;
      let k;
      if (e.f === "editorPoints") {
        k = "pt|" + String((Array.isArray(o.tags) && o.tags[0]) || "") + "|" + String(o.nom || o.name || "") + "|" +
          _niveauxCle(o) + "|" + _forme([o], q, false);
      } else {
        if (o.points.length < 2) return;
        k = e.f + "|" + String(o.type || "") + "|" + _niveauxCle(o) + "|" + _forme(o.points, q, _ferme(e));
      }
      const g = groupes.get(k);
      if (g) g.push(e); else groupes.set(k, [e]);
    });
    const out = [];
    groupes.forEach(function (g) {
      if (g.length < 2) return;
      const ref = _contenu(g[0].o);
      const identiques = g.every(function (e) { return _contenu(e.o) === ref; });
      const ids = g.map(function (e) { return _identite(e.o); }).sort();
      out.push(_constat("C4", g[0], identiques ? "identiques" : "differents", {
        cle: "C4|" + ids.join("|"), copies: g.length, identiques: identiques,
        autre: g[1].o, autreFamille: g[1].f }));
    });
    return out;
  }

  // ── C6 : contour fermé dégénéré ou qui se recoupe ──────────
  // Dégénéré : moins de 3 sommets distincts, ou aire nulle (sommets alignés). Se recoupe : deux arêtes non voisines
  // qui se croisent ou se touchent (pair-impair du volume, 3D, itinéraire faussés). Arêtes triées par x et balayées :
  // presque linéaire sur un grand contour.
  function _orient(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
  function _surSeg(a, b, p) {
    return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) &&
      p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  }
  function _croise(p1, p2, p3, p4) {
    const d1 = _orient(p3, p4, p1), d2 = _orient(p3, p4, p2), d3 = _orient(p1, p2, p3), d4 = _orient(p1, p2, p4);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      const t = d1 / (d1 - d2);
      return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    }
    if (d1 === 0 && _surSeg(p3, p4, p1)) return _ancre(p1);
    if (d2 === 0 && _surSeg(p3, p4, p2)) return _ancre(p2);
    if (d3 === 0 && _surSeg(p1, p2, p3)) return _ancre(p3);
    if (d4 === 0 && _surSeg(p1, p2, p4)) return _ancre(p4);
    return null;
  }
  function _recoupe(pts) {
    const k = pts.length;
    if (k < 4) return null;
    const x0 = [], x1 = [], idx = [];
    for (let i = 0; i < k; i++) {
      const a = pts[i], b = pts[(i + 1) % k];
      x0.push(Math.min(a.x, b.x)); x1.push(Math.max(a.x, b.x)); idx.push(i);
    }
    idx.sort(function (u, v) { return x0[u] - x0[v]; });
    for (let a = 0; a < k; a++) {
      const i = idx[a];
      for (let b = a + 1; b < k; b++) {
        const j = idx[b];
        if (x0[j] > x1[i]) break;
        const ecart = Math.abs(i - j);
        if (ecart === 1 || ecart === k - 1) continue;
        const ip = _croise(pts[i], pts[(i + 1) % k], pts[j], pts[(j + 1) % k]);
        if (ip) return ip;
      }
    }
    return null;
  }
  // Moins de 3 sommets distincts, ou tous alignés (aire de l'enveloppe nulle). 🩸 Pas l'aire signée : un nœud papillon
  // symétrique a une aire signée nulle, c'est un contour qui se recoupe.
  function _degenere(pts) {
    if (new Set(pts.map(function (p) { return p.x + "," + p.y; })).size < 3) return true;
    const a = pts[0];
    let b = a, d2 = 0;
    pts.forEach(function (p) {
      const d = (p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y);
      if (d > d2) { d2 = d; b = p; }
    });
    return pts.every(function (p) { return Math.abs(_orient(a, b, p)) <= 1e-9 * d2; });
  }
  function _c6(objs) {
    const out = [];
    objs.forEach(function (e) {
      if (!_ferme(e)) return;
      const pts = [];
      e.o.points.forEach(function (p) {
        const der = pts[pts.length - 1];
        if (p && typeof p.x === "number" && typeof p.y === "number" && !(der && der.x === p.x && der.y === p.y)) {
          pts.push(p);
        }
      });
      if (pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y) pts.pop();
      if (_degenere(pts)) {
        out.push(_constat("C6", e, "degenere"));
        return;
      }
      const ip = _recoupe(pts);
      if (ip) out.push(_constat("C6", e, "recoupe", { ancre: ip }));
    });
    return out;
  }

  // ── C7 : objet hors de l'image du plan ──────────
  // Un sommet (ou le point) au-delà de [0, largeur] × [0, hauteur] de plus de BORD_M : souvent un import mal calé.
  function _c7(d, objs) {
    const w = d.image && d.image.w, h = d.image && d.image.h;
    if (!(w > 0 && h > 0)) return [];
    const tol = seuilBordPx(d.echelle), out = [];
    objs.forEach(function (e) {
      const pts = _sommets(e);
      let hors = 0, premier = null;
      pts.forEach(function (p) {
        if (p.x < -tol || p.y < -tol || p.x > w + tol || p.y > h + tol) { hors++; if (!premier) premier = p; }
      });
      if (hors) out.push(_constat("C7", e, hors === pts.length ? "dehors" : "deborde", { ancre: _ancre(premier) }));
    });
    return out;
  }

  // ── C8 : niveau inconnu (plan multi-niveau) ──────────
  // Niveaux d'un objet : `level` (absent = 0), bouts d'un tracé jonction, `niveaux` d'une zone (chacun compte, comme
  // pour l'itinéraire) ou d'un point qui relie des niveaux. Valeur non entière (import) ou absente de availableLevels :
  // l'objet n'apparaît dans aucun choix du sélecteur. Un constat par (objet, valeur).
  function _c8(d, objs) {
    if (!d.multiLevel || !Array.isArray(d.niveaux)) return [];
    const PJ = window.KtaPoiJonction, out = [];
    objs.forEach(function (e) {
      const o = e.o, vals = [o.level == null ? 0 : o.level];
      if (e.f === "roads" && o.type === "jonction") {
        if (o.fromLevel != null) vals.push(o.fromLevel);
        if (o.toLevel != null) vals.push(o.toLevel);
      }
      const tag = Array.isArray(o.tags) ? String(o.tags[0] || "") : "";
      const porte = e.f === "zones" || (e.f === "editorPoints" && !!(PJ && PJ.porteNiveaux && PJ.porteNiveaux(tag)));
      if (porte && Array.isArray(o.niveaux)) o.niveaux.forEach(function (n) { vals.push(n); });
      const vus = new Set();
      vals.forEach(function (v) {
        const k = String(v);
        if (vus.has(k)) return;
        vus.add(k);
        const entier = Number.isInteger(v);
        if (entier && d.niveaux.indexOf(v) >= 0) return;
        out.push(_constat("C8", e, entier ? "inconnu" : "invalide", { cle: "C8|" + _identite(o) + "|" + k,
          valeur: v, niveau: null }));
      });
    });
    return out;
  }

  // ── C9 : type absent de la légende ──────────
  // Tracé, zone, structure : ktaResolveStyle (aplat) sans entrée, ni built-in ni type personnalisé de la catégorie ;
  // point : tag absent de window._iconMap (plan ouvert seulement). Rendu en couleur ou icône de repli, hors filtres.
  function _c9(d, objs) {
    const R = window.ktaResolveStyle, memo = new Map(), out = [];
    const cat = { roads: "traces", zones: "zones", structures: "structures" };
    const icones = d.planOuvert && window._iconMap && typeof window._iconMap === "object" ? window._iconMap : null;
    objs.forEach(function (e) {
      if (e.f === "editorPoints") {
        const tag = Array.isArray(e.o.tags) ? e.o.tags[0] : null;
        if (icones && typeof tag === "string" && tag && !icones[tag]) {
          out.push(_constat("C9", e, "absent", { type: tag }));
        }
        return;
      }
      if (typeof R !== "function") return;
      const type = e.o.type;
      if (typeof type !== "string" || !type) { out.push(_constat("C9", e, "sansType")); return; }
      const k = cat[e.f] + "|" + type;
      if (!memo.has(k)) {
        let s = null;
        try { s = R(cat[e.f], type, { flat: true }); } catch (err) { s = null; }
        memo.set(k, !!s);
      }
      if (!memo.get(k)) out.push(_constat("C9", e, "absent", { type: type }));
    });
    return out;
  }

  // ── C10 : sommets en double (compte seul) ──────────
  // Le dédoublonnage de l'Éditeur (tableEditor.js > ktaDedupliquerFichier) sur une enveloppe de l'objet : rien n'est
  // modifié. `disparait` : le nettoyage le ferait passer sous son minimum (il serait retiré).
  function _c10(objs) {
    const D = window.ktaDedupliquerFichier, out = [];
    if (typeof D !== "function") return out;
    objs.forEach(function (e) {
      if (e.f === "editorPoints") return;
      const env = {};
      env[e.f] = [{ type: e.o.type, points: e.o.points }];
      let b = null;
      try { b = D(env); } catch (err) { b = null; }
      if (!b || !b.sommets) return;
      const pts = e.o.points;
      let ancre = pts[0];
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].x === pts[i - 1].x && pts[i].y === pts[i - 1].y) { ancre = pts[i]; break; }
      }
      out.push(_constat("C10", e, "sommets", { n: b.sommets, disparait: b.objets > 0, ancre: _ancre(ancre) }));
    });
    return out;
  }

  // ── C5 : écarts du réseau (Raccords à vérifier) ──────────
  // KtaRaccords.detecter tel quel, plan ouvert seulement (il lit la carte). « Raccorder » est son écriture.
  // ⚠️ Il coûte (graphe + grille : plus d'une seconde sur ~20 000 objets) : son résultat est gardé tant que la
  // signature de ce qu'il lit ne change pas — tracés (session et calques, `d.roads` = Pathfinder.collecterTraces,
  // sa source), points (jonctions du graphe), échelle, multi-niveau, plan. Relue à chaque analyse (quelques ms)
  // plutôt que `kta:donneesPlanChange` : un indice, pas une preuve (utils.js > ktaSignalerDonneesPlan).
  // Ignorés : un écart AJOUTÉ (« Vu, normal », Ignorer) est retiré du résultat gardé ; une liste qui perd une
  // clé (Réafficher les ignorés) fait recalculer. Seulement pour le plan ouvert (`cache`) : des données passées
  // à analyser() ne sont pas celles que detecter lit.
  let _c5Cache = null;   // { sig, ign: Set, liste }
  function _sigC5(d) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    const entier = function (q) { h1 = Math.imul(h1 ^ q, 2654435761); h2 = Math.imul(h2 ^ q, 1597334677); };
    const texte = function (v) {
      const t = typeof v === "string" ? v : (v === undefined ? "\u0000" : JSON.stringify(v));
      for (let i = 0; i < t.length; i++) entier(t.codePointAt(i));
      entier(0x7c7c);   // séparateur : « 1|23 » ≠ « 12|3 »
    };
    // Coordonnée au millième de px : deux entiers (partie haute, partie basse), sans passer par une chaîne.
    const nombre = function (x) {
      if (typeof x !== "number" || !Number.isFinite(x)) { texte(String(x)); return; }
      const q = Math.round(x * 1000);
      // `h ^ q` dans entier() ramène déjà q sur 32 bits (ToInt32) : pas de `| 0` à faire ici.
      entier(q); entier(Math.floor(q / 4294967296));
    };
    const C = window.APP_CONFIG || {};
    texte(window._currentLoadedPlanId || ""); texte(C.scale); texte(C.multiLevel === true);
    // Objet : chaque champ sauf la géométrie (clé puis valeur), puis les sommets nombre par nombre.
    const objet = function (o) {
      if (!o || typeof o !== "object") { texte(o); return; }
      const cles = Object.keys(o).sort(function (x, y) { return x.localeCompare(y); });
      for (let i = 0; i < cles.length; i++) {
        const k = cles[i], v = o[k];
        if (k === "points" || typeof v === "function") continue;
        texte(k); texte(v);
      }
      const pts = Array.isArray(o.points) ? o.points : [];
      entier(pts.length);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p && typeof p === "object") { nombre(p.x); nombre(p.y); } else texte(p);
      }
    };
    (d.roads || []).forEach(objet);
    entier(0x2d2d);
    (d.points || []).forEach(objet);
    return (h1 >>> 0).toString(36) + "." + (h2 >>> 0).toString(36) + "." + (d.roads || []).length + "." +
      (d.points || []).length;
  }
  function _detecterC5(d, cache) {
    const K = window.KtaRaccords;
    const ign = new Set(typeof window.getPlanRaccordsIgnores === "function" ? window.getPlanRaccordsIgnores() : []);
    let sig = null;
    if (cache) { try { sig = _sigC5(d); } catch (err) { sig = null; } }   // cycle, valeur exotique : pas de cache
    if (sig && _c5Cache && _c5Cache.sig === sig) {
      let garde = true;
      _c5Cache.ign.forEach(function (k) { if (!ign.has(k)) garde = false; });
      if (garde) return _c5Cache.liste.filter(function (e) { return !ign.has(e.cle); });
    }
    let r = null;
    try { r = K.detecter(); } catch (err) { console.warn("[VerifierPlan] raccords :", err); r = null; }
    const liste = (r && r.liste) || [];
    _c5Cache = sig && r ? { sig: sig, ign: ign, liste: liste } : null;
    return liste;
  }
  function _c5(d, cache) {
    const K = window.KtaRaccords;
    if (!d.planOuvert || !K || typeof K.detecter !== "function") return [];
    return _detecterC5(d, cache).map(function (e) {
      const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      _etendre(b, e.a); _etendre(b, e.b);
      return { controle: "C5", gravite: CONTROLES.C5, cle: "C5|" + e.cle, motif: "ecart", niveau: e.niveau || 0,
        objet: e.mobile.road, famille: "roads", autreTrace: e.cible.road, ecartPx: e.ecartPx, raccord: e,
        segment: [e.a, e.b], ancre: _ancre(e.a),
        boite: { x0: b.x0 - 20, y0: b.y0 - 20, x1: b.x1 + 20, y1: b.y1 + 20 } };
    });
  }

  // ── C11 : liaisons vers un plan absent (renvoi au gestionnaire des liaisons, pas de doublon) ──────────
  function liaisonsAbsentes() {
    const IPL = window.InterPlanLinks, PR = window.PlanRegistry, pid = window._currentLoadedPlanId;
    if (!pid || !IPL || typeof IPL.getLinksForPlan !== "function" || !PR || typeof PR.findById !== "function") return 0;
    try {
      return IPL.getLinksForPlan(pid).filter(function (l) {
        const autre = l && l.a && l.a.planId === pid ? l.b : (l && l.a);
        return !!(autre && autre.planId) && !PR.findById(autre.planId);
      }).length;
    } catch (err) { return 0; }
  }

  // ── Analyse ──────────
  function _vusDuPlan() {
    return typeof window.getPlanVerifVus === "function" ? window.getPlanVerifVus() : [];
  }
  function _trier(l) {
    return l.sort(function (u, v) {
      return (GRAVITES.indexOf(u.gravite) - GRAVITES.indexOf(v.gravite)) ||
        (ORDRE_CONTROLES.indexOf(u.controle) - ORDRE_CONTROLES.indexOf(v.controle)) ||
        ((u.niveau || 0) - (v.niveau || 0)) || (u.cle < v.cle ? -1 : u.cle > v.cle ? 1 : 0);
    });
  }

  // → { liste: constats à revoir, vus: constats déclarés « vu, normal » } ; triés par gravité, contrôle, niveau.
  // `opts.vus` : clés vues (sinon celles du plan ouvert).
  function analyser(donnees, opts) {
    const d = donnees || collecter();
    const vus = new Set((opts && Array.isArray(opts.vus)) ? opts.vus : _vusDuPlan());
    const objs = _objets(d);
    const tous = _c1(d).concat(_c2(d), _c3(d), _c12(d), _c4(d, objs), _c5(d, !donnees), _c6(objs), _c7(d, objs), _c8(d, objs),
      _c9(d, objs), _c10(objs));
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
    if (c && c.controle === "C5" && c.raccord && window.KtaRaccords) return window.KtaRaccords.ignorer(c.raccord);
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
    if (c.controle === "C1" || c.controle === "C12") {
      const obst = _nomObjet(c.autreFamille, c.autre);
      detail = c.motif === "zone"
        ? _t("verif." + c.controle.toLowerCase() + ".zone", { obstacle: obst, d: _distTexte(c.longueurPx) })
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
    } else if (c.controle === "C4") {
      detail = _t("verif.c4." + c.motif, { n: c.copies });
    } else if (c.controle === "C5") {
      detail = _t("verif.c5.ecart", { d: _distTexte(c.ecartPx), autre: _nomObjet("roads", c.autreTrace || {}) });
    } else if (c.controle === "C8") {
      detail = c.motif === "invalide"
        ? _t("verif.c8.invalide", { v: String(c.valeur).slice(0, 20) })
        : _t("verif.c8.inconnu", { n: _fmtNiv(c.valeur) });
    } else if (c.controle === "C9") {
      detail = _t("verif.c9." + c.motif, { type: String(c.type || "").slice(0, 40) });
    } else if (c.controle === "C10") {
      detail = _t("verif.c10.sommets", { n: c.n }) + (c.disparait ? " · " + _t("verif.c10.disparait") : "");
    } else {
      detail = _t("verif." + c.controle.toLowerCase() + "." + c.motif);
    }
    const sansNiveau = c.controle === "C2" || c.controle === "C3" || c.controle === "C8";
    const niveau = _multi() && !sansNiveau ? " · " + _t("verif.niveau", { n: _fmtNiv(c.niveau) }) : "";
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
    if (_multi() && Number.isInteger(c.niveau) && window.APP_CONFIG.activeLevel !== c.niveau &&
        typeof window.ktaSetActiveLevel === "function") {
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
    if (Array.isArray(c.segment)) {
      couches.push(L.polyline(_latlngs(c.segment),
        Object.assign({ weight: 4, dashArray: "6 4", className: "kta-verif-obstacle" }, base)));
    }
    if (Array.isArray(c.objet.points)) {
      const style = Object.assign({ weight: 6, opacity: 0.55, className: "kta-verif-objet" }, base);
      couches.push(c.famille === "zones" || (c.famille === "structures" && _ferme({ f: c.famille, o: c.objet }))
        ? L.polygon(_latlngs(c.objet.points), Object.assign({ fill: false }, style))
        : L.polyline(_latlngs(c.objet.points), style));
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
    // C4 : l'autre exemplaire (un point en double est au même endroit : une seule fiche à toucher).
    const autre = _bandeau.querySelector('[data-verif="fiche-autre"]');
    autre.style.display = c.autre && !(c.controle === "C4" && c.famille === "editorPoints") ? "" : "none";
    autre.textContent = _t(c.controle === "C4" ? "verif.ficheCopie" : "verif.ficheObstacle");
    _bandeau.querySelector('[data-verif="raccorder"]').style.display = c.controle === "C5" ? "" : "none";
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
        btn("fiche-autre", "verif.ficheObstacle") + btn("raccorder", "verif.raccorder") + btn("vu", "verif.vu") +
        btn("fermer", "verif.fermer") + '</div>';
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
      if (act === "raccorder" && c.raccord && window.KtaRaccords) {
        Promise.resolve(window.KtaRaccords.raccorder(c.raccord)).then(function (ok) {
          if (!ok) return;
          _toast(_t("verif.toast.raccorde"), "success");
          _rafraichir();
        });
        return;
      }
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
    const absentes = liaisonsAbsentes();
    if (absentes) {
      h += '<div class="kta-racc-pied kta-verif-c11"><span>' + _esc(_t("verif.c11.texte", { n: absentes })) +
        '</span> <button type="button" class="kta-btn kta-btn-ghost kta-btn-small" data-verif="liaisons">' +
        _esc(_t("verif.c11.bouton")) + '</button></div>';
    }
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
      if (act === "liaisons" && window.InterPlanLinks) { _fermerListe(); window.InterPlanLinks.ouvrirGestionnaire(); }
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
  window.addEventListener("mktm:plan-ferme", function () { fermer(); _sigPlan = null; _sig = new Map(); _c5Cache = null; });

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
    liaisonsAbsentes: liaisonsAbsentes,
    // Copie de la liste courante (harnais, diagnostic) : rang, contrôle, gravité, motif, niveau, clé, au bord.
    liste: function () {
      return _liste.map(function (c, i) {
        return { i: i, controle: c.controle, gravite: c.gravite, motif: c.motif, niveau: c.niveau, cle: c.cle,
          auBord: !!c.auBord };
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
