/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// galerieEmprise.js — emprise des galeries d'un niveau : les tracés vus comme des couloirs d'une largeur par type
// (principal 2,5 m, secondaire 2 m, chemin 1,7 m, type perso 2 m ; ni l'itinéraire ni une jonction).
// Expose window.KtaGalerie : largeur(type) → m, modele(niveau[, mixte]) → modèle en coordonnées plan (px) | null,
//   dedans(x, y, niveau), segmentsBloques(segs, niveau) → [bool] (même forme que
//   tracking.js > ktaSegmentsBloquesParStructure), paroisBloquent(segs, niveau) (mode mixte), invalider(),
//   SEUIL_CHAMBRE_M, PASSAGE (dimensions des volumes de passage ; leur emprise est une pièce : _emprisesPassages).
// Modèle MIXTE (vue 3D par défaut) : chaque côté du tube est jugé à part ; une structure du niveau (intégrée ou
// perso) proche d'un côté ouvre CE côté (la paroi d'en face reste), un pan de retour relie la paroi gardée à la
// structure ; proche des deux côtés, le tracé traverse une CHAMBRE, sans parois. Un tube qui débouche dans une
// chambre s'y arrête sur un bout OUVERT (aucune paroi de fond) ; un tube plus court que TUBE_MIN_M entre deux
// chambres est ouvert aussi (pas de paroi orpheline). Règle du pas : on bute contre les parois dessinées et les
// pans de retour (paroisBloquent), contre les structures (règle du tracker) et contre un remblais dans un tube.
// Modèle : graphe plan des tracés (sommets confondus à 15 cm, croisements coupés, bout libre raccordé au tracé
// voisin s'il s'arrête à moins de 0,5 m de sa paroi) ; une PIÈCE convexe par tronçon (rectangle de sa largeur,
// d'un nœud à l'autre) et, à chaque nœud de degré ≥ 2, les triangles d'un joint : coude en onglet (borné à deux
// demi-largeurs, biseau au-delà) ou dalle de carrefour (degré ≥ 3) dont les parois relient les coins des tubes.
// ⚠️ contrat : l'emprise est l'UNION des pièces ; une paroi est un bord de pièce qui n'est dans aucune autre, d'où
// des tubes coupés au bord de la dalle et aucune paroi qui en traverse une autre, même pour des tracés presque
// parallèles qui se chevauchent. Règle du pas en mode galerie (vue 3D) : rester dans l'emprise (à moins d'une
// demi-largeur d'un tracé ou dans un joint) et hors d'un remblais du niveau.
// 🩸 Le graphe de roadGraph.js ne sert pas ici : c'est un graphe d'itinéraire (croisements en arêtes virtuelles,
// tronçons non coupés, tronçon retiré s'il croise un mur en ligne, types perso exclus), pas une géométrie.
// Doc : docs/architecture/tracking.md § Vue 3D · Garde-fou : scripts/smoke/checkup-vue-3d.js

