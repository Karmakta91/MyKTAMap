/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// vue3d.js — vue 3D à la première personne autour de la position du tracker (bêta), ouverte par le bouton cube de
// la barre de droite (interface.js > _ouvrirVue3D, qui la charge à la demande avec css/vue3d.css) ; three.js
// (lib/three/) n'est importé qu'à la première ouverture. Tout est précaché par sw.js (la 3D sert sous terre).
// Expose : window.KtaVue3D = { ouvrir(opts) → Promise<bool>, fermer() → Promise<bool recalé>, etat(), parois(),
//   mesurer(opts), basculerVue(), basculerSuivi(), basculerRendu(), changerNiveau(sens), incliner(deg), avancer(m),
//   tourner(deg), suivre(), placer(x, y, cap), reglerHauteur(m), charge() } ; opts : { distanceVue (m),
//   tuiles (bool), depart {x, y, cap}, densiteMax, stats, attenteReprise (ms), retourFocus (élément) }.
// Scène (m : x = x image / scale, z = y image / scale, y = hauteur), deux rendus exclusifs retenus par plan :
// STRUCTURES (extrudées à la hauteur du plan, tracés au sol) ou GALERIE (tracés en tubes, js/galerieEmprise.js) ;
// zones, itinéraire, POI en panneaux ; un niveau. Tuiles autour de soi, lampe frontale, rendu au mouvement seul.
// ⚠️ contrat : filtres = ceux de la carte (window._ktaRuntimeFilters, calques de données, niveaux visibles), lus à
// chaque construction et suivis par FilterPanel.onChange ; ≡ ouvre le même panneau (filterPanel.js) par-dessus.
// Masquer ne retire que le dessin : collisions, parois des tubes et passages 🪜 restent ; l'itinéraire, comme en 2D,
// ne suit aucun filtre. Points d'accroche (lot suivant) : _e.bandeau (sous la rangée du haut), _toucher (panneaux).
// ⚠️ contrat : hauteur = celle de ⛏️ Volume exploité (config.js > get/setPlanHauteurGalerie), réglée aussi en 3D.
// ⚠️ contrat : déplacement = règle du pas, jamais une copie (tracking.js > ktaEstAccessible,
// ktaSegmentsBloquesParStructure ; galerie : KtaGalerie.segmentsBloques), sur la largeur d'un corps. Le tracker
// n'est pas déplacé (décision produit) : à la fermeture, « Je suis ici ? » propose de le recaler (position, niveau).
// 🩸 three.js est un module ES : import() dynamique, URL absolue (pas d'import map, la CSP refuse tout script en
// ligne). Fermer libère le contexte WebGL (forceContextLoss) : un navigateur en garde peu (iOS ~ 8, Chrome 16).
// Doc : docs/ETUDE_VUE_3D.md, tracking.md § Vue 3D, ui.md § Vue 3D · Garde-fou : scripts/smoke/checkup-vue-3d.js

