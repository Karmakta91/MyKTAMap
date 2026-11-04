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
//   SEUIL_CHAMBRE_M, PASSAGE (dimensions des volumes de passage ; leur emprise est une pièce : _emprisesPassages),
//   PROCHE_M, versGalerie(x, y, niveau) (où poser un tracker recalé : tracking.js > _positionDansGalerie),
//   placePassage(p, niveau, rendu) (place, axe et côté d'entrée du volume de passage d'un POI en 3D : _placeVolume),
//   zonesBloquent(segs, niveau, depart, rendu), dansZone(x, y, niveau, rendu) (zones qui bouchent, ZONES_BOUCHENT, et
//   obstacles des accès de surface, BLOQUE, dans les 3 rendus), ACCES / ACCES_DIM (accès sans passage : formes et
//   dimensions des volumes), comblementPorte(x, y, ang, w, niveau, rendu) (pierre de taille d'un cavage).
// Modèle MIXTE (vue 3D par défaut) : chaque côté du tube est jugé à part ; une structure du niveau (intégrée ou
// perso) proche d'un côté ouvre CE côté (la paroi d'en face reste), un pan de retour relie la paroi gardée à la
// structure ; proche des deux côtés, le tracé traverse une CHAMBRE, sans parois. Un tube qui débouche dans une
// chambre s'y arrête sur un bout OUVERT (aucune paroi de fond) ; un tube plus court que TUBE_MIN_M entre deux
// chambres est ouvert aussi (pas de paroi orpheline). Règle du pas : on bute contre les parois dessinées et les
// pans de retour (paroisBloquent) et contre les structures (règle du tracker).
// Modèle : graphe plan des tracés (sommets confondus à 15 cm, croisements coupés, bout libre raccordé au tracé
// voisin s'il s'arrête à moins de 0,5 m de sa paroi) ; une PIÈCE convexe par tronçon (rectangle de sa largeur,
// d'un nœud à l'autre) et, à chaque nœud de degré ≥ 2, les triangles d'un joint : coude en onglet (borné à deux
// demi-largeurs, biseau au-delà) ou dalle de carrefour (degré ≥ 3) dont les parois relient les coins des tubes.
// ⚠️ contrat : l'emprise est l'UNION des pièces ; une paroi est un bord de pièce qui n'est dans aucune autre, d'où
// des tubes coupés au bord de la dalle et aucune paroi qui en traverse une autre, même pour des tracés presque
// parallèles qui se chevauchent. Règle du pas en mode galerie (vue 3D) : rester dans l'emprise (à moins d'une
// demi-largeur d'un tracé ou dans un joint). Dans les trois rendus, un remblais, un effondrement ou une zone
// inaccessible du niveau arrête aussi, comme le cône d'un puits comblé ou un cavage fermé (zonesBloquent).
// ⚠️ contrat : ces zones et obstacles ne bouchent que la vue 3D ; versGalerie
// (recalage du tracker) ne lit que l'emprise, l'itinéraire et le tracker ne passent pas par ici.
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
  // Zone inaccessible : obstacle de la 3D comme le remblais (décision produit, réversible ici seul : son rendu, hachures
  // au sol et rideau, ne dépend pas de ce choix).
  const INACCESSIBLE_BOUCHE = true;
  // Zones qui arrêtent la règle du pas de la vue 3D, dans les trois rendus (zonesBloquent, dedans, segmentsBloques) ;
  // jamais la 2D (carte, tracker, itinéraire, recalage).
  const ZONES_BOUCHENT = { remblais: true, effondrement: true, inaccessible: INACCESSIBLE_BOUCHE };
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
  // (jes, eso) 2,5 de volée × 1,5, puits carré (jpe, jps, peo) 1,2, aération (pa) 0,8 ; cadre doré au
  // sol de `cadre` à `marge` de la bouche ; rampe d'un tracé jonction de `rampe`, sa tranchée `tranchee` de plus de
  // chaque côté. Le volume s'aligne sur l'axe le plus proche à moins de DIR_PASSAGE_M (plusProche, même règle).
  const PASSAGE = { escalier: [2.5, 1.5], puits: 1.2, aeration: 0.8, rampe: 1, tranchee: 0.1, marge: 0.12, cadre: 0.08 };
  const DIR_PASSAGE_M = 10;
  // Accès de surface SANS passage (vue 3D seule) : tag → forme du volume (vue3d.js > _volumeAcces). Aucun n'a de
  // moyen (poiJonction.js > MOYEN) : ni 🪜, ni itinéraire, ni coût vertical. esf / pef = eso / peo fermés en haut ;
  // pb bouché au ras du plafond ; pc / psf comblés (cône d'éboulis au sol) ; ps puits d'extraction rond ouvert ;
  // pe bassin creusé dans le sol, contre la paroi ; cao / caf cavage, porte à deux battants en travers de la galerie.
  // ⚠️ contrat : aucune emprise de galerie (pas de pièce, d'où versGalerie et le recalage inchangés), sauf la niche
  // d'un esf (_niche, comme eso ; versGalerie l'ignore) ; seuls les obstacles (BLOQUE) comptent, pour la règle du pas
  // de la 3D seulement (zonesBloquent, dansZone, dedans).
  const ACCES = { esf: "escalier", pef: "puits", pb: "puits", pc: "puits", psf: "rond", ps: "rond", pe: "bassin",
    cao: "porte", caf: "porte" };
  // Obstacles d'un accès (décision produit) : cône d'éboulis d'un puits comblé, porte fermée ; cavage ouvert : son
  // comblement seul (comblementPorte), l'ouverture du cadre laisse passer. Le bassin (pe) n'arrête pas : posé contre
  // la paroi (_placeVolume, `contre`), on passe à côté. Le cône ne ferme jamais une galerie non plus : poussé vers la
  // paroi du côté du POI, il laisse au moins `bassinLibre` en face (_coneDans) ; on bute dessus, on passe à côté.
  const BLOQUE = { pc: "cone", psf: "cone", caf: "porte", cao: "porteOuverte" };
  // Dimensions (m) des accès : puits rond d'extraction `rond` de diamètre ; bassin `bassin` de diamètre intérieur,
  // margelle de `margelle` d'épaisseur et `margelleH` de haut, eau à `eau` sous le sol, fond à `fond` ; cône
  // d'éboulis de `cone` de rayon et `coneH` de haut ; porte de la largeur de la galerie (demi-largeur de l'axe le
  // plus proche à DIR_PASSAGE_M), `porteDefaut` sans galerie, obstacle de `porteEp` d'épaisseur qui déborde de
  // `porteDeborde` dans la paroi (aucune fente au bord) ; passage d'au moins `bassinLibre` (la largeur d'un corps,
  // vue3d.js > RAYON_CORPS) entre la margelle et la paroi d'en face (_placeVolume).
  const ACCES_DIM = { rond: 2.5, bassin: 1.6, margelle: 0.2, margelleH: 0.4, eau: 0.8, fond: 1.2, cone: 0.9,
    coneH: 0.6, porteDefaut: 2, porteEp: 0.2, porteDeborde: 0.4, bassinLibre: 0.8 };
  const CONE_MIN_M = 0.05;          // rayon de cône plus petit (galerie de moins de 0,95 m) : aucun cône
  // 🩸 Jeu laissé en plus d'un corps à côté d'un cône : un passage de bassinLibre tout juste, le corps touche le cône
  // et la paroi d'en face à la fois, et la règle du pas (rayons de RAYON_CORPS, bord compris) l'arrête.
  const CONE_JEU_M = 0.1;
  const COTES_CERCLE = 16;          // côtés d'un cercle d'obstacle (cône, margelle), les mêmes que la 3D
  // Comblement d'un cavage (décision produit) : la porte garde la largeur de la galerie (tracé le plus proche) ; entre
  // son cadre et la structure la plus proche de chaque côté (mur, pilier, front), cherchée dans le plan de la porte
  // au plus COMBLE_MAX_M au-delà du cadre, de la pierre de taille ferme le passage jusqu'au plafond. Plus loin, rien :
  // à plus de 3 m du cadre, on n'est plus dans une galerie bordée mais dans une chambre.
  const COMBLE_MAX_M = 3;
  const COMBLE_MIN_M = 0.01;        // écart plus petit : la porte touche déjà la structure
  // ⚠️ contrat : un point est « dans la galerie » s'il a un axe à moins de PROCHE_M ; c'est le rayon unique de la vue
  // 3D (vue3d.js > POI_GALERIE : POI montré contre la paroi ; volume de passage recalé, _placeVolume) et du
  // recalage du tracker (versGalerie). Une seule valeur : deux rayons divergents remettaient le tracker dans la roche
  // à côté d'un POI que la 3D montrait.
  const PROCHE_M = 10;

  const _cache = new Map();         // "niveau|m" → { sig, modele }
  const _cacheZones = new Map();    // niveau → { sig, index } (_indexZones)
  const _cacheObstacles = new Map(); // niveau → { sig, index } (_indexObstacles)
  const _cacheStructures = new Map(); // niveau → { sig, S } (_structuresDe : comblement des cavages)
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
  // `frais` : relue quoi qu'il arrive (geste ponctuel, pas une image : des données changées à l'instant comptent).
  function _signature(frais) {
    const t = performance.now();
    if (!frais && _sig !== null && t - _sigT < MEMO_MS) return _sig;
    let h = 0;
    const mel = function (v) { h = Math.imul(h ^ v, 16777619); };
    const lire = function (liste) {
      mel(liste.length);
      for (let i = 0; i < liste.length; i++) {
        const o = liste[i];
        if (!o || !Array.isArray(o.points)) continue;
        // 🩸 Le type entier, pas sa longueur : un tracé passé d'un type perso `cust-…` à un autre gardait, vue
        // rouverte, le modèle (largeur, couleur des parois) de l'ancien.
        const ty = String(o.type || "");
        mel(o.points.length); mel(o.level); mel(ty.length);
        for (let k = 0; k < ty.length; k++) mel(ty.codePointAt(k));
        if (Array.isArray(o.niveaux)) o.niveaux.forEach(mel);   // zone sur plusieurs niveaux
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
      // 🩸 Le tag entier, pas sa longueur : cao → caf (porte fermée) ou pa → pe ne changeaient rien sinon.
      const tg = String((p.tags && p.tags[0]) || "");
      mel(p.x * 10); mel(p.y * 10); mel(p.level); mel(tg.length);
      for (let k = 0; k < tg.length; k++) mel(tg.codePointAt(k));
      (Array.isArray(p.niveaux) ? p.niveaux : []).forEach(mel);
      (Array.isArray(p.accroches) ? p.accroches : []).forEach(function (a) {
        if (a) { mel(a.level); mel(a.x * 10); mel(a.y * 10); }
      });
    }
    _sig = h + ":" + _echelle();
    _sigT = t;
    return _sig;
  }

  function invalider() {
    _cache.clear(); _cacheZones.clear(); _cacheObstacles.clear(); _cacheStructures.clear(); _sig = null;
  }

  function _surNiveau(o, niveau) {
    return niveau === null || niveau === undefined || (Number.isInteger(o.level) ? o.level : 0) === niveau;
  }

  // Zone : sur CHACUN de ses niveaux (`niveaux`, règle commune poiJonction.js > ktaNiveauxObjet), pas son seul `level`.
  function _zoneSurNiveau(z, niveau) {
    if (niveau === null || niveau === undefined || typeof window.ktaNiveauxObjet !== "function") {
      return _surNiveau(z, niveau);
    }
    return window.ktaNiveauxObjet(z).indexOf(niveau) >= 0;
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

  // ── Zones qui bouchent (règle du pas de la 3D) ───────────────────────────────────────────────────

  // Zones ZONES_BOUCHENT du niveau (null = tous) en grille → { n, dedans(x, y), bloque(x0, y0, x1, y1) } (px), gardé
  // tant que la signature des données ne change pas. Indépendant du modèle des galeries : le rendu structures n'en
  // construit aucun.
  function _indexZones(niveau) {
    const n = Number.isInteger(niveau) ? niveau : null, sig = _signature(false), c = _cacheZones.get(n);
    if (c && c.sig === sig) return c.index;
    const anneaux = [];
    _zones().forEach(function (z) {
      if (!z || !ZONES_BOUCHENT[z.type] || !Array.isArray(z.points) || !_zoneSurNiveau(z, n)) return;
      const a = z.points.filter(function (p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); });
      if (a.length >= 3) anneaux.push(a);
    });
    const index = _indexAnneaux(anneaux);
    _cacheZones.set(n, { sig: sig, index: index });
    return index;
  }

  // Contours [{x, y}] (px) en grille → { n, dedans(x, y), bloque(x0, y0, x1, y1, dx, dy) } : la règle commune des
  // zones qui bouchent et des obstacles des accès (_indexObstacles).
  function _indexAnneaux(anneaux) {
    const g = new Grille(CASE_M * (_echelle() || 1));
    anneaux.forEach(function (a, i) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      a.forEach(function (p) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      });
      g.poser(i, x0, y0, x1, y1);
    });
    return {
      n: anneaux.length,
      dedans: function (x, y) {
        if (!anneaux.length) return false;
        const l = g.case(x, y);
        for (let i = 0; i < l.length; i++) { if (_dansAnneau(anneaux[l[i]], x, y)) return true; }
        return false;
      },
      // ⚠️ contrat (jamais coincé) : une zone où le segment commence, ou qui contient le départ du pas (dx, dy :
      // facultatif), ne l'arrête pas, on en sort librement ; une autre l'arrête s'il finit dedans ou entre dans son
      // contour (un contact au point de départ, sur le bord, ne compte pas : on s'en éloigne).
      bloque: function (x0, y0, x1, y1, dx, dy) {
        if (!anneaux.length) return false;
        const l = g.pres(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1));
        for (let i = 0; i < l.length; i++) {
          const a = anneaux[l[i]];
          if (_dansAnneau(a, x0, y0) || (dx !== undefined && _dansAnneau(a, dx, dy))) continue;
          if (_dansAnneau(a, x1, y1) || _coupeAnneau(a, x0, y0, x1, y1)) return true;
        }
        return false;
      }
    };
  }

  // Obstacles des accès (BLOQUE) du niveau dans un rendu ("mixte" par défaut, "galerie", "structures") → même index
  // que les zones. ⚠️ contrat : place et axe = placePassage (la règle unique du volume, du panneau et de l'emprise),
  // largeur d'une porte = demi-largeur de l'axe le plus proche de cette place (DIR_PASSAGE_M), comblement =
  // comblementPorte ; vue3d.js > _dimAcces dessine les mêmes. Aucun modèle construit sur un niveau sans POI qui
  // bouche (rien de plus à l'ouverture).
  function _indexObstacles(niveau, rendu) {
    const n = Number.isInteger(niveau) ? niveau : null, r = rendu || "mixte", cle = n + "|" + r;
    const sig = _signature(false), c = _cacheObstacles.get(cle);
    if (c && c.sig === sig) return c.index;
    const anneaux = [], sc = _echelle();
    _points().forEach(function (p) {
      const tag = p && Array.isArray(p.tags) ? p.tags[0] : "";
      if (!BLOQUE[tag] || !sc || !_surNiveau(p, n)) return;
      const pl = placePassage(p, n, r), m = modele(n, r === "mixte");
      if (!pl) return;
      const pp = m ? m.plusProche(pl.x, pl.y, DIR_PASSAGE_M * sc) : null;
      const w = pp ? pp.w : ACCES_DIM.porteDefaut / 2 * sc;
      const cb = ACCES[tag] === "porte" ? comblementPorte(pl.x, pl.y, pl.ang, w, n, r) : null;
      _obstaclesAcces(tag, pl, w, cb, sc).forEach(function (a) { anneaux.push(a); });
    });
    const index = _indexAnneaux(anneaux);
    _cacheObstacles.set(cle, { sig: sig, index: index });
    return index;
  }

  // Obstacles d'un accès (BLOQUE[tag]) à la place `pl` (placePassage : x, y px, axe `ang` rad, `cone`), galerie de
  // demi-largeur `w` px, comblement `cb` ([côté −, côté +] en m, comblementPorte) → contours [[{x, y}]]. Cône :
  // cercle de COTES_CERCLE côtés à pl.cone (sans lui : centré sur la place, de son rayon ; aucun sous CONE_MIN_M).
  // Porte : rectangles de porteEp le long de l'axe, en travers ; fermée, d'un bout de comblement à l'autre (la
  // largeur de la galerie sans comblement) ; ouverte, chaque comblement seul, du cadre à la structure (l'ouverture
  // reste libre). porteDeborde de plus au bout : aucune fente contre la paroi ou la structure.
  function _obstaclesAcces(tag, pl, w, cb, sc) {
    const D = ACCES_DIM, genre = BLOQUE[tag], x = pl.x, y = pl.y, ang = pl.ang;
    if (genre === "porte" || genre === "porteOuverte") {
      const ux = Math.cos(ang), uy = Math.sin(ang), s = D.porteEp / 2 * sc, deb = D.porteDeborde * sc;
      const g0 = (cb ? cb[0] : 0) * sc, g1 = (cb ? cb[1] : 0) * sc;
      const Q = function (a, b) { return { x: x + ux * a - uy * b, y: y + uy * a + ux * b }; };
      const rect = function (b0, b1) { return [Q(-s, b0), Q(s, b0), Q(s, b1), Q(-s, b1)]; };
      if (genre === "porte") return [rect(-(w + g0 + deb), w + g1 + deb)];
      const out = [];
      if (g0 > 0) out.push(rect(-(w + g0 + deb), -w));
      if (g1 > 0) out.push(rect(w, w + g1 + deb));
      return out;
    }
    const c = pl.cone || { x: x, y: y, R: D.cone }, R = c.R * sc, out = [];
    if (!(c.R >= CONE_MIN_M)) return [];
    for (let k = 0; k < COTES_CERCLE; k++) {
      const a = 2 * Math.PI * k / COTES_CERCLE;
      out.push({ x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) });
    }
    return [out];
  }

  // Structures du niveau pour le comblement des cavages, refaites quand les données changent (_signature).
  function _structuresDe(niveau, sc) {
    const cle = Number.isInteger(niveau) ? niveau : null, sig = _signature(false), c = _cacheStructures.get(cle);
    if (c && c.sig === sig) return c.S;
    const S = _indexStructures(cle, sc);
    _cacheStructures.set(cle, { sig: sig, S: S });
    return S;
  }

  // Comblement d'une porte de cavage posée en (x, y) px sur l'axe `ang` (rad), demi-largeur `w` px, dans un rendu →
  // [côté −, côté +] (m) : de chaque côté, distance du cadre (à w de l'axe) au premier bord de structure du niveau
  // croisé dans le plan de la porte (S.rayon, parti de l'axe : une structure qui empiète sur la porte donne 0), au
  // plus COMBLE_MAX_M ; 0 sans structure à portée. Côtés − / + = sens de la normale (−sin ang, cos ang), celui du
  // repère des volumes (vue3d.js > _repere). ⚠️ contrat (décision produit) : rendu galerie = [0, 0] (aucune
  // structure n'y est dessinée, les parois du tube bordent la porte).
  function comblementPorte(x, y, ang, w, niveau, rendu) {
    const sc = _echelle();
    if (!sc || rendu === "galerie" || !(w >= 0)) return [0, 0];
    const S = _structuresDe(niveau, sc);
    if (!S.n) return [0, 0];
    const nx = -Math.sin(ang), ny = Math.cos(ang), L = w + COMBLE_MAX_M * sc;
    return [-1, 1].map(function (sgn) {
      const d = S.rayon(x, y, nx * sgn, ny * sgn, L), g = d === null ? 0 : (d - w) / sc;
      return g >= COMBLE_MIN_M ? +g.toFixed(3) : 0;
    });
  }

  // Demi-emprise (m) d'un accès en travers de la galerie, pour _placeVolume : il est ramené au plus à w − demi de
  // l'axe. Porte : sur l'axe (elle barre toute la largeur) ; puits comblé : son cône.
  function _demiAcces(tag) {
    const D = ACCES_DIM, f = ACCES[tag];
    if (f === "porte") return Infinity;
    if (f === "bassin") return D.bassin / 2 + D.margelle;
    if (f === "rond") return Math.max(D.rond / 2, BLOQUE[tag] ? D.cone : 0);
    const t = f === "escalier" ? PASSAGE.escalier[1] / 2 : PASSAGE.puits / 2;
    return BLOQUE[tag] ? Math.max(t, D.cone) : t;
  }

  function _coupeAnneau(a, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const p = a[j], q = a[i], ex = q.x - p.x, ey = q.y - p.y, d = dx * ey - dy * ex;
      if (Math.abs(d) < 1e-12) continue;
      const rx = p.x - x0, ry = p.y - y0, t = (rx * ey - ry * ex) / d, u = (rx * dy - ry * dx) / d;
      if (t > 1e-9 && t <= 1 && u >= 0 && u <= 1) return true;
    }
    return false;
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

  // Point de départ du volume de passage de p au niveau donné → { x, y, raccord } (px) | null s'il n'y passe pas :
  // le raccord validé de ce niveau (celui du niveau du POI compris), sinon le POI lui-même.
  function _departPassage(p, niveau) {
    const J = window.KtaPoiJonction;
    if (!J || !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    if (niveau !== null && niveau !== undefined && J.estJonction(p)) {
      if (J.niveaux(p).indexOf(niveau) < 0) return null;
      const a = J.accroches(p).filter(function (q) { return q.level === niveau; })[0];
      return a ? { x: a.x, y: a.y, raccord: true } : { x: p.x, y: p.y, raccord: false };
    }
    return _surNiveau(p, niveau) ? { x: p.x, y: p.y, raccord: false } : null;
  }

  // Demi-largeur (m) d'une emprise de passage en travers de la galerie, cadre doré compris.
  function _demiTravers(tag) {
    if (ACCES[tag]) return _demiAcces(tag);
    const J = window.KtaPoiJonction, moyen = J && J.moyen(tag);
    const t = moyen === "escalier" ? PASSAGE.escalier[1] : moyen ? PASSAGE.puits : PASSAGE.aeration;
    return t / 2 + PASSAGE.marge + PASSAGE.cadre;
  }

  // Bord de pièce le plus proche de (x, y) à moins de R px → { d, x, y, i } | null ; `liste` = indices de pièces.
  function _bordProche(pieces, liste, x, y, R) {
    let best = null;
    liste.forEach(function (i) {
      const q = _bordLePlusProche(pieces[i], x, y);
      if (q && q.d <= R && (!best || q.d < best.d)) best = { d: q.d, x: q.x, y: q.y, i: i };
    });
    return best;
  }

  // Du bord atteint (_bordProche) à l'axe : celui de la même pièce (tube), sinon l'axe le plus proche du bord (joint,
  // passage) → { x, y, w (demi-largeur, px) }. C : { pieces, aretes, plusProche }.
  function _axeDuBord(C, best, R) {
    const P = C.pieces[best.i];
    if (P.genre === "tube" && C.aretes[P.arete]) {
      const r = C.aretes[P.arete], dx = r.bx - r.ax, dy = r.by - r.ay, l2 = dx * dx + dy * dy;
      let t = l2 ? ((best.x - r.ax) * dx + (best.y - r.ay) * dy) / l2 : 0;
      t = Math.max(P.t0 || 0, Math.min(P.t1 === undefined ? 1 : P.t1, t));
      return { x: r.ax + t * dx, y: r.ay + t * dy, w: r.w };
    }
    const pp = C.plusProche(best.x, best.y, R);
    return pp ? { x: pp.x, y: pp.y, w: pp.w } : { x: best.x, y: best.y, w: 0 };
  }

  // ⚠️ contrat : place (px) et axe (rad) d'un volume de passage, LA règle de la vue 3D (volume, cadre doré, panneau,
  // 🪜 : vue3d.js > _volumesDuNiveau, _passages, via placePassage) et de son emprise (_emprisesPassages). Un raccord
  // validé du niveau est pris au point exact (un escalier dans un tube : en niche à cette place, _nicheAuRaccord).
  // Sinon le POI (souvent posé à côté de l'axe pour la lecture en 2D) : en
  // mode galerie, ou dans un tube du mixte (hors chambre, comme son panneau), à moins de PROCHE_M d'un axe, le volume
  // est posé dans le tube du côté du POI, son emprise (`demi` m en travers) gardée entre les parois (au plus w − demi
  // de l'axe ; sur l'axe si le tube est plus étroit) ; `contre` (bassin, pe) : contre la paroi du côté du POI, à
  // w − demi de l'axe même au-delà du POI (margelle tangente à la paroi) ; galerie trop étroite pour laisser
  // ACCES_DIM.bassinLibre entre la margelle et la paroi d'en face : enfoncé dans SA paroi d'autant (centre à
  // bassinLibre + demi − w de l'axe), centre jamais de l'autre côté de l'axe, sans niche. Hors de l'emprise, la
  // galerie est d'abord gagnée par le trajet de versGalerie (jamais à travers la roche vers une autre). 🩸 Sinon un POI dans la roche dessinait son puits
  // derrière la paroi, bouche hors du sol dessiné : invisible. 🩸 Près d'un carrefour, la galerie retenue est celle
  // dont l'emprise est la plus près du POI, pas forcément celle voulue : seul un raccord validé du niveau tranche.
  // Rendu structures, chambre, rien à PROCHE_M : le point tel quel. L'axe (DIR_PASSAGE_M) est lu à la place finale,
  // avec le côté d'entrée (_entree). `niche` (escalier : jes, eso, esf ; décision produit, jamais en plein milieu de
  // la galerie) : volée en niche latérale (_niche), sauf POI au bout d'un cul-de-sac ou au-delà (_auFond : volée dans
  // l'axe vers le fond, règle ci-dessus).
  // `cone` (pc, psf) : dans un tube, la place porte aussi celle du cône d'éboulis (_coneDans) ; ailleurs, aucune
  // (cône centré sur la place, de son rayon : rien ne change en chambre, en structures ni sans axe).
  // C : { sc, pieces, aretes, plusProche, pres(x0, y0, x1, y1) → indices, tubes (bool), enChambre, tubeAu }.
  function _placeVolume(x, y, demi, C, contre, niche, cone) {
    const sc = C.sc, R = PROCHE_M * sc;
    const axeA = function (px, py, pl) {
      const pp = C.plusProche(px, py, DIR_PASSAGE_M * sc), r = pp ? C.aretes[pp.arete] : null;
      pl.ang = r ? Math.atan2(r.by - r.ay, r.bx - r.ax) : 0;
      pl.entree = r ? _entree(C.aretes, pp, sc) : 0;
      return pl;
    };
    const brut = axeA(x, y, { x: x, y: y, ramene: false });
    if (!C.tubes) return brut;
    const pp = C.plusProche(x, y, R);
    if (!pp || C.enChambre(x, y) || !C.tubeAu(pp.arete, pp.t)) return brut;
    // Les emprises de passage elles-mêmes ne comptent pas : le volume se pose dans la galerie, pas dans une niche.
    const liste = C.pres(x - R, y - R, x + R, y + R).filter(function (i) { return !_estPassage(C.pieces[i]); });
    let axe;
    if (liste.some(function (i) { return dansPiece(C.pieces[i], x, y, 1e-6); })) {
      axe = { x: pp.x, y: pp.y, w: pp.w };
    } else {
      const best = _bordProche(C.pieces, liste, x, y, R);
      if (!best) return brut;
      axe = _axeDuBord(C, best, R);
    }
    if (niche && !_auFond(C, pp)) return _niche(C, axe, x, y) || brut;
    const dx = x - axe.x, dy = y - axe.y, d = Math.hypot(dx, dy);
    const off = contre ? Math.max(axe.w - demi * sc, (ACCES_DIM.bassinLibre + demi) * sc - axe.w) : axe.w - demi * sc;
    const k = d <= 1e-9 ? 0 : contre ? off / d : Math.min(d, Math.max(0, off)) / d;
    const nx = axe.x + dx * k, ny = axe.y + dy * k;
    const pl = Math.hypot(nx - x, ny - y) < 1e-6 ? brut : axeA(nx, ny, { x: nx, y: ny, ramene: true });
    if (cone) pl.cone = _coneDans(C, axe, x, y, pl);
    return pl;
  }

  // Cône d'éboulis d'un puits comblé dont la bouche est à `pl`, dans le tube de `axe` ({ x, y, w } : point de l'axe
  // et demi-largeur, px), POI en (x, y) → { x, y (px), R (m) }. ⚠️ contrat (décision produit) : le cône ne ferme
  // jamais la galerie, il laisse ACCES_DIM.bassinLibre (un corps) plus CONE_JEU_M jusqu'à la paroi d'en face. Sous
  // la bouche si elle le laisse déjà ; sinon poussé vers la paroi du côté du POI juste assez, enfoncé dans SA paroi
  // (la roche en cache une part : il se couche contre elle, gardant sa taille), centre au plus sur la paroi ; plus
  // étroit encore (moins de 1,8 m), rayon réduit pour garder le passage, aucun sous CONE_MIN_M (moins de 0,95 m).
  // POI sur l'axe (à 1 cm près) : à gauche du sens du tracé (la règle de _niche). La bouche ne bouge pas.
  function _coneDans(C, axe, x, y, pl) {
    const sc = C.sc, L = ACCES_DIM.bassinLibre + CONE_JEU_M, w = axe.w / sc;
    let ux = x - axe.x, uy = y - axe.y, d = Math.hypot(ux, uy);
    if (d < 0.01 * sc) {
      const pp = C.plusProche(axe.x, axe.y, DIR_PASSAGE_M * sc), r = pp ? C.aretes[pp.arete] : null;
      if (!r || !r.l) return { x: pl.x, y: pl.y, R: ACCES_DIM.cone };
      ux = (r.by - r.ay) / r.l; uy = -(r.bx - r.ax) / r.l; d = 1;
    }
    ux /= d; uy /= d;
    const kb = ((pl.x - axe.x) * ux + (pl.y - axe.y) * uy) / sc;
    const c = Math.min(w, Math.max(kb, ACCES_DIM.cone + L - w)), R = Math.min(ACCES_DIM.cone, w + c - L);
    return { x: axe.x + ux * c * sc, y: axe.y + uy * c * sc, R: +Math.max(0, R).toFixed(4) };
  }

  // Pièce d'une emprise de passage (_emprisesPassages) : bouche dans le tube (« passage ») ou niche d'escalier.
  function _estPassage(P) { return P.genre === "passage" || P.genre === "niche"; }

  // Niche latérale d'un escalier → place | null. Volée perpendiculaire à l'axe de `axe` ({ x, y, w } : point de l'axe
  // et demi-largeur), pied contre la paroi (à w de l'axe), montée ou descente vers le côté du POI ; POI sur l'axe (à
  // 1 cm près) : à gauche du sens du tracé, carte nord en haut. ⚠️ contrat : ang = normale vers la niche, entree = −1
  // (vue3d.js > _marches : le pied, −a, contre la paroi) ; son emprise (_emprisesPassages, pièce « niche ») ouvre la
  // paroi, le passage de la galerie reste libre. 🩸 POI loin de la paroi : la niche reste contre elle (profondeur de
  // la volée), jamais au POI ; une galerie voisine à moins de la profondeur d'une volée n'est pas évitée.
  function _niche(C, axe, x, y) {
    const sc = C.sc, pp = C.plusProche(axe.x, axe.y, DIR_PASSAGE_M * sc), r = pp ? C.aretes[pp.arete] : null;
    if (!r || !r.l) return null;
    const ux = (r.bx - r.ax) / r.l, uy = (r.by - r.ay) / r.l, c = ux * (y - axe.y) - uy * (x - axe.x);
    // Côté + = normale (−uy, ux) ; plan en y vers le bas : la gauche du sens du tracé est le côté −.
    const s = Math.abs(c) < 0.01 * sc ? -1 : Math.sign(c), nx = -uy * s, ny = ux * s;
    const d = axe.w + PASSAGE.escalier[0] / 2 * sc;
    return { x: axe.x + nx * d, y: axe.y + ny * d, ang: Math.atan2(ny, nx), entree: -1, ramene: true, niche: true };
  }

  // POI au bout d'un cul-de-sac ou au-delà ? pp : axe le plus proche du POI, projection bornée à un nœud de degré 1
  // (la volée y prolonge la galerie).
  function _auFond(C, pp) {
    const r = C.aretes[pp.arete], bout = pp.t <= 1e-9 ? r.a : pp.t >= 1 - 1e-9 ? r.b : null;
    return bout !== null && (_graphe(C.aretes).adj.get(bout) || []).length === 1;
  }

  // Côté d'entrée d'un volume posé sur l'axe pp (plusProche) : +1 = vers b (le sens de `ang`), −1 = vers a, 0 =
  // égalité à 1 cm près ou boucle. ⚠️ contrat (vue3d.js > _marches) : la galerie continue le plus longtemps de ce
  // côté (le tronçon jusqu'au nœud, puis toute la galerie atteinte de ce nœud sans repasser par l'arête) : on arrive
  // le plus souvent par là ; au bout d'un cul-de-sac, c'est le côté ouvert. Arête dans une boucle (l'autre nœud
  // atteint sans elle) : les deux côtés mènent partout, 0. 🩸 Le sens a → b d'une arête est celui du dessin du
  // tracé, arbitraire : jamais une règle à lui seul. Portées calculées une fois par arête et par modèle.
  const _portees = new WeakMap();   // aretes (d'un modèle) → { adj, par: Map(arête → [depuis a, depuis b]) }
  function _graphe(aretes) {
    let g = _portees.get(aretes);
    if (!g) {
      const adj = new Map();
      aretes.forEach(function (r, k) {
        [r.a, r.b].forEach(function (n) { if (!adj.has(n)) adj.set(n, []); adj.get(n).push(k); });
      });
      g = { adj: adj, par: new Map() };
      _portees.set(aretes, g);
    }
    return g;
  }
  function _entree(aretes, pp, sc) {
    const g = _graphe(aretes), i = pp.arete, r = aretes[i];
    let p = g.par.get(i);
    if (!p) {
      // Longueur (px) atteinte depuis le nœud `de` sans l'arête i ; `boucle` : l'autre bout de i atteint.
      const portee = function (de, autre) {
        const vus = new Set([de]), faites = new Set([i]), pile = [de];
        let l = 0, boucle = false;
        while (pile.length) {
          const n = pile.pop();
          (g.adj.get(n) || []).forEach(function (k) {
            if (faites.has(k)) return;
            faites.add(k);
            const q = aretes[k], m = q.a === n ? q.b : q.a;
            l += q.l || 0;
            if (m === autre) boucle = true;
            if (!vus.has(m)) { vus.add(m); pile.push(m); }
          });
        }
        return { l: l, boucle: boucle };
      };
      p = [portee(r.a, r.b), portee(r.b, r.a)];
      g.par.set(i, p);
    }
    if (p[0].boucle) return 0;
    const versA = pp.t * r.l + p[0].l, versB = (1 - pp.t) * r.l + p[1].l;
    if (Math.abs(versA - versB) < 0.01 * sc) return 0;
    return versB > versA ? 1 : -1;
  }

  // Escalier (jes, eso par leur moyen ; esf, accès sans passage) : volée en niche (_niche).
  function _estEscalier(tag) {
    const J = window.KtaPoiJonction;
    return ACCES[tag] === "escalier" || (!!J && J.moyen(tag) === "escalier");
  }

  // Escalier au raccord validé (x, y) dans un tube : en niche (_niche) à sa place exacte le long de la galerie, du
  // côté du raccord (sur l'axe : la règle de _niche) → place | null (hors tube, chambre, bout de cul-de-sac : le point).
  function _nicheAuRaccord(C, x, y) {
    if (!C.tubes) return null;
    const pp = C.plusProche(x, y, PROCHE_M * C.sc);
    if (!pp || C.enChambre(x, y) || !C.tubeAu(pp.arete, pp.t) || _auFond(C, pp)) return null;
    return _niche(C, { x: pp.x, y: pp.y, w: pp.w }, x, y);
  }

  // Place du volume de passage de p au niveau donné (_placeVolume) → { x, y, ang, entree, ramene, raccord, niche }
  // | null.
  function _placePassageDans(p, niveau, C) {
    const d = _departPassage(p, niveau);
    if (!d) return null;
    const tag = (Array.isArray(p.tags) && p.tags[0]) || "default", esc = _estEscalier(tag);
    const pl = (d.raccord && esc && _nicheAuRaccord(C, d.x, d.y)) ||
      _placeVolume(d.x, d.y, _demiTravers(tag), d.raccord ? Object.assign({}, C, { tubes: false }) : C,
        ACCES[tag] === "bassin", esc, BLOQUE[tag] === "cone");
    pl.raccord = d.raccord;
    return pl;
  }

  // Emprises (px, rectangles) des volumes de passage du niveau, cadre doré compris.
  // ⚠️ contrat : mêmes règles que vue3d.js > _volumesDuNiveau (quels POI ont un volume, quelle forme) ; place et axe
  // par _placeVolume, le même calcul que la 3D ; filtres de la carte ignorés (masquer ne retire que le dessin, comme
  // la règle du pas). jes / jpe / jps seulement s'ils relient un autre niveau ; puits de surface (peo, eso) et
  // aération (pa) toujours. Tracé jonction qui part de ce niveau ou y arrive (plan multi-niveau) : un rectangle par
  // segment, de la largeur de sa tranchée.
  function _emprisesPassages(niveau, C) {
    const J = window.KtaPoiJonction, out = [], sc = C.sc;
    if (!J || typeof J.porteNiveaux !== "function") return out;
    const surface = J.TAGS_SURFACE_NIVEAUX || [], bord = PASSAGE.marge + PASSAGE.cadre;
    const multi = niveau !== null && niveau !== undefined;
    _points().forEach(function (p) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const tag = (Array.isArray(p.tags) && p.tags[0]) || "default";
      // esf (accès sans passage) : une emprise seulement en niche, celle d'eso (sinon aucune : ACCES).
      const esf = ACCES[tag] === "escalier";
      if (!J.porteNiveaux(tag) && !esf) return;
      const moyen = esf ? "escalier" : J.moyen(tag);
      const autres = multi && J.estJonction(p) ? J.niveaux(p).filter(function (n) { return n !== niveau; }).length : 0;
      if (!esf && moyen && surface.indexOf(tag) < 0 && !autres) return;
      const pl = _placePassageDans(p, niveau, C);
      if (!pl || (esf && !pl.niche)) return;
      const dim = moyen === "escalier" ? PASSAGE.escalier
        : moyen ? [PASSAGE.puits, PASSAGE.puits] : [PASSAGE.aeration, PASSAGE.aeration];
      const a = (dim[0] / 2 + bord) * sc, b = (dim[1] / 2 + bord) * sc;
      const x = pl.x, y = pl.y, ux = Math.cos(pl.ang), uy = Math.sin(pl.ang);
      const Q = function (s, t) { return [x + ux * s - uy * t, y + uy * s + ux * t]; };
      const e = [Q(-a, -b), Q(a, -b), Q(a, b), Q(-a, b)];
      e.niche = !!pl.niche;
      out.push(e);
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
    // Une emprise qui ne touche aucun tube n'ajoute rien (pas de boîte murée autour d'un passage isolé). La place
    // de chaque volume (_placeVolume) est jugée sur les tubes et joints, avant toute emprise de passage.
    const enChambre = function (x, y) { return !!S && S.proche(x, y); };
    const tubeAu = function (i, t) {
      const r = aretes[i];
      return !r || !r.tubes || r.tubes.some(function (u) { return t >= u[0] - 1e-9 && t <= u[1] + 1e-9; });
    };
    const gP = new Grille(CASE_M * sc);
    pieces.forEach(function (p, i) { gP.poser(i, p.x0, p.y0, p.x1, p.y1); });
    const C = { sc: sc, pieces: pieces, aretes: aretes, plusProche: plusProche, tubes: true, enChambre: enChambre,
      tubeAu: tubeAu, pres: function (x0, y0, x1, y1) { return gP.pres(x0, y0, x1, y1); } };
    const nTubes = pieces.length;
    let passages = 0;
    _emprisesPassages(niveau, C).forEach(function (pts) {
      const P = _piece(pts, null, pts.niche ? "niche" : "passage");
      for (let i = 0; i < nTubes; i++) {
        if (!_chevauche(P, pieces[i], 1e-3 * sc)) continue;
        P.type = pieces[i].type;
        pieces.push(P);
        gP.poser(pieces.length - 1, P.x0, P.y0, P.x1, P.y1);
        passages++;
        return;
      }
    });
    const gW = new Grille(CASE_M * sc);
    retours.forEach(function (w, i) {
      gW.poser(i, Math.min(w[0], w[2]), Math.min(w[1], w[3]), Math.max(w[0], w[2]), Math.max(w[1], w[3]));
    });
    // Zones qui bouchent la galerie (ZONES_BOUCHENT) : le même index que les rendus mixte et structures.
    const Z = _indexZones(niveau);
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
      enChambre: enChambre,
      // Mixte : le point t (0 → 1, de a vers b) de l'arête i est-il dans un morceau de tube ? Toujours vrai sinon.
      tubeAu: tubeAu,
      // Parois de la pièce i → [[x0, y0, x1, y1]] (px), calculées une fois (_parois), pans de retour compris.
      paroisDe: function (i) {
        const c = m._parois || (m._parois = new Map());
        let l = c.get(i);
        if (!l) { l = _parois(m, i).concat(pieces[i].retours || []); c.set(i, l); }
        return l;
      },
      piecesPres: function (x0, y0, x1, y1) { return gP.pres(x0, y0, x1, y1); },
      aretesPres: function (x0, y0, x1, y1) { return gA.pres(x0, y0, x1, y1); },
      // sansNiches : les niches d'escalier ne comptent pas (versGalerie : le recalage de la 2D ne les connaît pas).
      dedans: function (x, y, sansNiches) {
        const l = gP.case(x, y);
        for (let i = 0; i < l.length; i++) {
          const P = pieces[l[i]];
          if ((!sansNiches || P.genre !== "niche") && dansPiece(P, x, y, 1e-6)) return true;
        }
        return false;
      },
      enRemblais: Z.dedans,
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
  // frais : signature relue sans attendre MEMO_MS (versGalerie).
  function modele(niveau, mixte, frais) {
    const sc = _echelle();
    if (!sc) return null;
    const n = Number.isInteger(niveau) ? niveau : null, cle = n + (mixte ? "|m" : "");
    const sig = _signature(!!frais), c = _cache.get(cle);
    if (c && c.sig === sig) return c.modele;
    const t0 = performance.now();
    const m = _construire(n, sc, !!mixte);
    m.msConstruction = performance.now() - t0;
    _cache.set(cle, { sig: sig, modele: m });
    return m;
  }

  function dedans(x, y, niveau) {
    const m = modele(niveau);
    return !!m && m.dedans(x, y) && !m.enRemblais(x, y) && !_indexObstacles(niveau, "galerie").dedans(x, y);
  }

  // Segments [x0, y0, x1, y1] (px) → true si une partie sort de l'emprise (les zones qui bouchent : zonesBloquent).
  // Niveau sans galerie : rien n'arrête (true partout figerait la vue dans le vide).
  function segmentsBloques(segs, niveau) {
    const m = modele(niveau);
    if (!m || !m.pieces.length) return segs.map(function () { return false; });
    const pas = PAS_M * m.sc;
    return segs.map(function (s) {
      const l = Math.hypot(s[2] - s[0], s[3] - s[1]), n = Math.max(1, Math.ceil(l / pas));
      for (let i = 0; i <= n; i++) {
        if (!m.dedans(s[0] + (s[2] - s[0]) * i / n, s[1] + (s[3] - s[1]) * i / n)) return true;
      }
      return false;
    });
  }

  // Mode mixte : segments [x0, y0, x1, y1] (px) → true s'il coupe ou touche une paroi dessinée (bouts ouverts
  // exclus : on entre dans une chambre par là). Dans une chambre, rien ici n'arrête : les structures y bloquent par
  // la règle du tracker, les zones par zonesBloquent (vue3d.js > _juger).
  function paroisBloquent(segs, niveau) {
    const m = modele(niveau, true);
    if (!m || !m.pieces.length) return segs.map(function () { return false; });
    const e = 1e-9;
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
      return m.retoursPres(x0 - 1, y0 - 1, x1 + 1, y1 + 1).some(coupe);
    });
  }

  // Segments [x0, y0, x1, y1] (px) → true s'il entre dans une zone ZONES_BOUCHENT du niveau ou dans l'obstacle d'un
  // accès (BLOQUE : cône d'un puits comblé, porte fermée) — contour coupé ou touché, arrivée dedans ; un
  // contour où il commence, ou qui contient `depart` ({ x, y } px, la place d'où part le pas), ne l'arrête pas
  // (jamais coincé). Lu par la 3D dans les trois rendus (vue3d.js > _juger), en plus de la règle du rendu.
  function zonesBloquent(segs, niveau, depart, rendu) {
    const Z = _indexZones(niveau), O = _indexObstacles(niveau, rendu);
    const dx = depart ? depart.x : undefined, dy = depart ? depart.y : undefined;
    return segs.map(function (s) {
      return Z.bloque(s[0], s[1], s[2], s[3], dx, dy) || O.bloque(s[0], s[1], s[2], s[3], dx, dy);
    });
  }

  // Point dans une zone ZONES_BOUCHENT ou un obstacle d'accès du niveau (vue3d.js > _coince : départ dedans = ramené
  // au bord).
  function dansZone(x, y, niveau, rendu) {
    return _indexZones(niveau).dedans(x, y) || _indexObstacles(niveau, rendu).dedans(x, y);
  }

  // Distance (px) d'un point extérieur à une pièce convexe, et le point du bord atteint → { d, x, y }.
  function _bordLePlusProche(P, x, y) {
    const pts = P.pts;
    let best = null;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const ax = pts[j][0], ay = pts[j][1], dx = pts[i][0] - ax, dy = pts[i][1] - ay, l2 = dx * dx + dy * dy;
      const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      const qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(x - qx, y - qy);
      if (!best || d < best.d) best = { d: d, x: qx, y: qy };
    }
    return best;
  }

  // Où poser le tracker recalé sur (x, y) au niveau donné (null = tous) : la galerie de la vue 3D (modèle du mode
  // galerie : tous les types de tracé, perso compris, ni itinéraire ni jonction). → { etat, x, y } :
  //   "dedans" : déjà dans l'emprise → (x, y) inchangé ;
  //   "ramene" : hors emprise, un axe à moins de PROCHE_M (règle de la 3D pour montrer un POI) → point sur l'axe
  //              de la galerie dont l'EMPRISE est la plus proche ;
  //   "loin"   : aucun axe à portée → (x, y) inchangé ; "sans" : niveau sans galerie → (x, y) inchangé.
  // ⚠️ contrat : jamais à travers la roche vers une autre galerie. Dedans, on ne bouge pas (le plus proche axe peut
  // être celui d'à côté, derrière la paroi). Dehors, le segment du point au bord de l'emprise la plus proche ne
  // traverse aucune autre emprise (elle serait plus proche) : la seule roche franchie est celle qui sépare le point
  // de SA galerie. L'axe le plus proche ne le garantit pas : avec des largeurs différentes, l'axe d'un chemin peut
  // être plus près que celui d'un principal dont la paroi est plus près. Du bord, on va à l'axe de la même pièce
  // (tube) ou à l'axe le plus proche du bord (joint, passage) : le trajet reste dans l'emprise.
  function versGalerie(x, y, niveau) {
    const m = modele(niveau, false, true);
    if (!m || !m.pieces.length) return { etat: "sans", x: x, y: y };
    if (m.dedans(x, y, true)) return { etat: "dedans", x: x, y: y };
    const R = PROCHE_M * m.sc;
    if (!m.plusProche(x, y, R)) return { etat: "loin", x: x, y: y };
    const best = _bordProche(m.pieces, m.piecesPres(x - R, y - R, x + R, y + R).filter(function (i) {
      return m.pieces[i].genre !== "niche";
    }), x, y, R);
    if (!best) return { etat: "loin", x: x, y: y };
    const a = _axeDuBord(m, best, R);
    return { etat: "ramene", x: a.x, y: a.y };
  }

  // Place du volume de passage du POI p au niveau donné dans un rendu ("mixte" | "galerie" | "structures") →
  // { x, y (px), ang (rad, axe de la galerie), entree (+1 / −1 / 0 : côté d'entrée le long de `ang`, _entree), ramene,
  // raccord, cone ({ x, y px, R m } : cône d'un puits comblé dans un tube, _coneDans) } | null (p ne passe pas par ce
  // niveau). La règle (_placeVolume) est celle de l'emprise du modèle : vue3d.js y lit la place du volume, du
  // panneau, du cône et de 🪜, et le sens des marches. Rendu structures : le point tel
  // quel, aligné sur l'axe du mode galerie.
  function placePassage(p, niveau, rendu) {
    const n = Number.isInteger(niveau) ? niveau : null;
    const m = modele(n, rendu === "mixte");
    if (!m) {
      const d = _departPassage(p, n);
      return d ? { x: d.x, y: d.y, ang: 0, entree: 0, ramene: false, raccord: d.raccord } : null;
    }
    const C = { sc: m.sc, pieces: m.pieces, aretes: m.aretes, plusProche: m.plusProche, pres: m.piecesPres,
      tubes: rendu === "mixte" || rendu === "galerie", enChambre: m.enChambre, tubeAu: m.tubeAu };
    return _placePassageDans(p, n, C);
  }

  window.KtaGalerie = {
    SEUIL_CHAMBRE_M: SEUIL_CHAMBRE_M, paroisBloquent: paroisBloquent, PASSAGE: PASSAGE,
    LARGEURS: Object.assign({}, LARGEURS), LARGEUR_PERSO: LARGEUR_PERSO,
    largeur: largeur, modele: modele, dedans: dedans, segmentsBloques: segmentsBloques, invalider: invalider,
    dansPiece: dansPiece, PROCHE_M: PROCHE_M, versGalerie: versGalerie, placePassage: placePassage,
    zonesBloquent: zonesBloquent, dansZone: dansZone, ZONES_BOUCHENT: Object.assign({}, ZONES_BOUCHENT),
    ACCES: Object.assign({}, ACCES), BLOQUE: Object.assign({}, BLOQUE), ACCES_DIM: Object.assign({}, ACCES_DIM),
    COTES_CERCLE: COTES_CERCLE, comblementPorte: comblementPorte, COMBLE_MAX_M: COMBLE_MAX_M,
    CONE_MIN_M: CONE_MIN_M
  };
})();