(function () {
  "use strict";

  const LARGEURS = { principal: 2.5, secondaire: 2, chemin: 1.7 };
  const LARGEUR_PERSO = 2;          // m : type perso, en attendant un réglage par type
  const SANS_TUBE = { itinerary: true, jonction: true };
  const FUSION_M = 0.15;            // m : deux sommets plus proches sont un même nœud
  const ACCROCHE_M = 0.5;           // m : bout libre arrêté à moins de ça de la paroi d'un autre tracé → raccordé
  const ONGLET_MAX = 2;             // en demi-largeurs : pointe d'onglet plus loin du nœud → biseau
  const DALLE_MAX_M = 4;            // m : recul maximal d'une coupe autour d'un nœud (angles très aigus)
  const CASE_M = 4;                 // m : maille des grilles de recherche
  const PAS_M = 0.05;               // m : pas d'échantillonnage d'un segment jugé par segmentsBloques
  const MEMO_MS = 250;              // signature des données relue au plus tous les MEMO_MS
  // Mode mixte. 3 m : un tube principal a sa paroi à 1,25 m de l'axe ; une structure plus proche que 3 m de l'axe
  // laisserait entre elle et la paroi moins de 1,75 m (la largeur d'un chemin) : une lame de roche doublée qui ne
  // ressemble à rien. Elle borde donc la galerie elle-même (front de taille, mur de consolidation, pilier de
  // chambre) : on dessine la structure, pas le tube. Plus bas (2 m), les piliers d'une chambre traversée en son
  // milieu (rangées tous les 5 à 7 m) laissaient des tronçons de tube entre eux ; plus haut (4 à 5 m), une galerie
  // de liaison qui longe un pilier isolé perdait ses parois sur une longueur sans rien à dessiner à la place.
  const SEUIL_CHAMBRE_M = 3;
  const PAS_CHAMBRE_M = 0.5;        // m : pas d'échantillonnage de l'axe pour ce test (coupe affinée par dichotomie)
  const TUBE_MIN_M = 3;             // m : tube plus court entre deux chambres (ou chambre et bout libre) → ouvert
  const RECUL_CHAMBRE_M = 0.5;      // m au-delà de la plus grande demi-largeur : tubes arrêtés avant un nœud en chambre
  // Côté par côté : chaque échantillon de l'axe juge sa paroi gauche et sa paroi droite à part, au point posé à
  // w + COTE_MARGE_M de l'axe (w = demi-largeur) : une structure à moins de SEUIL_CHAMBRE_M − w de ce point ouvre
  // ce côté seulement. Les deux côtés ouverts = chambre (sans parois ni joint).
  const COTE_MARGE_M = 0.5;
  // Retour de paroi : à chaque bout d'un côté ouvert, un pan perpendiculaire part du bord du tube vers la
  // structure, au plus RETOUR_MAX_M, coupé à sa face (règle du pas des structures) ; le bout est avancé par pas de
  // RETOUR_PAS_M jusqu'à ce que ce pan touche la structure (sinon une fente resterait entre lui et elle).
  const RETOUR_MAX_M = 1.5;
  const RETOUR_PAS_M = 0.1;
  // Passages entre niveaux (m) : dimensions des volumes de la vue 3D (vue3d.js > VOLUME les lit ici) : escalier
  // (jes, eso) 2,5 le long de la galerie × 1,5, puits carré (jpe, jps, peo) 1,2, aération (pa) 0,8 ; cadre doré au
  // sol de `cadre` à `marge` de la bouche ; rampe d'un tracé jonction de `rampe`, sa tranchée `tranchee` de plus de
  // chaque côté. Le volume s'aligne sur l'axe le plus proche à moins de DIR_PASSAGE_M (plusProche, même règle).
  const PASSAGE = { escalier: [2.5, 1.5], puits: 1.2, aeration: 0.8, rampe: 1, tranchee: 0.1, marge: 0.12, cadre: 0.08 };
  const DIR_PASSAGE_M = 10;

  const _cache = new Map();         // "niveau|m" → { sig, modele }
  let _sig = null, _sigT = 0;

  function largeur(type) { return SANS_TUBE[type] ? 0 : (LARGEURS[type] || LARGEUR_PERSO); }

  function _echelle() {
    const sc = Number(window.APP_CONFIG && window.APP_CONFIG.scale);
    return Number.isFinite(sc) && sc > 0 ? sc : 0;
  }

  function _tab(f) { try { return (typeof f === "function" ? f() : []) || []; } catch (err) { return []; } }

  function _routes() {
    return _tab(window.getRoads).filter(function (r) { return r && !r._preview; })
      .concat(_tab(window.getAllEmbeddedRoads));
  }

  function _zones() { return _tab(window.getZones).concat(_tab(window.getAllEmbeddedZones)); }

  function _points() { return _tab(window.getEditorPoints).concat(_tab(window.getAllEmbeddedPoints)); }

  // Toutes les structures, filtres de la carte ignorés (masquer ne retire que le dessin, comme la règle du pas).
  function _structures() { return _tab(window.getStructures).concat(_tab(window.getAllEmbeddedStructures)); }

  function _estLigne(type) {
    if (typeof window.isStructurePolylineType === "function") return window.isStructurePolylineType(type);
    return type === "mur-ligne" || type === "front-1" || type === "front-2";
  }

  // Signature bon marché (comme roadGraph.js) : nombre, sommets et niveaux des tracés, zones et structures ; place,
  // tag, niveaux et raccords des POI (passages) ; échelle.
  function _signature() {
    const t = performance.now();
    if (_sig !== null && t - _sigT < MEMO_MS) return _sig;
    let h = 0;
    const mel = function (v) { h = Math.imul(h ^ (v | 0), 16777619); };
    const lire = function (liste) {
      mel(liste.length);
      for (let i = 0; i < liste.length; i++) {
        const o = liste[i];
        if (!o || !Array.isArray(o.points)) continue;
        mel(o.points.length); mel(o.level); mel(String(o.type || "").length);
        const p = o.points[0], q = o.points[o.points.length - 1];
        if (p && q) { mel(p.x * 10); mel(p.y * 10); mel(q.x * 10); mel(q.y * 10); }
      }
    };
    lire(_routes());
    lire(_zones());
    lire(_structures());
    const pts = _points();
    mel(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p) continue;
      mel(p.x * 10); mel(p.y * 10); mel(p.level); mel(String((p.tags && p.tags[0]) || "").length);
      (Array.isArray(p.niveaux) ? p.niveaux : []).forEach(mel);
      (Array.isArray(p.accroches) ? p.accroches : []).forEach(function (a) {
        if (a) { mel(a.level); mel(a.x * 10); mel(a.y * 10); }
      });
    }
    _sig = h + ":" + _echelle();
    _sigT = t;
    return _sig;
  }

  function invalider() { _cache.clear(); _sig = null; }

  function _surNiveau(o, niveau) {
    return niveau === null || niveau === undefined || (Number.isInteger(o.level) ? o.level : 0) === niveau;
  }

  // ── Grille de recherche (px) ──────────────────────────────────────────────────────────────────────

  // Clé numérique de case (une chaîne par case coûtait une allocation à chaque lecture : des centaines de milliers à
  // la construction du mode mixte). Les cases font CASE_M : 2^20 cases de côté suffisent à tout plan.
  function _cle(gx, gy) { return gx * 1048576 + gy; }

  function Grille(c) { this.c = c; this.m = new Map(); }
  Grille.prototype.poser = function (i, x0, y0, x1, y1) {
    const c = this.c;
    for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
      for (let gy = Math.floor(y0 / c); gy <= Math.floor(y1 / c); gy++) {
        const k = _cle(gx, gy);
        let l = this.m.get(k);
        if (!l) this.m.set(k, l = []);
        l.push(i);
      }
    }
  };
  Grille.prototype.pres = function (x0, y0, x1, y1) {
    const c = this.c, vus = new Set();
    for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
      for (let gy = Math.floor(y0 / c); gy <= Math.floor(y1 / c); gy++) {
        const l = this.m.get(_cle(gx, gy));
        if (l) for (let n = 0; n < l.length; n++) vus.add(l[n]);
      }
    }
    return Array.from(vus);
  };
  Grille.prototype.case = function (x, y) {
    return this.m.get(_cle(Math.floor(x / this.c), Math.floor(y / this.c))) || [];
  };

  // ── Géométrie ────────────────────────────────────────────────────────────────────────────────────

  function _aire(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    return a / 2;
  }

  // Pièce convexe de sens positif (intérieur à gauche de chaque bord).
  function _piece(pts, type, genre) {
    if (_aire(pts) < 0) pts.reverse();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      x0 = Math.min(x0, pts[i][0]); x1 = Math.max(x1, pts[i][0]);
      y0 = Math.min(y0, pts[i][1]); y1 = Math.max(y1, pts[i][1]);
    }
    return { pts: pts, type: type, genre: genre, x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  // Point dans une pièce convexe de sens positif ; `tol` (px) > 0 élargit, < 0 resserre.
  function dansPiece(P, x, y, tol) {
    const pts = P.pts, t = tol || 0;
    if (x < P.x0 - t || x > P.x1 + t || y < P.y0 - t || y > P.y1 + t) return false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const ax = pts[j][0], ay = pts[j][1], bx = pts[i][0], by = pts[i][1];
      const l = Math.hypot(bx - ax, by - ay);
      if (l < 1e-9) continue;
      if (((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / l < -t) return false;
    }
    return true;
  }

  function _dansAnneau(a, x, y) {
    let r = false;
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const p = a[i], q = a[j];
      if ((p.y > y) !== (q.y > y) && x < (q.x - p.x) * (y - p.y) / (q.y - p.y) + p.x) r = !r;
    }
    return r;
  }

  // ── Mode mixte : structures proches de l'axe ──────────────────────────────────────────────────────

  // Structures du niveau (bords des contours, segments des lignes) en grille → proche(x, y) : une structure est à
  // moins de SEUIL_CHAMBRE_M, ou le point est dans un contour fermé.
  function _indexStructures(niveau, sc) {
    const segs = [], polys = [], g = new Grille(CASE_M * sc), gp = new Grille(CASE_M * sc);
    _structures().forEach(function (s) {
      if (!s || !Array.isArray(s.points) || !_surNiveau(s, niveau)) return;
      const pts = s.points.filter(function (p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); });
      if (!pts.length) return;
      const ligne = _estLigne(s.type), n = pts.length;
      const fin = ligne || n < 3 ? Math.max(1, n - 1) : n;
      for (let i = 0; i < fin; i++) {
        const p = pts[i], q = pts[Math.min((i + 1) % n, n - 1)];
        segs.push([p.x, p.y, q.x, q.y]);
        g.poser(segs.length - 1, Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y));
      }
      if (ligne || n < 3) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach(function (p) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      });
      polys.push(pts);
      gp.poser(polys.length - 1, x0, y0, x1, y1);
    });
    const seuil = SEUIL_CHAMBRE_M * sc;
    // Une structure à moins de r (px) de (x, y), ou (x, y) dans un contour fermé ?
    // Cases lues une à une (sans Grille.pres, qui dédoublonne dans un Set) : appelé des dizaines de milliers de
    // fois à la construction, et un segment vu deux fois ne change pas la réponse.
    const pres = function (x, y, r) {
      if (!segs.length) return false;
      const c = g.c, r2 = r * r;
      for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++) {
        for (let gy = Math.floor((y - r) / c); gy <= Math.floor((y + r) / c); gy++) {
          const l = g.m.get(_cle(gx, gy));
          if (!l) continue;
          for (let i = 0; i < l.length; i++) {
            const s = segs[l[i]], dx = s[2] - s[0], dy = s[3] - s[1], q = dx * dx + dy * dy;
            const t = q ? Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / q)) : 0;
            const ex = s[0] + t * dx - x, ey = s[1] + t * dy - y;
            if (ex * ex + ey * ey <= r2) return true;
          }
        }
      }
      const lp = gp.case(x, y);
      for (let i = 0; i < lp.length; i++) { if (_dansAnneau(polys[lp[i]], x, y)) return true; }
      return false;
    };
    return {
      n: segs.length,
      // Aucune structure dans les cases autour du rectangle (px), marge `r` (px) comprise : rien à échantillonner.
      aucuneAutour: function (x0, y0, x1, y1, r) {
        const c = g.c;
        for (let gx = Math.floor((x0 - r) / c); gx <= Math.floor((x1 + r) / c); gx++) {
          for (let gy = Math.floor((y0 - r) / c); gy <= Math.floor((y1 + r) / c); gy++) {
            if (g.m.has(_cle(gx, gy)) || gp.m.has(_cle(gx, gy))) return false;
          }
        }
        return true;
      },
      pres: pres,
      proche: function (x, y) { return pres(x, y, seuil); },
      // Distance (px) de (x, y) au premier bord de structure croisé dans la direction (ux, uy), au plus L ; null
      // sinon. Bords = ceux que juge la règle du pas (contours fermés, segments des lignes : l'axe d'un front).
      rayon: function (x, y, ux, uy, L) {
        const x1 = x + ux * L, y1 = y + uy * L, c = g.c;
        let best = null;
        for (let gx = Math.floor(Math.min(x, x1) / c); gx <= Math.floor(Math.max(x, x1) / c); gx++) {
          for (let gy = Math.floor(Math.min(y, y1) / c); gy <= Math.floor(Math.max(y, y1) / c); gy++) {
            const l = g.m.get(_cle(gx, gy));
            if (!l) continue;
            for (let i = 0; i < l.length; i++) {
              const s = segs[l[i]], ex = s[2] - s[0], ey = s[3] - s[1], dx = x1 - x, dy = y1 - y;
              const d = dx * ey - dy * ex;
              if (Math.abs(d) < 1e-12) continue;
              const rx = s[0] - x, ry = s[1] - y, t = (rx * ey - ry * ex) / d, u = (rx * dy - ry * dx) / d;
              if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
            }
          }
        }
        return best === null ? null : best * L;
      }
    };
  }

  // Côtés d'un échantillon de l'arête r (point (x, y) de l'axe) : [côté +, côté −] ouverts ? Côté + = du côté de la
  // normale (−dy, dx) de a vers b, celui des pièces (_construire) et des coins `cote` +1 du joint quand r part de v.
  function _cotesOuverts(S, r, x, y, sc) {
    const nx = -(r.by - r.ay) / r.l, ny = (r.bx - r.ax) / r.l, d = r.w + COTE_MARGE_M * sc;
    const rs = Math.max(0.1 * sc, SEUIL_CHAMBRE_M * sc - r.w);
    return [S.pres(x + nx * d, y + ny * d, rs), S.pres(x - nx * d, y - ny * d, rs)];
  }

  // Classe chaque arête en morceaux de tube et de chambre → r.tubes = [[t0, t1, ouvertDebut, ouvertFin]] (t le long
  // de l'arête, de a vers b) et, par échantillon, ses côtés ouverts (e.cotes) ; rend les nœuds en chambre (aucun
  // joint n'y est construit). Échantillons tous les PAS_CHAMBRE_M : un échantillon est en chambre si ses DEUX côtés
  // sont ouverts (_cotesOuverts ; une structure dans l'axe ouvre les deux) ; un nœud l'est si l'échantillon d'une
  // de ses arêtes, à lui ou voisin, l'est ; autour d'un nœud en chambre, les tubes s'arrêtent à la plus grande
  // demi-largeur + RECUL_CHAMBRE_M (sinon la paroi d'une branche fermerait l'entrée d'une autre) ; un tube trop
  // court sans joint devient chambre.
  function _chambres(noeuds, aretes, incid, S, sc) {
    const nc = noeuds.map(function () { return false; });
    const portee = SEUIL_CHAMBRE_M * sc + COTE_MARGE_M * sc;
    const ech = aretes.map(function (r) {
      const n = Math.max(1, Math.ceil(r.l / (PAS_CHAMBRE_M * sc))), brut = [], cotes = [];
      const loin = S.aucuneAutour(Math.min(r.ax, r.bx), Math.min(r.ay, r.by), Math.max(r.ax, r.bx),
        Math.max(r.ay, r.by), portee);
      for (let i = 0; i <= n; i++) {
        const x = r.ax + (r.bx - r.ax) * i / n, y = r.ay + (r.by - r.ay) * i / n;
        // Rien à moins de la portée des deux tests de côté : les deux fermés sans les faire.
        const c = !loin && S.pres(x, y, portee) ? _cotesOuverts(S, r, x, y, sc) : [false, false];
        cotes.push(c);
        brut.push(c[0] && c[1]);
      }
      return { n: n, brut: brut, cotes: cotes };
    });
    aretes.forEach(function (r, k) {
      const e = ech[k];
      if (e.brut[0]) nc[r.a] = true;
      if (e.brut[e.n]) nc[r.b] = true;
      if (e.n < 2) return;
      if (e.brut[1]) nc[r.a] = true;
      if (e.brut[e.n - 1]) nc[r.b] = true;
    });
    const demi = noeuds.map(function (n, v) {
      return incid[v].reduce(function (m, i) { return Math.max(m, aretes[i].w); }, 0) + RECUL_CHAMBRE_M * sc;
    });
    aretes.forEach(function (r, k) {
      const e = ech[k], s = e.brut.slice();
      s[0] = nc[r.a]; s[e.n] = nc[r.b];
      for (let i = 0; i <= e.n; i++) {
        const d = r.l * i / e.n;
        if ((nc[r.a] && d <= demi[r.a]) || (nc[r.b] && r.l - d <= demi[r.b])) s[i] = true;
      }
      // Tubes trop courts sans joint (entre deux chambres, ou chambre et bout libre) : ouverts.
      for (let i = 0; i <= e.n;) {
        if (s[i]) { i++; continue; }
        let j = i;
        while (j + 1 <= e.n && !s[j + 1]) j++;
        const joint = (i === 0 && incid[r.a].length >= 2) || (j === e.n && incid[r.b].length >= 2);
        const chambreAutour = i > 0 || j < e.n;
        if (chambreAutour && !joint && (j - i) / e.n * r.l < TUBE_MIN_M * sc) {
          for (let q = i; q <= j; q++) s[q] = true;
          if (i === 0) nc[r.a] = true;
          if (j === e.n) nc[r.b] = true;
        }
        i = j + 1;
      }
      e.s = s;
    });
    // Coupe entre un échantillon de chambre et un de tube : au seuil exact si la proximité brute change entre eux
    // (dichotomie), sinon sur l'échantillon de tube (recul, tube court : le tube est raccourci, jamais allongé).
    const coupe = function (r, e, iCh, iTu) {
      const tCh = iCh / e.n, tTu = iTu / e.n;
      if (!e.brut[iCh] || e.brut[iTu]) return tTu;
      let a = tCh, b = tTu;
      for (let k = 0; k < 6; k++) {
        const m = (a + b) / 2;
        const c = _cotesOuverts(S, r, r.ax + (r.bx - r.ax) * m, r.ay + (r.by - r.ay) * m, sc);
        if (c[0] && c[1]) a = m; else b = m;
      }
      return b;
    };
    aretes.forEach(function (r, k) {
      const e = ech[k], s = e.s, tubes = [];
      for (let i = 0; i <= e.n;) {
        if (s[i]) { i++; continue; }
        let j = i;
        while (j + 1 <= e.n && !s[j + 1]) j++;
        const t0 = i === 0 ? 0 : coupe(r, e, i - 1, i), t1 = j === e.n ? 1 : coupe(r, e, j + 1, j);
        if ((t1 - t0) * r.l > 1e-6 * sc) tubes.push([t0, t1, i > 0, j < e.n]);
        i = j + 1;
      }
      r.tubes = tubes;
      r.ech = { n: e.n, cotes: e.cotes };
    });
    return nc;
  }

  // Longueur (px) du pan de retour partant de (x, y) dans la direction (ux, uy) : jusqu'au premier bord de structure
  // du niveau (S.rayon : les bords que juge la règle du pas des structures, types perso compris, donc on bute là où
  // le pan s'arrête), ou null si aucun n'est à moins de RETOUR_MAX_M.
  // 🩸 Pas de ktaSegmentsBloquesParStructure ici : chaque appel relit la signature de toutes les structures ; des
  // milliers d'appels (pas de 10 cm, dichotomie) portaient le modèle d'un plan dense à 2 s sous émulation téléphone.
  function _retour(S, x, y, ux, uy, sc) {
    return S.rayon(x, y, ux, uy, RETOUR_MAX_M * sc);
  }

  // Morceau de tube u = [t0, t1, ouvertDebut, ouvertFin] de l'arête r découpé là où un côté s'ouvre ou se ferme →
  // { morceaux: [[ta, tb, ouvert+, ouvert−, ouvertDebut, ouvertFin]], retours: [[x0, y0, x1, y1, ta]] } (px).
  // ⚠️ contrat : un côté ouvert ne commence (ne finit) que là où un pan perpendiculaire de RETOUR_MAX_M au plus
  // touche la structure : le pan relie la paroi gardée à la structure, ni fente ni bout de paroi orphelin. Un
  // côté dont aucun pan ne touche la structure reste fermé. Au bout du morceau (chambre, nœud), pas de pan : le
  // tube s'y ouvre déjà ou le joint prend le relais.
  function _cotesDuTube(r, u, S, sc) {
    const n = r.ech.n, ux = (r.bx - r.ax) / r.l, uy = (r.by - r.ay) / r.l, nx = -uy, ny = ux;
    const pasT = RETOUR_PAS_M * sc / r.l, eps = 1e-9;
    const retours = [], intervalles = [[], []];
    [1, -1].forEach(function (sgn, c) {
      const ox = nx * sgn, oy = ny * sgn;
      const bord = function (t) { return [r.ax + (r.bx - r.ax) * t + ox * r.w, r.ay + (r.by - r.ay) * t + oy * r.w]; };
      const touche = function (t) { const p = bord(t); return _retour(S, p[0], p[1], ox, oy, sc); };
      for (let i = 0; i <= n;) {
        const ti = i / n;
        if (!r.ech.cotes[i][c] || ti < u[0] - 0.5 / n || ti > u[1] + 0.5 / n) { i++; continue; }
        let j = i;
        while (j + 1 <= n && r.ech.cotes[j + 1][c] && (j + 1) / n <= u[1] + 0.5 / n) j++;
        let ta = Math.max(u[0], (i - 0.5) / n), tb = Math.min(u[1], (j + 0.5) / n);
        i = j + 1;
        let la = null, lb = null;
        if (ta > u[0] + eps) {
          for (; ta < tb; ta += pasT) { la = touche(ta); if (la !== null) break; }
          if (la === null) continue;
        }
        if (tb < u[1] - eps) {
          for (; tb > ta; tb -= pasT) { lb = touche(tb); if (lb !== null) break; }
          if (lb === null) continue;
        }
        if (tb - ta < eps) continue;
        [[ta, la], [tb, lb]].forEach(function (q) {
          if (q[1] === null) return;
          const p = bord(q[0]);
          retours.push([p[0], p[1], p[0] + ox * q[1], p[1] + oy * q[1], q[0]]);
        });
        intervalles[c].push([ta, tb]);
      }
    });
    const coupes = [u[0], u[1]];
    intervalles.forEach(function (l) { l.forEach(function (iv) { coupes.push(iv[0], iv[1]); }); });
    coupes.sort(function (a, b) { return a - b; });
    const dans = function (l, t) { return l.some(function (iv) { return t > iv[0] && t < iv[1]; }); };
    const morceaux = [];
    for (let k = 0; k + 1 < coupes.length; k++) {
      const ta = coupes[k], tb = coupes[k + 1];
      if ((tb - ta) * r.l < 1e-3 * sc) continue;
      const tm = (ta + tb) / 2;
      morceaux.push([ta, tb, dans(intervalles[0], tm), dans(intervalles[1], tm),
        ta <= u[0] + eps && u[2], tb >= u[1] - eps && u[3]]);
    }
    return { morceaux: morceaux, retours: retours };
  }

  // Bords ouverts d'une pièce : ceux dont le milieu est l'un des points `milieux` (px) → indices dans p.ouverts.
  function _marquerOuverts(p, milieux) {
    if (!milieux.length) return;
    p.ouverts = p.ouverts || [];
    for (let k = 0; k < p.pts.length; k++) {
      const a = p.pts[k], b = p.pts[(k + 1) % p.pts.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (milieux.some(function (c) { return Math.hypot(c[0] - mx, c[1] - my) < 1e-3; })) p.ouverts.push(k);
    }
  }

  // ── Passages entre niveaux ───────────────────────────────────────────────────────────────────────

  // Deux pièces convexes de sens positif se recouvrent-elles de plus de `tol` px (axes séparateurs) ?
  function _chevauche(P, Q, tol) {
    if (P.x1 <= Q.x0 + tol || Q.x1 <= P.x0 + tol || P.y1 <= Q.y0 + tol || Q.y1 <= P.y0 + tol) return false;
    const separe = function (A, B) {
      for (let i = 0, j = A.length - 1; i < A.length; j = i++) {
        const ex = A[i][0] - A[j][0], ey = A[i][1] - A[j][1], l = Math.hypot(ex, ey);
        if (l < 1e-9) continue;
        // Intérieur à gauche du bord : B tout entier à sa droite (à `tol` près) = séparés.
        let max = -Infinity;
        for (let k = 0; k < B.length; k++) {
          max = Math.max(max, (ex * (B[k][1] - A[j][1]) - ey * (B[k][0] - A[j][0])) / l);
        }
        if (max <= tol) return true;
      }
      return false;
    };
    return !separe(P.pts, Q.pts) && !separe(Q.pts, P.pts);
  }

  // Emprises (px, rectangles) des volumes de passage du niveau, cadre doré compris.
  // ⚠️ contrat : mêmes règles que vue3d.js > _volumesDuNiveau (quels POI ont un volume, à quelle place, quelle
  // forme, alignée sur quel axe) ; filtres de la carte ignorés (masquer ne retire que le dessin, comme la règle du
  // pas). POI jonction : à son raccord validé sur un autre de ses niveaux ; jes / jpe / jps seulement s'ils relient
  // un autre niveau ; puits de surface (peo, eso) et aération (pa) toujours. Tracé jonction qui part de ce niveau
  // ou y arrive (plan multi-niveau) : un rectangle par segment, de la largeur de sa tranchée.
  function _emprisesPassages(niveau, sc, plusProche, aretes) {
    const J = window.KtaPoiJonction, out = [];
    if (!J || typeof J.porteNiveaux !== "function") return out;
    const surface = J.TAGS_SURFACE_NIVEAUX || [], bord = PASSAGE.marge + PASSAGE.cadre;
    const multi = niveau !== null && niveau !== undefined;
    _points().forEach(function (p) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const tag = (Array.isArray(p.tags) && p.tags[0]) || "default";
      if (!J.porteNiveaux(tag)) return;
      const jonction = multi && J.estJonction(p);
      let x = p.x, y = p.y;
      if (!_surNiveau(p, niveau)) {
        if (!jonction || J.niveaux(p).indexOf(niveau) < 0) return;
        const a = J.accroches(p).filter(function (q) { return q.level === niveau; })[0];
        if (a) { x = a.x; y = a.y; }
      }
      const moyen = J.moyen(tag);
      const autres = jonction ? J.niveaux(p).filter(function (n) { return n !== niveau; }).length : 0;
      if (moyen && surface.indexOf(tag) < 0 && !autres) return;
      const dim = moyen === "escalier" ? PASSAGE.escalier
        : moyen ? [PASSAGE.puits, PASSAGE.puits] : [PASSAGE.aeration, PASSAGE.aeration];
      const a = (dim[0] / 2 + bord) * sc, b = (dim[1] / 2 + bord) * sc;
      const pp = plusProche(x, y, DIR_PASSAGE_M * sc), r = pp ? aretes[pp.arete] : null;
      const ang = r ? Math.atan2(r.by - r.ay, r.bx - r.ax) : 0, ux = Math.cos(ang), uy = Math.sin(ang);
      const Q = function (s, t) { return [x + ux * s - uy * t, y + uy * s + ux * t]; };
      out.push([Q(-a, -b), Q(a, -b), Q(a, b), Q(-a, b)]);
    });
    if (!multi) return out;
    const w = (PASSAGE.rampe / 2 + PASSAGE.tranchee) * sc;
    _routes().forEach(function (r) {
      if (!r || r.type !== "jonction" || !Array.isArray(r.points)) return;
      if (!Number.isInteger(r.fromLevel) || !Number.isInteger(r.toLevel) || r.fromLevel === r.toLevel) return;
      if (r.fromLevel !== niveau && r.toLevel !== niveau) return;
      const pts = r.points.filter(function (q) { return q && Number.isFinite(q.x) && Number.isFinite(q.y); });
      for (let i = 0; i + 1 < pts.length; i++) {
        const A = pts[i], B = pts[i + 1], l = Math.hypot(B.x - A.x, B.y - A.y);
        if (l < 1e-9) continue;
        const nx = -(B.y - A.y) / l * w, ny = (B.x - A.x) / l * w;
        out.push([[A.x - nx, A.y - ny], [B.x - nx, B.y - ny], [B.x + nx, B.y + ny], [A.x + nx, A.y + ny]]);
      }
    });
    return out;
  }

  // ── Construction du modèle ───────────────────────────────────────────────────────────────────────

  function _construire(niveau, sc, mixte) {
    const fusion = FUSION_M * sc, noeuds = [], gN = new Grille(CASE_M * sc);
    const noeud = function (x, y) {
      const l = gN.pres(x - fusion, y - fusion, x + fusion, y + fusion);
      for (let i = 0; i < l.length; i++) {
        const n = noeuds[l[i]];
        if (Math.hypot(n.x - x, n.y - y) <= fusion) return l[i];
      }
      noeuds.push({ x: x, y: y });
      gN.poser(noeuds.length - 1, x, y, x, y);
      return noeuds.length - 1;
    };
    // 1. Tronçons bruts.
    const segs = [];
    _routes().forEach(function (r) {
      if (!r || !Array.isArray(r.points) || r.points.length < 2 || !_surNiveau(r, niveau)) return;
      const l = largeur(r.type);
      if (!l) return;
      let prec = null;
      for (let i = 0; i < r.points.length; i++) {
        const p = r.points[i];
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        const n = noeud(p.x, p.y);
        if (prec !== null && prec !== n) segs.push({ a: prec, b: n, w: l * sc / 2, type: r.type, coupes: [] });
        prec = n;
      }
    });
    const gS = new Grille(CASE_M * sc);
    const poserSeg = function (i) {
      const s = segs[i], a = noeuds[s.a], b = noeuds[s.b];
      gS.poser(i, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
    };
    for (let i = 0; i < segs.length; i++) poserSeg(i);
    // 2. Croisements : un nœud au point de croisement, les deux tronçons y seront coupés.
    const nSegs = segs.length;
    for (let i = 0; i < nSegs; i++) {
      const s = segs[i], a = noeuds[s.a], b = noeuds[s.b];
      const cand = gS.pres(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
      for (let c = 0; c < cand.length; c++) {
        const j = cand[c];
        if (j <= i) continue;
        const u = segs[j];
        if (u.a === s.a || u.a === s.b || u.b === s.a || u.b === s.b) continue;
        const p = noeuds[u.a], q = noeuds[u.b];
        const d = (b.x - a.x) * (q.y - p.y) - (b.y - a.y) * (q.x - p.x);
        if (Math.abs(d) < 1e-9) continue;
        const t = ((p.x - a.x) * (q.y - p.y) - (p.y - a.y) * (q.x - p.x)) / d;
        const v = ((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / d;
        if (t < 0 || t > 1 || v < 0 || v > 1) continue;
        const n = noeud(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y));
        if (n !== s.a && n !== s.b) s.coupes.push(n);
        if (n !== u.a && n !== u.b) u.coupes.push(n);
      }
    }
    // 3. Bouts libres raccordés au tracé voisin (dessin imprécis : arrêté juste avant ou après la paroi).
    const degre = new Array(noeuds.length).fill(0);
    segs.forEach(function (s) { degre[s.a]++; degre[s.b]++; s.coupes.forEach(function (n) { degre[n] += 2; }); });
    const ajouts = [];
    for (let i = 0; i < nSegs; i++) {
      const s = segs[i];
      [s.a, s.b].forEach(function (e) {
        if (degre[e] !== 1) return;
        const E = noeuds[e], marge = ACCROCHE_M * sc + 1.5 * sc;
        let best = null;
        gS.pres(E.x - marge, E.y - marge, E.x + marge, E.y + marge).forEach(function (j) {
          const u = segs[j];
          if (j === i || u.a === e || u.b === e) return;
          const p = noeuds[u.a], q = noeuds[u.b], dx = q.x - p.x, dy = q.y - p.y, l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, ((E.x - p.x) * dx + (E.y - p.y) * dy) / l2)) : 0;
          const x = p.x + t * dx, y = p.y + t * dy, d = Math.hypot(E.x - x, E.y - y);
          if (d <= u.w + ACCROCHE_M * sc && (!best || d < best.d)) best = { d: d, j: j, x: x, y: y };
        });
        if (!best) return;
        const n = noeud(best.x, best.y), u = segs[best.j];
        if (n === e) return;
        if (n !== u.a && n !== u.b) u.coupes.push(n);
        degre[e]++;
        ajouts.push({ a: e, b: n, w: s.w, type: s.type, coupes: [] });
      });
    }
    // 4. Arêtes finales : chaque tronçon coupé à ses nœuds intérieurs, doublons fusionnés (plus large gardée).
    const aretes = [], vues = new Map();
    segs.concat(ajouts).forEach(function (s) {
      const a = noeuds[s.a], b = noeuds[s.b], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const chaine = [s.a].concat(s.coupes.filter(function (n, k, t) { return t.indexOf(n) === k; })
        .sort(function (m, n) {
          const P = noeuds[m], Q = noeuds[n];
          return ((P.x - a.x) * dx + (P.y - a.y) * dy) / l2 - ((Q.x - a.x) * dx + (Q.y - a.y) * dy) / l2;
        }), [s.b]);
      for (let k = 0; k + 1 < chaine.length; k++) {
        const m = chaine[k], n = chaine[k + 1];
        if (m === n) continue;
        const cle = Math.min(m, n) + "," + Math.max(m, n);
        const deja = vues.get(cle);
        if (deja !== undefined) {
          if (s.w > aretes[deja].w) { aretes[deja].w = s.w; aretes[deja].type = s.type; }
          continue;
        }
        vues.set(cle, aretes.length);
        aretes.push({ a: m, b: n, w: s.w, type: s.type });
      }
    });
    const incid = noeuds.map(function () { return []; }), gA = new Grille(CASE_M * sc);
    aretes.forEach(function (r, i) {
      const A = noeuds[r.a], B = noeuds[r.b];
      r.ax = A.x; r.ay = A.y; r.bx = B.x; r.by = B.y; r.l = Math.hypot(B.x - A.x, B.y - A.y);
      incid[r.a].push(i); incid[r.b].push(i);
      gA.poser(i, Math.min(r.ax, r.bx) - r.w, Math.min(r.ay, r.by) - r.w, Math.max(r.ax, r.bx) + r.w,
        Math.max(r.ay, r.by) + r.w);
    });
    // Axe le plus proche à moins de `rayon` px → { d, x, y (projection), w, arete, t } | null.
    const plusProche = function (x, y, rayon) {
      let best = null;
      gA.pres(x - rayon, y - rayon, x + rayon, y + rayon).forEach(function (i) {
        const r = aretes[i], dx = r.bx - r.ax, dy = r.by - r.ay, l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((x - r.ax) * dx + (y - r.ay) * dy) / l2)) : 0;
        const px = r.ax + t * dx, py = r.ay + t * dy, d = Math.hypot(x - px, y - py);
        if (d <= rayon && (!best || d < best.d)) best = { d: d, x: px, y: py, w: r.w, arete: i, t: t };
      });
      return best;
    };
    // 5. Pièces : rectangle par arête (par morceau de tube en mixte), joint (triangles en éventail autour du nœud)
    // par nœud de degré ≥ 2 (hors chambre). Bout ouvert d'un tube : son bord est noté dans `ouverts` (pas de paroi).
    const S = mixte ? _indexStructures(niveau, sc) : null;
    const nc = S ? _chambres(noeuds, aretes, incid, S, sc) : null;
    const pieces = [], retours = [];
    let cotesOuverts = 0;
    aretes.forEach(function (r, i) {
      if (r.l < 1e-9) return;
      const nx = -(r.by - r.ay) / r.l * r.w, ny = (r.bx - r.ax) / r.l * r.w;
      // Mixte : chaque morceau de tube recoupé là où un côté s'ouvre (_cotesDuTube) ; côtés aux nœuds pour le joint.
      (r.tubes || [[0, 1, false, false]]).forEach(function (u) {
        const dec = r.ech ? _cotesDuTube(r, u, S, sc)
          : { morceaux: [[u[0], u[1], false, false, u[2], u[3]]], retours: [] };
        const premiere = pieces.length;
        dec.morceaux.forEach(function (q) {
          const ax = r.ax + (r.bx - r.ax) * q[0], ay = r.ay + (r.by - r.ay) * q[0];
          const bx = r.ax + (r.bx - r.ax) * q[1], by = r.ay + (r.by - r.ay) * q[1];
          const p = _piece([[ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny], [ax + nx, ay + ny]], r.type,
            "tube");
          p.arete = i;
          p.t0 = q[0]; p.t1 = q[1];
          const mx = (ax + bx) / 2, my = (ay + by) / 2, ouv = [];
          if (q[4]) ouv.push([ax, ay]);
          if (q[5]) ouv.push([bx, by]);
          if (q[2]) ouv.push([mx + nx, my + ny]);
          if (q[3]) ouv.push([mx - nx, my - ny]);
          cotesOuverts += (q[2] ? 1 : 0) + (q[3] ? 1 : 0);
          _marquerOuverts(p, ouv);
          if (q[0] <= 1e-9) r.cotesA = [q[2], q[3]];
          if (q[1] >= 1 - 1e-9) r.cotesB = [q[2], q[3]];
          pieces.push(p);
        });
        // Pans de retour : dessinés avec le morceau qui les touche (paroisDe), jugés aussi seuls (paroisBloquent).
        dec.retours.forEach(function (w) {
          let k = premiere;
          while (k + 1 < pieces.length && pieces[k].t1 < w[4] - 1e-9) k++;
          const P = pieces[k];
          if (!P) return;
          (P.retours = P.retours || []).push([w[0], w[1], w[2], w[3]]);
          retours.push([w[0], w[1], w[2], w[3]]);
        });
      });
    });
    // Longueur de tube contre le nœud v (mixte : le morceau qui le touche) : borne la dalle du joint.
    const longueurAu = function (r, v) {
      if (!r.tubes) return r.l;
      const u = r.a === v ? r.tubes[0] : r.tubes[r.tubes.length - 1];
      return u ? (u[1] - u[0]) * r.l : 0;
    };
    let dalles = 0, coudes = 0, bouts = 0;
    for (let v = 0; v < noeuds.length; v++) {
      const k = incid[v].length;
      if (k === 1 && !(nc && nc[v])) bouts++;
      if (k < 2 || (nc && nc[v])) continue;
      const J = _joint(noeuds[v], incid[v].map(function (i) {
        return nc ? Object.assign({}, aretes[i], { lTube: longueurAu(aretes[i], v) }) : aretes[i];
      }), v, sc);
      if (!J.tri.length) continue;
      if (k >= 3) dalles++; else coudes++;
      const larges = incid[v].map(function (i) { return aretes[i]; }).sort(function (p, q) { return q.w - p.w; });
      J.tri.forEach(function (t, n) {
        const p = _piece(t, larges[0].type, k >= 3 ? "dalle" : "coude");
        p.noeud = v;
        if (J.ouvert[n]) _marquerOuverts(p, [[(t[1][0] + t[2][0]) / 2, (t[1][1] + t[2][1]) / 2]]);
        pieces.push(p);
      });
    }
    // 6. Passages entre niveaux : l'emprise d'un volume qui chevauche un tube devient une pièce. L'emprise étant
    // l'union des pièces, aucune paroi de tube ne reste dans le volume (bout de tube, paroi qui longe ou coupe la
    // bouche) ; ses bords hors des tubes sont des parois : le tube s'ouvre sur une niche autour de la bouche.
    // Une emprise qui ne touche aucun tube n'ajoute rien (pas de boîte murée autour d'un passage isolé).
    let passages = 0;
    _emprisesPassages(niveau, sc, plusProche, aretes).forEach(function (pts) {
      const P = _piece(pts, null, "passage");
      for (let i = 0; i < pieces.length; i++) {
        if (pieces[i].genre === "passage" || !_chevauche(P, pieces[i], 1e-3 * sc)) continue;
        P.type = pieces[i].type;
        pieces.push(P);
        passages++;
        return;
      }
    });
    const gP = new Grille(CASE_M * sc);
    pieces.forEach(function (p, i) { gP.poser(i, p.x0, p.y0, p.x1, p.y1); });
    const gW = new Grille(CASE_M * sc);
    retours.forEach(function (w, i) {
      gW.poser(i, Math.min(w[0], w[2]), Math.min(w[1], w[3]), Math.max(w[0], w[2]), Math.max(w[1], w[3]));
    });
    // Remblais du niveau : ils bouchent la galerie (règle du pas).
    const remblais = [], gR = new Grille(CASE_M * sc);
    _zones().forEach(function (z) {
      if (!z || z.type !== "remblais" || !Array.isArray(z.points) || z.points.length < 3) return;
      if (!_surNiveau(z, niveau)) return;
      const a = z.points.filter(function (p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); });
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      a.forEach(function (p) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      });
      remblais.push(a);
      gR.poser(remblais.length - 1, x0, y0, x1, y1);
    });
    const m = {
      niveau: niveau, sc: sc, mixte: !!mixte, noeuds: noeuds, aretes: aretes, pieces: pieces,
      degres: incid.map(function (l) { return l.length; }),
      dalles: dalles, coudes: coudes, bouts: bouts, passages: passages,
      chambres: nc ? nc.filter(Boolean).length : 0,
      ouverts: pieces.reduce(function (n, p) { return n + (p.ouverts ? p.ouverts.length : 0); }, 0),
      // Mixte : bords de tube ouverts d'un seul côté, et pans de retour [[x0, y0, x1, y1]] (px) qui les bornent.
      cotesOuverts: cotesOuverts, retours: retours,
      retoursPres: function (x0, y0, x1, y1) { return gW.pres(x0, y0, x1, y1).map(function (i) { return retours[i]; }); },
      // Mixte : une structure du niveau est à moins de SEUIL_CHAMBRE_M (chambre) ? Toujours faux sinon.
      enChambre: function (x, y) { return !!S && S.proche(x, y); },
      // Mixte : le point t (0 → 1, de a vers b) de l'arête i est-il dans un morceau de tube ? Toujours vrai sinon.
      tubeAu: function (i, t) {
        const r = aretes[i];
        return !r || !r.tubes || r.tubes.some(function (u) { return t >= u[0] - 1e-9 && t <= u[1] + 1e-9; });
      },
      // Parois de la pièce i → [[x0, y0, x1, y1]] (px), calculées une fois (_parois), pans de retour compris.
      paroisDe: function (i) {
        const c = m._parois || (m._parois = new Map());
        let l = c.get(i);
        if (!l) { l = _parois(m, i).concat(pieces[i].retours || []); c.set(i, l); }
        return l;
      },
      piecesPres: function (x0, y0, x1, y1) { return gP.pres(x0, y0, x1, y1); },
      aretesPres: function (x0, y0, x1, y1) { return gA.pres(x0, y0, x1, y1); },
      dedans: function (x, y) {
        const l = gP.case(x, y);
        for (let i = 0; i < l.length; i++) { if (dansPiece(pieces[l[i]], x, y, 1e-6)) return true; }
        return false;
      },
      enRemblais: function (x, y) {
        const l = gR.case(x, y);
        for (let i = 0; i < l.length; i++) { if (_dansAnneau(remblais[l[i]], x, y)) return true; }
        return false;
      },
      remblaisPres: function (x0, y0, x1, y1) { return gR.pres(x0, y0, x1, y1).length > 0; },
      plusProche: plusProche
    };
    return m;
  }

  // Bords visibles de la pièce i (px) → [[x0, y0, x1, y1]]. Chaque bord est coupé là où il croise une pièce voisine
  // (ou longe un de ses bords) ; un morceau est une paroi si le point juste à l'extérieur, en son milieu, n'est dans
  // aucune autre pièce. Un bord ouvert (bout de tube qui débouche dans une chambre) n'en donne aucune.
  // ⚠️ contrat : l'emprise est l'union des pièces, d'où aucune paroi qui en traverse une autre ; la 3D dessine ces
  // parois (vue3d.js > _construireTuileGalerie) et le mode mixte bute contre elles (paroisBloquent) : une seule source.
  function _parois(m, i) {
    const P = m.pieces[i], pts = P.pts, eps = 0.004 * m.sc, out = [];
    const vois = m.piecesPres(P.x0 - eps, P.y0 - eps, P.x1 + eps, P.y1 + eps).filter(function (j) { return j !== i; });
    for (let k = 0; k < pts.length; k++) {
      if (P.ouverts && P.ouverts.indexOf(k) >= 0) continue;
      const p = pts[k], q = pts[(k + 1) % pts.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
      if (l < 1e-9) continue;
      const ts = [0, 1];
      for (let v = 0; v < vois.length; v++) {
        const Q = m.pieces[vois[v]].pts;
        for (let a = 0; a < Q.length; a++) {
          const r = Q[a], s = Q[(a + 1) % Q.length], ex = s[0] - r[0], ey = s[1] - r[1];
          const rx = r[0] - p[0], ry = r[1] - p[1], d = dx * ey - dy * ex;
          if (Math.abs(d) > 1e-9 * l * Math.hypot(ex, ey)) {
            const t = (rx * ey - ry * ex) / d, u = (rx * dy - ry * dx) / d;
            if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
          } else if (Math.abs(rx * dy - ry * dx) / l < eps) {
            // Bords alignés : les bouts de l'autre bord coupent celui-ci.
            [r, s].forEach(function (z) {
              const t = ((z[0] - p[0]) * dx + (z[1] - p[1]) * dy) / (l * l);
              if (t > 0 && t < 1) ts.push(t);
            });
          }
        }
      }
      ts.sort(function (a, b) { return a - b; });
      const ox = dy / l * eps, oy = -dx / l * eps;   // vers l'extérieur (pièce de sens positif : intérieur à gauche)
      let deb = null, fin = null;
      const morceau = function (a, b) { return [p[0] + dx * a, p[1] + dy * a, p[0] + dx * b, p[1] + dy * b]; };
      for (let n = 0; n + 1 < ts.length; n++) {
        const t0 = ts[n], t1 = ts[n + 1];
        if ((t1 - t0) * l < 1e-6) continue;
        const tm = (t0 + t1) / 2, x = p[0] + dx * tm + ox, y = p[1] + dy * tm + oy;
        let couvert = false;
        for (let v = 0; v < vois.length && !couvert; v++) couvert = dansPiece(m.pieces[vois[v]], x, y, 0);
        if (!couvert) { if (deb === null) deb = t0; fin = t1; continue; }
        if (deb !== null) { out.push(morceau(deb, fin)); deb = null; }
      }
      if (deb !== null) out.push(morceau(deb, fin));
    }
    return out;
  }

  // Joint d'un nœud (px) → triangles convexes de sens positif autour de lui. Arêtes triées par angle ; entre deux
  // voisines : ouverture < 180° → coins au point où leurs parois se coupent (coupe reculée d'autant, bornée) ;
  // ouverture ≥ 180° → coins au nœud, plus la pointe d'onglet si elle reste à ONGLET_MAX demi-largeurs.
  // Les parois entre deux branches relient leurs coins (dalle) : elles ne traversent aucun tube voisin.
  // Mixte : le bord du joint entre deux branches est ouvert (sans paroi) si le côté de l'une d'elles qui le borde
  // est ouvert au nœud (r.cotesA / r.cotesB, _cotesDuTube) → { tri, ouvert: [bool] (bord extérieur, tri[n][1] →
  // tri[n][2]) }.
  function _joint(V, aretes, v, sc) {
    const br = aretes.map(function (r) {
      const sens = r.a === v ? 1 : -1;
      const dx = (r.bx - r.ax) * sens, dy = (r.by - r.ay) * sens, l = r.l || 1;
      // lTube (mixte) : longueur du morceau de tube contre le nœud, qui borne la dalle ; la direction reste l'arête.
      const lb = r.lTube !== undefined ? r.lTube : l;
      // Coin `cote` +1 = côté + de l'arête quand elle part du nœud, côté − quand elle y arrive.
      const c = (sens === 1 ? r.cotesA : r.cotesB) || [false, false];
      const ouv = sens === 1 ? { "1": c[0], "-1": c[1] } : { "1": c[1], "-1": c[0] };
      return { ux: dx / l, uy: dy / l, w: r.w, l: lb, ang: Math.atan2(dy, dx), recul: 0, ouv: ouv };
    }).sort(function (p, q) { return p.ang - q.ang; });
    const k = br.length, ouv = [];
    for (let i = 0; i < k; i++) {
      const p = br[i], q = br[(i + 1) % k];
      let a = q.ang - p.ang;
      if (i === k - 1) a += 2 * Math.PI;
      ouv.push(a);
      if (a < Math.PI - 1e-3 && a > 1e-6) {
        const s = Math.sin(a), c = Math.cos(a);
        p.recul = Math.max(p.recul, (q.w + p.w * c) / s);
        q.recul = Math.max(q.recul, (p.w + q.w * c) / s);
      }
    }
    br.forEach(function (b) { b.d = Math.max(0, Math.min(b.recul, DALLE_MAX_M * sc, b.l / 2)); });
    const coin = function (b, d, cote) {   // cote +1 = côté de la branche suivante (angle croissant)
      return [V.x + d * b.ux - cote * b.w * b.uy, V.y + d * b.uy + cote * b.w * b.ux];
    };
    const pts = [], tags = [];   // tags : [branche, cote] d'un coin, null pour une pointe d'onglet
    for (let i = 0; i < k; i++) {
      const b = br[i], avant = ouv[(i - 1 + k) % k], apres = ouv[i], q = br[(i + 1) % k];
      pts.push(coin(b, avant < Math.PI - 1e-3 ? b.d : 0, -1)); tags.push([b, -1]);
      pts.push(coin(b, apres < Math.PI - 1e-3 ? b.d : 0, 1)); tags.push([b, 1]);
      if (apres >= Math.PI - 1e-3) {
        // Pointe d'onglet : intersection des parois prolongées en arrière du nœud.
        const P = coin(b, 0, 1), Q = coin(q, 0, -1);
        const det = b.ux * (-q.uy) - b.uy * (-q.ux);
        if (Math.abs(det) > 1e-9) {
          const rx = Q[0] - P[0], ry = Q[1] - P[1];
          const s = (rx * (-q.uy) - ry * (-q.ux)) / det, t = (b.ux * ry - b.uy * rx) / det;
          const M = [P[0] + s * b.ux, P[1] + s * b.uy];
          const loin = Math.hypot(M[0] - V.x, M[1] - V.y) > ONGLET_MAX * Math.max(b.w, q.w);
          if (s <= 1e-6 && t <= 1e-6 && !loin) { pts.push(M); tags.push(null); }
        }
      }
    }
    const tri = [], ouvert = [], c = [V.x, V.y], seuil = 1e-4 * sc * sc;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length, p = pts[i], q = pts[j];
      const t = [c, p, q];
      if (_aire(t) <= seuil) continue;
      tri.push([[c[0], c[1]], [p[0], p[1]], [q[0], q[1]]]);
      ouvert.push(!!((tags[i] && tags[i][1] === 1 && tags[i][0].ouv["1"]) ||
        (tags[j] && tags[j][1] === -1 && tags[j][0].ouv["-1"])));
    }
    return { tri: tri, ouvert: ouvert };
  }

  // ── API ──────────────────────────────────────────────────────────────────────────────────────────

  // mixte : modèle du mode mixte (tubes seulement loin des structures), gardé à part de celui du mode galerie.
  function modele(niveau, mixte) {
    const sc = _echelle();
    if (!sc) return null;
    const n = Number.isInteger(niveau) ? niveau : null, cle = n + (mixte ? "|m" : "");
    const sig = _signature(), c = _cache.get(cle);
    if (c && c.sig === sig) return c.modele;
    const t0 = performance.now();
    const m = _construire(n, sc, !!mixte);
    m.msConstruction = performance.now() - t0;
    _cache.set(cle, { sig: sig, modele: m });
    return m;
  }

  function dedans(x, y, niveau) {
    const m = modele(niveau);
    return !!m && m.dedans(x, y) && !m.enRemblais(x, y);
  }

  // Segments [x0, y0, x1, y1] (px) → true si une partie sort de l'emprise ou entre dans un remblais. Niveau sans
  // galerie : rien n'arrête (true partout figerait la vue dans le vide).
  function segmentsBloques(segs, niveau) {
    const m = modele(niveau);
    if (!m || !m.pieces.length) return segs.map(function () { return false; });
    const pas = PAS_M * m.sc;
    return segs.map(function (s) {
      const l = Math.hypot(s[2] - s[0], s[3] - s[1]), n = Math.max(1, Math.ceil(l / pas));
      for (let i = 0; i <= n; i++) {
        const x = s[0] + (s[2] - s[0]) * i / n, y = s[1] + (s[3] - s[1]) * i / n;
        if (!m.dedans(x, y) || m.enRemblais(x, y)) return true;
      }
      return false;
    });
  }

  // Mode mixte : segments [x0, y0, x1, y1] (px) → true s'il coupe ou touche une paroi dessinée (bouts ouverts
  // exclus : on entre dans une chambre par là) ou s'il entre dans un remblais à l'intérieur d'un tube. Dans une
  // chambre, rien ici n'arrête : les structures y bloquent par la règle du tracker (vue3d.js > _juger).
  function paroisBloquent(segs, niveau) {
    const m = modele(niveau, true);
    if (!m || !m.pieces.length) return segs.map(function () { return false; });
    const pas = PAS_M * m.sc, e = 1e-9;
    return segs.map(function (s) {
      const x0 = Math.min(s[0], s[2]), x1 = Math.max(s[0], s[2]), y0 = Math.min(s[1], s[3]), y1 = Math.max(s[1], s[3]);
      const dx = s[2] - s[0], dy = s[3] - s[1], ps = m.piecesPres(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
      const coupe = function (p) {
        const ex = p[2] - p[0], ey = p[3] - p[1], d = dx * ey - dy * ex;
        if (Math.abs(d) < 1e-12) return false;
        const rx = p[0] - s[0], ry = p[1] - s[1], t = (rx * ey - ry * ex) / d, u = (rx * dy - ry * dx) / d;
        return t >= -e && t <= 1 + e && u >= -e && u <= 1 + e;
      };
      for (let k = 0; k < ps.length; k++) { if (m.paroisDe(ps[k]).some(coupe)) return true; }
      // Pans de retour : ils sortent de l'emprise de leur pièce (jusqu'à la structure), cherchés à part.
      if (m.retoursPres(x0 - 1, y0 - 1, x1 + 1, y1 + 1).some(coupe)) return true;
      if (!m.remblaisPres(x0, y0, x1, y1)) return false;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / pas));
      for (let i = 0; i <= n; i++) {
        const x = s[0] + dx * i / n, y = s[1] + dy * i / n;
        if (m.dedans(x, y) && m.enRemblais(x, y)) return true;
      }
      return false;
    });
  }

  window.KtaGalerie = {
    SEUIL_CHAMBRE_M: SEUIL_CHAMBRE_M, paroisBloquent: paroisBloquent, PASSAGE: PASSAGE,
    LARGEURS: Object.assign({}, LARGEURS), LARGEUR_PERSO: LARGEUR_PERSO,
    largeur: largeur, modele: modele, dedans: dedans, segmentsBloques: segmentsBloques, invalider: invalider,
    dansPiece: dansPiece
  };
})();