(function () {
  "use strict";

  const URL_THREE = "lib/three/three.module.js";
  const DISTANCE_VUE = 30;          // m : au-delà, brouillard noir complet et tuiles masquées
  const TUILE = 16;                 // m : côté d'une tuile de géométrie
  const TUILES_PAR_IMAGE = 3;       // tuiles construites au plus par image après l'ouverture (pas d'à-coup)
  const HAUTEUR_DEFAUT = 2;         // m, comme ⛏️ Volume exploité
  const HAUTEUR_REGLAGE = { min: 1.5, max: 4 };   // m, bornes du réglage ⛏️ (pas de 0,1 m)
  const OEIL = 1.6;                 // m
  const RAYON_CORPS = 0.4;          // m : demi-largeur du corps, gardée devant et sur les côtés (un mur en ligne
                                    // de 0,4 m est dessiné à 0,2 m de son axe : on reste à 0,2 m de sa face)
  const RAILS = [0, -1, 1];         // couloirs balayés, en part de RAYON_CORPS de part et d'autre de l'axe
  const RAYONS = 12;                // rayons de RAYON_CORPS autour du point d'arrivée (un tous les 30°)
  const VITESSE = 2.8;              // m/s au pavé et au clavier (explorer, pas marcher : le tracker n'en dépend pas)
  const FACTEUR_RAPIDE = 2.5;       // pas rapide : Maj maintenue, ou ▲ maintenu plus de APPUI_LONG
  const APPUI_LONG = 600;           // ms
  const INCLINAISON = { defaut: 60, min: 15, max: 85, pas: 5 };   // ° de la vue plongeante (90 = verticale)
  const RECUL_PLONGEE = 18.4;       // m entre la caméra plongeante et le point visé, 2 m devant soi
  const ROTATION = 90;              // °/s
  const EPAISSEUR_MUR_LIGNE = 0.4;  // m
  const EPAISSEUR_FRONT = 0.3;      // m
  const LARGEUR_TRACE = 0.25;       // m
  const LARGEUR_ITI = 0.5;          // m
  const HAUTEUR_REMBLAIS = 0.6;     // part de la hauteur du plan
  const PANNEAU = { l: 1.6, h: 0.5 };   // m : taille d'un panneau de POI de près
  // De près : rien sous PRES.min, fondu jusqu'à PRES.net ; jamais plus large que PRES.ecran de la largeur de l'écran
  // (au téléphone en portrait, un panneau de 1,6 m à 2 m couvrait tout l'écran).
  const PRES = { min: 1, net: 2.2, ecran: 0.45 };
  const BRUIT_CAP = 2;              // ° : en suivi, un écart de cap plus petit (boussole) ne redessine pas
  const HAUTEUR_MUR = 0.98;         // part de la hauteur du plan : un mur passe toujours sous pilier et front
  // Sol et ciel de carrière (plafond, à la hauteur du plan) : même teinte sable calcaire, grain procédural répété
  // (bruit dessiné dans un canvas, aucune image téléchargée). Couleur de la scène, pas de la charte de l'UI.
  const COULEUR_CALCAIRE = "#c9b48c";
  const HACHURE_PAS = 0.6;   // m : période des hachures d'une zone inaccessible (sol et rideau)
  const GRAIN_TAILLE = 128;         // px du motif
  const GRAIN_METRES = 2;           // m couverts par un motif
  // Mode galerie : parois en moellons de calcaire taillés (assises horizontales à joints décalés, dessinées dans un
  // canvas comme le grain du sol), liseré au sol de la couleur du tracé, POI proches seulement. Pierre plus claire
  // et plus grise que le sol, joints de mortier : la paroi se détache du sol.
  const MOELLON = { couleur: "#d4c9b2", l: 0.4, h: 0.25, joint: 0.015 };   // teinte de base ; bloc et joint en m
  const MOELLONS_MOTIF = { l: 4, h: 4 };   // blocs par motif (1,6 × 1 m), répété en mètres sur la paroi
  const MOELLON_PX_M = 160;                // px du motif par mètre de paroi
  const LISERE = 0.15;              // m
  const POI_GALERIE = 10;           // m : POI plus loin de l'axe d'un tracé = masqué en mode galerie (salles comprises)
  const RECUL_PAROI = 0.08;         // m : POI hors du tube ramené contre la paroi, devant elle
  const PASSAGE = 2;                // m : distance d'un passage (POI jonction, bout de tracé jonction) qui montre 🪜
  const ATTENTE_REPRISE = 8000;     // ms d'écran visible sans contexte avant de renoncer à la reprise
  const SEUIL_RECALAGE = 0.5;       // m d'écart avec le tracker sous lequel « Je suis ici ? » ne se pose pas

  let THREE = null;
  let _import = null;
  let _e = null;                    // état de la vue ouverte (null = fermée)
  let _dernierGl = null;            // contexte de la dernière vue fermée (checkup : libéré ou non)
  let _derniereFermeture = null;    // "utilisateur" | "contexte" (checkup)

  // Textes lus au rendu (langue courante) ; sans I18n, la clé.
  function _t(cle, p) { return window.I18n && typeof window.I18n.t === "function" ? window.I18n.t(cle, p) : cle; }

  function _fmtNiveau(n) {
    return typeof window.ktaFormatNiveau === "function" ? window.ktaFormatNiveau(n) : String(n);
  }

  function _toast(cle) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(_t(cle), "warn");
  }

  function _alerte(cle) {
    if (typeof window.ktaAlerte === "function") window.ktaAlerte(_t(cle), { type: "erreur" });
  }

  function _echelle() {
    const sc = Number(window.APP_CONFIG && window.APP_CONFIG.scale);
    return Number.isFinite(sc) && sc > 0 ? sc : 0;
  }

  function _chargerThree() {
    if (THREE) return Promise.resolve(THREE);
    if (!_import) {
      _import = import(new URL(URL_THREE, document.baseURI).href)
        .then(function (m) { THREE = m; return m; })
        .catch(function (err) { _import = null; throw err; });
    }
    return _import;
  }

  function _chargerCss() {
    if (document.getElementById("kta-vue3d-css")) return Promise.resolve(true);
    return new Promise(function (resolve) {
      const l = document.createElement("link");
      l.id = "kta-vue3d-css";
      l.rel = "stylesheet";
      l.href = "css/vue3d.css";
      l.addEventListener("load", function () { resolve(true); });
      l.addEventListener("error", function () { resolve(false); });
      document.head.appendChild(l);
    });
  }

  // ── Données du plan (session + calques embarqués) et filtres de la carte ─────────────────────────────

  function _tab(f) { try { return (typeof f === "function" ? f() : []) || []; } catch (err) { return []; } }

  function _niveauCourant() {
    const c = window.APP_CONFIG || {};
    if (c.multiLevel !== true) return null;
    const suivi = typeof window.getTrackingActif === "function" && window.getTrackingActif();
    const lvlTracker = typeof window.getTrackerLevel === "function";
    if (_e && _e.mode === "suivi" && suivi && lvlTracker) return window.getTrackerLevel();
    const actif = Number.isInteger(c.activeLevel) ? c.activeLevel : 0;
    // Niveau pris par un passage (🪜) : gardé tant que le niveau actif de la carte ne change pas.
    if (_e && Number.isInteger(_e.niveauLibre)) {
      if (_e.actifVu === actif) return _e.niveauLibre;
      _e.niveauLibre = null;
    }
    return actif;
  }

  function _surNiveau(o, niveau) {
    return niveau === null || (Number.isInteger(o.level) ? o.level : 0) === niveau;
  }

  function _premierTag(p) { return (Array.isArray(p.tags) && p.tags[0]) || "default"; }

  // ⚠️ Les mêmes règles que la carte, lues à leur source : filtres ≡ (Set = types montrés, null = tout ;
  // filterPanel.js), calque coché (dataLayerGroups ; la session vit dans « editor »), niveau visible
  // (road.js > passeFiltreNiveau, POI jonction compris). Un objet sans calque connu reste montré.
  function _montre(o, cle, set, session) {
    const f = window._ktaRuntimeFilters || {}, g = window.dataLayerGroups || {}, map = window.map;
    if (f[set] instanceof Set && !f[set].has(cle)) return false;
    const calque = session ? "editor" : o.layerId;
    if (calque && g[calque] && map && typeof map.hasLayer === "function" && !map.hasLayer(g[calque])) return false;
    return typeof window.passeFiltreNiveau !== "function" || window.passeFiltreNiveau(o);
  }

  function _filtrer(session, embarques, set, cle) {
    const out = [];
    session.forEach(function (o) { if (o && _montre(o, cle(o), set, true)) out.push(o); });
    embarques.forEach(function (o) { if (o && _montre(o, cle(o), set, false)) out.push(o); });
    return out;
  }

  // Objets DESSINÉS du niveau (filtres de la carte appliqués ; l'itinéraire n'en suit aucun, comme en 2D) ; les
  // structures de tout filtre comptées à part (choix du rendu par défaut), les tracés jonction tous (passages 🪜).
  function _collecter(niveau) {
    const ok = function (o) { return o && Array.isArray(o.points) && _surNiveau(o, niveau); };
    const type = function (o) { return o.type; };
    const sessionRoads = _tab(window.getRoads).filter(function (r) { return r && !r._preview; });
    const embRoads = _tab(window.getAllEmbeddedRoads);
    // 🩸 L'itinéraire est UN tracé dont chaque point porte son niveau (pathfinder.js) : il est découpé en morceaux
    // du niveau affiché, sinon un itinéraire au −1 (tracé sans `level` = 0) disparaissait tout entier.
    const itiDuNiveau = [];
    sessionRoads.forEach(function (r) {
      if (r.type !== "itinerary" || !Array.isArray(r.points)) return;
      const defaut = Number.isInteger(r.level) ? r.level : 0;
      let cur = [];
      r.points.forEach(function (q) {
        const n = q && Number.isInteger(q.level) ? q.level : defaut;
        if (niveau === null || n === niveau) { cur.push(q); return; }
        if (cur.length > 1) itiDuNiveau.push(Object.assign({}, r, { points: cur, level: niveau }));
        cur = [];
      });
      if (cur.length > 1) itiDuNiveau.push(Object.assign({}, r, { points: cur, level: niveau === null ? defaut : niveau }));
    });
    const roads = itiDuNiveau
      .concat(_filtrer(sessionRoads.filter(function (r) { return r.type !== "itinerary"; }), embRoads,
        "roadTypes", type));
    const toutes = _tab(window.getStructures).concat(_tab(window.getAllEmbeddedStructures));
    // Un POI jonction se montre sur chacun de ses niveaux, à son raccord validé de ce niveau s'il en a un.
    const J = window.KtaPoiJonction, points = [];
    const montres = _filtrer(_tab(window.getEditorPoints), _tab(window.getAllEmbeddedPoints), "tags", _premierTag);
    montres.forEach(function (p) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      if (_surNiveau(p, niveau)) { points.push(p); return; }
      if (niveau === null || !J || !J.estJonction(p) || J.niveaux(p).indexOf(niveau) < 0) return;
      const a = J.accroches(p).filter(function (q) { return q.level === niveau; })[0];
      points.push(Object.assign({}, p, { x: a ? a.x : p.x, y: a ? a.y : p.y, level: niveau, _v3dJonction: p }));
    });
    return {
      structures: _filtrer(_tab(window.getStructures), _tab(window.getAllEmbeddedStructures), "structTypes", type)
        .filter(ok),
      nStructures: toutes.filter(ok).length,
      zones: _filtrer(_tab(window.getZones), _tab(window.getAllEmbeddedZones), "zoneTypes", type).filter(ok),
      roads: roads.filter(ok),
      jonctions: sessionRoads.concat(embRoads).filter(function (r) {
        return r && r.type === "jonction" && Array.isArray(r.points);
      }),
      points: points
    };
  }

  // Type de tracé montré par les filtres de la carte : liseré du mode galerie (le tube, lui, reste : collision).
  function _typeTraceMontre(type) {
    const f = window._ktaRuntimeFilters || {};
    return type === "itinerary" || !(f.roadTypes instanceof Set) || f.roadTypes.has(type);
  }

  // Passages du niveau vers un autre : POI jonction (niveaux liés, raccords validés) et bouts de tracé `jonction`
  // (pris dans les deux sens). → [{ x, y (px), poi?, cibles: [{ niveau, x, y (NaN = même position) }] }].
  function _passages(niveau, jonctions) {
    const out = [], J = window.KtaPoiJonction;
    if (niveau === null) return out;
    if (J && typeof J.pointsJonction === "function") {
      J.pointsJonction().forEach(function (p) {
        const nv = J.niveaux(p), acc = J.accroches(p);
        if (nv.indexOf(niveau) < 0) return;
        const raccord = function (n) { return acc.filter(function (a) { return a.level === n; })[0] || null; };
        const ici = (Number.isInteger(p.level) ? p.level : 0) === niveau ? p : (raccord(niveau) || p);
        const cibles = nv.filter(function (n) { return n !== niveau; }).map(function (n) {
          const a = raccord(n);
          return { niveau: n, x: a ? a.x : NaN, y: a ? a.y : NaN };
        });
        out.push({ x: ici.x, y: ici.y, poi: p, cibles: cibles });
      });
    }
    jonctions.forEach(function (r) {
      const pts = r.points.filter(function (p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); });
      if (pts.length < 2 || !Number.isInteger(r.fromLevel) || !Number.isInteger(r.toLevel)) return;
      const A = pts[0], B = pts[pts.length - 1];
      if (r.fromLevel === niveau && r.toLevel !== niveau) {
        out.push({ x: A.x, y: A.y, cibles: [{ niveau: r.toLevel, x: B.x, y: B.y }] });
      }
      if (r.toLevel === niveau && r.fromLevel !== niveau) {
        out.push({ x: B.x, y: B.y, cibles: [{ niveau: r.fromLevel, x: A.x, y: A.y }] });
      }
    });
    return out;
  }

  function _estLigne(type) {
    if (typeof window.isStructurePolylineType === "function") return window.isStructurePolylineType(type);
    return type === "mur-ligne" || type === "front-1" || type === "front-2";
  }

  // Couleur du canon (aplat, couleur choisie par l'utilisateur comprise) → THREE.Color, en cache par clé.
  function _couleur(cat, cle, champ) {
    const k = cat + "|" + cle + "|" + (champ || "");
    let c = _e.couleurs.get(k);
    if (c) return c;
    let hex = null;
    if (champ && typeof window.ktaResolveStyle === "function") {
      const s = window.ktaResolveStyle(cat, cle, { flat: true });
      hex = s && s[champ];
    }
    if (!hex && typeof window.ktaSwatchColor === "function") hex = window.ktaSwatchColor(cat, cle);
    c = new THREE.Color();
    try { c.setStyle(hex || "#888888"); } catch (err) { c.set(0x888888); }
    _e.couleurs.set(k, c);
    return c;
  }

  // ── Index des tuiles : chaque objet va dans la tuile de son centre ; la tuile retient l'emprise réelle ──────

  function _indexer(d, sc, taille) {
    const tuiles = new Map();
    const range = function (ix, iz) {
      const k = ix + "," + iz;
      let t = tuiles.get(k);
      if (!t) {
        t = { cle: k, s: [], z: [], r: [], p: [], g: [], a: [], x0: Infinity, z0: Infinity, x1: -Infinity,
          z1: -Infinity, obj: null, parois: null };
        tuiles.set(k, t);
      }
      return t;
    };
    const emprise = function (t, pts) {
      for (let i = 0; i < pts.length; i++) {
        const x = pts[i].x / sc, z = pts[i].y / sc;
        if (x < t.x0) t.x0 = x; if (x > t.x1) t.x1 = x;
        if (z < t.z0) t.z0 = z; if (z > t.z1) t.z1 = z;
      }
    };
    const centre = function (pts) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      }
      return [(x0 + x1) / 2 / sc, (y0 + y1) / 2 / sc];
    };
    const cle = function (x, z) { return taille ? [Math.floor(x / taille), Math.floor(z / taille)] : [0, 0]; };
    const objets = function (liste, champ) {
      for (let i = 0; i < liste.length; i++) {
        const o = liste[i];
        if (o.points.length < 2) continue;
        const c = centre(o.points), k = cle(c[0], c[1]);
        const t = range(k[0], k[1]);
        t[champ].push(o);
        emprise(t, o.points);
      }
    };
    const m = d.galerie;
    if (!m) objets(d.structures, "s");
    objets(d.zones, "z");
    // Galerie : pièces de l'emprise et axes (liseré) à la tuile de leur centre ; parmi les tracés, seul l'itinéraire
    // reste un ruban.
    if (m) {
      for (let i = 0; i < m.pieces.length; i++) {
        const P = m.pieces[i], k = cle((P.x0 + P.x1) / 2 / sc, (P.y0 + P.y1) / 2 / sc), t = range(k[0], k[1]);
        t.g.push(i);
        emprise(t, [{ x: P.x0, y: P.y0 }, { x: P.x1, y: P.y1 }]);
      }
      for (let i = 0; i < m.aretes.length; i++) {
        const r = m.aretes[i], k = cle((r.ax + r.bx) / 2 / sc, (r.ay + r.by) / 2 / sc);
        range(k[0], k[1]).a.push(i);
      }
    }
    // Tracés : par segment (un tracé traverse tout le plan).
    for (let i = 0; i < d.roads.length; i++) {
      const r = d.roads[i], pts = r.points;
      // Jonctions jamais dessinées (décision produit) : le passage de niveau passe par 🪜 (_passages).
      if (r.type === "jonction") continue;
      if (m && r.type !== "itinerary") continue;
      for (let j = 0; j + 1 < pts.length; j++) {
        const a = pts[j], b = pts[j + 1];
        if (!a || !b) continue;
        const k = cle((a.x + b.x) / 2 / sc, (a.y + b.y) / 2 / sc);
        const t = range(k[0], k[1]);
        t.r.push({ type: r.type, a: a, b: b });
        emprise(t, [a, b]);
      }
    }
    for (let i = 0; i < d.points.length; i++) {
      const p = d.points[i], k = cle(p.x / sc, p.y / sc);
      const t = range(k[0], k[1]);
      t.p.push(p);
      emprise(t, [p]);
    }
    return tuiles;
  }

  // ── Géométrie : triangles non indexés, normales int8, couleurs uint8 (18 octets par sommet) ───────────

  function Lot() { this.p = []; this.n = []; this.c = []; this.uv = []; }

  const BLANC = { r: 1, g: 1, b: 1 };

  // Triangle orienté vers `n` (l'ordre des sommets est corrigé au besoin : face avant = côté de la normale).
  // `uv` facultatif : [ua, va, ub, vb, uc, vc] (lots texturés : sol, plafond, parois du mode galerie).
  Lot.prototype.tri = function (a, b, c, n, col, uv) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const inverse = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    if (inverse) { const t = b; b = c; c = t; }
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    if (uv) {
      if (inverse) this.uv.push(uv[0], uv[1], uv[4], uv[5], uv[2], uv[3]);
      else this.uv.push(uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]);
    }
    const nx = Math.round(n[0] * 127), ny = Math.round(n[1] * 127), nz = Math.round(n[2] * 127);
    const r = Math.round(col.r * 255), g = Math.round(col.g * 255), bl = Math.round(col.b * 255);
    for (let i = 0; i < 3; i++) { this.n.push(nx, ny, nz); this.c.push(r, g, bl); }
  };

  Lot.prototype.quad = function (a, b, c, d, n, col, uv) {
    this.tri(a, b, c, n, col, uv && [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]]);
    this.tri(a, c, d, n, col, uv && [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]]);
  };

  Lot.prototype.geometrie = function () {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Int8Array(this.n), 3, true));
    g.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(this.c), 3, true));
    if (this.uv.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  };

  // Contour en mètres, sans doublon de fermeture ; sens rendu positif (aire > 0 en x, z).
  function _anneau(points, sc) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const x = p.x / sc, z = p.y / sc;
      const der = out[out.length - 1];
      if (der && Math.abs(der[0] - x) < 1e-6 && Math.abs(der[1] - z) < 1e-6) continue;
      out.push([x, z]);
    }
    if (out.length > 2 && Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-6 &&
        Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
    let aire = 0;
    for (let i = 0, j = out.length - 1; i < out.length; j = i++) aire += out[j][0] * out[i][1] - out[i][0] * out[j][1];
    if (aire < 0) out.reverse();
    return out;
  }

  function _dessus(lot, ring, y, col) {
    const v2 = ring.map(function (q) { return new THREE.Vector2(q[0], q[1]); });
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(v2, []); } catch (err) { return; }
    const haut = [0, 1, 0];
    for (let i = 0; i < tris.length; i++) {
      const a = ring[tris[i][0]], b = ring[tris[i][1]], c = ring[tris[i][2]];
      lot.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], haut, col);
    }
  }

  // Prisme : faces latérales vers l'extérieur (contour de sens positif), dessus facultatif.
  function _prisme(lot, ring, y0, y1, col, dessus) {
    if (ring.length < 3) return;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const n = [dz / l, 0, -dx / l];
      lot.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], n, col);
    }
    if (dessus) _dessus(lot, ring, y1, col);
  }

  // Mur d'épaisseur réelle le long d'une polyligne : un pavé par segment, prolongé d'une demi-épaisseur aux deux
  // bouts pour fermer les angles.
  function _murLigne(lot, points, sc, ep, h, col) {
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i], b = points[i + 1];
      if (!a || !b) continue;
      let ax = a.x / sc, az = a.y / sc, bx = b.x / sc, bz = b.y / sc;
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const ux = dx / l, uz = dz / l, e = ep / 2;
      ax -= ux * e; az -= uz * e; bx += ux * e; bz += uz * e;
      const nx = -uz * e, nz = ux * e;
      const ring = [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]];
      let aire = 0;
      for (let k = 0, j = 3; k < 4; j = k++) aire += ring[j][0] * ring[k][1] - ring[k][0] * ring[j][1];
      if (aire < 0) ring.reverse();
      _prisme(lot, ring, 0, h, col, true);
    }
  }

  function _ruban(lot, a, b, sc, larg, y, col) {
    const ax = a.x / sc, az = a.y / sc, bx = b.x / sc, bz = b.y / sc;
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    if (l < 1e-6) return;
    const nx = -dz / l * larg / 2, nz = dx / l * larg / 2;
    const ex = dx / l * larg / 2, ez = dz / l * larg / 2;   // recouvrement aux jointures
    lot.quad([ax - ex + nx, y, az - ez + nz], [bx + ex + nx, y, bz + ez + nz], [bx + ex - nx, y, bz + ez - nz],
      [ax - ex - nx, y, az - ez - nz], [0, 1, 0], col);
  }

  // ⚠️ contrat (décision produit) : un mur (polygone ou en ligne) est toujours SOUS un pilier ou un front de son
  // niveau. Là où ils se chevauchent, le pilier ou le front l'emporte : le mur monte à HAUTEUR_MUR de la hauteur et
  // son matériau est reculé en profondeur (polygonOffset), d'où aucun scintillement sur les faces confondues et
  // un dessus de pilier toujours visible.
  function _estMur(type) { return type === "mur" || type === "mur-ligne"; }

  function _construireTuile(t) {
    if (_e.galerie) { _construireTuileGalerie(t); return; }
    const sc = _e.sc, h = _e.hauteur;
    const opaque = new Lot(), murs = new Lot(), transp = new Lot(), lumineux = new Lot();
    const hachSol = new Lot(), hachRideau = new Lot();
    for (let i = 0; i < t.s.length; i++) {
      const s = t.s[i], col = _couleur("structures", s.type);
      const lot = _estMur(s.type) ? murs : opaque, hs = _estMur(s.type) ? h * HAUTEUR_MUR : h;
      if (_estLigne(s.type)) {
        const ep = s.type === "mur-ligne" ? EPAISSEUR_MUR_LIGNE : EPAISSEUR_FRONT;
        _murLigne(lot, s.points, sc, ep, hs, col);
      } else {
        _prisme(lot, _anneau(s.points, sc), 0, hs, col, true);
      }
    }
    for (let i = 0; i < t.z.length; i++) {
      const z = t.z[i], ring = _anneau(z.points, sc);
      if (ring.length < 3) continue;
      if (z.type === "remblais") {
        _prisme(opaque, ring, 0, h * HAUTEUR_REMBLAIS, _couleur("zones", z.type, "fillColor"), true);
      } else if (z.type === "eau") {
        _dessus(transp, ring, 0.04, _couleur("zones", z.type, "fillColor"));
      } else if (z.type === "inaccessible") {
        // Rouge hachuré comme sur la carte : sol et rideau (visible des deux côtés) en matériaux à hachures.
        _dessus(hachSol, ring, 0.02, _couleur("zones", z.type, "fillColor"));
        _prisme(hachRideau, ring, 0, h, _couleur("zones", z.type, "fillColor"), false);
      } else {
        _dessus(opaque, ring, 0.02, _couleur("zones", z.type, "fillColor"));   // effondrement, types perso
      }
    }
    for (let i = 0; i < t.r.length; i++) {
      const r = t.r[i], col = _couleur("traces", r.type, "color");
      _compter(_e.rubans, r.type);
      if (r.type === "itinerary") _ruban(lumineux, r.a, r.b, sc, LARGEUR_ITI, 0.05, col);
      else _ruban(opaque, r.a, r.b, sc, LARGEUR_TRACE, 0.03, col);
    }
    const groupe = new THREE.Group();
    const ajouter = function (lot, mat, ordre, famille) {
      const g = lot.geometrie();
      if (!g) return;
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = ordre;
      m.matrixAutoUpdate = false;
      m.userData.famille = famille;
      groupe.add(m);
    };
    ajouter(opaque, _e.mats.opaque, 0, "opaque");
    ajouter(murs, _e.mats.murs, 0, "murs");
    ajouter(lumineux, _e.mats.lumineux, 1);
    ajouter(transp, _e.mats.transp, 2);
    ajouter(hachSol, _e.mats.hachSol, 0, "opaque");
    ajouter(hachRideau, _e.mats.hachRideau, 2);
    for (let i = 0; i < t.p.length; i++) {
      const sp = _panneau(t.p[i]);
      if (sp) groupe.add(sp);
    }
    _e.scene.add(groupe);
    t.obj = groupe;
    _e.sale = true;
  }

  function _libererTuile(t) {
    if (!t.obj) return;
    t.obj.traverse(function (o) {
      // 🩸 Un Sprite partage la géométrie de three.js : ne jamais la libérer, seulement sa texture.
      if (o.geometry && !o.isSprite) o.geometry.dispose();
      if (o.isSprite && o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      if (o.isSprite) _e.panneaux.delete(o);
    });
    _e.scene.remove(t.obj);
    t.obj = null;
    t.parois = null;
  }

  // ── Mode galerie : les tracés en tubes (window.KtaGalerie, js/galerieEmprise.js), sans les structures ─────
  // ⚠️ contrat : une paroi est un morceau de bord de pièce de l'emprise qui n'est dans aucune autre pièce (union) :
  // tubes coupés au bord des dalles, aucune paroi qui en traverse une autre. Sol et plafond = les pièces elles-mêmes,
  // superposées sans défaut visible (même texture, posée en coordonnées monde). Zones découpées à l'emprise.

  // Bords visibles de la pièce i (px) → [[x0, y0, x1, y1]]. Chaque bord est coupé là où il croise une pièce voisine
  // (ou longe un de ses bords) ; un morceau est une paroi si le point juste à l'extérieur, en son milieu, n'est dans
  // aucune autre pièce.
  function _paroisPiece(m, i) {
    const P = m.pieces[i], pts = P.pts, eps = 0.004 * m.sc, out = [];
    const vois = m.piecesPres(P.x0 - eps, P.y0 - eps, P.x1 + eps, P.y1 + eps).filter(function (j) { return j !== i; });
    const dans = window.KtaGalerie.dansPiece;
    for (let k = 0; k < pts.length; k++) {
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
        for (let v = 0; v < vois.length && !couvert; v++) couvert = dans(m.pieces[vois[v]], x, y, 0);
        if (!couvert) { if (deb === null) deb = t0; fin = t1; continue; }
        if (deb !== null) { out.push(morceau(deb, fin)); deb = null; }
      }
      if (deb !== null) out.push(morceau(deb, fin));
    }
    return out;
  }

  // Découpe (Sutherland-Hodgman) d'un contour de sens positif par une pièce convexe de sens positif → contour | null.
  function _decouper(sujet, clip) {
    let out = sujet;
    for (let i = 0; i < clip.length && out.length; i++) {
      const a = clip[i], b = clip[(i + 1) % clip.length], ex = b[0] - a[0], ey = b[1] - a[1];
      const cote = function (p) { return ex * (p[1] - a[1]) - ey * (p[0] - a[0]); };
      const entree = out;
      out = [];
      for (let k = 0; k < entree.length; k++) {
        const P = entree[k], Q = entree[(k + 1) % entree.length], sp = cote(P), sq = cote(Q);
        if (sp >= 0) out.push(P);
        if ((sp >= 0) !== (sq >= 0)) {
          const t = sp / (sp - sq);
          out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
        }
      }
    }
    return out.length >= 3 ? out : null;
  }

  function _metres(pts, sc) { return pts.map(function (q) { return [q[0] / sc, q[1] / sc]; }); }

  // Pièce convexe (m) en éventail, à la hauteur y, normale vers le haut (sol) ou le bas (plafond), texture monde.
  function _dalleTexturee(lot, ring, y, haut) {
    const n = haut ? [0, 1, 0] : [0, -1, 0], g = GRAIN_METRES;
    for (let i = 1; i + 1 < ring.length; i++) {
      const a = ring[0], b = ring[i], c = ring[i + 1];
      lot.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], n, BLANC,
        [a[0] / g, a[1] / g, b[0] / g, b[1] / g, c[0] / g, c[1] / g]);
    }
  }

  // Paroi verticale (m) du sol au plafond, face vers l'intérieur de la galerie (à gauche du bord), en moellons.
  // ⚠️ Texture en mètres dans les deux sens (jamais étirée à la hauteur) : une assise part du sol.
  function _paroi(lot, x0, z0, x1, z1, h) {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz);
    if (l < 1e-6) return;
    const lm = MOELLON.l * MOELLONS_MOTIF.l, hm = MOELLON.h * MOELLONS_MOTIF.h;
    const u0 = (x0 * dx + z0 * dz) / l / lm, u1 = u0 + l / lm, v1 = h / hm;
    lot.quad([x0, 0, z0], [x1, 0, z1], [x1, h, z1], [x0, h, z0], [-dz / l, 0, dx / l], BLANC,
      [u0, 0, u1, 0, u1, v1, u0, v1]);
  }

  function _construireTuileGalerie(t) {
    const e = _e, m = e.galerie, sc = e.sc, h = e.hauteur;
    const sol = new Lot(), plafond = new Lot(), parois = new Lot(), opaque = new Lot(), lumineux = new Lot();
    const eau = new Lot(), hachSol = new Lot(), hachRideau = new Lot(), remblais = new Lot();
    t.parois = [];
    for (let i = 0; i < t.g.length; i++) {
      const ring = _metres(m.pieces[t.g[i]].pts, sc);
      _dalleTexturee(sol, ring, 0, true);
      _dalleTexturee(plafond, ring, h, false);
      const ps = _paroisPiece(m, t.g[i]);
      for (let k = 0; k < ps.length; k++) {
        const s = ps[k], x0 = s[0] / sc, z0 = s[1] / sc, x1 = s[2] / sc, z1 = s[3] / sc;
        _paroi(parois, x0, z0, x1, z1, h);
        t.parois.push([x0, z0, x1, z1]);
      }
    }
    // Liseré au sol : la couleur du type de tracé dans la légende.
    for (let i = 0; i < t.a.length; i++) {
      const r = m.aretes[t.a[i]];
      if (!_typeTraceMontre(r.type)) continue;
      const col = _couleur("traces", r.type, "color");
      _compter(e.liseres, r.type);
      _ruban(opaque, { x: r.ax, y: r.ay }, { x: r.bx, y: r.by }, sc, LISERE, 0.015, col);
    }
    const lots = { opaque: opaque, eau: eau, hachSol: hachSol, hachRideau: hachRideau, remblais: remblais };
    for (let i = 0; i < t.z.length; i++) _zoneGalerie(t.z[i], m, lots);
    for (let i = 0; i < t.r.length; i++) {
      const r = t.r[i], col = _couleur("traces", r.type, "color");
      _compter(_e.rubans, r.type);
      if (r.type === "itinerary") _ruban(lumineux, r.a, r.b, sc, LARGEUR_ITI, 0.05, col);
      else _ruban(opaque, r.a, r.b, sc, LARGEUR_TRACE, 0.03, col);
    }
    const groupe = new THREE.Group();
    const ajouter = function (lot, mat, ordre, famille) {
      const g = lot.geometrie();
      if (!g) return;
      const me = new THREE.Mesh(g, mat);
      me.renderOrder = ordre;
      me.matrixAutoUpdate = false;
      me.userData.famille = famille;
      if (famille === "plafond") me.visible = e.vue !== "plongee";
      groupe.add(me);
    };
    ajouter(sol, e.mats.solGalerie, 0, "sol");
    ajouter(plafond, e.mats.plafondGalerie, 0, "plafond");
    ajouter(parois, e.mats.paroi, 0, "parois");
    ajouter(opaque, e.mats.opaque, 0, "opaque");
    ajouter(remblais, e.mats.opaque, 0, "remblais");
    ajouter(lumineux, e.mats.lumineux, 1);
    ajouter(eau, e.mats.eauGalerie, 2, "eau");
    ajouter(hachSol, e.mats.hachSol, 0, "inaccessible");
    ajouter(hachRideau, e.mats.hachRideau, 2, "rideau");
    for (let i = 0; i < t.p.length; i++) {
      const p = t.p[i];
      const pp = m.plusProche(p.x, p.y, POI_GALERIE * sc);
      if (!pp) { e.poiMasques++; continue; }
      // Dans le tube : là où il est ; au-delà de la paroi : ramené contre elle, RECUL_PAROI devant.
      const w = pp.w / sc - RECUL_PAROI, d = pp.d / sc;
      let x = p.x / sc, z = p.y / sc;
      if (d > w && d > 1e-9) { x = pp.x / sc + (x - pp.x / sc) * w / d; z = pp.y / sc + (z - pp.y / sc) * w / d; }
      const sp = _panneau(p, [x, z]);
      if (sp) groupe.add(sp);
    }
    e.scene.add(groupe);
    t.obj = groupe;
    e.sale = true;
  }

  // Zone en mode galerie : découpée à chaque pièce de l'emprise qu'elle touche. Eau à 4 cm ; remblais en volume
  // (faces seulement là où il donne sur la galerie) ; inaccessible au sol + rideau en travers du tube là où son
  // contour coupe l'axe ; effondrement et types perso au sol.
  function _zoneGalerie(z, m, lots) {
    const e = _e, sc = e.sc, h = e.hauteur, ring = _anneau(z.points, sc);
    if (ring.length < 3) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ring.forEach(function (q) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    });
    const col = _couleur("zones", z.type, "fillColor");
    const pieces = m.piecesPres(x0 * sc, y0 * sc, x1 * sc, y1 * sc);
    for (let i = 0; i < pieces.length; i++) {
      const c = _decouper(ring, _metres(m.pieces[pieces[i]].pts, sc));
      if (!c) continue;
      e.zonesDecoupees[z.type] = (e.zonesDecoupees[z.type] || 0) + 1;
      if (z.type === "eau") _dessus(lots.eau, c, 0.04, col);
      else if (z.type === "inaccessible") _dessus(lots.hachSol, c, 0.02, col);
      else if (z.type === "remblais") _remblaisGalerie(lots.remblais, c, ring, m, h * HAUTEUR_REMBLAIS, col);
      else _dessus(lots.opaque, c, 0.02, col);
    }
    if (z.type !== "inaccessible") return;
    m.aretesPres(x0 * sc, y0 * sc, x1 * sc, y1 * sc).forEach(function (k) {
      const r = m.aretes[k], ax = r.ax / sc, az = r.ay / sc, bx = r.bx / sc, bz = r.by / sc, w = r.w / sc;
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      if (l < 1e-6) return;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const p = ring[j], q = ring[i], ex = q[0] - p[0], ez = q[1] - p[1], d = dx * ez - dz * ex;
        if (Math.abs(d) < 1e-12) continue;
        const rx = p[0] - ax, rz = p[1] - az, t = (rx * ez - rz * ex) / d, u = (rx * dz - rz * dx) / d;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const cx = ax + dx * t, cz = az + dz * t, nx = -dz / l * w, nz = dx / l * w;
        lots.hachRideau.quad([cx - nx, 0, cz - nz], [cx + nx, 0, cz + nz], [cx + nx, h, cz + nz], [cx - nx, h, cz - nz],
          [dx / l, 0, dz / l], col);
        e.rideaux.push([cx, cz]);
      }
    });
  }

  // Remblais découpé : dessus, et une face sur chaque bord qui donne sur la galerie (pas contre une paroi ni à
  // l'intérieur du remblais, où elle ne se verrait pas ou scintillerait contre la paroi).
  function _remblaisGalerie(lot, c, ring, m, hr, col) {
    const sc = m.sc, dedansZone = function (x, z) {
      let r = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const p = ring[i], q = ring[j];
        if ((p[1] > z) !== (q[1] > z) && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) r = !r;
      }
      return r;
    };
    for (let i = 0; i < c.length; i++) {
      const p = c[i], q = c[(i + 1) % c.length], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const x = (p[0] + q[0]) / 2 + dz / l * 0.01, z = (p[1] + q[1]) / 2 - dx / l * 0.01;
      if (!m.dedans(x * sc, z * sc) || dedansZone(x, z)) continue;
      lot.quad([p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], hr, q[1]], [p[0], hr, p[1]], [dz / l, 0, -dx / l], col);
      _e.facesRemblais++;
    }
    _dessus(lot, c, hr, col);
  }

  // ── POI : panneau (icône + nom) toujours face à la caméra, à hauteur de tête ─────────────────────────
  // ⚠️ contrat (décision produit) : un panneau n'est JAMAIS caché par la géométrie (depthTest coupé, dessiné après
  // tout) : un POI relevé dans un pilier ou derrière reste lisible. Borné à la distance de vue, plus petit et plus
  // pâle au loin (_majPanneaux). Un POI dans un volume fermé (pilier, mur, type perso) est collé contre la face de
  // ce volume la plus proche de la caméra, pour ne pas sembler flotter dans la roche. En mode galerie, `ou` [x, z]
  // (m) fixe la place du panneau, dans le tube (_construireTuileGalerie).

  // Jetons de la charte du thème SOMBRE, quel que soit le thème affiché : lus dans la règle `:root` des feuilles
  // (style.css), que le thème clair surcharge sur html.kta-theme-light — getComputedStyle rendrait le clair.
  // Repli : les valeurs sombres de la charte. Lus une fois par ouverture (_e.jetonsSombres).
  function _jetonsSombres() {
    if (_e.jetonsSombres) return _e.jetonsSombres;
    const j = { surface: "#1a1f2e", fond: "#0a0d18", texte: "#e8eaf0", accent: "#f4c542" };
    const noms = { surface: "--kta-surface", fond: "--kta-fond", texte: "--kta-texte", accent: "--kta-accent" };
    const feuilles = document.styleSheets;
    for (let i = 0; i < feuilles.length; i++) {
      let regles = null;
      try { regles = feuilles[i].cssRules; } catch (err) { continue; }   // feuille d'une autre origine
      for (let k = 0; regles && k < regles.length; k++) {
        const r = regles[k];
        if (r.selectorText !== ":root" || !r.style.getPropertyValue("--kta-surface")) continue;
        Object.keys(noms).forEach(function (c) { j[c] = r.style.getPropertyValue(noms[c]).trim() || j[c]; });
        return (_e.jetonsSombres = j);
      }
    }
    return (_e.jetonsSombres = j);
  }

  // Panneau d'un POI aux couleurs de la charte, TOUJOURS celles du thème sombre (décision produit : la scène est
  // noire dans les deux thèmes, _jetonsSombres). Carte surface, liseré doré, icône dans un carré arrondi, nom ENTIER
  // sur 3 lignes au plus (coupé aux espaces, « … » au-delà).
  // La hauteur du canvas suit le nombre de lignes ; `userData.ratio` garde la proportion pour l'échelle du sprite.
  function _panneau(p, ou) {
    const W = 512, PAD = 18, ICONE = 76, LIGNE = 38, POLICE = "600 30px system-ui, -apple-system, sans-serif";
    const coul = _jetonsSombres();
    // Même titre que la fiche 2D (utils.js > buildPointPopupHtml : `nom`) ; l'id n'est qu'un repli technique.
    const nom = String(p.nom || p.name || p.id || (Array.isArray(p.tags) && p.tags[0]) || "").slice(0, 120);
    let url = null;
    try {
      url = typeof window.getIconUrlForPoint === "function" ? window.getIconUrlForPoint(p) : null;
    } catch (err) { url = null; }
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d");
    ctx.font = POLICE;
    const xTexte = url ? PAD + ICONE + 16 : PAD + 4, largeur = W - xTexte - PAD;
    const lignes = [];
    let cur = "";
    nom.split(/\s+/).filter(Boolean).forEach(function (mot) {
      // Un mot plus long que la ligne est coupé à la lettre.
      while (ctx.measureText(mot).width > largeur) {
        let n = mot.length - 1;
        while (n > 1 && ctx.measureText(mot.slice(0, n)).width > largeur) n--;
        if (cur) { lignes.push(cur); cur = ""; }
        lignes.push(mot.slice(0, n));
        mot = mot.slice(n);
      }
      const essai = cur ? cur + " " + mot : mot;
      if (ctx.measureText(essai).width <= largeur) cur = essai;
      else { lignes.push(cur); cur = mot; }
    });
    if (cur) lignes.push(cur);
    if (lignes.length > 3) {
      lignes.length = 3;
      let d = lignes[2];
      while (d && ctx.measureText(d + "…").width > largeur) d = d.slice(0, -1);
      lignes[2] = d + "…";
    }
    const H = Math.max(ICONE + 2 * PAD, lignes.length * LIGNE + 2 * PAD);
    cv.width = W; cv.height = H;
    const arrondi = function (x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };
    const dessiner = function (img) {
      ctx.clearRect(0, 0, W, H);
      arrondi(2, 2, W - 4, H - 4, 18);
      ctx.globalAlpha = 0.92; ctx.fillStyle = coul.surface; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 3; ctx.strokeStyle = coul.accent; ctx.stroke();
      if (url) {
        arrondi(PAD, (H - ICONE) / 2, ICONE, ICONE, 14);
        ctx.fillStyle = coul.fond; ctx.fill();
        if (img) {
          try { ctx.drawImage(img, PAD + 8, (H - ICONE) / 2 + 8, ICONE - 16, ICONE - 16); } catch (err) { /* illisible */ }
        }
      }
      ctx.fillStyle = coul.texte;
      ctx.font = POLICE;
      ctx.textBaseline = "middle";
      const y0 = H / 2 - (lignes.length - 1) * LIGNE / 2;
      lignes.forEach(function (l, i) { ctx.fillText(l, xTexte, y0 + i * LIGNE); });
    };
    dessiner(null);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, fog: true, depthWrite: false, depthTest: false,
      transparent: true });
    const sp = new THREE.Sprite(mat);
    sp.userData.ratio = H / W;
    sp.userData.fond = coul.surface;
    sp.scale.set(PANNEAU.l, PANNEAU.l * sp.userData.ratio, 1);
    const x = ou ? ou[0] : p.x / _e.sc, z = ou ? ou[1] : p.y / _e.sc;
    sp.position.set(x, Math.min(_e.oeil + 0.4, _e.hauteur - 0.3), z);
    sp.renderOrder = 10;
    const J = window.KtaPoiJonction, jonction = p._v3dJonction || (J && J.estJonction(p) ? p : null);
    sp.userData.poi = { x: x, z: z, anneau: ou ? null : _volumeContenant(x, z), nom: nom, jonction: jonction };
    _e.panneaux.add(sp);
    if (url) {
      const img = new Image();
      img.addEventListener("load", function () {
        if (!_e || !mat.map) return;
        dessiner(img);
        tex.needsUpdate = true;
        _e.sale = true;
      });
      img.src = url;
    }
    return sp;
  }

  // Grille des volumes fermés du niveau (anneaux en mètres), faite à chaque _reindexer : un POI y trouve son pilier.
  function _grilleVolumes(structures) {
    const g = new Map(), c = 8;
    for (let i = 0; i < structures.length; i++) {
      const s = structures[i];
      if (_estLigne(s.type)) continue;
      const a = _anneau(s.points, _e.sc);
      if (a.length < 3) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      a.forEach(function (q) {
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]);
      });
      for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
        for (let gz = Math.floor(z0 / c); gz <= Math.floor(z1 / c); gz++) {
          const k = gx + "," + gz;
          if (!g.has(k)) g.set(k, []);
          g.get(k).push(a);
        }
      }
    }
    _e.volumes = { cases: g, c: c };
  }

  function _volumeContenant(x, z) {
    const v = _e.volumes;
    if (!v) return null;
    const l = v.cases.get(Math.floor(x / v.c) + "," + Math.floor(z / v.c));
    if (!l) return null;
    for (let i = 0; i < l.length; i++) {
      const a = l[i];
      let dedans = false;
      for (let j = 0, k = a.length - 1; j < a.length; k = j++) {
        const p = a[j], q = a[k];
        if ((p[1] > z) !== (q[1] > z) && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) dedans = !dedans;
      }
      if (dedans) return a;
    }
    return null;
  }

  // Point du contour le plus proche de (cx, cz), avancé de 8 cm vers lui (devant la face, pas dedans).
  function _bordProche(a, cx, cz) {
    let best = null, d = Infinity;
    for (let i = 0; i < a.length; i++) {
      const p = a[i], q = a[(i + 1) % a.length], vx = q[0] - p[0], vz = q[1] - p[1], l2 = vx * vx + vz * vz;
      const t = l2 ? Math.max(0, Math.min(1, ((cx - p[0]) * vx + (cz - p[1]) * vz) / l2)) : 0;
      const x = p[0] + t * vx, z = p[1] + t * vz, dd = Math.hypot(cx - x, cz - z);
      if (dd < d) { d = dd; best = [x, z]; }
    }
    if (d > 1e-6) { best[0] += (cx - best[0]) / d * 0.08; best[1] += (cz - best[1]) / d * 0.08; }
    return best;
  }

  // Panneaux : dans la distance de vue (comptée depuis soi), échelle 1 → 0,5 et opacité 1 → 0,4 vers la limite.
  // De près (distance à la caméra) : rien sous PRES.min, fondu jusqu'à PRES.net, et jamais plus large que PRES.ecran
  // de l'écran (champ horizontal de la caméra à cette distance).
  function _majPanneaux() {
    const e = _e, cam = e.camera.position, px = e.pos.x / e.sc, pz = e.pos.y / e.sc;
    const demiChamp = Math.tan(e.camera.fov * Math.PI / 360) * (e.camera.aspect || 1);
    const v = e.v3 || (e.v3 = new THREE.Vector3());
    e.camera.updateMatrixWorld();
    e.panneaux.forEach(function (sp) {
      const u = sp.userData.poi;
      let x = u.x, z = u.z;
      if (u.anneau) { const b = _bordProche(u.anneau, cam.x, cam.z); x = b[0]; z = b[1]; }
      const k = Math.hypot(x - px, z - pz) / e.distance;
      const dc = Math.hypot(x - cam.x, sp.position.y - cam.y, z - cam.z);
      sp.visible = k <= 1 && dc >= PRES.min;
      if (!sp.visible) return;
      sp.position.x = x; sp.position.z = z;
      // Profondeur devant la caméra (la largeur à l'écran en dépend) ; derrière elle, la distance suffit.
      const prof = -v.copy(sp.position).applyMatrix4(e.camera.matrixWorldInverse).z;
      const ratio = sp.userData.ratio || PANNEAU.h / PANNEAU.l;
      const l = Math.min(PANNEAU.l * (1 - 0.5 * k), PRES.ecran * 2 * (prof > 0 ? prof : dc) * demiChamp);
      sp.scale.set(l, l * ratio, 1);
      const pres = Math.min(1, (dc - PRES.min) / (PRES.net - PRES.min));
      sp.material.opacity = (1 - 0.6 * k) * pres;
    });
  }

  // ── Scène ──────────────────────────────────────────────────────────────────────────────────────────

  // Motif calcaire répétable : teinte COULEUR_CALCAIRE, taches douces (bruit de valeur 8 × 8 interpolé, bouclé sur
  // les bords pour que la répétition ne se voie pas) et grain fin par pixel. ~1 ms, 64 Ko de texture.
  function _grainCalcaire() {
    const n = GRAIN_TAILLE, g = 8, cv = document.createElement("canvas");
    cv.width = n; cv.height = n;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(n, n), base = new THREE.Color(COULEUR_CALCAIRE);
    let graine = 7;
    const alea = function () { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
    const grille = [];
    for (let i = 0; i < g * g; i++) grille.push(alea());
    const v = function (x, y) { return grille[((y + g) % g) * g + ((x + g) % g)]; };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const fx = x / n * g, fy = y / n * g, x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const haut = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
        const bas = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
        const k = 0.86 + (haut + (bas - haut) * sy) * 0.2 + (alea() - 0.5) * 0.1;
        const o = (y * n + x) * 4;
        img.data[o] = Math.min(255, base.r * 255 * k);
        img.data[o + 1] = Math.min(255, base.g * 255 * k);
        img.data[o + 2] = Math.min(255, base.b * 255 * k);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(_e.distance * 2.4 / GRAIN_METRES, _e.distance * 2.4 / GRAIN_METRES);
    tex.anisotropy = 4;
    return tex;
  }

  // Appareil de moellons des parois du mode galerie (galeries consolidées des carrières) : MOELLONS_MOTIF.h assises
  // de blocs MOELLON.l × MOELLON.h, joints décalés (chaque assise part d'un décalage tiré, les blocs bouclent sur la
  // largeur : motif sans couture), longueur de bloc ± 25 %, teinte par bloc autour de MOELLON.couleur, arêtes un peu
  // éclairées en haut et ombrées en bas, joints de mortier plus sombres ou plus clairs, grain fin. ~3 ms, 160 Ko de
  // texture ; aucune image téléchargée.
  function _moellons() {
    const k = MOELLON_PX_M, bl = Math.round(MOELLON.l * k), bh = Math.round(MOELLON.h * k);
    const L = bl * MOELLONS_MOTIF.l, H = bh * MOELLONS_MOTIF.h, jt = Math.max(1, Math.round(MOELLON.joint * k));
    const cv = document.createElement("canvas");
    cv.width = L; cv.height = H;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(L, H), base = new THREE.Color(MOELLON.couleur);
    let graine = 13;
    const alea = function () { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
    for (let a = 0; a < MOELLONS_MOTIF.h; a++) {
      // Blocs de l'assise : longueurs tirées, la dernière ajuste la somme à L.
      const bords = [0];
      for (let x = 0; ;) {
        const w = Math.round(bl * (0.75 + alea() * 0.5));
        if (L - (x + w) < bl * 0.6) break;
        x += w; bords.push(x);
      }
      bords.push(L);
      const dec = Math.floor(alea() * L), y0 = a * bh;
      for (let b = 0; b + 1 < bords.length; b++) {
        const t = 0.88 + alea() * 0.17, chaud = alea();
        const fj = alea() < 0.25 ? 1.05 : 0.6 + alea() * 0.1;   // mortier du joint : sombre le plus souvent, ou clair
        const r0 = base.r * t, g0 = base.g * t * (0.98 + 0.03 * chaud), b0 = base.b * t * (0.93 + 0.1 * chaud);
        const w = bords[b + 1] - bords[b];
        for (let dy = 0; dy < bh; dy++) {
          for (let dx = 0; dx < w; dx++) {
            const x = (bords[b] + dx + dec) % L, y = y0 + dy, o = (y * L + x) * 4;
            let f = 1 + (alea() - 0.5) * 0.1;
            const joint = dy < jt || dx < jt;
            if (joint) f = fj * (1 + (alea() - 0.5) * 0.06);
            else if (dy < jt + 2) f *= 1.06;              // arête haute éclairée
            else if (dy >= bh - 2) f *= 0.86;             // arête basse ombrée
            else if (dx >= w - 2) f *= 0.92;
            img.data[o] = Math.min(255, r0 * f * 255);
            img.data[o + 1] = Math.min(255, g0 * f * 255);
            img.data[o + 2] = Math.min(255, b0 * f * 255);
            img.data[o + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  // Hachures à 45° en coordonnées monde (une bande sombre tous les HACHURE_PAS m) sur un matériau Lambert :
  // la couleur de la zone reste celle du canon, l'éclairage et le brouillard de la lampe restent ceux de three.js.
  function _hachurer(mat) {
    const vary = "#include <common>\nvarying vec3 vKtaMonde;";
    const bande = "if (fract((vKtaMonde.x + vKtaMonde.y + vKtaMonde.z) / " + HACHURE_PAS.toFixed(2) +
      ") < 0.4) diffuseColor.rgb *= 0.3;";
    mat.onBeforeCompile = function (sh) {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", vary)
        .replace("#include <begin_vertex>",
          "#include <begin_vertex>\nvKtaMonde = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", vary)
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + bande);
    };
    return mat;
  }

  function _materiaux() {
    const grain = _e.grain = _grainCalcaire();
    // Sol et plafond des galeries : même motif, posé en coordonnées monde (pièces superposées sans couture).
    const monde = _e.grainMonde = grain.clone();
    monde.repeat.set(1, 1);
    monde.offset.set(0, 0);
    monde.needsUpdate = true;
    _e.moellons = _moellons();
    return {
      opaque: new THREE.MeshLambertMaterial({ vertexColors: true }),
      murs: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1,
        polygonOffsetUnits: 1 }),
      lumineux: new THREE.MeshBasicMaterial({ vertexColors: true }),
      transp: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45,
        depthWrite: false, side: THREE.DoubleSide }),
      hachSol: _hachurer(new THREE.MeshLambertMaterial({ vertexColors: true })),
      hachRideau: _hachurer(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55,
        depthWrite: false, side: THREE.DoubleSide })),
      sol: new THREE.MeshLambertMaterial({ map: grain }),
      plafond: new THREE.MeshLambertMaterial({ map: grain, side: THREE.BackSide }),
      avatar: new THREE.MeshBasicMaterial({ color: 0xf4c542 }),
      solGalerie: new THREE.MeshLambertMaterial({ map: monde }),
      plafondGalerie: new THREE.MeshLambertMaterial({ map: monde }),
      paroi: new THREE.MeshLambertMaterial({ map: _e.moellons, side: THREE.DoubleSide }),
      // 🩸 Eau découpée en plusieurs pièces qui se recouvrent : sans écriture de profondeur stricte, chaque
      // recouvrement serait mélangé deux fois (taches plus sombres).
      eauGalerie: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45,
        depthWrite: true, depthFunc: THREE.LessDepth, side: THREE.DoubleSide })
    };
  }

  function _monterScene() {
    const e = _e;
    e.panneaux = new Set();
    e.scene = new THREE.Scene();
    e.scene.background = new THREE.Color(0x000000);
    e.scene.fog = new THREE.Fog(0x000000, e.distance * 0.45, e.distance);
    e.camera = new THREE.PerspectiveCamera(70, 1, 0.05, e.distance + 5);
    e.camera.rotation.order = "YXZ";
    e.scene.add(e.camera);
    e.mats = _materiaux();
    // Sol et plafond : un carré qui suit la position, plus grand que la distance de vue.
    const plan = new THREE.PlaneGeometry(e.distance * 2.4, e.distance * 2.4, 8, 8);
    plan.rotateX(-Math.PI / 2);
    e.sol = new THREE.Mesh(plan, e.mats.sol);
    e.plafond = new THREE.Mesh(plan, e.mats.plafond);
    e.plafond.position.y = e.hauteur;
    e.scene.add(e.sol, e.plafond);
    // Tête (porte la lampe) et silhouette visible en vue plongeante.
    e.tete = new THREE.Object3D();
    e.tete.rotation.order = "YXZ";
    e.scene.add(e.tete);
    // Lampe frontale : portée = distance de vue (au-delà, le brouillard est noir de toute façon), décroissance douce.
    e.lampe = new THREE.SpotLight(0xfff1d6, 24, e.distance, 0.62, 0.55, 1.2);
    e.lampe.position.set(0, 0.05, 0);
    e.lampe.target.position.set(0, -0.3, -1);
    e.tete.add(e.lampe, e.lampe.target);
    e.halo = new THREE.PointLight(0xfff1d6, 1.6, 4.5, 2);
    e.tete.add(e.halo);
    e.ambiance = new THREE.AmbientLight(0xffffff, 0.04);
    e.scene.add(e.ambiance);
    const cone = new THREE.ConeGeometry(0.35, 0.9, 12);
    cone.rotateX(-Math.PI / 2);
    e.avatar = new THREE.Mesh(cone, e.mats.avatar);
    e.avatar.visible = false;
    e.scene.add(e.avatar);
  }

  // Compteurs tenus par la construction des tuiles (checkup), remis à zéro avec elles.
  function _razCompteurs() {
    const e = _e;
    e.poiMasques = 0; e.zonesDecoupees = {}; e.rideaux = []; e.facesRemblais = 0; e.rubans = {}; e.liseres = {};
  }

  // Tuiles refaites sur place (hauteur, affichage) : même index, position, cap, niveau et rendu gardés.
  function _refaireTuiles() {
    const e = _e;
    e.tuiles.forEach(_libererTuile);
    _razCompteurs();
    _gererTuiles(true);
    e.sale = true;
  }

  function _reindexer() {
    const e = _e;
    e.tuiles.forEach(_libererTuile);
    const t0 = performance.now();
    e.niveau = _niveauCourant();
    const d = _collecter(e.niveau);
    e.rendu = _renduVoulu(d.nStructures);
    e.galerie = null;
    if (e.rendu === "galerie") e.galerie = d.galerie = window.KtaGalerie.modele(e.niveau);
    const m = e.galerie;
    e.compte = { structures: d.structures.length, zones: d.zones.length, roads: d.roads.length,
      points: d.points.length, pieces: m ? m.pieces.length : 0, aretes: m ? m.aretes.length : 0,
      dalles: m ? m.dalles : 0, coudes: m ? m.coudes : 0, bouts: m ? m.bouts : 0,
      msGalerie: m ? Math.round(m.msConstruction) : 0 };
    _razCompteurs();
    if (m) e.volumes = null; else _grilleVolumes(d.structures);
    e.passages = _passages(e.niveau, d.jonctions);
    e.passageSig = null;
    e.tuiles = _indexer(d, e.sc, e.tuilesActives ? TUILE : 0);
    e.msIndex = performance.now() - t0;
    _appliquerRendu();
    _gererTuiles(true);
  }

  // ── Rendu structures / galerie (interrupteur exclusif, retenu par plan) ─────────────────────────────────
  // Choix retenu du plan (config.js > getPlanRenduVue3D), sinon structures si le niveau affiché en a, galerie sinon.
  function _renduVoulu(nStructures) {
    if (!window.KtaGalerie) return "structures";
    const pref = typeof window.getPlanRenduVue3D === "function" ? window.getPlanRenduVue3D() : null;
    if (pref === "structures" || pref === "galerie") return pref;
    return nStructures > 0 ? "structures" : "galerie";
  }

  function _appliquerRendu() {
    const e = _e, gal = !!e.galerie, b = e.boutonRendu;
    e.sol.visible = !gal;
    e.plafond.visible = !gal && e.vue !== "plongee";
    if (b) {
      // Icônes de la carte : 🛣️ = les tracés (outil de la barre), 🏛️ = les structures.
      b.textContent = gal ? "🛣️ " + _t("vue3d.modeGalerie") : "🏛️ " + _t("vue3d.modeStructures");
      b.title = _t(gal ? "vue3d.passerStructures" : "vue3d.passerGalerie");
      b.setAttribute("aria-label", b.title);
    }
    e.sale = true;
  }

  // Bascule structures ↔ galerie, retenue pour ce plan ; la scène est refaite. Rend le nouveau rendu.
  function basculerRendu() {
    const e = _e;
    if (!e || !window.KtaGalerie) return null;
    const vers = e.rendu === "galerie" ? "structures" : "galerie";
    if (typeof window.setPlanRenduVue3D === "function") window.setPlanRenduVue3D(null, vers);
    _reindexer();
    return e.rendu;
  }

  // Tuiles proches construites (toutes à l'ouverture, puis quelques-unes par image), lointaines jetées.
  function _gererTuiles(tout) {
    const e = _e, px = e.pos.x / e.sc, pz = e.pos.y / e.sc;
    const rVue = e.vue === "plongee" ? e.distance * 1.4 : e.distance;
    const rGarde = rVue + 2 * TUILE;
    let construites = 0;
    const t0 = performance.now();
    e.tuiles.forEach(function (t) {
      const dx = Math.max(t.x0 - px, 0, px - t.x1), dz = Math.max(t.z0 - pz, 0, pz - t.z1);
      const d = Math.hypot(dx, dz);
      if (d <= rVue) {
        if (!t.obj && (tout || construites < TUILES_PAR_IMAGE)) { _construireTuile(t); construites++; }
        if (t.obj && !t.obj.visible) { t.obj.visible = true; e.sale = true; }
      } else if (d > rGarde) {
        if (t.obj) { _libererTuile(t); e.sale = true; }
      } else if (t.obj && t.obj.visible) {
        t.obj.visible = false; e.sale = true;
      }
    });
    if (construites) e.msTuiles += performance.now() - t0;
  }

  function _placerCamera() {
    const e = _e, x = e.pos.x / e.sc, z = e.pos.y / e.sc, cap = e.cap * Math.PI / 180;
    e.tete.position.set(x, e.oeil, z);
    e.tete.rotation.set(e.tangage, -cap, 0);
    e.sol.position.set(x, 0, z);
    // Le carré de sol suit la position : le motif est décalé d'autant pour rester fixe sous les pieds.
    e.grain.offset.set(x / GRAIN_METRES, -z / GRAIN_METRES);
    e.plafond.position.set(x, e.hauteur, z);
    e.avatar.position.set(x, 0.45, z);
    e.avatar.rotation.set(0, -cap, 0);
    if (e.vue === "plongee") {
      const fx = Math.sin(cap), fz = -Math.cos(cap), i = e.inclinaison * Math.PI / 180;
      const vx = x + fx * 2, vz = z + fz * 2, h = RECUL_PLONGEE * Math.cos(i);
      e.camera.position.set(vx - fx * h, RECUL_PLONGEE * Math.sin(i), vz - fz * h);
      e.camera.lookAt(vx, 0, vz);
    } else {
      e.camera.position.set(x, e.oeil, z);
      e.camera.rotation.set(e.tangage, -cap, 0);
    }
    _majPanneaux();
    _majBoussole();
  }

  // Rose des vents : même convention que la boussole 2D (compass.js, rotate(-cap)), sur le cap RÉEL de la vue :
  // cap plan − calibration Nord du plan (tracking.js > _getPlanRelHeading fait l'inverse). Sans calibration, la
  // rose montre le haut du plan ; seul son libellé accessible le dit (aucun texte à l'écran, décision produit).
  function _majBoussole() {
    const e = _e;
    if (!e.rose) return;
    const reel = ((e.cap - e.nord) % 360 + 360) % 360;
    if (Math.abs(reel - e.roseAngle) < 0.5) return;
    e.roseAngle = reel;
    e.rose.style.transform = "rotate(" + (-reel).toFixed(1) + "deg)";
  }

  function _lireNord() {
    const e = _e;
    e.nordCalibre = typeof window.getPlanNorthCalibre === "function" && window.getPlanNorthCalibre() === true;
    const lire = typeof window.getPlanNorthOffset === "function" ? window.getPlanNorthOffset : null;
    e.nord = e.nordCalibre && lire ? Number(lire()) || 0 : 0;
    e.roseAngle = NaN;
    if (e.boussole) {
      const non = e.nordCalibre ? "" : " · " + _t("vue3d.nordNonCalibre");
      e.boussole.setAttribute("aria-label", _t("vue3d.boussole") + non);
    }
    e.sale = true;
  }

  // Inclinaison de la vue plongeante, bornée, retenue tant que la vue est ouverte.
  function incliner(deg) {
    if (!_e) return;
    _e.inclinaison = Math.max(INCLINAISON.min, Math.min(INCLINAISON.max, _e.inclinaison + deg));
    _e.sale = true;
  }

  function _appliquerVue() {
    const e = _e, haut = e.vue === "plongee";
    e.plafond.visible = !haut && !e.galerie;
    e.tuiles.forEach(function (t) {
      if (t.obj) t.obj.children.forEach(function (o) { if (o.userData.famille === "plafond") o.visible = !haut; });
    });
    e.avatar.visible = haut;
    e.ambiance.intensity = haut ? 0.9 : 0.04;
    e.scene.fog.near = haut ? e.distance : e.distance * 0.45;
    e.scene.fog.far = haut ? e.distance * 1.4 + 20 : e.distance;
    e.camera.far = haut ? e.distance * 1.4 + 30 : e.distance + 5;
    e.camera.updateProjectionMatrix();
    if (e.boutonVue) e.boutonVue.setAttribute("aria-pressed", haut ? "true" : "false");
    if (e.boutonsIncl) e.boutonsIncl.hidden = !haut;
    e.sale = true;
  }

  // ── Déplacement ────────────────────────────────────────────────────────────────────────────────────

  // Pas de `m` mètres dans la direction `angle` (° plan, 0 = haut de l'image), glisse le long d'un mur si un seul
  // axe passe. ⚠️ Le corps a une largeur : le pas est BALAYÉ par trois segments parallèles (axe et ± RAYON_CORPS),
  // prolongés de RAYON_CORPS devant, puis l'arrivée doit laisser libres RAYONS segments de RAYON_CORPS en étoile
  // (un disque autour de soi) ; tous jugés par la règle du tracker, en un lot (ktaSegmentsBloquesParStructure,
  // types perso compris). Déjà à moins de RAYON_CORPS d'une face (ouvert sur la position du tracker) : l'arrivée
  // peut garder des rayons bloqués, pas plus qu'au départ, sinon on resterait figé contre le mur.
  // 🩸 Avec le seul axe, on frôlait une face à quelques centimètres en biais ou en glissant : la caméra passait
  // alors dans le pilier (plan proche à 5 cm) et l'on voyait au travers ; et les types perso, dessinés en volume,
  // n'arrêtaient rien.
  function _pas(m, angle) {
    const e = _e, a = angle * Math.PI / 180;
    const dx = Math.sin(a) * m * e.sc, dy = -Math.cos(a) * m * e.sc;
    const essais = [[dx, dy], [dx, 0], [0, dy]];
    let auDepart = -1;   // rayons bloqués au départ, lus seulement si une arrivée en a
    const depart = function () { if (auDepart < 0) auDepart = _rayonsBloques(e.pos.x, e.pos.y); return auDepart; };
    for (let i = 0; i < essais.length; i++) {
      const sx = essais[i][0], sy = essais[i][1], l = Math.hypot(sx, sy);
      if (l < 1e-9) continue;
      const x1 = e.pos.x + sx, y1 = e.pos.y + sy;
      const n = _balayage(e.pos.x, e.pos.y, x1, y1, sx / l, sy / l);
      if (n < 0 || (n > 0 && n > depart())) continue;
      e.pos.x = x1; e.pos.y = y1;
      e.aBouge = true;
      e.passageForce = null;
      e.sale = true;
      return true;
    }
    e.butees++;
    return false;
  }

  // → -1 si un couloir est coupé (ou l'arrivée hors plan / hors image de collision), sinon le nombre de rayons
  // bloqués autour de l'arrivée. Un seul lot de segments par essai (_juger : structures ou galerie).
  // Mode galerie : on bute contre les parois et les remblais (KtaGalerie.segmentsBloques), l'image de collision du
  // plan n'est pas lue ; parti d'en dehors des galeries (tracker hors tracé), on se déplace librement pour y entrer.
  function _balayage(x0, y0, x1, y1, ux, uy) {
    const r = RAYON_CORPS * _e.sc, fx = x1 + ux * r, fy = y1 + uy * r, gal = !!_e.galerie;
    const pc = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
    if (pc && (fx < 0 || fy < 0 || fx > pc.imageWidth || fy > pc.imageHeight)) return -1;
    if (gal && !window.KtaGalerie.dedans(x0, y0, _niveauPas())) return 0;
    if (!gal && typeof window.ktaEstAccessible === "function" && !window.ktaEstAccessible(fx, fy)) return -1;
    if (!gal && typeof window.ktaSegmentsBloquesParStructure !== "function") return 0;
    const segs = [];
    for (let i = 0; i < RAILS.length; i++) {
      const ox = -uy * r * RAILS[i], oy = ux * r * RAILS[i];
      segs.push([x0 + ox, y0 + oy, fx + ox, fy + oy]);
    }
    _rayons(segs, x1, y1, r);
    const res = _juger(segs);
    for (let i = 0; i < RAILS.length; i++) { if (res[i]) return -1; }
    let n = 0;
    for (let i = RAILS.length; i < res.length; i++) { if (res[i]) n++; }
    return n;
  }

  function _rayons(segs, x, y, r) {
    for (let i = 0; i < RAYONS; i++) {
      const a = i * 2 * Math.PI / RAYONS;
      segs.push([x, y, x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    return segs;
  }

  function _niveauPas() { return _e.niveau === null ? undefined : _e.niveau; }

  // Règle du rendu affiché : structures (tracking.js, types perso compris) ou parois des galeries.
  function _juger(segs) {
    if (_e.galerie) return window.KtaGalerie.segmentsBloques(segs, _niveauPas());
    if (typeof window.ktaSegmentsBloquesParStructure !== "function") return segs.map(function () { return false; });
    return window.ktaSegmentsBloquesParStructure(segs, _niveauPas(), true);
  }

  function _rayonsBloques(x, y) {
    return _juger(_rayons([], x, y, RAYON_CORPS * _e.sc)).filter(Boolean).length;
  }

  function _passerEnLibre() { if (_e.mode !== "libre") { _e.mode = "libre"; _majBoutonSuivre(); } }

  // ── Changer de niveau par un passage (🪜, mode libre) ─────────────────────────────────────────────────
  // ⚠️ contrat (décision produit) : la 3D change seulement SON niveau ; ni le tracker ni le niveau actif de la
  // carte ne bougent (« Je suis ici ? » recale aussi le niveau à la fermeture). En suivi, le niveau est celui du
  // tracker : 🪜 n'apparaît qu'en libre. Arrivée au raccord validé du niveau choisi, sinon au bout opposé d'un
  // tracé jonction, sinon à la même position (au passage touché s'il est à plus de PASSAGE m). Cap conservé.

  // Niveau a au-dessus de b : d'après les profondeurs saisies si les deux en ont, sinon le plus grand numéro.
  function _auDessus(a, b) {
    const z = typeof window.getProfondeurNiveau === "function" ? window.getProfondeurNiveau : null;
    const za = z ? z(a) : null, zb = z ? z(b) : null;
    return Number.isFinite(za) && Number.isFinite(zb) && za !== zb ? za > zb : a > b;
  }

  // Niveaux proposés : ceux des passages à moins de PASSAGE m (le plus proche d'abord), ou du passage touché.
  function _ciblesProches() {
    const e = _e;
    if (e.mode !== "libre" || !e.passages || !e.passages.length) return [];
    const loin = function (p) { return Math.hypot(p.x - e.pos.x, p.y - e.pos.y) / e.sc; };
    const liste = e.passageForce ? [{ p: e.passageForce, d: loin(e.passageForce) }]
      : e.passages.map(function (p) { return { p: p, d: loin(p) }; })
        .filter(function (q) { return q.d <= PASSAGE; }).sort(function (a, b) { return a.d - b.d; });
    const vus = {}, out = [];
    liste.forEach(function (q) {
      q.p.cibles.forEach(function (c) {
        if (vus[c.niveau] || c.niveau === e.niveau) return;
        vus[c.niveau] = true;
        out.push({ niveau: c.niveau, x: c.x, y: c.y, depuis: q.p, proche: q.d <= PASSAGE });
      });
    });
    return out;
  }

  // Le plus proche au-dessus (haut) ou au-dessous du niveau affiché, parmi `cibles`.
  function _voisin(cibles, haut) {
    let best = null;
    cibles.forEach(function (c) {
      if (_auDessus(c.niveau, _e.niveau) !== haut) return;
      if (!best || (haut ? _auDessus(best.niveau, c.niveau) : _auDessus(c.niveau, best.niveau))) best = c;
    });
    return best;
  }

  // Boîte 🪜 : ▲ / ▼ (un niveau au plus de chaque côté), sinon la liste des niveaux liés. Refaite au changement.
  function _majPassage() {
    const e = _e, boite = e.boiteNiveaux;
    if (!boite) return;
    const cibles = _ciblesProches();
    const nHaut = cibles.filter(function (c) { return _auDessus(c.niveau, e.niveau); }).length;
    const liste = nHaut > 1 || cibles.length - nHaut > 1;
    const sig = cibles.map(function (c) { return c.niveau; }).join(",") + (liste ? "|liste" : "") + "|" + e.niveau;
    if (sig === e.passageSig) return;
    e.passageSig = sig;
    e.passageCibles = { haut: null, bas: null, liste: [] };
    boite.textContent = "";
    boite.hidden = !cibles.length;
    if (!cibles.length) return;
    const marque = document.createElement("span");
    marque.className = "kta-v3d-niveaux-marque";
    marque.textContent = "🪜";
    marque.setAttribute("aria-hidden", "true");
    boite.appendChild(marque);
    if (liste) {
      cibles.slice().sort(function (a, b) { return _auDessus(a.niveau, b.niveau) ? -1 : 1; }).forEach(function (c) {
        const n = _fmtNiveau(c.niveau), fl = _auDessus(c.niveau, e.niveau) ? "▲ " : "▼ ";
        e.passageCibles.liste.push(c);
        _bouton(boite, "kta-v3d-btn-mode", fl + n, _t("vue3d.niveauAller", { n: n }), "niveau")
          .dataset.indice = String(e.passageCibles.liste.length - 1);
      });
      return;
    }
    const h = e.passageCibles.haut = _voisin(cibles, true), b = e.passageCibles.bas = _voisin(cibles, false);
    if (h) {
      _bouton(boite, "kta-v3d-btn-mode", "▲ " + _fmtNiveau(h.niveau),
        _t("vue3d.niveauMonter", { n: _fmtNiveau(h.niveau) }), "niveauHaut");
    }
    if (b) {
      _bouton(boite, "kta-v3d-btn-mode", "▼ " + _fmtNiveau(b.niveau),
        _t("vue3d.niveauDescendre", { n: _fmtNiveau(b.niveau) }), "niveauBas");
    }
  }

  function _allerNiveau(c) {
    const e = _e;
    if (!e || !c || !Number.isInteger(c.niveau)) return false;
    _passerEnLibre();
    const cfg = window.APP_CONFIG || {};
    e.niveauLibre = c.niveau;
    e.actifVu = Number.isInteger(cfg.activeLevel) ? cfg.activeLevel : 0;
    if (Number.isFinite(c.x) && Number.isFinite(c.y)) { e.pos.x = c.x; e.pos.y = c.y; }
    else if (c.depuis && !c.proche) { e.pos.x = c.depuis.x; e.pos.y = c.depuis.y; }
    e.aBouge = true;
    e.passageForce = null;
    e.changementsNiveau++;
    console.log("[Vue3D] passage vers le niveau " + c.niveau);
    _reindexer();
    _majPassage();
    e.sale = true;
    return true;
  }

  // sens : "haut", "bas" ou un numéro de niveau, parmi les passages proches. → true si la scène a changé de niveau.
  function changerNiveau(sens) {
    if (!_e) return false;
    const cibles = _ciblesProches();
    const c = sens === "haut" ? _voisin(cibles, true) : sens === "bas" ? _voisin(cibles, false)
      : cibles.filter(function (q) { return q.niveau === sens; })[0];
    return _allerNiveau(c || null);
  }

  // Toucher un panneau de POI jonction : son passage, d'où que l'on soit (un seul niveau lié : on y va).
  function _toucher(cx, cy) {
    const e = _e, r = e.cv.getBoundingClientRect(), sprites = [];
    if (!r.width || !r.height) return false;
    e.panneaux.forEach(function (sp) {
      if (sp.visible && sp.parent && sp.parent.visible && sp.userData.poi.jonction) sprites.push(sp);
    });
    if (!sprites.length) return false;
    e.rayon = e.rayon || new THREE.Raycaster();
    e.rayon.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1),
      e.camera);
    const hit = e.rayon.intersectObjects(sprites, false)[0];
    if (!hit) return false;
    const poi = hit.object.userData.poi.jonction;
    const pas = e.passages.filter(function (p) { return p.poi === poi; })[0];
    if (!pas) return false;
    const proche = Math.hypot(pas.x - e.pos.x, pas.y - e.pos.y) / e.sc <= PASSAGE;
    const autres = pas.cibles.filter(function (c) { return c.niveau !== e.niveau; });
    if (autres.length === 1) return _allerNiveau(Object.assign({ depuis: pas, proche: proche }, autres[0]));
    _passerEnLibre();
    e.passageForce = pas;
    e.passageSig = null;
    _majPassage();
    return true;
  }

  function _trackerActif() {
    return typeof window.getTrackingActif === "function" && window.getTrackingActif() === true;
  }

  // Bouton 🧭 = interrupteur « suivi » / « libre ». Grisé (mais touchable : il explique) tracker éteint.
  function _majBoutonSuivre() {
    const e = _e, b = e.boutonSuivre;
    if (!b) return;
    const dispo = _trackerActif();
    e.suiviDispo = dispo;
    b.setAttribute("aria-pressed", e.mode === "suivi" ? "true" : "false");
    b.classList.toggle("kta-v3d-inactif", !dispo);
    const t = !dispo ? _t("vue3d.suiviIndispo") : _t(e.mode === "suivi" ? "vue3d.passerLibre" : "vue3d.suivre");
    b.title = t;
    b.setAttribute("aria-label", t);
    // Mode écrit en clair : sans lui, rien ne disait qu'on était passé en libre ni comment revenir au suivi.
    // 🧭 = le tracker, comme son menu sur la carte (📍 y est le recalage).
    b.textContent = e.mode === "suivi" ? "🧭 " + _t("vue3d.etatSuivi") : "🕹️ " + _t("vue3d.etatLibre");
  }

  // Mode « suivi » : position du tracker et cap de l'appareil, la même source que le mode « plan orienté »
  // (tracking.js > getPlanRelHeading, offset Nord du plan compris ; mapBearing.js la lit aussi). Tracker
  // arrêté en route : retour au mode libre, là où l'on est.
  function basculerSuivi() {
    const e = _e;
    if (!e) return false;
    if (e.mode === "suivi") { _passerEnLibre(); return true; }
    if (!_trackerActif()) {
      _majBoutonSuivre();
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast(_t("vue3d.suiviIndispo"), "warn");
      }
      return false;
    }
    suivre();
    return true;
  }

  function _lireTracker() {
    const e = _e;
    if (typeof window.getTrackingPosition !== "function") return;
    const p = window.getTrackingPosition();
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    // Lissage : un pas du tracker (~0,7 m d'un coup) glisse sur quelques images au lieu de sauter.
    // Sous 1 cm, la position est posée d'un coup : la scène ne se redessine plus pour rien.
    const kx = p.x - e.pos.x, ky = p.y - e.pos.y;
    if (Math.abs(kx) + Math.abs(ky) > 0.01) {
      const saut = Math.hypot(kx, ky) > 10 * e.sc, fin = Math.hypot(kx, ky) < 0.01 * e.sc;
      e.pos.x = saut || fin ? p.x : e.pos.x + kx * 0.25;
      e.pos.y = saut || fin ? p.y : e.pos.y + ky * 0.25;
      e.sale = true;
    }
    // Cap : le bruit de la boussole (écart < BRUIT_CAP) ne relance pas le rendu ; un vrai virage se suit jusqu'au
    // bout (à 0,2° près), puis la vue se repose. Sans ce seuil, on redessinait à chaque image en restant immobile.
    if (typeof window.getPlanRelHeading === "function") {
      const c = Number(window.getPlanRelHeading());
      if (Number.isFinite(c)) {
        const dc = ((c - e.cap + 540) % 360) - 180, adc = Math.abs(dc);
        if (adc > BRUIT_CAP) e.virage = true;
        if (e.virage && adc > 0.2) { e.cap = (e.cap + dc * 0.3 + 360) % 360; e.sale = true; }
        else e.virage = false;
      }
    }
  }

  // ── Boucle ─────────────────────────────────────────────────────────────────────────────────────────

  function _image(ts) {
    const e = _e;
    if (!e) return;
    e.raf = requestAnimationFrame(_image);
    const dt = e.tsPrec ? Math.min(0.1, (ts - e.tsPrec) / 1000) : 0;
    e.tsPrec = ts;
    const k = e.touches;
    const rapide = k.Shift || (k.av && e.avDepuis > 0 && ts - e.avDepuis > APPUI_LONG);
    const vit = VITESSE * (rapide ? FACTEUR_RAPIDE : 1);
    const av = (k.av ? 1 : 0) - (k.ar ? 1 : 0), lat = (k.dr ? 1 : 0) - (k.ga ? 1 : 0);
    const rot = (k.td ? 1 : 0) - (k.tg ? 1 : 0);
    e.rapide = !!rapide && !!(av || lat);
    if (av || lat || rot) _passerEnLibre();
    if (rot) { e.cap = (e.cap + rot * ROTATION * dt + 360) % 360; e.sale = true; }
    if (av) _pas(vit * dt * av, e.cap);
    if (lat) _pas(vit * dt, e.cap + 90 * lat);
    if (_trackerActif() !== e.suiviDispo) {
      if (e.mode === "suivi" && !_trackerActif()) e.mode = "libre";
      _majBoutonSuivre();
    }
    if (e.mode === "suivi") _lireTracker();
    _majPassage();
    const niv = _niveauCourant();
    if (niv !== e.niveau || e.filtresChanges) { e.filtresChanges = false; _reindexer(); }
    _gererTuiles(false);
    if (e.perdu) return;
    _redimensionner();
    if (!e.sale) return;
    e.sale = false;
    _placerCamera();
    e.renderer.render(e.scene, e.camera);
    e.images++;
    if (e.compteur) {
      e.compteurN++;
      if (ts - e.compteurT0 > 1000) {
        e.compteur.textContent = _t("vue3d.stats", { ips: Math.round(e.compteurN * 1000 / (ts - e.compteurT0)),
          tri: e.renderer.info.render.triangles, appels: e.renderer.info.render.calls });
        e.compteurN = 0; e.compteurT0 = ts;
      }
    }
  }

  function _redimensionner() {
    const e = _e, w = e.cv.clientWidth, h = e.cv.clientHeight;
    if (!w || !h || (w === e.w && h === e.h)) return;
    e.w = w; e.h = h;
    e.renderer.setSize(w, h, false);
    e.camera.aspect = w / h;
    e.camera.updateProjectionMatrix();
    e.sale = true;
  }

  // ── Interface (aucun script en ligne : écouteurs posés ici) ──────────────────────────────────────────

  const TOUCHES = {
    ArrowUp: "av", KeyW: "av", KeyZ: "av", ArrowDown: "ar", KeyS: "ar",
    ArrowLeft: "tg", ArrowRight: "td", KeyA: "ga", KeyQ: "ga", KeyD: "dr", KeyE: "dr"
  };

  function _bouton(parent, cls, txt, titre, action) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kta-v3d-btn " + cls;
    b.textContent = txt;
    b.title = titre;
    b.setAttribute("aria-label", titre);
    if (action) b.dataset.v3d = action;
    parent.appendChild(b);
    return b;
  }

  // Rangée du haut, à droite (row-reverse : l'ordre CSS de chaque élément dit sa place, de droite à gauche) : ✕
  // toujours au coin haut droit, même quand la rangée passe sur deux lignes au téléphone, puis 🚨, ❓ (posé par
  // interfaceDocs.js > _aidePoserBouton dans l'en-tête marqué kta-aide-ctx-entete), ≡, vue, hauteur, rendu, mode et
  // la marque « bêta ». Réglage de hauteur sur sa propre ligne dessous. Ordre de tabulation = ordre du DOM.
  function _monterDom(stats) {
    const e = _e;
    const ov = document.createElement("div");
    ov.id = "kta-vue3d";
    ov.className = "kta-vue3d";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", _t("vue3d.titre"));
    ov.tabIndex = -1;
    const cv = document.createElement("canvas");
    cv.className = "kta-v3d-canvas";
    ov.appendChild(cv);
    const haut = document.createElement("div");
    haut.className = "kta-v3d-haut kta-aide-ctx-entete";
    const fermer = _bouton(haut, "kta-v3d-fermer", "✕", _t("vue3d.fermer"), "fermer");
    fermer.setAttribute("data-aide-croix", "");
    const urgence = _bouton(haut, "kta-v3d-urgence", "🚨", _t("ui.refonte.counter_sortie_title"), "urgence");
    urgence.setAttribute("aria-label", _t("ui.refonte.counter_sortie_title"));
    // ≡ = le panneau ≡ Filtres de la carte ; titre et pastille posés par FilterPanel.majBadge
    // (data-kta-pastille-filtres).
    e.boutonFiltres = _bouton(haut, "kta-v3d-filtres", "≡", _t("ui.filter.title"), "filtres");
    e.boutonFiltres.setAttribute("aria-label", _t("ui.filter.aria"));
    e.boutonFiltres.setAttribute("data-kta-pastille-filtres", "");
    e.boutonVue = _bouton(haut, "kta-v3d-vue", "🦅", _t("vue3d.plongee"), "vue");
    e.boutonHauteur = _bouton(haut, "kta-v3d-btn-mode kta-v3d-btn-hauteur", "", _t("vue3d.hauteur"), "hauteur");
    e.boutonHauteur.setAttribute("aria-expanded", "false");
    e.boutonRendu = _bouton(haut, "kta-v3d-btn-mode kta-v3d-btn-rendu", "", "", "rendu");
    e.boutonSuivre = _bouton(haut, "kta-v3d-btn-mode kta-v3d-btn-suivre", "🧭", _t("vue3d.suivre"), "suivre");
    const beta = document.createElement("span");
    beta.className = "kta-v3d-beta";
    beta.textContent = _t("vue3d.beta");
    haut.appendChild(beta);
    // Réglage de la hauteur : − valeur +, sous la rangée du haut, ouvert par ⛏️.
    const regl = document.createElement("div");
    regl.className = "kta-v3d-hauteur";
    regl.setAttribute("role", "group");
    regl.setAttribute("aria-label", _t("vue3d.hauteurReglage"));
    regl.hidden = true;
    e.hauteurMoins = _bouton(regl, "", "−", _t("vue3d.hauteurMoins"), "hauteurMoins");
    e.hauteurValeur = document.createElement("span");
    e.hauteurValeur.className = "kta-v3d-hauteur-valeur";
    e.hauteurValeur.setAttribute("aria-live", "polite");
    regl.appendChild(e.hauteurValeur);
    e.hauteurPlus = _bouton(regl, "", "+", _t("vue3d.hauteurPlus"), "hauteurPlus");
    haut.appendChild(regl);
    e.reglageHauteur = regl;
    ov.appendChild(haut);
    e.haut = haut;
    // Bandeau sous la rangée du haut (vide pour l'instant) : un message durable de la vue s'y pose ; les toasts de
    // l'app passent dessous (_majSousHaut).
    const bandeau = document.createElement("div");
    bandeau.className = "kta-v3d-bandeau";
    bandeau.setAttribute("aria-live", "polite");
    bandeau.hidden = true;
    ov.appendChild(bandeau);
    e.bandeau = bandeau;
    const pad = document.createElement("div");
    pad.className = "kta-v3d-pad";
    _bouton(pad, "kta-v3d-tg", "↶", _t("vue3d.tournerGauche"), "tg");
    _bouton(pad, "kta-v3d-av", "▲", _t("vue3d.avancer"), "av");
    _bouton(pad, "kta-v3d-td", "↷", _t("vue3d.tournerDroite"), "td");
    _bouton(pad, "kta-v3d-ga", "◀", _t("vue3d.pasGauche"), "ga");
    _bouton(pad, "kta-v3d-ar", "▼", _t("vue3d.reculer"), "ar");
    _bouton(pad, "kta-v3d-dr", "▶", _t("vue3d.pasDroite"), "dr");
    ov.appendChild(pad);
    // Inclinaison (vue plongeante seulement) : deux petits boutons à droite.
    const incl = document.createElement("div");
    incl.className = "kta-v3d-incl";
    incl.hidden = true;
    _bouton(incl, "kta-v3d-btn-petit", "▲", _t("vue3d.inclinaisonPlus"), "inclPlus");
    _bouton(incl, "kta-v3d-btn-petit", "▼", _t("vue3d.inclinaisonMoins"), "inclMoins");
    ov.appendChild(incl);
    e.boutonsIncl = incl;
    // Rose des vents (image de la boussole 2D, précachée).
    const bous = document.createElement("div");
    bous.className = "kta-v3d-boussole";
    bous.setAttribute("role", "img");
    bous.setAttribute("aria-label", _t("vue3d.boussole"));
    const rose = document.createElement("img");
    rose.className = "kta-v3d-rose";
    rose.src = "icon/compass.svg";
    rose.alt = "";
    rose.draggable = false;
    bous.appendChild(rose);
    ov.appendChild(bous);
    e.rose = rose; e.boussole = bous;
    if (stats) {
      e.compteur = document.createElement("div");
      e.compteur.className = "kta-v3d-stats";
      ov.appendChild(e.compteur);
    }
    // Passage vers un autre niveau (🪜), à gauche, montré près d'un passage en mode libre (_majPassage).
    const niv = document.createElement("div");
    niv.className = "kta-v3d-niveaux";
    niv.setAttribute("role", "group");
    niv.setAttribute("aria-label", _t("vue3d.passage"));
    niv.hidden = true;
    ov.appendChild(niv);
    e.boiteNiveaux = niv;
    document.body.appendChild(ov);
    e.ov = ov; e.cv = cv;
    document.documentElement.classList.add("kta-vue3d-ouverte");
    _majBoutonSuivre();
    _majHauteur();
    if (window.FilterPanel && typeof window.FilterPanel.majBadge === "function") window.FilterPanel.majBadge();
    _majSousHaut();
  }

  // Bas de la rangée du haut (et du bandeau s'il est montré), en px, posé sur <html> : css/vue3d.css y descend la
  // pile des toasts de l'app pendant la vue. Refait au redimensionnement et à chaque ouverture / fermeture d'un
  // réglage ou du bandeau.
  function _majSousHaut() {
    const e = _e;
    if (!e || !e.haut) return;
    let bas = e.haut.getBoundingClientRect().bottom;
    if (e.bandeau && !e.bandeau.hidden) bas = Math.max(bas, e.bandeau.getBoundingClientRect().bottom);
    const v = Math.round(bas + 8) + "px";
    if (v === e.sousHaut) return;
    e.sousHaut = v;
    document.documentElement.style.setProperty("--kta-v3d-sous-haut", v);
  }

  // ── Hauteur des galeries (même chiffre que ⛏️ Volume exploité) ──────────────────────────────────────

  function _oeil(h) { return Math.min(OEIL, Math.max(0.4, h * 0.8)); }

  function _majHauteur() {
    const e = _e, txt = typeof window.formatDistance === "function" ? window.formatDistance(e.hauteur, 1)
      : e.hauteur.toFixed(1) + " m";
    // ⛏️ comme l'outil Volume exploité, dont c'est le même chiffre (↕ dit déjà « passage entre niveaux » en 2D).
    if (e.boutonHauteur) e.boutonHauteur.textContent = "⛏️ " + txt;
    if (e.hauteurValeur) e.hauteurValeur.textContent = txt;
    if (e.hauteurMoins) e.hauteurMoins.disabled = e.hauteur <= HAUTEUR_REGLAGE.min;
    if (e.hauteurPlus) e.hauteurPlus.disabled = e.hauteur >= HAUTEUR_REGLAGE.max;
  }

  function _basculerReglageHauteur() {
    const e = _e, r = e.reglageHauteur;
    if (!r) return;
    r.hidden = !r.hidden;
    e.boutonHauteur.setAttribute("aria-expanded", r.hidden ? "false" : "true");
    _majSousHaut();
  }

  // Hauteur bornée à HAUTEUR_REGLAGE et arrondie à 0,1 m, écrite pour le plan (⛏️ Volume exploité la relit), puis
  // tuiles refaites à cette hauteur (structures, tubes, remblais, murs, rideaux, plafond, œil) ; position, cap, niveau
  // et rendu gardés. Une hauteur saisie hors bornes dans ⛏️ est montrée telle quelle jusqu'au premier − / +.
  // Rend la hauteur retenue (null : vue fermée).
  function reglerHauteur(m) {
    const e = _e;
    if (!e) return null;
    const v = Math.round(Math.max(HAUTEUR_REGLAGE.min, Math.min(HAUTEUR_REGLAGE.max, Number(m))) * 10) / 10;
    if (!Number.isFinite(v)) return e.hauteur;
    if (typeof window.setPlanHauteurGalerie === "function") window.setPlanHauteurGalerie(null, v);
    if (v !== e.hauteur) {
      e.hauteur = v;
      e.oeil = _oeil(v);
      _refaireTuiles();
    }
    _majHauteur();
    return v;
  }

  function _compter(o, cle) { o[cle] = (o[cle] || 0) + 1; }

  // ── Fenêtres de l'app au-dessus de la vue, clavier ──────────────────────────────────────────────────

  // Une fenêtre de l'app couvre la vue (au centre de l'écran, un élément qui n'est pas de la vue) ? Les toasts ne
  // comptent pas : ils laissent passer les touchers (pointer-events: none), elementFromPoint les ignore aussi.
  function _recouverte() {
    const e = _e, r = e.ov.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el && !e.ov.contains(el);
  }

  // Tab reste dans la vue (fenêtre modale) : du dernier bouton on revient au premier, et inversement.
  function _tabulation(ev) {
    const e = _e, liste = Array.prototype.filter.call(e.ov.querySelectorAll("button"), function (b) {
      return !b.disabled && b.offsetParent !== null;
    });
    if (!liste.length) return;
    const i = liste.indexOf(document.activeElement), der = liste.length - 1;
    const cible = ev.shiftKey ? (i <= 0 ? liste[der] : null) : (i < 0 || i === der ? liste[0] : null);
    if (!cible) return;
    ev.preventDefault();
    ev.stopPropagation();
    cible.focus();
  }

  // ≡ = le panneau ≡ Filtres de la carte (filterPanel.js), posé par-dessus la vue : un seul état, partagé.
  function _ouvrirFiltres() {
    if (window.FilterPanel && typeof window.FilterPanel.ouvrir === "function") window.FilterPanel.ouvrir();
  }

  // 🚨 = le bouton de l'en-tête (SortieUrgence.declencher). Sans position connue du tracker, elle se demande sur la
  // carte 2D : la vue se ferme d'abord, sinon le pointeur « Où es-tu ? » resterait sous elle.
  function _urgence() {
    const S = window.SortieUrgence;
    if (!S || typeof S.declencher !== "function") {
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast(_t("ui.refonte.sortie_indispo"), "error");
      }
      return;
    }
    if (typeof S.demandeLaCarte === "function" && S.demandeLaCarte()) {
      fermer().then(function () { S.declencher(); });
      return;
    }
    S.declencher();
  }

  function _brancher() {
    const e = _e, l = e.ecouteurs;
    const on = function (cible, type, f, opt) { cible.addEventListener(type, f, opt); l.push([cible, type, f, opt]); };
    // Boutons maintenus (déplacement) : pointerdown → actif jusqu'au relâchement ou à la sortie du bouton.
    const relacher = function () {
      ["av", "ar", "tg", "td", "ga", "dr"].forEach(function (k) { e.touches[k] = false; });
      e.avDepuis = 0;
    };
    // 🩸 ✕, ≡ et 🚨 agissent au `click`, jamais au pointerdown : ce qui s'ouvre ou disparaît sous le doigt recevait
    // le clic du même toucher (vue retirée : 🚨 de l'en-tête dessous ; panneau ouvert : son fond, qui le referme).
    on(e.ov, "click", function (ev) {
      const b = ev.target.closest && ev.target.closest('[data-v3d]');
      const a = b && b.dataset.v3d;
      if (a === "fermer") fermer();
      else if (a === "filtres") _ouvrirFiltres();
      else if (a === "urgence") _urgence();
    });
    on(e.ov, "pointerdown", function (ev) {
      const b = ev.target.closest && ev.target.closest("[data-v3d]");
      if (!b) return;
      const a = b.dataset.v3d;
      if (a === "fermer" || a === "filtres" || a === "urgence") return;
      if (a === "vue") { basculerVue(); return; }
      if (a === "rendu") { basculerRendu(); return; }
      if (a === "hauteur") { _basculerReglageHauteur(); return; }
      if (a === "hauteurMoins" || a === "hauteurPlus") {
        ev.preventDefault();
        reglerHauteur(e.hauteur + (a === "hauteurPlus" ? 0.1 : -0.1));
        return;
      }
      if (a === "niveauHaut" || a === "niveauBas") { changerNiveau(a === "niveauHaut" ? "haut" : "bas"); return; }
      if (a === "niveau") {
        _allerNiveau(e.passageCibles && e.passageCibles.liste[Number(b.dataset.indice)]);
        return;
      }
      if (a === "suivre") { basculerSuivi(); return; }
      if (a === "inclPlus" || a === "inclMoins") {
        ev.preventDefault();
        incliner(a === "inclPlus" ? INCLINAISON.pas * 2 : -INCLINAISON.pas * 2);
        return;
      }
      ev.preventDefault();
      e.touches[a] = true;
      // Appui long sur ▲ = pas rapide (pendant de Maj au clavier). Même base de temps que requestAnimationFrame.
      if (a === "av") e.avDepuis = performance.now();
    });
    on(window, "pointerup", relacher);
    on(window, "pointercancel", relacher);
    on(e.ov, "pointerout", function (ev) { if (ev.target.dataset && ev.target.dataset.v3d) relacher(); });
    // Glisser sur la scène : un doigt tourne (horizontal) et lève / baisse les yeux (vertical) ; deux doigts,
    // glissés à la verticale, inclinent la vue plongeante (vers le haut = plus rasante).
    let glisse = null;
    const doigts = new Map();
    // Toucher bref et immobile (< 8 px, < 0,5 s) : un panneau de POI jonction ? (_toucher).
    let tape = null;
    on(e.cv, "pointerdown", function (ev) {
      tape = doigts.size === 0 ? { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: performance.now() } : null;
      doigts.set(ev.pointerId, ev.clientY);
      glisse = doigts.size === 1 ? { x: ev.clientX, y: ev.clientY } : null;
      try { e.cv.setPointerCapture(ev.pointerId); } catch (err) { /* pointeur déjà relâché */ }
    });
    on(e.cv, "pointermove", function (ev) {
      if (doigts.size >= 2 && doigts.has(ev.pointerId)) {
        const dy = ev.clientY - doigts.get(ev.pointerId);
        doigts.set(ev.pointerId, ev.clientY);
        if (e.vue === "plongee" && dy) incliner(dy * 0.15 / doigts.size);
        return;
      }
      if (!glisse) return;
      const dx = ev.clientX - glisse.x, dy = ev.clientY - glisse.y;
      glisse = { x: ev.clientX, y: ev.clientY };
      // 🩸 En suivi, le cap est celui de l'appareil : glisser ne règle que le regard haut/bas. Tourner au doigt
      // quittait le suivi au moindre toucher (un tap bouge toujours d'un pixel ou deux).
      if (dx && e.mode !== "suivi") e.cap = (e.cap + dx * 0.25 + 360) % 360;
      e.tangage = Math.max(-1, Math.min(1, e.tangage - dy * 0.004));
      e.sale = true;
    });
    const lever = function (ev) {
      doigts.delete(ev.pointerId);
      glisse = null;
      if (ev.type === "pointerup" && tape && tape.id === ev.pointerId && doigts.size === 0 &&
          Math.hypot(ev.clientX - tape.x, ev.clientY - tape.y) < 8 && performance.now() - tape.t < 500) {
        _toucher(ev.clientX, ev.clientY);
      }
      tape = null;
    };
    on(e.cv, "pointerup", lever);
    on(e.cv, "pointercancel", lever);
    // Molette (PC) : incline la vue plongeante (vers soi = plus verticale).
    on(e.cv, "wheel", function (ev) {
      if (e.vue !== "plongee") return;
      ev.preventDefault();
      incliner(ev.deltaY < 0 ? INCLINAISON.pas : -INCLINAISON.pas);
    }, { passive: false });
    on(window, "kta:northOffsetChange", function () { _lireNord(); });
    on(e.cv, "contextmenu", function (ev) { ev.preventDefault(); });
    // Clavier : capturé pendant que la vue est ouverte (les raccourcis de la carte ne partent pas dessous).
    // Une fenêtre de l'app par-dessus la vue (≡ Filtres, Aide, Sortie d'urgence, confirmation) garde ses touches :
    // Échap la ferme, elle, et les flèches ne déplacent pas la scène dessous.
    on(document, "keydown", function (ev) {
      if (_recouverte()) return;
      if (ev.key === "Escape") {
        ev.stopPropagation(); ev.preventDefault();
        // Échap ferme d'abord un réglage ouvert, puis la vue.
        if (e.reglageHauteur && !e.reglageHauteur.hidden) { _basculerReglageHauteur(); return; }
        fermer();
        return;
      }
      if (ev.key === "Tab") { _tabulation(ev); return; }
      if (ev.code === "KeyV") { ev.stopPropagation(); basculerVue(); return; }
      if (ev.key === "PageUp" || ev.key === "PageDown") {
        ev.stopPropagation(); ev.preventDefault();
        incliner(ev.key === "PageUp" ? INCLINAISON.pas : -INCLINAISON.pas);
        return;
      }
      if (ev.key === "Shift") e.touches.Shift = true;
      const a = TOUCHES[ev.code];
      if (!a) return;
      ev.stopPropagation(); ev.preventDefault();
      e.touches[a] = true;
    }, true);
    on(document, "keyup", function (ev) {
      if (ev.key === "Shift") e.touches.Shift = false;
      const a = TOUCHES[ev.code];
      if (a) { e.touches[a] = false; ev.stopPropagation(); }
    }, true);
    on(window, "blur", relacher);
    on(window, "resize", function () { _majSousHaut(); });
    // Filtres de la carte changés (ici ou en 2D) : la scène est refaite à l'image suivante, une fois même si
    // plusieurs cases changent d'un coup (« Tout masquer »).
    if (window.FilterPanel && typeof window.FilterPanel.onChange === "function") {
      e.desabonner = window.FilterPanel.onChange(function () { if (_e) _e.filtresChanges = true; });
    }
    // 🩸 Contexte perdu (mémoire graphique iOS, onglet longtemps en fond) : preventDefault demande au navigateur de
    // le rendre. On attend ATTENTE_REPRISE d'écran visible (un onglet caché n'est pas rendu avant d'être revu),
    // puis on ferme avec un message plutôt qu'un écran noir figé.
    on(e.cv, "webglcontextlost", function (ev) {
      ev.preventDefault();
      console.warn("[Vue3D] contexte WebGL perdu : attente de la reprise");
      e.perdu = true;
      e.msPerdu = 0;
      relacher();
      let t0 = performance.now();
      clearInterval(e.minuterie);
      e.minuterie = setInterval(function () {
        const t = performance.now();
        if (document.visibilityState !== "hidden") e.msPerdu += t - t0;
        t0 = t;
        if (e.perdu && e.msPerdu >= e.attenteReprise) _fermerSansContexte();
      }, Math.min(500, e.attenteReprise));
    });
    // Reprise : three.js a déjà refait son état (son écouteur passe avant celui-ci). La scène est remontée à neuf.
    // 🩸 Jamais dispose() sur les objets d'avant la perte : leurs écouteurs appartiennent à l'ancien état de
    // three.js et effaceraient sur le nouveau contexte des objets qui n'en sont pas (« object does not belong to
    // this context »). Leur mémoire GPU est morte avec l'ancien contexte ; le ramasse-miettes prend le reste.
    on(e.cv, "webglcontextrestored", function () {
      clearInterval(e.minuterie);
      e.perdu = false;
      e.reprises++;
      e.tuiles.forEach(function (t) { t.obj = null; });
      _monterScene();
      _reindexer();
      _appliquerVue();
      e.w = 0;          // taille et projection reposées à la prochaine image
      e.sale = true;
      console.log("[Vue3D] contexte WebGL repris, scène remontée");
    });
  }

  function _fermerSansContexte() {
    console.warn("[Vue3D] contexte WebGL non repris : vue fermée");
    _demonter("contexte");
    _toast("vue3d.contextePerdu");
  }

  // ── API ────────────────────────────────────────────────────────────────────────────────────────────

  // Refus avec un message (le bouton de la barre fait le même test avant de charger quoi que ce soit) : sans
  // échelle, 1 px vaudrait 1 m et la scène serait fausse sans le dire.
  function ouvrir(opts) {
    const o = opts || {};
    if (_e) return Promise.resolve(true);
    if (!window.map || !window.PLAN_CONFIG || !window.APP_CONFIG) {
      _alerte("vue3d.sansPlan");
      return Promise.resolve(false);
    }
    if (!_echelle()) { _alerte("vue3d.sansEchelle"); return Promise.resolve(false); }
    return Promise.all([_chargerThree(), _chargerCss()]).catch(function (err) {
      console.warn("[Vue3D] three.js introuvable :", err && err.message);
      _alerte("vue3d.chargementImpossible");
      return null;
    }).then(function (charges) {
      if (!charges) return false;
      if (_e) return true;
      const sc = _echelle();
      const hauteur = (typeof window.getPlanHauteurGalerie === "function" && window.getPlanHauteurGalerie()) ||
        HAUTEUR_DEFAUT;
      const pos = o.depart ||
        (typeof window.getTrackingPosition === "function" ? window.getTrackingPosition() : null) ||
        { x: window.PLAN_CONFIG.plan.imageWidth / 2, y: window.PLAN_CONFIG.plan.imageHeight / 2 };
      const cap = o.depart && Number.isFinite(o.depart.cap) ? o.depart.cap
        : (typeof window.getPlanRelHeading === "function" ? Number(window.getPlanRelHeading()) || 0 : 0);
      _e = {
        sc: sc, hauteur: hauteur, oeil: _oeil(hauteur),
        distance: o.distanceVue > 0 ? o.distanceVue : DISTANCE_VUE, tuilesActives: o.tuiles !== false,
        pos: { x: pos.x, y: pos.y }, cap: cap, tangage: 0, vue: "yeux",
        mode: o.depart || !_trackerActif() ? "libre" : "suivi",
        touches: {}, ecouteurs: [], tuiles: new Map(), couleurs: new Map(), sale: true, images: 0, butees: 0,
        msIndex: 0, msTuiles: 0, compteurN: 0, compteurT0: 0, w: 0, h: 0, aBouge: false, perdu: false,
        msPerdu: 0, reprises: 0, minuterie: null, inclinaison: INCLINAISON.defaut, nord: 0, nordCalibre: false,
        roseAngle: NaN, rendu: "structures", galerie: null, passages: [], passageSig: null, passageCibles: null,
        passageForce: null, niveauLibre: null, actifVu: null, changementsNiveau: 0, poiMasques: 0,
        zonesDecoupees: {}, rideaux: [], facesRemblais: 0, rubans: {}, liseres: {}, filtresChanges: false,
        virage: false, desabonner: null, sousHaut: null,
        retourFocus: o.retourFocus || document.activeElement || null,
        attenteReprise: o.attenteReprise > 0 ? o.attenteReprise : ATTENTE_REPRISE
      };
      const t0 = performance.now();
      _monterDom(!!o.stats);
      try {
        _e.renderer = new THREE.WebGLRenderer({ canvas: _e.cv, antialias: (window.devicePixelRatio || 1) < 2,
          powerPreference: "high-performance" });
      } catch (err) {
        console.warn("[Vue3D] WebGL indisponible :", err && err.message);
        _demonter("indisponible");
        _alerte("vue3d.indisponible");
        return false;
      }
      // Densité plafonnée : au-delà de 2, le coût de remplissage (x 2,25 de 2 à 3) ne se voit pas à l'œil.
      _e.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.densiteMax > 0 ? o.densiteMax : 2));
      // Tons compressés : une face claire (pilier doré) éclairée de près ne sature pas en aplat.
      _e.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      _monterScene();
      _lireNord();
      _brancher();
      _redimensionner();
      _reindexer();
      _appliquerVue();
      _placerCamera();
      _e.msOuverture = performance.now() - t0;
      _e.raf = requestAnimationFrame(_image);
      // Focus dans la fenêtre (Tab y reste, _tabulation) ; rendu à l'appelant à la fermeture.
      try { _e.ov.focus({ preventScroll: true }); } catch (err) { /* focus refusé : sans effet sur la vue */ }
      console.log("[Vue3D] ouverte en " + Math.round(_e.msOuverture) + " ms (" + _e.tuiles.size + " tuiles)");
      return true;
    });
  }

  function _demonter(raison) {
    const e = _e;
    if (!e) return;
    _derniereFermeture = raison || "utilisateur";
    if (e.raf) cancelAnimationFrame(e.raf);
    clearInterval(e.minuterie);
    e.ecouteurs.forEach(function (x) { x[0].removeEventListener(x[1], x[2], x[3]); });
    if (e.desabonner) e.desabonner();
    document.documentElement.classList.remove("kta-vue3d-ouverte");
    document.documentElement.style.removeProperty("--kta-v3d-sous-haut");
    if (e.renderer) {
      e.tuiles.forEach(_libererTuile);
      if (e.sol) e.sol.geometry.dispose();
      if (e.avatar) e.avatar.geometry.dispose();
      if (e.mats) Object.keys(e.mats).forEach(function (k) { e.mats[k].dispose(); });
      if (e.grain) e.grain.dispose();
      if (e.grainMonde) e.grainMonde.dispose();
      if (e.moellons) e.moellons.dispose();
      if (e.lampe) e.lampe.dispose();
      e.renderer.dispose();
      const gl = e.renderer.getContext();
      if (!gl.isContextLost()) e.renderer.forceContextLoss();
      _dernierGl = gl;
    }
    if (e.ov && e.ov.parentNode) e.ov.parentNode.removeChild(e.ov);
    _e = null;
    // Focus rendu à ce qui l'avait (le bouton cube), sinon au bouton de la barre.
    const r = e.retourFocus && e.retourFocus.isConnected ? e.retourFocus : document.querySelector(".kta-vue3d-ctrl a");
    if (r && typeof r.focus === "function") { try { r.focus({ preventScroll: true }); } catch (err) { /* rien */ } }
  }

  // Fermeture par l'utilisateur (✕, Échap, API). Suivi actif et position 3D écartée du tracker par un
  // déplacement : « Je suis ici ? » (Oui = recalage du tracker, Non = rien ne change). Rend true si recalé.
  function fermer() {
    const e = _e;
    if (!e) return Promise.resolve(false);
    const pos = { x: e.pos.x, y: e.pos.y }, niveau = e.niveau, sc = e.sc, bouge = e.aBouge;
    const suivi = e.mode === "suivi";
    _demonter("utilisateur");
    console.log("[Vue3D] fermée");
    const actif = typeof window.getTrackingActif === "function" && window.getTrackingActif() === true;
    const tr = typeof window.getTrackingPosition === "function" ? window.getTrackingPosition() : null;
    // En suivi sans déplacement libre, la place est celle du tracker (la vue n'en garde qu'une version lissée).
    const ici = suivi && !bouge && tr && Number.isFinite(tr.x) && Number.isFinite(tr.y) ? { x: tr.x, y: tr.y } : pos;
    _placerCarte(ici, niveau);
    if (!bouge || !actif || !tr || typeof window.recalerTrackerSurPoint !== "function" ||
        typeof window.ktaConfirm !== "function") return Promise.resolve(false);
    // Passé à un autre niveau que celui du tracker (🪜) : la question se pose aussi, et recale le niveau.
    const nivTr = typeof window.getTrackerLevel === "function" ? window.getTrackerLevel() : null;
    const autreNiveau = niveau !== null && Number.isInteger(nivTr) && niveau !== nivTr;
    if (Math.hypot(pos.x - tr.x, pos.y - tr.y) / sc < SEUIL_RECALAGE && !autreNiveau) return Promise.resolve(false);
    const texte = autreNiveau ? _t("vue3d.jeSuisIci.texteNiveau", { n: _fmtNiveau(niveau) })
      : _t("vue3d.jeSuisIci.texte");
    return window.ktaConfirm(window.ktaEsc(texte), {
      titre: window.ktaEsc(_t("vue3d.jeSuisIci.titre")),
      okLabel: window.ktaEsc(_t("vue3d.jeSuisIci.oui")),
      cancelLabel: window.ktaEsc(_t("vue3d.jeSuisIci.non"))
    }).then(function (oui) {
      if (!oui) return false;
      window.recalerTrackerSurPoint(pos.x, pos.y, niveau === null ? undefined : niveau);
      return true;
    });
  }

  // ⚠️ contrat (décision produit) : à la sortie, la carte 2D se place là où l'on était en 3D, quelle que soit la
  // réponse à « Je suis ici ? » : niveau de la 3D (s'il diffère, après un passage 🪜), centre sur la position, sans
  // animation, zoom gardé (au moins 0). Pendant la 3D, la carte ne bouge pas. Plan orienté actif : setView ne
  // touche pas à la rotation (portée par le pane intercalaire de mapBearing.js, réappliquée au déplacement).
  function _placerCarte(p, niveau) {
    const map = window.map, cfg = window.APP_CONFIG || {};
    if (!map || typeof window.convertCoord !== "function" || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    if (cfg.multiLevel === true && Number.isInteger(niveau) && cfg.activeLevel !== niveau &&
        typeof window.ktaSetActiveLevel === "function") {
      try { window.ktaSetActiveLevel(niveau, { source: "vue3d" }); } catch (err) { /* niveau absent */ }
    }
    try {
      map.setView(window.convertCoord(p.x, p.y), Math.max(map.getZoom(), 0), { animate: false });
    } catch (err) { console.warn("[Vue3D] carte non recentrée :", err && err.message); }
  }

  function basculerVue() {
    if (!_e) return;
    _e.vue = _e.vue === "plongee" ? "yeux" : "plongee";
    _appliquerVue();
  }

  function suivre() {
    if (!_e || !_trackerActif()) return;
    _e.mode = "suivi";
    _e.niveauLibre = null;
    _e.passageForce = null;
    _e.tangage = 0;
    _majBoutonSuivre();
    _e.sale = true;
  }

  // Pose la position (coordonnées plan) sans test de collision : mesures, et plus tard « aller à » un point.
  function placer(x, y, cap) {
    if (!_e || !Number.isFinite(x) || !Number.isFinite(y)) return;
    _passerEnLibre();
    _e.pos.x = x; _e.pos.y = y;
    _e.aBouge = true;
    if (Number.isFinite(cap)) _e.cap = (cap % 360 + 360) % 360;
    _e.sale = true;
  }

  function avancer(m) { if (!_e) return false; _passerEnLibre(); return _pas(m, _e.cap); }

  function tourner(deg) { if (!_e) return; _passerEnLibre(); _e.cap = (_e.cap + deg + 360) % 360; _e.sale = true; }

  function etat() {
    if (!_e) {
      return { ouvert: false, contexteLibere: _dernierGl ? _dernierGl.isContextLost() : null,
        fermeture: _derniereFermeture };
    }
    const e = _e, info = e.renderer.info;
    let construites = 0, visibles = 0;
    const yMax = { opaque: 0, murs: 0 }, boites = {};
    e.tuiles.forEach(function (t) {
      if (!t.obj) return;
      construites++;
      if (t.obj.visible) visibles++;
      t.obj.children.forEach(function (m) {
        const f = m.userData && m.userData.famille;
        if (f && m.geometry) {
          // Emprise de chaque famille (m), toutes tuiles construites : zones découpées au tube (checkup).
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          const bb = m.geometry.boundingBox, b = boites[f] || (boites[f] = { x0: Infinity, x1: -Infinity,
            y1: -Infinity, z0: Infinity, z1: -Infinity });
          b.x0 = Math.min(b.x0, bb.min.x); b.x1 = Math.max(b.x1, bb.max.x); b.y1 = Math.max(b.y1, bb.max.y);
          b.z0 = Math.min(b.z0, bb.min.z); b.z1 = Math.max(b.z1, bb.max.z);
        }
        if (f !== "opaque" && f !== "murs") return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        yMax[f] = Math.max(yMax[f], m.geometry.boundingBox.max.y);
      });
    });
    return {
      ouvert: true, contexteVivant: !e.renderer.getContext().isContextLost(), perdu: e.perdu, reprises: e.reprises,
      aBouge: e.aBouge, rapide: !!e.rapide, suiviDispo: !!e.suiviDispo, vue: e.vue, mode: e.mode,
      inclinaison: e.inclinaison,
      boussole: { angle: e.roseAngle, nord: e.nord, calibre: e.nordCalibre,
        libelle: e.boussole ? e.boussole.getAttribute("aria-label") : "",
        inclinaisonVisible: !!e.boutonsIncl && !e.boutonsIncl.hidden },
      niveau: e.niveau, niveauLibre: Number.isInteger(e.niveauLibre) ? e.niveauLibre : null,
      changementsNiveau: e.changementsNiveau, hauteur: e.hauteur, oeil: e.oeil, distance: e.distance,
      reglageHauteur: { visible: !!e.reglageHauteur && !e.reglageHauteur.hidden,
        bouton: e.boutonHauteur ? e.boutonHauteur.textContent : "",
        valeur: e.hauteurValeur ? e.hauteurValeur.textContent : "" },
      rendu: e.rendu, poiMasques: e.poiMasques, zonesDecoupees: e.zonesDecoupees, rideaux: e.rideaux.slice(),
      facesRemblais: e.facesRemblais, rubans: Object.assign({}, e.rubans), liseres: Object.assign({}, e.liseres),
      filtres: { panneauOuvert: !!(window.FilterPanel && window.FilterPanel.isVisible()),
        pastille: !!e.boutonFiltres && e.boutonFiltres.classList.contains("kta-filter-ctrl-actif") },
      recouverte: _recouverte(),
      passage: { visible: !!e.boiteNiveaux && !e.boiteNiveaux.hidden,
        haut: e.passageCibles && e.passageCibles.haut ? e.passageCibles.haut.niveau : null,
        bas: e.passageCibles && e.passageCibles.bas ? e.passageCibles.bas.niveau : null,
        liste: e.passageCibles ? e.passageCibles.liste.map(function (c) { return c.niveau; }) : [] },
      boutonRendu: e.boutonRendu ? e.boutonRendu.textContent : "",
      pos: { x: e.pos.x, y: e.pos.y }, cap: e.cap, butees: e.butees, images: e.images,
      tuiles: e.tuiles.size, construites: construites, visibles: visibles, compte: e.compte, yMax: yMax,
      boites: boites,
      panneaux: Array.from(e.panneaux).map(function (sp) {
        return { visible: sp.visible && !!sp.parent && sp.parent.visible, x: sp.position.x, z: sp.position.z,
          nom: sp.userData.poi.nom, jonction: !!sp.userData.poi.jonction, ecran: _ecran(sp.position),
          dansVolume: !!sp.userData.poi.anneau, depthTest: sp.material.depthTest, ordre: sp.renderOrder,
          opacite: +sp.material.opacity.toFixed(2), echelle: +sp.scale.x.toFixed(2), fond: sp.userData.fond,
          largeurEcran: +_largeurEcran(sp).toFixed(3) };
      }),
      murDecale: e.mats.murs.polygonOffset === true,
      triangles: info.render.triangles, appels: info.render.calls,
      geometries: info.memory.geometries, textures: info.memory.textures,
      msOuverture: Math.round(e.msOuverture || 0), msIndex: Math.round(e.msIndex), msTuiles: Math.round(e.msTuiles)
    };
  }

  // Part de la largeur de l'écran couverte par un panneau visible (checkup : pas plus que PRES.ecran de près).
  function _largeurEcran(sp) {
    if (!sp.visible) return 0;
    const c = _e.camera, d = sp.position.clone().applyMatrix4(c.matrixWorldInverse).z;
    if (d >= 0) return 0;
    return sp.scale.x / (2 * -d * Math.tan(c.fov * Math.PI / 360) * (c.aspect || 1));
  }

  // Point de la scène → position à l'écran (px de la page), pour viser un panneau (checkup).
  function _ecran(v) {
    const r = _e.cv.getBoundingClientRect(), q = new THREE.Vector3(v.x, v.y, v.z).project(_e.camera);
    return { x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height, devant: q.z < 1 };
  }

  // Parois des tuiles construites du mode galerie, en mètres [[x0, z0, x1, z1]] (checkup : aucune ne se croise).
  function parois() {
    if (!_e) return [];
    const out = [];
    _e.tuiles.forEach(function (t) { if (t.obj && t.parois) Array.prototype.push.apply(out, t.parois); });
    return out;
  }

  // Mesure : `images` rendus en tournant sur place (un tour complet), chacun suivi d'une lecture d'un pixel qui
  // attend la fin du travail du GPU. Temps par image = CPU + GPU, sans la synchronisation à l'écran. Un premier
  // tour non compté compile les shaders et envoie géométries et textures au GPU.
  function mesurer(opts) {
    if (!_e) return null;
    const e = _e, n = (opts && opts.images) || 120, gl = e.renderer.getContext();
    const px = new Uint8Array(4), temps = [];
    const cap0 = e.cap;
    _gererTuiles(true);
    let tri = 0, appels = 0;
    const t00 = performance.now();
    for (let i = 0; i < 12; i++) {
      e.cap = (cap0 + i * 30) % 360;
      _placerCamera();
      e.renderer.render(e.scene, e.camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    const msPremierTour = performance.now() - t00;
    for (let i = 0; i < n; i++) {
      e.cap = (cap0 + i * 360 / n) % 360;
      _placerCamera();
      const t0 = performance.now();
      e.renderer.render(e.scene, e.camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      temps.push(performance.now() - t0);
      tri = Math.max(tri, e.renderer.info.render.triangles);
      appels = Math.max(appels, e.renderer.info.render.calls);
    }
    e.cap = cap0;
    e.sale = true;
    temps.sort(function (a, b) { return a - b; });
    const moy = temps.reduce(function (s, v) { return s + v; }, 0) / n;
    return {
      images: n, msPremierTour: Math.round(msPremierTour), msMoy: +moy.toFixed(2),
      msMed: +temps[Math.floor(n / 2)].toFixed(2), msP95: +temps[Math.floor(n * 0.95)].toFixed(2),
      msMax: +temps[n - 1].toFixed(2), trianglesMax: tri, appelsMax: appels,
      memoire: { geometries: e.renderer.info.memory.geometries, textures: e.renderer.info.memory.textures }
    };
  }

  window.KtaVue3D = {
    ouvrir: ouvrir, fermer: fermer, etat: etat, mesurer: mesurer, basculerVue: basculerVue, incliner: incliner,
    basculerSuivi: basculerSuivi, basculerRendu: basculerRendu, changerNiveau: changerNiveau, parois: parois,
    avancer: avancer, tourner: tourner, suivre: suivre, placer: placer, reglerHauteur: reglerHauteur,
    charge: function () { return !!THREE; }
  };
})();
