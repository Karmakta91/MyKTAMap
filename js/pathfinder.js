/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// PATHFINDER — itinéraire sur le réseau de routes du plan
// =========================
// Dijkstra sur un graphe construit à la volée depuis les polylines (session getRoads() + embarquées
// getAllEmbeddedRoads()), waypoints calés orthogonalement sur le segment le plus proche.
// Expose window.Pathfinder : computeRoute (async, 2 passes), computeRouteOnRoads (sync, réseau fourni),
//   computeReachable (isochrone du Mode Perdu), buildNetworkGraph / snapPointToGraph (roadGraph.js),
//   resolvePointById, aDesTraces, carrefoursSurChemin, nbObstaclesDurs, grapheDeTraces / collecterTraces
//   (raccordsTraces.js), estZoneDure / TYPES_ZONES_DURS, estZoneCout / TYPES_ZONES_COUT, texteZonesTraversees,
//   controle (« Vérifier le plan », verifierPlan.js : mêmes tests que le graphe). Et window.getAvoidableZoneTypes.
// ⚠️ Contraintes DURES : zones dont le type est dans TYPES_ZONES_DURS et murs en ligne (`mur-ligne`), levées
//   ensemble par `respecterInaccessibles: false` (case de la modale) ; aucune autre structure ne compte. Zones À
//   COÛT (TYPES_ZONES_COUT) : évitées dès qu'un autre chemin existe, jamais bloquantes. Masse au sol : coût selon
//   le vide restant, passage coupé sous 0,5 m (_coutMasseSegment, sol de masseSol.js).
// ⚠️ computeRoute → { path:[{x, y, level}], totalDistance, segmentCount, snappedPoints, raccords, carrefours, cout,
//   zonesTraversees:[{ type, longueurPx, objet }] } ; `cout` ≠ `totalDistance` dès qu'une zone à coût est traversée.
//   `level` = entier du niveau s'il est UNIVOQUE, sinon null (nœud fusionné multi-niveaux, milieu de jonction).
// Coordonnées en système image (x, y plan) ; la conversion Leaflet se fait au rendu (road.js > renderRoads).
// Doc : docs/architecture/multilevel-pathfinding.md
// =========================

(function() {
  "use strict";

  // Deux nœuds à ≤ 1,5 px = le MÊME nœud : joint les routes qui se touchent ou se croisent quasi exactement.
  const SPATIAL_MERGE_THRESHOLD = 1.5;

  // Jonctions imparfaites (T et extrémité↔extrémité). Plus permissif que les 8 px du DESSIN des cercles
  // d'intersection : les tracés à la main ont 5-10 px de jitter aux jonctions.
  // ⚠️ contrat (décision produit) : ne s'applique qu'aux BOUTS LIBRES (_boutsLibres : 1er ou dernier sommet d'un
  // tracé qui ne touche encore aucun autre tracé) ; un raté de connexion vient toujours d'un bout resté en l'air.
  // 🩸 Appliquée à tous les sommets, elle reliait deux galeries parallèles plus proches que la tolérance (15 px ≈ 6 m
  // à 2,5 px/m) : itinéraire à travers le mur. Appliquée à un bout déjà raccordé (T, croisement, bout fusionné,
  // passage de POI), elle le reliait EN PLUS à la galerie parallèle voisine : même saut à travers le mur.
  const PROXIMITY_TOLERANCE = 15;

  // Deux sommets INTÉRIEURS de deux tracés différents à ≤ 3 px sont reliés : carrefour dessiné en deux « L » qui se
  // touchent sans se croiser (mesuré à 2,5 px sur un relevé réel). Seuil à part de la fusion (SPATIAL_MERGE_THRESHOLD,
  // qui confond les nœuds) : ici une arête pondérée. ⚠️ Rester sous l'écart de deux galeries parallèles : au-delà,
  // l'itinéraire repasse à travers le mur (docs/architecture/multilevel-pathfinding.md §14).
  const PROXIMITE_INTERIEURS_PX = 3;

  // Un bout libre ne se relie qu'au plus PROCHE de ses candidats (et à ceux à ≤ 3 px de plus) : coin entre deux
  // galeries, oui ; galerie parallèle derrière celle qu'il touche presque, non. 🩸 Une branche finie à la main à 1 m
  // d'une galerie (rien ne l'aimante sur un segment) est un bout libre : sans ce filtre, elle se reliait aussi à la
  // galerie parallèle à 4 m derrière, à travers le mur.
  const MARGE_PLUS_PROCHE_PX = 3;

  // ── Géométrie ──────────
  function _dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  // Projection orthogonale clampée aux extrémités → {x, y, t ∈ [0,1], dist}.
  function _projectOnSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-9) {
      return { x: a.x, y: a.y, t: 0, dist: _dist(p, a) };
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    return { x: px, y: py, t: t, dist: Math.hypot(p.x - px, p.y - py) };
  }

  // Intersection stricte de [p1,p2] et [p3,p4] dans [0,1], sinon null (cohérent avec road.js).
  function _segmentIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-9) return null; // parallèles ou colinéaires

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }

  // ── Zones inaccessibles (contrainte DURE) ──────────
  // Tout segment qui entre ou traverse le bord d'une zone dure n'est PAS ajouté au graphe.
  // Multi-niveau : la zone ne bloque que les segments de SON niveau (multiLevel off → tout au niveau 0).
  // ⚠️ contrat : TYPES_ZONES_DURS est la SEULE table des types de zone durs. Itinéraire, inter-plans
  // (interPlanRoute.js), liste des évitables et « Vérifier le plan » la lisent par estZoneDure : un test écrit à
  // part laisserait un de ces chemins traverser un type devenu dur.
  const TYPES_ZONES_DURS = ["inaccessible"];
  function _estZoneDure(type) { return TYPES_ZONES_DURS.indexOf(type) >= 0; }

  // ── Zones à coût : Comblé (`remblais`) et effondrement ──────────
  // ⚠️ contrat (décision produit) : une zone mal comprise ou posée à tort ne casse jamais un itinéraire, et un tracé
  // qui la traverse dit que ça passe. Elle n'est donc jamais dure : chaque pixel parcouru dedans pèse
  // PENALITE_ZONE_COUT pixels de plus. Tout autre chemin l'emporte en pratique, mais le coût reste fini : sans autre
  // chemin, l'itinéraire passe et le dit (sortie d'urgence et inter-plans compris). TYPES_ZONES_COUT est la SEULE
  // table de ces types : évitables, inter-plans et « Vérifier le plan » la lisent par estZoneCout.
  // 🩸 Le coût vit à côté de la longueur (arête { weight: coût, len: longueur }) : `totalDistance` reste la somme des
  // longueurs, sinon les mètres annoncés, le classement des sorties et l'inter-plans seraient gonflés.
  const TYPES_ZONES_COUT = ["remblais", "effondrement"];
  const PENALITE_ZONE_COUT = 1e6;
  function _estZoneCout(type) { return TYPES_ZONES_COUT.indexOf(type) >= 0; }
  // ⚠️ contrat (décision produit) : une traversée CONTINUE d'un tracé dans une zone à coût de moins de
  // TOLERANCE_ZONE_COUT_M mètres est ignorée — ni pénalité, ni mention, ni C12 — : c'est un contour dessiné un peu
  // large, pas un passage dans le remblai. Même seuil partout (itinéraire, sortie d'urgence, inter-plans, Vérifier le
  // plan), lu par toleranceZonePx. Sans échelle du plan : aucune tolérance (repli strict, rien n'est supposé).
  // 🩸 Mesurée par traversée du TRACÉ (_traverseesTrace), jamais par arête : un tracé dense découpe une longue
  // traversée en arêtes de quelques pixels, qui passeraient toutes sous le seuil.
  const TOLERANCE_ZONE_COUT_M = 1;
  function _toleranceZonePx(echelle) {
    const e = _echelleReseau(echelle, 0);
    return e > 0 ? TOLERANCE_ZONE_COUT_M * e : 0;
  }
  // Traversées continues des points d'un tracé dans un polygone → [{ px, segs: [indices des segments] }], dans
  // l'ordre du tracé. Une traversée se poursuit tant que le sommet commun est dans le polygone.
  function _traverseesTrace(pts, poly) {
    const out = [];
    let cur = null;
    for (let i = 1; i < pts.length; i++) {
      const l = _longueurDansPolygone(pts[i - 1], pts[i], poly);
      if (l > 1e-6) {
        if (!cur) cur = { px: 0, segs: [] };
        cur.px += l;
        cur.segs.push(i);
        if (!_pointInPolygon(pts[i], poly)) { out.push(cur); cur = null; }
      } else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out;
  }

  // ── Masse au sol : coût selon le vide restant ──────────
  // ⚠️ contrat (décision produit, docs/ETUDE_REMBLAIS.md § 8) : la longueur parcourue dans une masse au sol
  // (`masse-sol`) coûte selon le VIDE = hauteur du niveau − sol local : ≥ 1,8 m debout ×1, 1 à 1,8 m courbé ×1,5,
  // 0,5 à 1 m ramper ×3, sous 0,5 m passage COUPÉ (pour tous, case « Respecter… » et passe 2 comprises). Sol
  // abaissé : ×1. Brancard (`opts.brancard`, Secours « Évacuer ») : moins de 1,8 m de vide pèse comme une zone à coût
  // (évité, jamais bloquant). Aucun effet sur TYPES_ZONES_COUT ni sur leur tolérance.
  // 🩸 Le sol local est celui de la 3D et de la fiche (masseSol.js > masseCarte, sol), jamais une copie : les rampes
  // et la règle des bords y vivent. Le vide est pris point par point le long de l'arête (PAS_MASSE_M), jamais une
  // moyenne de la zone (le talus monte depuis les bords ouverts). Le coût vit à côté de la longueur, comme pour les
  // zones à coût : la distance affichée reste la vraie. Sans échelle du plan, aucune masse ne compte (pas de mètres).
  const MASSE_VIDE = { debout: 1.8, courbe: 1, ramper: 0.5 };
  const MASSE_FACTEUR = { courbe: 1.5, ramper: 3 };
  const PAS_MASSE_M = 0.1;
  function _facteurVide(v) {
    if (v >= MASSE_VIDE.debout) return 1;
    if (v >= MASSE_VIDE.courbe) return MASSE_FACTEUR.courbe;
    if (v >= MASSE_VIDE.ramper) return MASSE_FACTEUR.ramper;
    return Infinity;
  }
  // Masses d'une liste de zones → grille (_grilleZones) de [_zoneBloquante + lire()] et `brancard`, null sans masse
  // ou sans masseSol.js. `fabrique(zone)` → { m, h, sc } | null, appelée à la première arête qui touche la zone.
  function _preparerMasses(liste, fabrique, brancard) {
    const S = window.KtaMasseSol;
    if (!S || typeof S.sol !== "function") return null;
    const polys = [];
    (Array.isArray(liste) ? liste : []).forEach(function(z) {
      if (!z || z.type !== "masse-sol" || !Array.isArray(z.points) || z.points.length < 3) return;
      const zb = _zoneBloquante(z);
      let lu = false, val = null;
      zb.lire = function() {
        if (!lu) { lu = true; try { val = fabrique(z); } catch (e) { val = null; } }
        return val;
      };
      polys.push(zb);
    });
    if (!polys.length) return null;
    const g = _grilleZones(polys);
    g.brancard = !!brancard;
    return g;
  }
  // Masses du plan ouvert : session + calques, construites par masseSol.js > masseCarte (sonde de la carte).
  // 🩸 Construire une masse sonde chacun de ses bords (~4 ms) : la sortie d'urgence lance jusqu'à 15 calculs d'affilée.
  // Cache par contour (WeakMap sur `points`), clé = part, niveau, hauteur du niveau, rendu, échelle ; vidé à chaque
  // signal de données (utils.js > ktaSignalerDonneesPlan : une structure déplacée change les bords).
  let _cacheMasses = new WeakMap();
  if (typeof window.addEventListener === "function") {
    window.addEventListener("kta:donneesPlanChange", function() { _cacheMasses = new WeakMap(); });
  }
  function _cleMasse(z) {
    const lvl = Number.isInteger(z.level) ? z.level : 0;
    let h = "";
    try { h = typeof window.getNiveauVertical === "function" ? window.getNiveauVertical(lvl).hauteurM : ""; }
    catch (e) { h = ""; }
    const rendu = typeof window.getPlanRenduVue3D === "function" ? window.getPlanRenduVue3D() : "";
    const c = typeof window.ktaCombleZone === "function" ? window.ktaCombleZone(z) : z.comble;
    return [c, lvl, h, rendu, window.APP_CONFIG && window.APP_CONFIG.scale].join("|");
  }
  function _massesDuPlan(brancard) {
    const S = window.KtaMasseSol;
    if (!S || typeof S.masseCarte !== "function") return null;
    const session = (typeof window.getZones === "function") ? window.getZones() : [];
    return _preparerMasses((session || []).concat(_registre(window._ktaDataPolygons)), function(z) {
      const cle = _cleMasse(z), c = _cacheMasses.get(z.points);
      if (c && c.cle === cle) return c.val;
      const val = S.masseCarte(z);
      _cacheMasses.set(z.points, { cle: cle, val: val });
      return val;
    }, brancard);
  }
  // Masses du réseau d'un AUTRE plan (inter-plans) : ni ses structures ni ses hauteurs ne sont chargées. Bords tous
  // fermés (sol = part × hauteur partout, le cas d'une masse posée entre deux parois) et hauteur par défaut de 2 m :
  // estimation prudente (multilevel-pathfinding.md § Masse au sol).
  function _massesReseau(liste, echelle) {
    const S = window.KtaMasseSol, sc = Number(echelle);
    if (!S || typeof S.masse !== "function" || !(sc > 0)) return null;
    const ferme = function() { return true; };
    return _preparerMasses(liste, function(z) {
      const c = typeof window.ktaCombleZone === "function" ? window.ktaCombleZone(z) : 0.5;
      const m = S.masse(z, sc, Math.max(-1, Math.min(1, c)) * 2, ferme, null);
      return m ? { m: m, h: 2, sc: sc } : null;
    }, false);
  }
  // Masses traversées par p1→p2 au niveau `lvl` → { extra (px de coût en plus), sousDebout (px sous 1,8 m de vide),
  // courbe / ramper (px parcourus courbé / à plat ventre), coupe } | null. Sol local = le plus haut des remblais qui couvrent le point (comme vue3d.js > _solMasse).
  function _coutMasseSegment(masses, p1, p2, lvl) {
    if (!masses || lvl === "transit") return null;
    const L = _dist(p1, p2);
    if (L < 1e-9) return null;
    const cands = _zonesQuiBloquent(p1, p2, lvl, _zonesCandidates(masses, p1, p2), true);
    if (!cands.length) return null;
    const ts = [0, 1];
    cands.forEach(function(z) {
      for (let i = 0; i < z.points.length; i++) {
        const ip = _segmentIntersection(p1, p2, z.points[i], z.points[(i + 1) % z.points.length]);
        if (ip) ts.push(_dist(p1, ip) / L);
      }
    });
    ts.sort(function(a, b) { return a - b; });
    const S = window.KtaMasseSol;
    let extra = 0, sousDebout = 0, courbe = 0, ramper = 0, coupe = false, touche = false;
    for (let i = 1; i < ts.length && !coupe; i++) {
      const dt = ts[i] - ts[i - 1];
      if (dt <= 1e-9) continue;
      const tm = (ts[i] + ts[i - 1]) / 2;
      const pm = { x: p1.x + tm * (p2.x - p1.x), y: p1.y + tm * (p2.y - p1.y) };
      const dedans = cands.filter(function(z) { return _pointInPolygon(pm, z.points); })
        .map(function(z) { return z.lire(); }).filter(Boolean);
      if (!dedans.length) continue;
      touche = true;
      const lg = dt * L, n = Math.max(1, Math.ceil(lg / (PAS_MASSE_M * dedans[0].sc))), d = lg / n;
      for (let k = 0; k < n; k++) {
        const t = ts[i - 1] + dt * (k + 0.5) / n;
        const x = p1.x + t * (p2.x - p1.x), y = p1.y + t * (p2.y - p1.y);
        let sol = 0, h = dedans[0].h;
        dedans.forEach(function(c) {
          const v = S.sol(c.m, x / c.sc, y / c.sc);
          if (v > sol) { sol = v; h = c.h; }
        });
        const vide = h - sol, f = _facteurVide(vide);
        if (f === Infinity) { coupe = true; break; }
        extra += d * (f - 1);
        if (vide < MASSE_VIDE.debout) sousDebout += d;
        if (f === MASSE_FACTEUR.courbe) courbe += d;
        else if (f === MASSE_FACTEUR.ramper) ramper += d;
      }
    }
    return touche ? { extra: extra, sousDebout: sousDebout, courbe: courbe, ramper: ramper, coupe: coupe } : null;
  }
  // Ralentissement le long d'un trajet déjà calculé (guidage : temps restant) → cumul en px à chaque point (même
  // longueur que `points`), masses du plan ouvert, sans le brancard. Un point sans niveau entier (puits, milieu de
  // jonction) ne compte pas sur multi-niveau ; hors multi-niveau, niveau 0.
  function surcoutMasseTrajet(points) {
    if (!Array.isArray(points)) return [];
    const out = [0];
    if (points.length < 2) return points.map(function() { return 0; });
    const masses = _massesDuPlan(false);
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      let lvl = 0;
      if (mlOn) lvl = (Number.isInteger(a.level) && a.level === b.level) ? a.level : "transit";
      const m = masses ? _coutMasseSegment(masses, a, b, lvl) : null;
      out.push(out[i - 1] + (m && !m.coupe ? m.extra : 0));
    }
    return out;
  }

  // Résumé des masses d'un trajet déjà calculé (fenêtre Itinéraire, sortie d'urgence) → { extraPx (ralentissement en
  // px, à ajouter à la distance pour le temps), courbePx, ramperPx } ; mêmes masses et même mesure que le guidage.
  function resumeMasseTrajet(points) {
    const out = { extraPx: 0, courbePx: 0, ramperPx: 0 };
    if (!Array.isArray(points) || points.length < 2) return out;
    const masses = _massesDuPlan(false);
    if (!masses) return out;
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      let lvl = 0;
      if (mlOn) lvl = (Number.isInteger(a.level) && a.level === b.level) ? a.level : "transit";
      const m = _coutMasseSegment(masses, a, b, lvl);
      if (!m || m.coupe) continue;
      out.extraPx += m.extra; out.courbePx += m.courbe; out.ramperPx += m.ramper;
    }
    return out;
  }

  // Ray-casting standard, O(n).
  function _pointInPolygon(p, poly) {
    let inside = false;
    const x = p.x, y = p.y;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > y) !== (yj > y)) &&
                        (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Contact si une extrémité est dedans OU si le segment croise une arête.
  function _segmentTraversePolygon(p1, p2, poly) {
    if (_pointInPolygon(p1, poly)) return true;
    if (_pointInPolygon(p2, poly)) return true;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (_segmentIntersection(p1, p2, a, b)) return true;
    }
    return false;
  }

  // Niveaux d'une zone (poiJonction.js > ktaNiveauxObjet, règle commune points / zones) ; `level` seul sans elle.
  function _niveauxZone(z) {
    if (typeof window.ktaNiveauxObjet === "function") return window.ktaNiveauxObjet(z);
    return [Number.isInteger(z && z.level) ? z.level : 0];
  }
  // Forme lue par le test de blocage : { points, level, niveaux, objet }, niveaux calculés UNE fois par calcul ;
  // `objet` = la zone d'origine (« Vérifier le plan » nomme l'obstacle), jamais lu par le graphe.
  function _zoneBloquante(z) {
    return { points: z.points, level: Number.isInteger(z.level) ? z.level : 0, niveaux: _niveauxZone(z), objet: z };
  }

  // Une zone bloque sur CHACUN de ses niveaux, et seulement là (sauf multiLevel off). Les segments "transit"
  // (milieu de jonction) ne sont jamais bloqués : ce sont des points « en l'air » dans un puits.
  // `toutes` false : s'arrête à la première (graphe) ; true : toutes celles qui bloquent (« Vérifier le plan »).
  function _zonesQuiBloquent(p1, p2, segLevel, zonesInacc, toutes) {
    const out = [];
    if (segLevel === "transit") return out;
    if (!zonesInacc || zonesInacc.length === 0) return out;
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    for (let i = 0; i < zonesInacc.length; i++) {
      const z = zonesInacc[i];
      if (mlOn && z.niveaux.indexOf(segLevel) < 0) continue;  // aucun de ses niveaux → pas bloquant
      if (_segmentTraversePolygon(p1, p2, z.points)) {
        out.push(z);
        if (!toutes) return out;
      }
    }
    return out;
  }
  function _segmentBloqueParZoneInaccess(p1, p2, segLevel, zonesInacc) {
    return _zonesQuiBloquent(p1, p2, segLevel, zonesInacc, false).length > 0;
  }

  // ── Murs en ligne (contrainte DURE) ──────────
  // Un segment de tracé qui CROISE un `mur-ligne` de son niveau n'entre pas au graphe, comme pour une zone
  // inaccessible. Le rôle tient à la CLÉ du type : renommé ou recoloré en légende, il reste un obstacle.
  // 🩸 Un relevé importé porte des milliers de murs : leurs segments sont rangés dans une grille par niveau et
  // chaque segment de tracé ne teste que les cellules de sa boîte (le test naïf serait tracés × murs).
  // 🩸 Contact compté (bornes incluses, comme _segmentIntersection) : un tracé qui finit PILE sur un mur perd ce
  // dernier segment, sinon deux segments qui se touchent sur le mur le franchiraient.
  const TYPE_MUR_LIGNE = "mur-ligne";
  const GRILLE_MUR_PX = 64;

  // Obstacles durs → { polys: zones à tester une à une, grille: Map "niveau|cx,cy" → segments de murs | null }.
  // Plan sans multi-niveau : un seul étage (« * »), comme pour les zones.
  function _preparerObstacles(obstacles) {
    const polys = [], murs = [];
    (obstacles || []).forEach(function(o) { if (o) (o.ligne ? murs : polys).push(o); });
    if (murs.length === 0) return { polys: polys, grille: null };
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const grille = new Map();
    murs.forEach(function(m) {
      const etage = mlOn ? m.level : "*";
      for (let i = 1; i < m.points.length; i++) {
        const a = m.points[i - 1], b = m.points[i];
        const seg = { a: a, b: b, x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y),
                      x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y), mur: m.objet || null };
        _cellulesDe(seg.x0, seg.y0, seg.x1, seg.y1, GRILLE_MUR_PX, function(k) {
          const cle = etage + "|" + k;
          let l = grille.get(cle);
          if (!l) grille.set(cle, l = []);
          l.push(seg);
        });
      }
    });
    return { polys: polys, grille: grille };
  }

  // Segments "transit" (milieu de jonction) jamais coupés : ce sont des points « en l'air » dans un puits.
  // → segments de murs croisés { a, b, mur, croise:{x,y} } ; `tous` false : le premier seulement (graphe).
  // 🩸 Un segment de mur rangé dans plusieurs cellules est dédoublonné, sinon compté deux fois.
  function _mursQuiCoupent(p1, p2, segLevel, grille, tous) {
    const out = [];
    if (!grille || segLevel === "transit") return out;
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const etage = mlOn ? segLevel : "*";
    const x0 = Math.min(p1.x, p2.x), y0 = Math.min(p1.y, p2.y);
    const x1 = Math.max(p1.x, p2.x), y1 = Math.max(p1.y, p2.y);
    const vus = tous ? new Set() : null;
    _cellulesDe(x0, y0, x1, y1, GRILLE_MUR_PX, function(k) {
      if (!tous && out.length) return;
      const l = grille.get(etage + "|" + k);
      if (!l) return;
      for (let i = 0; i < l.length; i++) {
        const s = l[i];
        if (s.x1 < x0 || s.x0 > x1 || s.y1 < y0 || s.y0 > y1) continue;
        if (vus && vus.has(s)) continue;
        const ip = _segmentIntersection(p1, p2, s.a, s.b);
        if (!ip) continue;
        if (vus) vus.add(s);
        out.push({ a: s.a, b: s.b, mur: s.mur, croise: ip });
        if (!tous) return;
      }
    });
    return out;
  }
  function _segmentCoupeParMur(p1, p2, segLevel, grille) {
    return _mursQuiCoupent(p1, p2, segLevel, grille, false).length > 0;
  }

  // ── Évitement de points (contrainte SOUPLE) ──────────
  // Le graphe exclut les segments à moins de `avoidRadius` d'un point à éviter. Sans chemin, computeRoute
  // repasse sans évitements et rend les points contournés (« Impossible d'éviter : X, Y »).

  // Distance au SEGMENT (projection clampée), pas à sa droite support.
  function _segmentTraverseProxiPoint(p1, p2, avoidPoint, radius) {
    const proj = _projectOnSegment(avoidPoint, p1, p2);
    return proj.dist < radius;
  }

  // Toujours false si avoidPoints vide ou radius ≤ 0.
  function _segmentBloqueParAvoidance(p1, p2, avoidPoints, radius) {
    if (!avoidPoints || avoidPoints.length === 0 || !radius || radius <= 0) return false;
    for (let i = 0; i < avoidPoints.length; i++) {
      if (_segmentTraverseProxiPoint(p1, p2, avoidPoints[i], radius)) return true;
    }
    return false;
  }

  // Après la passe 2 : les évitements que le chemin final n'a pas pu respecter.
  function _pathPassesNearPoint(pathPts, ap, radius) {
    if (!Array.isArray(pathPts) || pathPts.length < 2 || !radius || radius <= 0) return false;
    for (let i = 1; i < pathPts.length; i++) {
      const proj = _projectOnSegment(ap, pathPts[i - 1], pathPts[i]);
      if (proj.dist < radius) return true;
    }
    return false;
  }

  // Tags → points porteurs (SearchPoints.getAllPoints, async ; retours [{point, …}] → `.point`).
  // SearchPoints absent → [].
  async function _expandAvoidTagsEnPoints(tags) {
    if (!Array.isArray(tags) || tags.length === 0) return [];
    if (typeof window.SearchPoints !== "object" ||
        typeof window.SearchPoints.getAllPoints !== "function") {
      return [];
    }
    let allItems;
    try { allItems = await window.SearchPoints.getAllPoints(); }
    catch(e) { return []; }
    if (!Array.isArray(allItems)) return [];
    return allItems
      .filter(function(it) {
        const p = it && it.point;
        if (!p || !Array.isArray(p.tags)) return false;
        return p.tags.some(function(t) { return tags.indexOf(t) >= 0; });
      })
      .map(function(it) {
        const p = it.point;
        return {
          x:     p.x,
          y:     p.y,
          label: p.nom || p.id || "(tag " + (p.tags[0] || "?") + ")",
          tags:  p.tags
        };
      });
  }

  // Registre d'un calque (_ktaDataPolygons, _ktaDataStructurePolygons) sans les objets d'un calque en modification :
  // sa copie de session est lue par getZones / getStructures (utils.js > ktaHorsCalquesEnModification).
  function _registre(liste) {
    if (typeof window.ktaHorsCalquesEnModification === "function") return window.ktaHorsCalquesEnModification(liste);
    return Array.isArray(liste) ? liste : [];
  }

  // Zones dures d'une liste de zones (session, registre d'un calque, données fournies). → [_zoneBloquante].
  function _zonesDuresDe(liste) {
    const out = [];
    (Array.isArray(liste) ? liste : []).forEach(function(z) {
      if (z && _estZoneDure(z.type) && Array.isArray(z.points) && z.points.length >= 3) out.push(_zoneBloquante(z));
    });
    return out;
  }

  // Zones à coût d'une liste de zones, même forme que les zones dures (même test niveau compris). → [_zoneBloquante].
  function _zonesCoutDe(liste) {
    const out = [];
    (Array.isArray(liste) ? liste : []).forEach(function(z) {
      if (z && _estZoneCout(z.type) && Array.isArray(z.points) && z.points.length >= 3) out.push(_zoneBloquante(z));
    });
    return out;
  }
  // Zones à coût du plan ouvert : session (getZones) + embarquées (_ktaDataPolygons).
  function _collecterZonesCout() {
    const session = (typeof window.getZones === "function") ? window.getZones() : [];
    return _zonesCoutDe(session).concat(_zonesCoutDe(_registre(window._ktaDataPolygons)));
  }

  // Murs en ligne d'une liste de structures. → [{ points, level, ligne: true, objet }] ; sans `level` = niveau 0.
  function _mursLigneDe(liste) {
    const out = [];
    (Array.isArray(liste) ? liste : []).forEach(function(s) {
      if (s && s.type === TYPE_MUR_LIGNE && Array.isArray(s.points) && s.points.length >= 2) {
        out.push({ points: s.points, level: Number.isInteger(s.level) ? s.level : 0, ligne: true, objet: s });
      }
    });
    return out;
  }

  // Zones dures du plan : session (getZones) + embarquées (_ktaDataPolygons).
  function _collecterZonesInaccessibles() {
    const session = (typeof window.getZones === "function") ? window.getZones() : [];
    return _zonesDuresDe(session).concat(_zonesDuresDe(_registre(window._ktaDataPolygons)));
  }

  // Murs en ligne du plan : structures de session (getStructures) + embarquées (_ktaDataStructurePolygons, qui
  // range aussi les lignes).
  function _collecterMursLigne() {
    const session = (typeof window.getStructures === "function") ? window.getStructures() : [];
    return _mursLigneDe(session).concat(_mursLigneDe(_registre(window._ktaDataStructurePolygons)));
  }

  // Toutes les contraintes dures du plan ouvert : zones dures puis murs en ligne.
  function _collecterObstaclesDurs() {
    return _collecterZonesInaccessibles().concat(_collecterMursLigne());
  }

  // ── « Vérifier le plan » (verifierPlan.js) : ce qu'il faut pour MONTRER un obstacle, en plus des tests ──
  // Longueur d'un segment à l'intérieur d'un polygone (pair-impair, comme _pointInPolygon) : bornes aux
  // croisements des arêtes, milieu de chaque morceau testé.
  function _longueurDansPolygone(p1, p2, poly) {
    const L = _dist(p1, p2);
    if (L < 1e-9) return 0;
    const ts = [0, 1];
    for (let i = 0; i < poly.length; i++) {
      const ip = _segmentIntersection(p1, p2, poly[i], poly[(i + 1) % poly.length]);
      if (ip) ts.push(_dist(p1, ip) / L);
    }
    ts.sort(function(a, b) { return a - b; });
    let dedans = 0;
    for (let i = 1; i < ts.length; i++) {
      const dt = ts[i] - ts[i - 1];
      if (dt <= 1e-9) continue;
      const tm = (ts[i] + ts[i - 1]) / 2;
      if (_pointInPolygon({ x: p1.x + tm * (p2.x - p1.x), y: p1.y + tm * (p2.y - p1.y) }, poly)) dedans += dt;
    }
    return dedans * L;
  }

  // Grille des zones dures par boîte englobante : un segment ne teste que les zones des cellules de sa boîte.
  // Filtre exact (un contact suppose des boîtes qui se touchent) ; le test reste _zonesQuiBloquent.
  const GRILLE_ZONES_PX = 128;
  function _grilleZones(polys) {
    const g = new Map();
    (polys || []).forEach(function(z, i) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      z.points.forEach(function(p) {
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      });
      _cellulesDe(x0, y0, x1, y1, GRILLE_ZONES_PX, function(k) {
        let l = g.get(k);
        if (!l) g.set(k, l = []);
        l.push(i);
      });
    });
    return { polys: polys || [], g: g };
  }
  // Zones candidates d'un segment, dans l'ordre de la liste, sans doublon.
  function _zonesCandidates(grille, p1, p2) {
    const vus = new Set();
    _cellulesDe(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.max(p1.x, p2.x), Math.max(p1.y, p2.y),
      GRILLE_ZONES_PX, function(k) {
        const l = grille.g.get(k);
        if (l) for (let n = 0; n < l.length; n++) vus.add(l[n]);
      });
    return Array.from(vus).sort(function(a, b) { return a - b; }).map(function(i) { return grille.polys[i]; });
  }

  // ── Évitement de zones par TYPE (contrainte SOUPLE) ──────────
  // Libellé d'un type : cust-… → entrée de légende via findCustomEntry (getLabel ne lit PAS
  // customEntries) ; built-in → getLabel "zones".
  function _zoneTypeLabel(type) {
    var LC = window.LegendCustomization;
    if (LC && typeof LC.findCustomEntry === "function") {
      try { var e = LC.findCustomEntry(type); if (e && e.label) return e.label; } catch(_e) {}
    }
    if (LC && typeof LC.getLabel === "function") {
      try { var lbl = LC.getLabel("zones", type); if (lbl) return lbl; } catch(_e2) {}
    }
    return type || "?";
  }

  // Types évitables distincts, SAUF les types durs (bloqués d'office) et à coût (évités d'office)
  // → [{ type, label, count }].
  function _listerTypesZonesEvitables() {
    var counts = {};
    function _compter(z) {
      if (!z || _estZoneDure(z.type) || _estZoneCout(z.type)) return;
      if (!Array.isArray(z.points) || z.points.length < 3) return;
      counts[z.type] = (counts[z.type] || 0) + 1;
    }
    if (typeof window.getZones === "function") {
      var s = window.getZones();
      if (Array.isArray(s)) s.forEach(_compter);
    }
    _registre(window._ktaDataPolygons).forEach(_compter);
    return Object.keys(counts).map(function(type) {
      return { type: type, label: _zoneTypeLabel(type), count: counts[type] };
    }).sort(function(a, b) { return String(a.label).localeCompare(String(b.label)); });
  }
  window.getAvoidableZoneTypes = _listerTypesZonesEvitables;

  // Même forme que _collecterZonesInaccessibles → même test géométrique niveau-aware. Un type à coût coché dans des
  // préférences anciennes est ignoré : son coût l'évite déjà, et l'exclure ici ferait échouer la passe 1 dès qu'il
  // est le seul passage, ce qui relâcherait en passe 2 tous les autres évitements.
  function _collecterZonesAEviter(avoidTypes) {
    if (!Array.isArray(avoidTypes) || avoidTypes.length === 0) return [];
    var set = {};
    avoidTypes.forEach(function(t) { set[t] = 1; });
    var out = [];
    function _pousser(z) {
      if (!z || _estZoneDure(z.type) || _estZoneCout(z.type) || !set[z.type] || !Array.isArray(z.points) ||
          z.points.length < 3) return;
      out.push(_zoneBloquante(z));
    }
    if (typeof window.getZones === "function") {
      var s = window.getZones();
      if (Array.isArray(s)) s.forEach(_pousser);
    }
    _registre(window._ktaDataPolygons).forEach(_pousser);
    return out;
  }

  // ── Construction du graphe ──────────
  // Buckets spatiaux : existence d'un nœud proche en O(1).
  function _bucketKey(x, y) {
    const s = SPATIAL_MERGE_THRESHOLD * 2;
    return Math.floor(x / s) + "," + Math.floor(y / s);
  }

  function _newGraph() {
    return {
      nodes:      [],   // [{x, y, virtual?:true}]
      // edges[i] = [{ to: nodeIdx, weight: coût, len: longueur, zc?: Map(zone à coût → px dedans) }, ...]
      edges:      [],
      zonesCout:  null, // grille des zones à coût (_grilleZones) posée par _buildGraph ; null = aucun coût
      masses:     null, // masses au sol (_preparerMasses) posées par _buildGraph ; null = aucune
      segments:   [],   // [{a: nodeIdx, b: nodeIdx, roadType: string, level: number|"transit"}]
      buckets:    {},   // bucketKey → [nodeIdx, ...]
      // Set<niveau> par nœud : 1 niveau pour un nœud de route, plusieurs pour un nœud fusionné,
      // ["transit"] pour le milieu d'une jonction. Décide des connexions à l'enrichissement.
      nodeLevels: [],   // nodeLevels[i] = Set<number|"transit">
      bouts:      new Set(),  // 1er et dernier sommets des tracés
      boutsLibres: new Set(), // ceux qui ne touchent aucun autre tracé (_boutsLibres) : seuls à avoir la tolérance
      traces:     [],         // traces[i] = indices des tracés qui passent par le nœud i (sommets intérieurs voisins)
      noeudsTrace: []         // noeudsTrace[r][k] = nœud du k-ième sommet du tracé r (raccordsTraces.js)
    };
  }

  function _ajouterNiveauNode(graph, idx, lvl) {
    while (graph.nodeLevels.length <= idx) graph.nodeLevels.push(new Set());
    graph.nodeLevels[idx].add(lvl);
  }

  // 🩸 `lvl` (multi-niveau) : seul un nœud qui porte DÉJÀ ce niveau numérique est réutilisé. Sans ce filtre, un
  // sommet du 0 posé sur un sommet du −1 (deux galeries qui arrivent au même puits) devenait UN nœud à deux
  // niveaux : l'itinéraire changeait d'étage là, sans jonction, à coût nul. Un point "transit" (milieu de
  // jonction, en l'air dans un puits) ne fusionne avec rien. `lvl` absent ou multi-niveau coupé : fusion libre.
  function _getOrAddNode(graph, x, y, lvl) {
    const filtre = (lvl !== undefined && lvl !== null &&
                    !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true));
    if (filtre && lvl === "transit") return _nouveauNode(graph, x, y);
    // Bucket courant + 8 voisins (point juste au-delà d'une frontière de bucket).
    const ks = _bucketKey(x, y).split(",").map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bk = (ks[0] + dx) + "," + (ks[1] + dy);
        const bucket = graph.buckets[bk];
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const idx = bucket[i];
          const n = graph.nodes[idx];
          if (Math.hypot(n.x - x, n.y - y) <= SPATIAL_MERGE_THRESHOLD &&
              (!filtre || (graph.nodeLevels[idx] && graph.nodeLevels[idx].has(lvl)))) {
            return idx;
          }
        }
      }
    }
    return _nouveauNode(graph, x, y);
  }

  function _nouveauNode(graph, x, y) {
    const idx = graph.nodes.length;
    graph.nodes.push({ x: x, y: y });
    graph.edges.push([]);
    const bk = _bucketKey(x, y);
    if (!graph.buckets[bk]) graph.buckets[bk] = [];
    graph.buckets[bk].push(idx);
    return idx;
  }

  function _noterTrace(graph, idx, r) {
    const l = graph.traces[idx] || (graph.traces[idx] = []);
    if (l[l.length - 1] !== r) l.push(r);
  }

  function _memeTrace(graph, a, b) {
    const la = graph.traces[a], lb = graph.traces[b];
    if (!la || !lb) return false;
    for (let i = 0; i < la.length; i++) if (lb.indexOf(la[i]) >= 0) return true;
    return false;
  }

  // Niveaux auxquels une arête court : celui fourni, sinon les niveaux numériques communs à ses deux nœuds (aucun :
  // puits ou milieu de jonction, en l'air). Hors multi-niveau, un seul étage (les zones n'y regardent pas le niveau).
  function _niveauxArete(graph, a, b, niveau) {
    if (niveau !== undefined && niveau !== null) return [niveau];
    if (!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true)) return [0];
    const la = graph.nodeLevels[a], lb = graph.nodeLevels[b], out = [];
    if (la && lb) la.forEach(function(l) { if (Number.isInteger(l) && lb.has(l)) out.push(l); });
    return out;
  }

  // Traversées courtes (sous la tolérance) de chaque zone à coût par les tracés du réseau → Map(zone → [{a, b}]) : les
  // segments des tracés qui ne la traversent que sur moins de TOLERANCE_ZONE_COUT_M. Seuil 0 (sans échelle) : vide.
  function _traverseesCourtes(roads, polys, seuilPx) {
    const out = new Map();
    if (!(seuilPx > 0) || !polys || !polys.length) return out;
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    (roads || []).forEach(function(road) {
      if (!road || !Array.isArray(road.points) || road.points.length < 2) return;
      if (road.type === "itinerary" || road.type === "jonction") return;   // jonction : segments en l'air
      const lvl = Number.isInteger(road.level) ? road.level : 0;
      polys.forEach(function(z) {
        if (mlOn && z.niveaux.indexOf(lvl) < 0) return;
        _traverseesTrace(road.points, z.points).forEach(function(t) {
          if (t.px >= seuilPx) return;
          let l = out.get(z);
          if (!l) out.set(z, l = []);
          t.segs.forEach(function(i) { l.push({ a: road.points[i - 1], b: road.points[i] }); });
        });
      });
    });
    return out;
  }
  // L'arête p1→p2 ne fait-elle, dans la zone z, que suivre une traversée courte ? Un point de sa partie intérieure
  // est cherché sur les segments exemptés (les arêtes découpées aux croisements restent sur leur tracé).
  function _areteExemptee(courtes, z, p1, p2) {
    const segs = courtes && courtes.get(z);
    if (!segs) return false;
    const p = _pointInterieur(p1, p2, z.points);
    return !!p && segs.some(function(s) { return _projectOnSegment(p, s.a, s.b).dist < 0.5; });
  }
  // Milieu du premier morceau de p1→p2 dans le polygone (coupé à ses intersections avec le contour), ou null.
  // 🩸 Pas d'échantillonnage régulier : une bande de 2 px tombe entre deux échantillons d'une arête de 100 px.
  function _pointInterieur(p1, p2, poly) {
    const L = _dist(p1, p2);
    if (L < 1e-9) return null;
    const ts = [0, 1];
    for (let i = 0; i < poly.length; i++) {
      const ip = _segmentIntersection(p1, p2, poly[i], poly[(i + 1) % poly.length]);
      if (ip) ts.push(_dist(p1, ip) / L);
    }
    ts.sort(function(a, b) { return a - b; });
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] - ts[i - 1] <= 1e-9) continue;
      const tm = (ts[i] + ts[i - 1]) / 2;
      const p = { x: p1.x + tm * (p2.x - p1.x), y: p1.y + tm * (p2.y - p1.y) };
      if (_pointInPolygon(p, poly)) return p;
    }
    return null;
  }

  // Zones à coût que l'arête a→b traverse → { px: longueur dedans, zones: Map(zone → px) } | null. Même test que les
  // zones dures (_zonesQuiBloquent), puis la longueur dedans : une arête qui touche seulement le bord ne paie rien,
  // une arête qui suit une traversée courte non plus (TOLERANCE_ZONE_COUT_M).
  function _coutZonesArete(graph, a, b, niveau) {
    const g = graph.zonesCout;
    if (!g || g.polys.length === 0) return null;
    const p1 = graph.nodes[a], p2 = graph.nodes[b];
    const cands = _zonesCandidates(g, p1, p2);
    if (cands.length === 0) return null;
    let px = 0, zones = null;
    _niveauxArete(graph, a, b, niveau).forEach(function(lvl) {
      _zonesQuiBloquent(p1, p2, lvl, cands, true).forEach(function(z) {
        if (zones && zones.has(z)) return;
        const l = _longueurDansPolygone(p1, p2, z.points);
        if (l <= 1e-6) return;
        if (_areteExemptee(g.courtes, z, p1, p2)) return;
        if (!zones) zones = new Map();
        zones.set(z, l);
        px += l;
      });
    });
    return zones ? { px: px, zones: zones } : null;
  }

  // `longueur` = distance de l'arête (ce qu'affiche l'itinéraire) ; le coût y ajoute les zones à coût traversées.
  // `niveau` facultatif : celui du segment quand l'appelant le connaît (sinon déduit des nœuds).
  // Masse au sol (_coutMasseSegment) : coût selon le vide en plus ; arête COUPÉE (non posée) sous 0,5 m de vide — un
  // morceau découpé hors du passage bas (croisement, calage) garde la sienne.
  function _addEdge(graph, a, b, longueur, niveau) {
    if (a === b) return;
    const c = _coutZonesArete(graph, a, b, niveau);
    let surcout = 0;
    if (graph.masses) {
      const p1 = graph.nodes[a], p2 = graph.nodes[b];
      const niveaux = _niveauxArete(graph, a, b, niveau);
      for (let i = 0; i < niveaux.length; i++) {
        const m = _coutMasseSegment(graph.masses, p1, p2, niveaux[i]);
        if (!m) continue;
        if (m.coupe) return;
        surcout = Math.max(surcout, m.extra + (graph.masses.brancard ? m.sousDebout * PENALITE_ZONE_COUT : 0));
      }
    }
    const ea = { to: b, weight: (c ? longueur + c.px * PENALITE_ZONE_COUT : longueur) + surcout, len: longueur };
    const eb = { to: a, weight: ea.weight, len: longueur };
    if (c) { ea.zc = c.zones; eb.zc = c.zones; }
    graph.edges[a].push(ea);
    graph.edges[b].push(eb);
  }

  // Trace de diagnostic en mode debug seulement : une jonction dont la longueur change mérite d'être vue.
  const _diagJonction = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);

  // `ctxPoids` = { echelle, profondeurs } du plan du RÉSEAU quand ce n'est pas le plan ouvert
  // (itinéraire inter-plans). 🩸 Une table fournie fait foi, même vide : le repli sur le plan ouvert
  // n'a lieu que SANS table, sinon une étape distante pèserait ses puits avec le mauvais plan.
  function _profondeurPourPoids(niveau, ctxPoids) {
    const table = ctxPoids && ctxPoids.profondeurs;
    if (table && typeof table === "object") {
      const v = table[String(niveau)];
      return (typeof v === "number" && Number.isFinite(v)) ? v : null;
    }
    if (typeof window.getProfondeurNiveau !== "function") return null;
    return window.getProfondeurNiveau(niveau);
  }

  // Poids en pixels plan = distance 2D, SAUF jonction dont les deux niveaux ont une profondeur.
  // `part` (0..1) = part du dénivelé portée par CE segment (prorata de la longueur 2D, cf
  // _partsDenivJonction) : somme des hypoténuses = hypot(longueur 2D totale, dénivelé) — une jonction
  // pèse pareil quel que soit son nombre de points et dans les deux sens.
  function _poidsSegment(a, b, road, ctxPoids, part) {
    const plan = _dist(a, b);
    if (!road || road.type !== "jonction") return plan;
    const zA = _profondeurPourPoids(road.fromLevel, ctxPoids);
    const zB = _profondeurPourPoids(road.toLevel, ctxPoids);
    if (zA === null || zB === null) return plan;   // non renseigné → inchangé
    const echelle = _echelleReseau(ctxPoids && ctxPoids.echelle, 0);
    if (!echelle) return plan;                     // plan non calibré → inchangé
    const p = (typeof part === "number" && Number.isFinite(part)) ? part : 1;
    const denivPx = Math.abs(zB - zA) * echelle * p;
    return Math.hypot(plan, denivPx);
  }

  // Part i = longueur 2D de [points[i], points[i+1]] / longueur totale ; longueur nulle → parts égales.
  function _partsDenivJonction(points) {
    const n = points.length - 1;
    const longueurs = [];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const l = _dist(points[i], points[i + 1]);
      longueurs.push(l);
      total += l;
    }
    return longueurs.map(function(l) { return total > 0 ? l / total : 1 / n; });
  }

  // `ctxPoids` facultatif (cf _profondeurPourPoids) ; absent = plan ouvert. `zonesCout` facultatif ([_zoneBloquante]
  // à coût) : posé AVANT toute arête, l'enrichissement et le calage le relisent dans `graph.zonesCout`.
  // `masses` facultatif (_preparerMasses) : posé avant toute arête, comme `zonesCout`.
  function _buildGraph(roads, allowedTypes, zonesInacc, avoidPoints, avoidRadius, avoidZones, ctxPoids, zonesCout,
                       masses) {
    zonesInacc  = zonesInacc  || [];
    avoidPoints = avoidPoints || [];
    avoidRadius = avoidRadius || 0;
    avoidZones  = avoidZones  || [];   // zones à éviter (souple), même test géométrique que les inaccessibles
    const obstacles = _preparerObstacles(zonesInacc);   // zones inaccessibles + murs en ligne (DUR)
    const graph = _newGraph();
    graph.masses = masses || null;
    if (Array.isArray(zonesCout) && zonesCout.length) {
      graph.zonesCout = _grilleZones(zonesCout);
      graph.zonesCout.courtes = _traverseesCourtes(roads, graph.zonesCout.polys,
        _toleranceZonePx(ctxPoids && ctxPoids.echelle));
    }

    for (let r = 0; r < roads.length; r++) {
      const road = roads[r];
      if (!road || !Array.isArray(road.points) || road.points.length < 2) continue;
      if (road.type === "itinerary") continue;

      const isJonction = (road.type === "jonction");
      // Jonctions toujours autorisées (ponts entre niveaux) ; les autres suivent allowedTypes.
      if (!isJonction && allowedTypes && allowedTypes.indexOf(road.type) < 0) continue;

      // Route : segments et nœuds au même `level`. Jonction : segments "transit" (exclus de
      // l'enrichissement), mais premier nœud = fromLevel, dernier = toLevel → raccord
      // extrémité↔extrémité avec les routes cibles malgré le jitter.
      const segLevel = isJonction
        ? "transit"
        : (Number.isInteger(road.level) ? road.level : 0);
      const fromLvl = isJonction
        ? (Number.isInteger(road.fromLevel) ? road.fromLevel : 0)
        : null;
      const toLvl = isJonction
        ? (Number.isInteger(road.toLevel) ? road.toLevel : 0)
        : null;
      const lastPointIdxInRoad = road.points.length - 1;
      const partsDeniv = isJonction ? _partsDenivJonction(road.points) : null;

      let prevIdx = _getOrAddNode(graph, road.points[0].x, road.points[0].y, isJonction ? fromLvl : segLevel);
      const noeuds = graph.noeudsTrace[r] = [prevIdx];
      graph.bouts.add(prevIdx);
      _noterTrace(graph, prevIdx, r);
      _ajouterNiveauNode(graph, prevIdx, isJonction ? fromLvl : segLevel);

      for (let i = 1; i < road.points.length; i++) {
        const p = road.points[i];
        const prevP = road.points[i - 1];
        const isLast = (i === lastPointIdxInRoad);
        const nodeLvl = isJonction
          ? (isLast ? toLvl : "transit")
          : segLevel;
        const idx = _getOrAddNode(graph, p.x, p.y, nodeLvl);
        _ajouterNiveauNode(graph, idx, nodeLvl);
        if (isLast) graph.bouts.add(idx);
        _noterTrace(graph, idx, r);
        noeuds.push(idx);

        // Segment exclu (nœud sans arête) si une zone inaccessible le traverse ou s'il croise un mur en ligne
        // (DUR, jamais relâché), ou si un point d'évitement est à moins de `avoidRadius` (SOUPLE, passe 2).
        if (!_segmentBloqueParZoneInaccess(prevP, p, segLevel, obstacles.polys) &&
            !_segmentCoupeParMur(prevP, p, segLevel, obstacles.grille) &&
            !_segmentBloqueParAvoidance(prevP, p, avoidPoints, avoidRadius) &&
            !_segmentBloqueParZoneInaccess(prevP, p, segLevel, avoidZones)) { // zones à éviter (souple)
          // 🩸 UNE JONCTION EST UN PUITS, PAS UN TRAIT : sa longueur dans le plan (3 px pour 12 m de
          // dénivelé) sous-compterait les distances et ferait toujours préférer le puits au détour.
          // Avec profondeurs saisies, le poids est l'hypoténuse, le dénivelé converti en PIXELS par
          // l'échelle (sinon on additionnerait des mètres à des pixels). Sans profondeur : longueur 2D.
          const w = _poidsSegment(prevP, p, road, ctxPoids, partsDeniv ? partsDeniv[i - 1] : 1);
          if (_diagJonction && road.type === "jonction") {
            console.log("[Pathfinder] jonction 3D : plan", _dist(prevP, p).toFixed(1),
              "px → réel", w.toFixed(1), "px");
          }
          _addEdge(graph, prevIdx, idx, w, segLevel);
          graph.segments.push({
            a:        prevIdx,
            b:        idx,
            roadType: road.type,
            level:    segLevel,  // numeric pour road, "transit" pour jonction
            road:     road       // tracé d'origine (secteurs du Secours → zone « tracés »)
          });
        }
        prevIdx = idx;
      }
    }
    return graph;
  }

  // ── Enrichissement : nœuds virtuels aux croisements ──────────
  // Sans lui, le graphe a une composante par route dont les points ne sont pas EXACTEMENT partagés :
  // Dijkstra ne passe pas d'une route à l'autre même si elles se croisent. On insère un nœud virtuel
  // (a) aux croisements stricts, (b) aux T imparfaits, (c) entre extrémités proches.
  // Compatibilité de niveau (multiLevel off → tout compatible) :
  //   - 2 segments : même niveau NUMÉRIQUE ; un segment "transit" n'est compatible avec rien ;
  //   - 2 nœuds (extrémité↔extrémité) : au moins 1 niveau numérique commun (transit exclu) ;
  //   - nœud vs segment (T) : le nœud porte le niveau du segment.
  function _segmentsCompatibleNiveau(segA, segB, mlOn) {
    if (!mlOn) return true;
    if (segA.level === "transit" || segB.level === "transit") return false;
    return segA.level === segB.level;
  }
  function _nodesCompatibleNiveau(setA, setB, mlOn) {
    if (!mlOn) return true;
    if (!setA || !setB) return false;
    for (const l of setA) {
      if (l === "transit") continue;
      if (setB.has(l)) return true;
    }
    return false;
  }
  function _nodeSurSegmentCompatible(nodeSet, segLevel, mlOn) {
    if (!mlOn) return true;
    if (segLevel === "transit") return false;
    return !!(nodeSet && nodeSet.has(segLevel));
  }

  // Grille spatiale de l'enrichissement : chaque test n'aboutit que pour des objets PROCHES, la grille
  // écarte d'avance les paires lointaines (O(S²) = ~40 s par itinéraire sur un grand relevé).
  // 🩸 RÉSULTAT IDENTIQUE AU BIT PRÈS : les candidats sont TRIÉS par indice croissant, donc les nœuds
  // virtuels naissent dans le même ordre, avec les mêmes indices, qu'en comparaison exhaustive.
  const GRILLE_ENRICH_PX = 64;

  function _cellulesDe(x0, y0, x1, y1, cell, rappel) {
    const cx0 = Math.floor(x0 / cell), cx1 = Math.floor(x1 / cell);
    const cy0 = Math.floor(y0 / cell), cy1 = Math.floor(y1 / cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) rappel(cx + "," + cy);
    }
  }

  // Chaque segment dans toutes les cellules de sa bbox élargie de `marge`.
  function _grilleSegments(graph, segs, marge) {
    const g = new Map();
    for (let i = 0; i < segs.length; i++) {
      const a = graph.nodes[segs[i].a], b = graph.nodes[segs[i].b];
      _cellulesDe(Math.min(a.x, b.x) - marge, Math.min(a.y, b.y) - marge,
                  Math.max(a.x, b.x) + marge, Math.max(a.y, b.y) + marge, GRILLE_ENRICH_PX, function(k) {
        let l = g.get(k);
        if (!l) g.set(k, l = []);
        l.push(i);
      });
    }
    return g;
  }

  // Candidats triés, sans doublon, des cellules couvrant une bbox.
  function _candidatsGrille(g, x0, y0, x1, y1) {
    const vus = new Set();
    _cellulesDe(x0, y0, x1, y1, GRILLE_ENRICH_PX, function(k) {
      const l = g.get(k);
      if (l) for (let n = 0; n < l.length; n++) vus.add(l[n]);
    });
    return Array.from(vus).sort(function(p, q) { return p - q; });
  }

  // Bouts LIBRES : 1er ou dernier sommet d'un tracé qui ne touche encore aucun autre tracé. Un bout est raccordé si
  // son nœud est partagé par un autre tracé (fusion à SPATIAL_MERGE_THRESHOLD, sommet commun, bout de jonction), s'il
  // a une arête vers le nœud d'un autre tracé (croisement exact posé sur lui par l'étape 1) ou s'il porte le raccord
  // validé d'un POI entre niveaux (_poiInjectable, même filtre que _injecterJonctionsPoi).
  // ⚠️ À lire après les croisements stricts, avant toute jonction imparfaite. Un bout raccordé est traité comme un
  // sommet intérieur (lien seulement à ≤ PROXIMITE_INTERIEURS_PX d'un sommet d'un autre tracé).
  function _boutsLibres(graph, pois, ctxPois) {
    const libres = new Set();
    const accroches = [];
    if (Array.isArray(pois) && window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
      pois.forEach(function(p) {
        const inj = _poiInjectable(p, ctxPois);
        if (inj) inj.acc.forEach(function(a) { accroches.push(a); });
      });
    }
    (graph.bouts || new Set()).forEach(function(idx) {
      const tr = graph.traces[idx];
      if (!tr || tr.length !== 1) return;
      const r = tr[0];
      const voisins = graph.edges[idx] || [];
      for (let k = 0; k < voisins.length; k++) {
        const tv = graph.traces[voisins[k].to];
        if (tv && tv.indexOf(r) < 0) return;
      }
      const n = graph.nodes[idx], niv = graph.nodeLevels[idx];
      for (let k = 0; k < accroches.length; k++) {
        const a = accroches[k];
        if (niv && niv.has(a.level) && Math.hypot(a.x - n.x, a.y - n.y) <= SPATIAL_MERGE_THRESHOLD) return;
      }
      libres.add(idx);
    });
    return libres;
  }

  // `pois` / `ctxPois` : ceux passés ensuite à _injecterJonctionsPoi (bouts posés sur un passage entre niveaux).
  function _enrichirGrapheAvecCroisements(graph, pois, ctxPois) {
    // Snapshot AVANT enrichissement, sinon boucle infinie sur les segments virtuels ajoutés.
    const segs = graph.segments.slice();
    // Deux index : bbox brute (+1 px) pour les croisements, bbox élargie de la tolérance pour les T.
    const grilleCroise = _grilleSegments(graph, segs, 1);
    const grilleProxi  = _grilleSegments(graph, segs, PROXIMITY_TOLERANCE + 1);
    let nbCroisements = 0;
    let nbProximites  = 0;
    // Lu une fois : boucles chaudes sur les gros plans.
    const _mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    let _nbSkipNiveau = 0;
    // Nœuds posés à l'intérieur de chaque segment d'origine (croisements, pieds de T) : chaînés à la fin (étape 4).
    const poses = new Map();   // indice dans segs → [{ idx, t }]
    function _poser(j, idx, t) {
      if (idx === segs[j].a || idx === segs[j].b) return;
      let l = poses.get(j);
      if (!l) poses.set(j, l = []);
      for (let k = 0; k < l.length; k++) if (l[k].idx === idx) return;
      l.push({ idx: idx, t: t });
    }

    // ── 1. Croisements stricts ──
    for (let i = 0; i < segs.length; i++) {
      const segA = segs[i];
      const a1 = graph.nodes[segA.a];
      const a2 = graph.nodes[segA.b];
      const candA = _candidatsGrille(grilleCroise, Math.min(a1.x, a2.x), Math.min(a1.y, a2.y),
                                     Math.max(a1.x, a2.x), Math.max(a1.y, a2.y));

      for (let c = 0; c < candA.length; c++) {
        const j = candA[c];
        if (j <= i) continue;
        const segB = segs[j];
        // Nœud partagé : déjà connectés.
        if (segA.a === segB.a || segA.a === segB.b ||
            segA.b === segB.a || segA.b === segB.b) continue;

        // Niveaux incompatibles : croisement visuel 2D entre étages, ou milieu de jonction.
        if (!_segmentsCompatibleNiveau(segA, segB, _mlOn)) {
          _nbSkipNiveau++;
          continue;
        }

        const b1 = graph.nodes[segB.a];
        const b2 = graph.nodes[segB.b];

        const inter = _segmentIntersection(a1, a2, b1, b2);
        if (!inter) continue;

        // Bucket-merge si un nœud existe déjà (croisements à 3+ routes).
        const newIdx = _getOrAddNode(graph, inter.x, inter.y, segA.level);
        // Le nœud virtuel hérite du niveau commun (nécessaire aux tests nœud↔segment suivants).
        if (_mlOn && segA.level !== "transit") {
          _ajouterNiveauNode(graph, newIdx, segA.level);
        }
        _addEdge(graph, newIdx, segA.a, Math.hypot(a1.x - inter.x, a1.y - inter.y), segA.level);
        _addEdge(graph, newIdx, segA.b, Math.hypot(a2.x - inter.x, a2.y - inter.y), segA.level);
        _addEdge(graph, newIdx, segB.a, Math.hypot(b1.x - inter.x, b1.y - inter.y), segB.level);
        _addEdge(graph, newIdx, segB.b, Math.hypot(b2.x - inter.x, b2.y - inter.y), segB.level);
        _poser(i, newIdx, _projectOnSegment(inter, a1, a2).t);
        _poser(j, newIdx, _projectOnSegment(inter, b1, b2).t);
        nbCroisements++;
      }
    }

    // ── 2. T par proximité : BOUT LIBRE projeté à l'INTÉRIEUR d'un autre segment, sous la tolérance ──
    // Lu APRÈS les croisements stricts : un bout posé sur un croisement exact y a gagné ses arêtes.
    const bouts = graph.boutsLibres = _boutsLibres(graph, pois, ctxPois);   // lu aussi par raccordsTraces.js
    // Liens des étapes 2 et 3 PROPOSÉS d'abord, posés ensuite dans le même ordre : un bout libre ne garde que les
    // plus proches (MARGE_PLUS_PROCHE_PX). dmin = distance du candidat le plus proche sur un AUTRE tracé.
    const dmin = new Map();
    // `memeTrace` : candidat sur le tracé du bout lui-même, jamais compté dans dmin.
    function _noterProche(idx, memeTrace, d) {
      if (!bouts.has(idx) || memeTrace) return;
      const v = dmin.get(idx);
      if (v === undefined || d < v) dmin.set(idx, d);
    }
    function _assezProche(idx, d) {
      const v = dmin.get(idx);
      return v === undefined || d <= v + MARGE_PLUS_PROCHE_PX;
    }
    const propT = [];
    for (let i = 0; i < segs.length; i++) {
      const segA = segs[i];
      if (!bouts.has(segA.a) && !bouts.has(segA.b)) continue;
      const pa = graph.nodes[segA.a], pb = graph.nodes[segA.b];
      const endpoints = [
        { nodeIdx: segA.a, point: pa },
        { nodeIdx: segA.b, point: pb }
      ].filter(function(ep) { return bouts.has(ep.nodeIdx); });
      const candB = _candidatsGrille(grilleProxi, Math.min(pa.x, pb.x), Math.min(pa.y, pb.y),
                                     Math.max(pa.x, pb.x), Math.max(pa.y, pb.y));

      for (let c = 0; c < candB.length; c++) {
        const j = candB[c];
        if (j === i) continue;
        const segB = segs[j];

        // Pas de T vers un segment "transit" ; le niveau de chaque extrémité est vérifié plus bas.
        if (_mlOn && segB.level === "transit") {
          _nbSkipNiveau++;
          continue;
        }

        for (const ep of endpoints) {
          if (segB.a === ep.nodeIdx || segB.b === ep.nodeIdx) continue;

          // L'extrémité doit porter le niveau du segment cible (permet aux bouts de jonction
          // fromLevel/toLevel de s'accrocher malgré le jitter).
          if (_mlOn && !_nodeSurSegmentCompatible(graph.nodeLevels[ep.nodeIdx], segB.level, _mlOn)) {
            _nbSkipNiveau++;
            continue;
          }

          const b1 = graph.nodes[segB.a];
          const b2 = graph.nodes[segB.b];
          const proj = _projectOnSegment(ep.point, b1, b2);

          // t ∈ ]0,05 ; 0,95[ : évite le double comptage avec les croisements aux extrémités.
          if (proj.dist < PROXIMITY_TOLERANCE && proj.t > 0.05 && proj.t < 0.95) {
            propT.push({ ep: ep.nodeIdx, j: j, proj: proj });
            _noterProche(ep.nodeIdx, _memeTrace(graph, ep.nodeIdx, segB.a) && _memeTrace(graph, ep.nodeIdx, segB.b),
                         proj.dist);
          }
        }
      }
    }

    // ── 3. Bout↔sommet : un BOUT LIBRE décalé de quelques px (jitter) d'un sommet d'un autre tracé, trop loin pour
    // SPATIAL_MERGE_THRESHOLD au build → arête directe pondérée. Deux autres sommets (intérieurs ou bouts déjà
    // raccordés) ne se relient qu'à ≤ PROXIMITE_INTERIEURS_PX. ──
    const endpointSet = new Set();
    for (let i = 0; i < segs.length; i++) {
      endpointSet.add(segs[i].a);
      endpointSet.add(segs[i].b);
    }
    const endpoints = Array.from(endpointSet);
    let nbEndpoints = 0;
    const propE = [];
    // Pas ≥ tolérance : deux extrémités assez proches sont forcément dans des cellules voisines (3×3).
    const pasExt = Math.max(GRILLE_ENRICH_PX, PROXIMITY_TOLERANCE);
    const grilleExt = new Map();
    for (let i = 0; i < endpoints.length; i++) {
      const p = graph.nodes[endpoints[i]];
      const k = Math.floor(p.x / pasExt) + "," + Math.floor(p.y / pasExt);
      let l = grilleExt.get(k);
      if (!l) grilleExt.set(k, l = []);
      l.push(i);
    }

    for (let i = 0; i < endpoints.length; i++) {
      const idxA = endpoints[i];
      const pA = graph.nodes[idxA];
      const candE = [];
      const gx = Math.floor(pA.x / pasExt), gy = Math.floor(pA.y / pasExt);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const l = grilleExt.get((gx + dx) + "," + (gy + dy));
          if (l) for (let n = 0; n < l.length; n++) if (l[n] > i) candE.push(l[n]);
        }
      }
      candE.sort(function(p, q) { return p - q; });
      for (let c = 0; c < candE.length; c++) {
        const j = candE[c];
        const idxB = endpoints[j];

        // Aucun niveau numérique commun → pas de lien (deux milieux de jonction ne se relient pas).
        if (_mlOn && !_nodesCompatibleNiveau(graph.nodeLevels[idxA], graph.nodeLevels[idxB], _mlOn)) {
          _nbSkipNiveau++;
          continue;
        }

        const pB = graph.nodes[idxB];
        const d = Math.hypot(pB.x - pA.x, pB.y - pA.y);
        // Aucun bout libre : seulement très proches, et de deux tracés différents.
        const unBout = bouts.has(idxA) || bouts.has(idxB);
        if (!unBout && (d > PROXIMITE_INTERIEURS_PX || _memeTrace(graph, idxA, idxB))) continue;
        // Au-dessus du seuil de fusion (sinon déjà fusionnés au build).
        if (d > SPATIAL_MERGE_THRESHOLD && d < PROXIMITY_TOLERANCE) {
          propE.push({ a: idxA, b: idxB, d: d, bout: unBout });
          if (unBout) {
            const meme = _memeTrace(graph, idxA, idxB);
            _noterProche(idxA, meme, d);
            _noterProche(idxB, meme, d);
          }
        }
      }
    }

    // Pose des liens retenus : T d'abord, puis bout↔sommet, chacun dans son ordre de proposition.
    for (let k = 0; k < propT.length; k++) {
      const pr = propT[k], proj = pr.proj, segB = segs[pr.j];
      if (!_assezProche(pr.ep, proj.dist)) continue;
      const b1 = graph.nodes[segB.a], b2 = graph.nodes[segB.b];
      const projIdx = _getOrAddNode(graph, proj.x, proj.y, segB.level);
      if (_mlOn) _ajouterNiveauNode(graph, projIdx, segB.level);
      _addEdge(graph, pr.ep, projIdx, proj.dist, segB.level);
      _addEdge(graph, projIdx, segB.a, Math.hypot(b1.x - proj.x, b1.y - proj.y), segB.level);
      _addEdge(graph, projIdx, segB.b, Math.hypot(b2.x - proj.x, b2.y - proj.y), segB.level);
      _poser(pr.j, projIdx, proj.t);
      nbProximites++;
    }
    for (let k = 0; k < propE.length; k++) {
      const pr = propE[k];
      // Lien d'un bout libre : gardé s'il est parmi les plus proches de l'un de ses bouts libres.
      if (pr.bout && !((bouts.has(pr.a) && _assezProche(pr.a, pr.d)) ||
                       (bouts.has(pr.b) && _assezProche(pr.b, pr.d)))) continue;
      _addEdge(graph, pr.a, pr.b, pr.d);
      nbEndpoints++;
    }

    // ── 4. Chaînage le long d'un segment : ses nœuds posés, reliés de proche en proche (ordre de t) ──
    // 🩸 Chaque nœud posé n'était relié qu'aux DEUX extrémités du segment (l'arête d'origine reste) : entre deux
    // croisements d'un long segment, l'itinéraire repassait par une extrémité (aller-retour, distance gonflée).
    poses.forEach(function(l, j) {
      if (l.length < 2) return;
      l.sort(function(p, q) { return (p.t - q.t) || (p.idx - q.idx); });
      for (let k = 1; k < l.length; k++) {
        const na = graph.nodes[l[k - 1].idx], nb = graph.nodes[l[k].idx];
        _addEdge(graph, l[k - 1].idx, l[k].idx, _dist(na, nb), segs[j].level);
      }
    });

    if (_mlOn) {
      console.log("[Pathfinder] Multi-niveau : " + _nbSkipNiveau + " paires skip (niveaux incompatibles)");
    }

    console.log("[Pathfinder] Graphe enrichi —",
      "nœuds:", graph.nodes.length, "/",
      "segments:", segs.length, "/",
      "croisements stricts:", nbCroisements, "/",
      "T-junctions:", nbProximites, "/",
      "endpoint↔endpoint:", nbEndpoints);
  }

  // ── Calage d'un point externe sur le graphe ──────────
  // Projette le point sur le segment le plus proche et y INSÈRE un nœud virtuel (départ/arrivée exacts).
  // 🩸 Le niveau du point compte : le segment le plus proche DE SON NIVEAU est préféré s'il n'est pas à
  // plus de NIVEAU_TOLERANCE_PX au-delà du plus proche tous niveaux confondus (sinon le niveau du point
  // est sans doute faux). Le plus proche en 2D seul accrochait des clics à un autre étage.
  // Point sans niveau : plus proche en 2D.
  const NIVEAU_TOLERANCE_PX = 40;
  function _insertVirtualNode(graph, p) {
    let bestSegIdx = -1;
    let bestProj   = null;
    let bestDist   = Infinity;
    const niv = (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true && p && Number.isInteger(p.level))
                ? p.level : null;
    let nivIdx = -1, nivProj = null, nivDist = Infinity;

    for (let i = 0; i < graph.segments.length; i++) {
      const seg = graph.segments[i];
      if (seg.poi) continue;   // puits d'un POI entre niveaux : on ne part ni n'arrive « en l'air »
      const a = graph.nodes[seg.a];
      const b = graph.nodes[seg.b];
      const proj = _projectOnSegment(p, a, b);
      if (proj.dist < bestDist) {
        bestDist   = proj.dist;
        bestProj   = proj;
        bestSegIdx = i;
      }
      if (niv !== null && seg.level === niv && proj.dist < nivDist) {
        nivDist = proj.dist; nivProj = proj; nivIdx = i;
      }
    }
    if (nivIdx >= 0 && nivIdx !== bestSegIdx && nivDist <= bestDist + NIVEAU_TOLERANCE_PX) {
      bestSegIdx = nivIdx; bestProj = nivProj; bestDist = nivDist;
    }

    if (bestSegIdx < 0) return null;
    return _poserNoeudSur(graph, bestSegIdx, bestProj, bestDist);
  }

  // Nœud posé sur le segment `segIdx` au projeté `proj` (extrémité réutilisée si le projeté y tombe).
  function _poserNoeudSur(graph, segIdx, proj, dist) {
    const bestProj = proj, bestDist = dist;
    const seg = graph.segments[segIdx];
    const a   = graph.nodes[seg.a];
    const b   = graph.nodes[seg.b];

    // Projeté sur une extrémité → ce nœud, pas de nœud virtuel.
    const dToA = Math.hypot(a.x - bestProj.x, a.y - bestProj.y);
    if (dToA < SPATIAL_MERGE_THRESHOLD) {
      return { nodeIdx: seg.a, projection: { x: a.x, y: a.y }, snapDist: bestDist };
    }
    const dToB = Math.hypot(b.x - bestProj.x, b.y - bestProj.y);
    if (dToB < SPATIAL_MERGE_THRESHOLD) {
      return { nodeIdx: seg.b, projection: { x: b.x, y: b.y }, snapDist: bestDist };
    }

    // Nœud virtuel + arêtes A↔V et V↔B ; l'arête A↔B d'origine reste (Dijkstra choisit).
    const newIdx = graph.nodes.length;
    graph.nodes.push({ x: bestProj.x, y: bestProj.y, virtual: true });
    graph.edges.push([]);
    // Le nœud virtuel hérite du niveau du segment, sinon Dijkstra partirait sans contrainte de niveau.
    if (graph.nodeLevels) {
      _ajouterNiveauNode(graph, newIdx, seg.level);
    }
    _addEdge(graph, newIdx, seg.a, dToA, seg.level);
    _addEdge(graph, newIdx, seg.b, dToB, seg.level);

    // 🩸 Le nœud virtuel doit aussi être relié aux nœuds de croisement posés SUR son segment (sur
    // l'arête d'origine, gardée) — le plus proche de chaque côté. Relié aux seules extrémités, le
    // chemin partait vers l'extrémité puis revenait (aller-retour invisible, « demi-tour » annoncé).
    // Multi-niveau : seulement un nœud du MÊME niveau, sinon deux étages superposés communiqueraient.
    const _mlOnV = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const tV = bestProj.t;
    let avant = null, apres = null;
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    for (let k = 0; k < newIdx && lenSq > 1e-9 && seg.level !== "transit"; k++) {
      if (k === seg.a || k === seg.b) continue;
      if (_mlOnV && !(graph.nodeLevels && graph.nodeLevels[k] && graph.nodeLevels[k].has(seg.level))) continue;
      const n = graph.nodes[k];
      const tk = ((n.x - a.x) * dx + (n.y - a.y) * dy) / lenSq;
      if (tk <= 0 || tk >= 1) continue;
      const px = a.x + tk * dx, py = a.y + tk * dy;
      if (Math.hypot(n.x - px, n.y - py) > SPATIAL_MERGE_THRESHOLD) continue;
      if (tk < tV && (!avant || tk > avant.t)) avant = { idx: k, t: tk };
      if (tk > tV && (!apres || tk < apres.t)) apres = { idx: k, t: tk };
    }
    const lenSeg = Math.sqrt(lenSq);
    if (avant) _addEdge(graph, newIdx, avant.idx, (tV - avant.t) * lenSeg, seg.level);
    if (apres) _addEdge(graph, newIdx, apres.idx, (apres.t - tV) * lenSeg, seg.level);

    return {
      nodeIdx:    newIdx,
      projection: { x: bestProj.x, y: bestProj.y },
      snapDist:   bestDist
    };
  }

  // ── POI entre niveaux (escalier, puits) : arêtes de jonction ──────────
  // Un POI qui dessert plusieurs niveaux (poiJonction.js) devient un PUITS : un nœud par niveau desservi à sa
  // position, chaînés du plus bas au plus haut, et chaque raccord VALIDÉ (`accroches`) relie la galerie de son
  // niveau au nœud de ce niveau. Un niveau sans galerie raccordée est traversé (0 ↔ 2 par un puits sans
  // débouché au 1). Coût d'un maillon : différence de profondeur des deux niveaux si elles sont saisies, sinon
  // forfait par niveau franchi selon le moyen (escalier 10 m, échelons ou corde 20 m) : sans lui le puits, qui
  // n'a pas de longueur dans le plan, gagnerait toujours.
  // 🩸 Injecté APRÈS l'enrichissement, avec ses PROPRES nœuds (jamais _getOrAddNode : les nœuds des niveaux sont
  // au même x,y) : l'enrichissement ne doit pas raccorder ces nœuds « en l'air » aux galeries qui passent.
  // `ctx` = { echelle, profondeurs, corde } ; puits sans échelon (jps) seulement avec `corde`.
  // Raccord qui ne retombe plus sur une galerie de son niveau à ≤ PROXIMITY_TOLERANCE (galerie déplacée) :
  // ignoré et compté dans graph.raccordsPerdus.
  const ECHELLE_SANS_CALAGE = 10;   // px/m supposés d'un plan sans échelle (comme le rayon de 50 px = 5 m)
  function _poisJonctionDuPlan() {
    const PJ = window.KtaPoiJonction;
    return (PJ && typeof PJ.pointsJonction === "function") ? PJ.pointsJonction() : [];
  }

  function _poidsPuits(la, lb, tag, ctx) {
    const zA = _profondeurPourPoids(la, ctx), zB = _profondeurPourPoids(lb, ctx);
    const e = _echelleReseau(ctx && ctx.echelle, 0);
    if (zA !== null && zB !== null && e) return Math.abs(zA - zB) * e;
    const forfait = (window.KtaPoiJonction && window.KtaPoiJonction.forfaitM(tag)) || 0;
    return Math.abs(la - lb) * forfait * _echelleReseau(ctx && ctx.echelle, ECHELLE_SANS_CALAGE);
  }

  // Segment le plus proche de `p` au niveau `lvl`, à ≤ maxDist → nœud posé dessus (null sinon).
  function _insererSurNiveau(graph, p, lvl, maxDist) {
    let best = -1, bestProj = null, bestDist = Infinity;
    for (let i = 0; i < graph.segments.length; i++) {
      const seg = graph.segments[i];
      if (seg.level !== lvl) continue;
      const proj = _projectOnSegment(p, graph.nodes[seg.a], graph.nodes[seg.b]);
      if (proj.dist < bestDist) { best = i; bestProj = proj; bestDist = proj.dist; }
    }
    if (best < 0 || bestDist > maxDist) return null;
    return _poserNoeudSur(graph, best, bestProj, bestDist);
  }

  // POI réellement injecté comme puits → { tag, moyen, niveaux, acc } ; null sinon (sans moyen, corde non permise,
  // moins de deux niveaux, aucun raccord validé).
  function _poiInjectable(p, ctx) {
    const PJ = window.KtaPoiJonction;
    if (!PJ || !p) return null;
    const tag = (Array.isArray(p.tags) && p.tags[0]) || "";
    const moyen = PJ.moyen(tag);
    if (!moyen || (moyen === "corde" && !(ctx && ctx.corde))) return null;
    const niveaux = PJ.niveaux(p);
    const acc = PJ.accroches(p);
    if (niveaux.length < 2 || !acc.length) return null;
    return { tag: tag, moyen: moyen, niveaux: niveaux, acc: acc };
  }

  function _injecterJonctionsPoi(graph, pois, ctx) {
    graph.raccordsPerdus = 0;
    if (!Array.isArray(pois) || !pois.length || !graph.segments.length) return;
    if (!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true)) return;
    const PJ = window.KtaPoiJonction;
    if (!PJ) return;
    pois.forEach(function(p) {
      const inj = _poiInjectable(p, ctx);
      if (!inj) return;
      const tag = inj.tag, niveaux = inj.niveaux, acc = inj.acc;
      const info = { tag: tag, moyen: inj.moyen, nom: String(p.nom || p.id || "") };
      const puits = {};
      niveaux.forEach(function(n) {
        const idx = _nouveauNode(graph, p.x, p.y);
        _ajouterNiveauNode(graph, idx, "transit");
        graph.nodes[idx].poi = info;
        puits[n] = idx;
      });
      for (let i = 1; i < niveaux.length; i++) {
        const a = puits[niveaux[i - 1]], b = puits[niveaux[i]];
        _addEdge(graph, a, b, _poidsPuits(niveaux[i - 1], niveaux[i], tag, ctx));
        graph.segments.push({ a: a, b: b, roadType: "jonction", level: "transit", road: null, poi: info });
      }
      acc.forEach(function(r) {
        const pose = _insererSurNiveau(graph, r, r.level, PROXIMITY_TOLERANCE);
        if (!pose) { graph.raccordsPerdus++; return; }
        const n = graph.nodes[pose.nodeIdx];
        _addEdge(graph, pose.nodeIdx, puits[r.level], _dist(n, p));
        graph.segments.push({ a: pose.nodeIdx, b: puits[r.level], roadType: "jonction", level: "transit",
                              road: null, poi: info });
      });
    });
    if (graph.raccordsPerdus) {
      console.warn("[Pathfinder] " + graph.raccordsPerdus + " raccord(s) de passage entre niveaux sans galerie");
    }
  }

  // ── Dijkstra ──────────
  // Tas binaire (O(E log V)) : le balayage O(V²) coûtait ~40 s sur un grand relevé.
  // 🩸 Tas ordonné sur (distance, indice) : à égalité de distance, le plus petit indice sort d'abord,
  // comme le balayage — donc mêmes chemins. Entrées périmées ignorées.
  function _tasPousser(tas, d, i) {
    tas.push(d, i);
    let k = (tas.length >> 1) - 1;
    while (k > 0) {
      const p = ((k - 1) >> 1);
      if (tas[2 * p] < tas[2 * k] || (tas[2 * p] === tas[2 * k] && tas[2 * p + 1] <= tas[2 * k + 1])) break;
      const d0 = tas[2 * p], i0 = tas[2 * p + 1];
      tas[2 * p] = tas[2 * k]; tas[2 * p + 1] = tas[2 * k + 1];
      tas[2 * k] = d0; tas[2 * k + 1] = i0;
      k = p;
    }
  }
  function _tasExtraire(tas) {   // → [d, i] du minimum ; tas non vide
    const d = tas[0], i = tas[1];
    const iDernier = tas.pop(), dDernier = tas.pop();   // paires [d, i] à plat : l'indice sort en premier
    const n = tas.length >> 1;
    if (n > 0) {
      tas[0] = dDernier; tas[1] = iDernier;
      let k = 0;
      for (;;) {
        const g = 2 * k + 1, dr = g + 1;
        let m = k;
        if (g < n && (tas[2 * g] < tas[2 * m] || (tas[2 * g] === tas[2 * m] && tas[2 * g + 1] < tas[2 * m + 1]))) m = g;
        if (dr < n && (tas[2 * dr] < tas[2 * m] || (tas[2 * dr] === tas[2 * m] && tas[2 * dr + 1] < tas[2 * m + 1]))) m = dr;
        if (m === k) break;
        const d0 = tas[2 * m], i0 = tas[2 * m + 1];
        tas[2 * m] = tas[2 * k]; tas[2 * m + 1] = tas[2 * k + 1];
        tas[2 * k] = d0; tas[2 * k + 1] = i0;
        k = m;
      }
    }
    return [d, i];
  }

  // Ordonné sur le COÛT (dist) ; la longueur (lg) suit le même chemin. Sans zone à coût, coût = longueur au bit près
  // (mêmes additions dans le même ordre) : chemins et distances inchangés.
  // → { nodeIndices, totalDistance: longueur, cout, zonesTraversees: Map(zone → px dedans) } | null.
  function _dijkstra(graph, start, end) {
    const N    = graph.nodes.length;
    const dist = new Array(N).fill(Infinity);
    const lg   = new Array(N).fill(0);
    const prev = new Array(N).fill(-1);
    const via  = new Array(N).fill(null);   // arête prise pour arriver au nœud (zones à coût traversées)
    const fait = new Uint8Array(N);
    dist[start] = 0;
    const tas = [];
    _tasPousser(tas, 0, start);

    while (tas.length) {
      const e = _tasExtraire(tas);
      const u = e[1];
      if (fait[u] || e[0] !== dist[u]) continue;   // entrée périmée
      if (u === end) break;
      fait[u] = 1;

      const neigh = graph.edges[u];
      for (let i = 0; i < neigh.length; i++) {
        const v = neigh[i].to;
        if (fait[v]) continue;
        const alt = dist[u] + neigh[i].weight;
        if (alt < dist[v]) {
          dist[v] = alt;
          lg[v] = lg[u] + neigh[i].len;
          prev[v] = u;
          via[v] = neigh[i];
          _tasPousser(tas, alt, v);
        }
      }
    }

    if (dist[end] === Infinity) return null;

    const pathIdx = [];
    const zones = new Map();
    let u = end;
    while (u >= 0) {
      pathIdx.unshift(u);
      if (via[u] && via[u].zc) via[u].zc.forEach(function(px, z) { zones.set(z, (zones.get(z) || 0) + px); });
      u = prev[u];
    }
    return { nodeIndices: pathIdx, totalDistance: lg[end], cout: dist[end], zonesTraversees: zones };
  }

  // Zones à coût d'un chemin → [{ type, longueurPx, objet }], une entrée par zone, la plus traversée d'abord.
  function _listeZonesTraversees(zones) {
    const out = [];
    zones.forEach(function(px, z) { out.push({ type: z.objet && z.objet.type, longueurPx: px, objet: z.objet }); });
    return out.sort(function(a, b) { return b.longueurPx - a.longueurPx; });
  }

  // ── Calcul interne, une passe ──────────
  // build + enrichissement + calage + Dijkstra ; computeRoute l'appelle en passe 1 puis 2 si besoin.
  // `echelle` (px/m) et `profondeurs` ({ "<niveau>": m|null }) facultatifs : ceux du plan du RÉSEAU
  // quand ce n'est pas le plan ouvert (sinon APP_CONFIG.scale / getProfondeurNiveau). Ils servent aux
  // carrefours ET au poids des jonctions. `zonesCout` : zones à coût du réseau (_buildGraph), gardées dans les deux
  // passes (un coût ne se relâche pas : il ne bloque jamais).
  function _computeRouteInterne(waypoints, allRoads, allowedTypes, zonesInacc, avoidPoints, avoidRadius, avoidZones,
                                echelle, profondeurs, jonctions, zonesCout, masses) {
    const graph = _buildGraph(allRoads, allowedTypes, zonesInacc, avoidPoints, avoidRadius, avoidZones,
                              { echelle: echelle, profondeurs: profondeurs }, zonesCout, masses);
    if (graph.nodes.length === 0) {
      // i18n : code + params, localisé au rendu (interfaceItineraire.js).
      const e = new Error("Aucune route correspondant aux types sélectionnés (" + allowedTypes.join(", ") + ")");
      e.code = "NO_ROUTE_TYPES";
      e.i18nKey = "iti.err.aucuneRouteTypes";
      e.i18nParams = { types: allowedTypes.join(", ") };
      throw e;
    }
    const ctxPuits = { echelle: echelle, profondeurs: profondeurs, corde: !!(jonctions && jonctions.corde) };
    _enrichirGrapheAvecCroisements(graph, jonctions && jonctions.pois, ctxPuits);
    _injecterJonctionsPoi(graph, jonctions && jonctions.pois, ctxPuits);

    const snapResults = [];
    for (let i = 0; i < waypoints.length; i++) {
      const snap = _insertVirtualNode(graph, waypoints[i]);
      if (!snap) {
        const e = new Error("Impossible de snap le waypoint #" + (i + 1) + " sur le réseau");
        e.code = "SNAP_FAILED";
        e.i18nKey = "iti.err.snapImpossible";
        e.i18nParams = { n: (i + 1) };
        throw e;
      }
      snapResults.push(snap);
    }

    const fullPath    = [];
    let totalDistance = 0;
    let segmentCount  = 0;
    let cout          = 0;
    const zonesCumul  = new Map();

    for (let i = 0; i < snapResults.length - 1; i++) {
      const a = snapResults[i].nodeIdx;
      const b = snapResults[i + 1].nodeIdx;
      const result = _dijkstra(graph, a, b);
      if (!result) {
        const e = new Error(
          "Aucun chemin trouvé entre le waypoint #" + (i + 1) + " et le waypoint #" + (i + 2) +
          " (le réseau est probablement déconnecté entre ces 2 points)"
        );
        e.code = "NO_PATH";
        e.i18nKey = "iti.err.pasDeChemin";
        e.i18nParams = { a: (i + 1), b: (i + 2) };
        throw e;
      }
      // 🩸 LE NIVEAU VOYAGE AVEC LE CHEMIN (nécessaire au profil en long). `levels` peut avoir plusieurs
      // entrées (nœud fusionné) ou « transit » (milieu de jonction, ENTRE deux étages) : on ne rend un
      // niveau qu'univoque, sinon null (« indéterminé ») et le profil interpole.
      const segPoints = result.nodeIndices.map(function(idx) {
        const n = graph.nodes[idx];
        // 🩸 Les niveaux vivent dans le tableau parallèle `graph.nodeLevels[idx]`, PAS sur le nœud :
        // `n.levels` vaut toujours undefined → null partout, sans erreur, profil plat.
        const set = graph.nodeLevels && graph.nodeLevels[idx];
        let lvl = null;
        if (set && typeof set.forEach === "function") {
          const nums = [];
          set.forEach(function (v) { if (Number.isInteger(v)) nums.push(v); });
          if (nums.length === 1) lvl = nums[0];
        }
        // Puits d'un POI entre niveaux : le moyen voyage avec le point (« par l'échelle » au guidage).
        return n.poi ? { x: n.x, y: n.y, level: lvl, via: n.poi.moyen } : { x: n.x, y: n.y, level: lvl };
      });
      if (i > 0) segPoints.shift();
      for (let k = 0; k < segPoints.length; k++) fullPath.push(segPoints[k]);
      totalDistance += result.totalDistance;
      segmentCount  += result.nodeIndices.length - 1;
      cout          += result.cout;
      result.zonesTraversees.forEach(function(px, z) { zonesCumul.set(z, (zonesCumul.get(z) || 0) + px); });
    }

    return {
      path:           fullPath,
      totalDistance:  totalDistance,
      segmentCount:   segmentCount,
      cout:           cout,
      zonesTraversees: _listeZonesTraversees(zonesCumul),
      snappedPoints:  snapResults.map(function(s) { return s.projection; }),
      // Champs du guidage (`path`/`totalDistance` restent le trajet SUR tracé) :
      //   • raccords : trajet à vol d'oiseau entre chaque waypoint et son tracé (dessiné ET compté) ;
      //   • carrefours : nœuds SUR le chemin d'où partent ≥ 3 directions, cherchés géométriquement —
      //     l'arête d'origine restant dans le graphe, un chemin tout droit peut éviter le nœud de croisement.
      raccords: snapResults.map(function(s, i) {
        const w = waypoints[i];
        return {
          index:  i,
          role:   (i === 0) ? "depart" : (i === snapResults.length - 1 ? "arrivee" : "etape"),
          label:  (w && w.label) ? String(w.label) : null,
          de:     { x: w.x, y: w.y },
          vers:   { x: s.projection.x, y: s.projection.y },
          distPx: s.snapDist
        };
      }),
      carrefours: _carrefoursSurChemin(graph, fullPath, echelle)
    };
  }

  // ── Carrefours le long d'un chemin (guidage) ──────────
  // [{x, y, sorties:[cap°]}] par nœud posé sur le chemin (≤ CARREFOUR_TOL_PX) d'où partent au moins 3
  // directions DISTINCTES. Cap : 0 = haut du plan, sens horaire (convention de tracking.js).
  // 🩸 Compter les voisins d'un nœud ment (arêtes doublées, extrémités proches reliées, tremblement) :
  // on regarde la GÉOMÉTRIE — chaque traversée d'un cercle de ~3 m autour du nœud est une sortie, les
  // directions proches (SORTIE_ECART_DEG) se regroupent. Une amorce < 3 m (défaut de dessin) ne compte pas.
  const CARREFOUR_TOL_PX  = 3;
  const SORTIE_ECART_DEG  = 25;
  const GRILLE_CHEMIN_PX  = 24;

  // Rayon de sortie : ~3 m, jamais moins de 8 px.
  // Échelle (px/m) : celle de l'appelant (réseau d'un AUTRE plan), sinon le plan ouvert, sinon `repli`
  // (0 = pas calibré).
  function _echelleReseau(echelle, repli) {
    if (Number(echelle) > 0) return Number(echelle);
    return (window.APP_CONFIG && Number(window.APP_CONFIG.scale) > 0) ? Number(window.APP_CONFIG.scale) : repli;
  }

  function _rayonSortiePx(echelle) {
    return Math.max(8, 3 * _echelleReseau(echelle, 0));
  }

  function _capDeg(a, b) {
    const d = Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI;
    return (d + 360) % 360;
  }

  function _voisinsUniques(graph, idx) {
    const vus = {};
    const out = [];
    const neigh = graph.edges[idx] || [];
    for (let i = 0; i < neigh.length; i++) {
      const v = neigh[i].to;
      if (v === idx || vus[v]) continue;
      vus[v] = 1;
      out.push(v);
    }
    return out;
  }

  function _grilleAretes(graph, cell) {
    const g = {};
    for (let i = 0; i < graph.edges.length; i++) {
      const vus = {};
      const neigh = graph.edges[i] || [];
      for (let k = 0; k < neigh.length; k++) {
        const j = neigh[k].to;
        if (j <= i || vus[j]) continue;
        vus[j] = 1;
        const a = graph.nodes[i], b = graph.nodes[j];
        const x0 = Math.floor(Math.min(a.x, b.x) / cell), x1 = Math.floor(Math.max(a.x, b.x) / cell);
        const y0 = Math.floor(Math.min(a.y, b.y) / cell), y1 = Math.floor(Math.max(a.y, b.y) / cell);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) continue;   // arête aberrante : ignorée
        for (let cx = x0; cx <= x1; cx++) {
          for (let cy = y0; cy <= y1; cy++) {
            const key = cx + "," + cy;
            (g[key] || (g[key] = [])).push(i, j);
          }
        }
      }
    }
    return g;
  }

  // `c` : centre du cercle — un nœud, ou le centre d'une ZONE de carrefour.
  function _capsDeSortie(graph, c, grille, cell, R) {
    const caps = [];
    const vus = {};
    const cx0 = Math.floor((c.x - R) / cell), cx1 = Math.floor((c.x + R) / cell);
    const cy0 = Math.floor((c.y - R) / cell), cy1 = Math.floor((c.y + R) / cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const lst = grille[cx + "," + cy];
        if (!lst) continue;
        for (let k = 0; k < lst.length; k += 2) {
          const i = lst[k], j = lst[k + 1];
          const key = i + "," + j;
          if (vus[key]) continue;
          vus[key] = 1;
          const a = graph.nodes[i], b = graph.nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const fx = a.x - c.x, fy = a.y - c.y;
          const A = dx * dx + dy * dy;
          if (A < 1e-9) continue;
          const B = 2 * (fx * dx + fy * dy);
          const C = fx * fx + fy * fy - R * R;
          const disc = B * B - 4 * A * C;
          if (disc < 0) continue;
          const r = Math.sqrt(disc);
          [(-B - r) / (2 * A), (-B + r) / (2 * A)].forEach(function(t) {
            if (t >= 0 && t <= 1) caps.push(_capDeg(c, { x: a.x + t * dx, y: a.y + t * dy }));
          });
        }
      }
    }
    // Regroupement circulaire (le dernier groupe peut rejoindre le premier via 0°), moyenne VECTORIELLE
    // (359° et 1° font 0°, pas 180°).
    caps.sort(function(a, b) { return a - b; });
    const groupes = [];
    caps.forEach(function(c) {
      const g = groupes[groupes.length - 1];
      if (g && c - g[g.length - 1] <= SORTIE_ECART_DEG) g.push(c);
      else groupes.push([c]);
    });
    if (groupes.length > 1 &&
        groupes[0][0] + 360 - groupes[groupes.length - 1].slice(-1)[0] <= SORTIE_ECART_DEG) {
      groupes[0] = groupes.pop().concat(groupes[0]);
    }
    return groupes.map(function(g) {
      let sx = 0, sy = 0;
      g.forEach(function(c) { sx += Math.sin(c * Math.PI / 180); sy += Math.cos(c * Math.PI / 180); });
      return Math.round((Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360);
    });
  }

  function _carrefoursSurChemin(graph, path, echelle) {
    if (!graph || !Array.isArray(path) || path.length < 2) return [];
    const grille = {};
    function _cle(cx, cy) { return cx + "," + cy; }
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const x0 = Math.floor((Math.min(a.x, b.x) - CARREFOUR_TOL_PX) / GRILLE_CHEMIN_PX);
      const x1 = Math.floor((Math.max(a.x, b.x) + CARREFOUR_TOL_PX) / GRILLE_CHEMIN_PX);
      const y0 = Math.floor((Math.min(a.y, b.y) - CARREFOUR_TOL_PX) / GRILLE_CHEMIN_PX);
      const y1 = Math.floor((Math.max(a.y, b.y) + CARREFOUR_TOL_PX) / GRILLE_CHEMIN_PX);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = _cle(cx, cy);
          (grille[k] || (grille[k] = [])).push(i);
        }
      }
    }
    const R = _rayonSortiePx(echelle);
    const cellA = Math.max(16, 2 * R);
    let grilleA = null;   // grille des arêtes : construite au premier candidat seulement
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + _dist(path[i - 1], path[i]));
    const out = [];
    for (let idx = 0; idx < graph.nodes.length; idx++) {
      const n = graph.nodes[idx];
      const segs = grille[_cle(Math.floor(n.x / GRILLE_CHEMIN_PX), Math.floor(n.y / GRILLE_CHEMIN_PX))];
      if (!segs) continue;
      if (_voisinsUniques(graph, idx).length < 3) continue;
      let sN = null;
      for (let k = 0; k < segs.length; k++) {
        const i = segs[k];
        const pr = _projectOnSegment(n, path[i - 1], path[i]);
        if (pr.dist <= CARREFOUR_TOL_PX && (sN === null || cum[i - 1] + pr.t * (cum[i] - cum[i - 1]) < sN)) {
          sN = cum[i - 1] + pr.t * (cum[i] - cum[i - 1]);
        }
      }
      if (sN === null) continue;
      if (!grilleA) grilleA = _grilleAretes(graph, cellA);
      const sorties = _capsDeSortie(graph, n, grilleA, cellA, R);
      if (sorties.length >= 3) out.push({ x: n.x, y: n.y, sorties: sorties, _s: sN });
    }
    _zonesDeCarrefour(graph, out, grilleA, cellA, R, echelle);
    out.forEach(function(c) { delete c._s; });
    return out;
  }

  // Grands carrefours : une ZONE de croisements proches (les galeries n'arrivent pas au même point du
  // dessin). Des croisements consécutifs sur le trajet à ≤ ZONE_ECART_M forment une zone ; ses sorties se
  // mesurent sur un cercle qui l'englobe (rayon de zone + rayon de sortie). Chaque membre reçoit la
  // MÊME `zone` : { x, y, r, sorties }. 5 m (décision produit : 20 m regroupait trop).
  const ZONE_ECART_M = 5;   // (décision produit, cf plus haut)
  function _zonesDeCarrefour(graph, carrefours, grilleA, cellA, R, echelle) {
    if (carrefours.length < 2 || !grilleA) return;
    const e = _echelleReseau(echelle, 1);
    const ecart = ZONE_ECART_M * e;
    const tries = carrefours.slice().sort(function(a, b) { return a._s - b._s; });
    const groupes = [];
    tries.forEach(function(c) {
      const g = groupes[groupes.length - 1];
      if (g && c._s - g[g.length - 1]._s <= ecart) g.push(c);
      else groupes.push([c]);
    });
    groupes.forEach(function(g) {
      if (g.length < 2) return;
      let cx = 0, cy = 0;
      g.forEach(function(c) { cx += c.x; cy += c.y; });
      const centre = { x: cx / g.length, y: cy / g.length };
      let r = 0;
      g.forEach(function(c) { r = Math.max(r, _dist(centre, c)); });
      const zone = {
        x: centre.x, y: centre.y, r: r,
        sorties: _capsDeSortie(graph, centre, grilleA, cellA, r + R)
      };
      g.forEach(function(c) { c.zone = zone; });
    });
  }

  // ── computeRoute (2 passes) ──────────
  // opts : allowedTypes (défaut principal/secondaire/chemin) · avoidPoints [{x, y, label?}] · avoidTags
  //   (développés en points via SearchPoints) · avoidRadius px (défaut 100) · avoidZones (types) ·
  //   respecterInaccessibles (false = SUSPEND les contraintes dures ; absent = respecter) · corde (true =
  //   équipe équipée : les puits sans échelon entre niveaux deviennent praticables) · brancard (true = masse au sol
  //   sous 1,8 m de vide évitée comme une zone à coût).
  // Passe 1 : zones inaccessibles (dur) + évitements (souple) + coût des zones à coût. Échec avec évitements →
  // passe 2 sans eux (le coût reste) ;
  // si elle aboutit : `usedFallback: true` + `avoidedThrough` (points traversés) pour l'UI. Échec de la
  // passe 2 → vraie absence de chemin, l'erreur remonte.
  // ⚠️ ASYNC (SearchPoints.getAllPoints) : `await Pathfinder.computeRoute(…)`.
  async function computeRoute(waypoints, opts) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      throw new Error("Au moins 2 waypoints sont requis");
    }
    opts = opts || {};
    const allowedTypes = opts.allowedTypes || ["principal", "secondaire", "chemin"];

    // ⚠️ getAllEmbeddedRoads (visibles ET masquées), pas getEmbeddedRoads : masquer le calque des routes
    // (souvent déjà dessinées sur le PNG) ne doit pas casser le pathfinder.
    const sessionRoads = (typeof window.getRoads === "function") ? window.getRoads() : [];
    let embeddedRoads;
    if (typeof window.getAllEmbeddedRoads === "function") {
      embeddedRoads = window.getAllEmbeddedRoads();
    } else if (typeof window.getEmbeddedRoads === "function") {
      embeddedRoads = window.getEmbeddedRoads();
    } else {
      embeddedRoads = [];
    }
    const allRoads = sessionRoads.concat(embeddedRoads);

    console.log("[Pathfinder] Roads en entrée —",
      "session:", sessionRoads.length, "/",
      "embedded (toutes):", embeddedRoads.length, "/",
      "total:", allRoads.length,
      "| types autorisés:", allowedTypes.join(","));

    if (allRoads.length === 0) {
      const e = new Error("Aucune route disponible pour calculer un itinéraire");
      e.code = "NO_ROUTE";
      e.i18nKey = "iti.err.aucuneRoute";
      throw e;
    }

    // Zones inaccessibles et murs en ligne : SEULES contraintes dures, jamais relâchées même en passe 2 — un
    // objet mal typé ferme un passage sans recours, d'où la case de la modale (cochée par défaut : la suspendre
    // est un geste explicite) ; elle lève les deux ensemble.
    // ⚠️ Limité à computeRoute : computeReachable (Secours / Perdu) les garde toujours — une préférence
    // de confort n'élargit pas un périmètre de secours.
    const zonesInacc = (opts.respecterInaccessibles === false)
      ? [] : _collecterObstaclesDurs();
    if (opts.respecterInaccessibles === false) {
      console.log("[Pathfinder] zones inaccessibles et murs IGNORÉS (choix utilisateur)");
    }
    if (zonesInacc.length > 0) {
      console.log("[Pathfinder] " + zonesInacc.length + " obstacle(s) dur(s) (zones inaccessibles, murs)");
    }

    // Évitements souples : points explicites + avoidTags développés.
    const explicitAvoid    = Array.isArray(opts.avoidPoints) ? opts.avoidPoints.slice() : [];
    const avoidTags        = Array.isArray(opts.avoidTags)   ? opts.avoidTags.slice()   : [];
    const expandedFromTags = await _expandAvoidTagsEnPoints(avoidTags);
    const allAvoidPts      = explicitAvoid.concat(expandedFromTags);
    const avoidRadius      = (Number.isFinite(opts.avoidRadius) && opts.avoidRadius > 0)
                              ? opts.avoidRadius : 100;
    const avoidZones       = _collecterZonesAEviter(Array.isArray(opts.avoidZones) ? opts.avoidZones : []);
    if (avoidZones.length > 0) {
      console.log("[Pathfinder] " + avoidZones.length + " zone(s) a eviter — contrainte souple");
    }
    const hasAvoidances    = (allAvoidPts.length > 0) || (avoidZones.length > 0);
    if (allAvoidPts.length > 0) {
      console.log("[Pathfinder] " + allAvoidPts.length +
                  " point(s) a eviter (rayon " + avoidRadius + "px) — contrainte souple, fallback possible");
    }

    // Passages entre niveaux du plan ; `opts.corde` (équipe équipée) ouvre les puits sans échelon.
    const jonctions = { pois: _poisJonctionDuPlan(), corde: opts.corde === true };
    // Zones à coût (Comblé, effondrement) : jamais levées, ni par la case « Respecter… » ni en passe 2.
    const zonesCout = _collecterZonesCout();
    // Masses au sol : coût selon le vide, passage coupé sous 0,5 m ; jamais levées (passe 2 comprise).
    const masses = _massesDuPlan(opts.brancard === true);

    let result          = null;
    let usedFallback    = false;
    let avoidedThrough  = [];

    try {
      result = _computeRouteInterne(
        waypoints, allRoads, allowedTypes,
        zonesInacc, allAvoidPts, avoidRadius, avoidZones, undefined, undefined, jonctions, zonesCout, masses
      );
    } catch(e1) {
      // Sans évitements, c'est une vraie absence de chemin → on relance.
      if (!hasAvoidances) throw e1;

      console.log("[Pathfinder] Passe 1 echec — tentative passe 2 sans evitements (fallback)");
      try {
        result = _computeRouteInterne(
          waypoints, allRoads, allowedTypes,
          zonesInacc, [], 0, [], undefined, undefined, jonctions, zonesCout, masses
        );
        usedFallback = true;
        // Points évités que le chemin final traverse quand même (« Impossible d'éviter : X, Y »).
        avoidedThrough = allAvoidPts.filter(function(ap) {
          return _pathPassesNearPoint(result.path, ap, avoidRadius);
        });
        console.log("[Pathfinder] Passe 2 ok — " + avoidedThrough.length +
                    " evitement(s) traverse(s) malgre la preference");
      } catch(e2) {
        throw e2;
      }
    }

    return Object.assign({}, result, {
      usedFallback:    usedFallback,
      avoidedThrough:  avoidedThrough,
      avoidRadius:     avoidRadius
    });
  }

  // ── computeRouteOnRoads : itinéraire inter-plans ──────────
  // Dijkstra sur des ROADS FOURNIES (plan NON chargé, lues par InterPlanLinks.collectRoutingDataForPlan).
  // SYNCHRONE : pas d'avoidTags — l'appelant résout ses évitements, les données distantes ne sont pas
  // dans les globales.
  // opts : allowedTypes · zones [{type, points, level?}] (types durs = contrainte DURE, estZoneDure) ·
  //   types à coût = évités d'office, jamais levés · murs [{points, level?}] (murs en ligne de CE réseau, DURS) ·
  //   respecterInaccessibles (false = lève zones dures et murs) ·
  //   avoidPoints · avoidZonesResolved (zones objets, souple) · avoidRadius (px, 100) ·
  //   echelle (px/m de CE réseau : carrefours 3 m / 5 m et dénivelé) ·
  //   profondeurs ({ "<niveau>": m|null } de CE réseau ; fournie, même {}, fait foi ; absente = plan ouvert) ·
  //   poisJonction (POI entre niveaux de CE réseau, absent = aucun) · corde.
  // Retour : même forme que computeRoute (+ usedFallback / avoidedThrough).
  function computeRouteOnRoads(waypoints, roads, opts) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      throw new Error("Au moins 2 waypoints sont requis");
    }
    opts = opts || {};
    const allowedTypes = opts.allowedTypes || ["principal", "secondaire", "chemin"];
    if (!Array.isArray(roads) || roads.length === 0) {
      const e = new Error("Aucune route disponible pour calculer un itinéraire");
      e.code = "NO_ROUTE";
      e.i18nKey = "iti.err.aucuneRoute";
      throw e;
    }
    const zonesDures = (Array.isArray(opts.zones) ? opts.zones : []).filter(function(z) {
      return z && _estZoneDure(z.type) && Array.isArray(z.points) && z.points.length >= 3;
    }).map(_zoneBloquante);
    const mursDurs = (Array.isArray(opts.murs) ? opts.murs : []).filter(function(m) {
      return m && Array.isArray(m.points) && m.points.length >= 2;
    }).map(function(m) {
      return { points: m.points, level: Number.isInteger(m.level) ? m.level : 0, ligne: true };
    });
    const zonesInacc = (opts.respecterInaccessibles === false) ? [] : zonesDures.concat(mursDurs);
    const zonesCout = _zonesCoutDe(opts.zones);
    const masses = _massesReseau(opts.zones, opts.echelle);
    const avoidPts    = Array.isArray(opts.avoidPoints) ? opts.avoidPoints : [];
    const avoidRadius = (Number.isFinite(opts.avoidRadius) && opts.avoidRadius > 0) ? opts.avoidRadius : 100;
    const avoidZones  = (Array.isArray(opts.avoidZonesResolved) ? opts.avoidZonesResolved : [])
      .filter(function(z) { return z && Array.isArray(z.points) && z.points.length >= 3; }).map(_zoneBloquante);
    const hasAvoid    = avoidPts.length > 0 || avoidZones.length > 0;
    // Passages entre niveaux de CE réseau : fournis par l'appelant (plan non chargé → aucun par défaut).
    const jonctions   = { pois: Array.isArray(opts.poisJonction) ? opts.poisJonction : [],
                          corde: opts.corde === true };

    let result = null, usedFallback = false, avoidedThrough = [];
    try {
      result = _computeRouteInterne(waypoints, roads, allowedTypes, zonesInacc, avoidPts, avoidRadius,
                                    avoidZones, opts.echelle, opts.profondeurs, jonctions, zonesCout, masses);
    } catch(e1) {
      if (!hasAvoid) throw e1;
      result = _computeRouteInterne(waypoints, roads, allowedTypes,
                                    zonesInacc, [], 0, [], opts.echelle, opts.profondeurs, jonctions, zonesCout,
                                    masses);
      usedFallback = true;
      avoidedThrough = avoidPts.filter(function(ap) {
        return _pathPassesNearPoint(result.path, ap, avoidRadius);
      });
    }
    return Object.assign({}, result, {
      usedFallback:   usedFallback,
      avoidedThrough: avoidedThrough,
      avoidRadius:    avoidRadius
    });
  }

  // Point par id ou nom (insensible à la casse) : points éditeur, puis cache de searchPoints.js.
  function resolvePointById(idOrName) {
    if (!idOrName) return null;
    const target = String(idOrName).trim().toLowerCase();
    if (!target) return null;

    const editorPoints = (typeof window.getEditorPoints === "function") ? window.getEditorPoints() : [];
    for (let i = 0; i < editorPoints.length; i++) {
      const p = editorPoints[i];
      if (!p) continue;
      if ((p.id   && String(p.id).trim().toLowerCase()   === target) ||
          (p.nom  && String(p.nom).trim().toLowerCase()  === target)) {
        // Point précis du POI s'il existe (poiPrecis.js > cible) : l'itinéraire vise le vrai lieu.
        const c = window.KtaPoiPrecis ? window.KtaPoiPrecis.cible(p) : p;
        return { x: c.x, y: c.y, source: "editor", point: p };
      }
    }

    if (window.PLAN_CONFIG && Array.isArray(window.PLAN_CONFIG.dataLayers)) {
      // Lecture synchrone du cache seulement : sinon l'appelant passe par des coordonnées (clic).
    }

    return null;
  }

  // ── computeReachable : isochrone du Mode Perdu ──────────
  // Segments atteignables depuis un point dans un budget de distance (vitesse × temps), pour que
  // lostMode.js restreigne la zone de recherche au réseau réel plutôt qu'à un cercle.
  // Dijkstra « budget » depuis le nœud de calage → fullSegments (2 extrémités dans le budget) et
  // partialSegments (tronqués par interpolation au point où le budget s'épuise).
  // Les jonctions sont traversables : le calcul s'étend aux autres niveaux.
  // Départ loin de tout tracé : exceedsBudget=true + snapPoint/snapDistance, listes vides (LostMode trace
  // alors pointillé + cercle seul). `opts.corde` : puits sans échelon franchissables.
  function computeReachable(startPoint, budgetPx, opts) {
    if (!startPoint || typeof startPoint.x !== "number" || typeof startPoint.y !== "number") {
      throw new Error("computeReachable : startPoint = {x, y} requis");
    }
    if (!isFinite(budgetPx) || budgetPx <= 0) {
      throw new Error("computeReachable : budgetPx > 0 requis (= rayon en pixels)");
    }

    // Même collecte que computeRoute (visibles ET masquées) : tout le réseau est couvert.
    const sessionRoads = (typeof window.getRoads === "function" ? window.getRoads() : []) || [];
    const embeddedRoads = (typeof window.getAllEmbeddedRoads === "function"
      ? window.getAllEmbeddedRoads() : []) || [];
    const allRoads = sessionRoads.concat(embeddedRoads);

    if (allRoads.length === 0) {
      return {
        fullSegments: [], partialSegments: [],
        snapPoint: null, snapDistance: Infinity,
        exceedsBudget: true, reason: "no-roads",
        totalReachableDistance: 0
      };
    }

    const allowedTypes = ["principal", "secondaire", "chemin"];
    const zonesInacc = _collecterObstaclesDurs();

    // Sans évitements (propres à l'itinéraire).
    const graph = _buildGraph(allRoads, allowedTypes, zonesInacc, [], 0);
    const poisPuits = _poisJonctionDuPlan(), ctxPuits = { corde: !!(opts && opts.corde) };
    _enrichirGrapheAvecCroisements(graph, poisPuits, ctxPuits);
    _injecterJonctionsPoi(graph, poisPuits, ctxPuits);

    if (graph.nodes.length === 0) {
      return {
        fullSegments: [], partialSegments: [],
        snapPoint: null, snapDistance: Infinity,
        exceedsBudget: true, reason: "empty-graph",
        totalReachableDistance: 0
      };
    }

    const snap = _insertVirtualNode(graph, startPoint);
    if (!snap) {
      return {
        fullSegments: [], partialSegments: [],
        snapPoint: null, snapDistance: Infinity,
        exceedsBudget: true, reason: "no-snap",
        totalReachableDistance: 0
      };
    }

    // Calage déjà hors budget → aucune route atteignable.
    if (snap.snapDist >= budgetPx) {
      return {
        fullSegments: [], partialSegments: [],
        snapPoint: snap.projection,
        snapDistance: snap.snapDist,
        exceedsBudget: true, reason: "snap-too-far",
        totalReachableDistance: 0
      };
    }

    const remainingBudget = budgetPx - snap.snapDist;

    const distances = _dijkstraReachable(graph, snap.nodeIdx, remainingBudget);

    const fullSegments = [];
    const partialSegments = [];
    let totalDist = 0;

    for (let i = 0; i < graph.segments.length; i++) {
      const seg = graph.segments[i];
      const dA = distances[seg.a];
      const dB = distances[seg.b];

      if (dA === Infinity && dB === Infinity) continue;

      const pA = graph.nodes[seg.a];
      const pB = graph.nodes[seg.b];
      const segLen = Math.hypot(pB.x - pA.x, pB.y - pA.y);
      if (segLen < 0.01) continue;  // segment dégénéré

      const inA = dA <= remainingBudget;
      const inB = dB <= remainingBudget;

      if (inA && inB) {
        fullSegments.push([{ x: pA.x, y: pA.y }, { x: pB.x, y: pB.y }]);
        totalDist += segLen;
      } else if (inA) {
        // A atteint, B hors budget → tronqué de A vers B.
        const rem = remainingBudget - dA;
        const ratio = Math.min(1, rem / segLen);
        if (ratio > 0.001) {
          const cut = {
            x: pA.x + (pB.x - pA.x) * ratio,
            y: pA.y + (pB.y - pA.y) * ratio
          };
          partialSegments.push([{ x: pA.x, y: pA.y }, cut]);
          totalDist += segLen * ratio;
        }
      } else if (inB) {
        // B atteint, A hors budget → tronqué de B vers A.
        const rem = remainingBudget - dB;
        const ratio = Math.min(1, rem / segLen);
        if (ratio > 0.001) {
          const cut = {
            x: pB.x + (pA.x - pB.x) * ratio,
            y: pB.y + (pA.y - pB.y) * ratio
          };
          partialSegments.push([{ x: pB.x, y: pB.y }, cut]);
          totalDist += segLen * ratio;
        }
      }
    }

    return {
      fullSegments:           fullSegments,
      partialSegments:        partialSegments,
      snapPoint:              snap.projection,
      snapDistance:           snap.snapDist,
      exceedsBudget:          false,
      totalReachableDistance: totalDist
    };
  }

  // dist[] par nodeIdx (Infinity si non atteint).
  function _dijkstraReachable(graph, start, budget) {
    const N = graph.nodes.length;
    const dist = new Array(N).fill(Infinity);
    const fait = new Uint8Array(N);
    dist[start] = 0;
    // Même tas (distance, indice) que `_dijkstra` : mêmes distances.
    const tas = [];
    _tasPousser(tas, 0, start);

    while (tas.length) {
      const e = _tasExtraire(tas);
      const u = e[1], minD = e[0];
      if (fait[u] || minD !== dist[u]) continue;   // entrée périmée
      // Extraction croissante : le minimum dépasse le budget → tous les suivants aussi.
      if (minD > budget) break;
      fait[u] = 1;

      const neigh = graph.edges[u];
      for (let i = 0; i < neigh.length; i++) {
        const v = neigh[i].to;
        if (fait[v]) continue;
        const alt = dist[u] + neigh[i].weight;
        // dist[v] gardé même > budget : les segments partiels doivent savoir que B a été « vu ».
        if (alt < dist[v]) {
          dist[v] = alt;
          _tasPousser(tas, alt, v);
        }
      }
    }

    return dist;
  }

  // ── Graphe réseau réutilisable (navigation intelligente) ──────────
  // Même moteur (_buildGraph + enrichissement) pour le map-matching ; cache et invalidation dans
  // js/roadGraph.js. computeRoute / computeReachable gardent leur build par requête.

  // Session + embarquées, comme computeRoute.
  function _collecterToutesLesRoads() {
    const sessionRoads = (typeof window.getRoads === "function" ? window.getRoads() : []) || [];
    let embeddedRoads;
    if (typeof window.getAllEmbeddedRoads === "function") {
      embeddedRoads = window.getAllEmbeddedRoads();
    } else if (typeof window.getEmbeddedRoads === "function") {
      embeddedRoads = window.getEmbeddedRoads();
    } else {
      embeddedRoads = [];
    }
    return sessionRoads.concat(embeddedRoads || []);
  }

  // Graphe complet SANS évitements. Obstacles durs (zones inaccessibles, murs en ligne) exclus par défaut : la
  // nav dit où l'utilisateur EST, un obstacle ne change pas la géométrie (opts.includeZones = true pour les
  // respecter).
  function buildNetworkGraph(opts) {
    return _grapheDeTraces(_collecterToutesLesRoads(), opts);
  }

  // Même graphe sur une liste de tracés fournie : `graph.noeudsTrace[r]` se lit alors par l'indice r de CETTE liste
  // (raccordsTraces.js > detecter : morceaux du réseau).
  function _grapheDeTraces(allRoads, opts) {
    opts = opts || {};
    const allowedTypes = opts.allowedTypes || ["principal", "secondaire", "chemin"];
    if (!allRoads || allRoads.length === 0) return _newGraph();
    const zonesInacc = opts.includeZones ? _collecterObstaclesDurs() : [];
    const graph = _buildGraph(allRoads, allowedTypes, zonesInacc, [], 0);
    const poisPuits = _poisJonctionDuPlan(), ctxPuits = { corde: opts.corde === true };
    _enrichirGrapheAvecCroisements(graph, poisPuits, ctxPuits);
    _injecterJonctionsPoi(graph, poisPuits, ctxPuits);
    return graph;
  }

  // Calage LECTURE SEULE (ne mute pas le graphe, contrairement à _insertVirtualNode).
  // → { segIdx, seg, projection:{x,y}, t, dist } | null.
  function snapPointToGraph(graph, p) {
    if (!graph || !Array.isArray(graph.segments) || graph.segments.length === 0) return null;
    if (!p || typeof p.x !== "number" || typeof p.y !== "number") return null;
    let best = null;
    for (let i = 0; i < graph.segments.length; i++) {
      const seg = graph.segments[i];
      const a = graph.nodes[seg.a];
      const b = graph.nodes[seg.b];
      const proj = _projectOnSegment(p, a, b);
      if (!best || proj.dist < best.dist) {
        best = { segIdx: i, seg: seg, projection: { x: proj.x, y: proj.y }, t: proj.t, dist: proj.dist };
      }
    }
    return best;
  }

  // Le plan a-t-il un tracé exploitable ? Pour AVERTIR au lancement plutôt qu'échouer sur un message
  // technique. L'itinéraire lui-même ne compte pas (c'est un calcul, pas un tracé).
  function aDesTraces() {
    const s = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    const e = (typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || [])
      : (typeof window.getEmbeddedRoads === "function") ? (window.getEmbeddedRoads() || []) : [];
    return s.concat(e).some(function(r) {
      return r && r.type !== "itinerary" && Array.isArray(r.points) && r.points.length >= 2;
    });
  }

  // Alerte « passe par une zone … » d'un résultat, null s'il n'en traverse aucune : la même phrase pour l'itinéraire,
  // la sortie d'urgence, l'inter-plans et le Secours. Libellés de la légende (renommage compris). `echelle` px/m du
  // réseau, défaut : plan ouvert (sans échelle, la longueur est dite en px).
  function texteZonesTraversees(zones, echelle) {
    if (!Array.isArray(zones) || zones.length === 0) return null;
    const types = [];
    let px = 0;
    zones.forEach(function(z) {
      const l = _zoneTypeLabel(z.type);
      if (types.indexOf(l) < 0) types.push(l);
      px += z.longueurPx || 0;
    });
    const ech = window.APP_CONFIG && window.APP_CONFIG.scale > 0 ? window.APP_CONFIG.scale : 0;
    const e = echelle > 0 ? echelle : ech;
    const m = e > 0 ? px / e : 0;
    const d = (e > 0 && typeof window.formatDistance === "function")
      ? window.formatDistance(m, m < 10 ? 1 : 0) : Math.round(px) + " px";
    const p = { types: types.join(" / "), d: d };
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t("iti.zonesCout.traverse", p)
      : "Passe par une zone " + p.types + " sur " + p.d;
  }

  // ── Export ──────────
  window.Pathfinder = {
    aDesTraces:        aDesTraces,
    // Obstacles durs du plan ouvert (zones inaccessibles + murs en ligne) : compte des cases qui les lèvent.
    nbObstaclesDurs:   function() { return _collecterObstaclesDurs().length; },
    TYPES_ZONES_DURS:  TYPES_ZONES_DURS.slice(),
    estZoneDure:       _estZoneDure,
    TYPES_ZONES_COUT:  TYPES_ZONES_COUT.slice(),
    estZoneCout:       _estZoneCout,
    texteZonesTraversees: texteZonesTraversees,
    // Masse au sol : facteur d'un vide (m) — 1, 1,5, 3 ou Infinity (coupé) — et ralentissement cumulé d'un trajet
    // (guidage : temps restant), mêmes règles que le graphe.
    MASSE_VIDE:        Object.assign({}, MASSE_VIDE),
    facteurVide:       _facteurVide,
    surcoutMasseTrajet: surcoutMasseTrajet,
    resumeMasseTrajet: resumeMasseTrajet,
    // « Vérifier le plan » (verifierPlan.js) : les tests du graphe eux-mêmes, jamais une copie, sinon l'outil et
    // l'itinéraire divergent. ⚠️ contrat : obstaclesDuPlan() → la liste que lit _buildGraph (plan ouvert) ;
    // obstaclesDe(zones, structures) → la même, sur des données fournies ;
    // zonesCoutDuPlan() / zonesCoutDe(zones) → les zones à coût que lit le graphe, même forme ;
    // preparer(obstacles) → { polys, grille (murs) } ; zonesQuiBloquent(p1, p2, niveau, polys) et
    // mursQuiCoupent(p1, p2, niveau, grille) → tous les obstacles qui excluent ce segment du graphe.
    controle: {
      PROXIMITY_TOLERANCE: PROXIMITY_TOLERANCE,
      ECHELLE_SANS_CALAGE: ECHELLE_SANS_CALAGE,
      obstaclesDe: function(zones, structures) { return _zonesDuresDe(zones).concat(_mursLigneDe(structures)); },
      obstaclesDuPlan: _collecterObstaclesDurs,
      zonesCoutDe: _zonesCoutDe,
      zonesCoutDuPlan: _collecterZonesCout,
      preparer: _preparerObstacles,
      grilleZones: _grilleZones,
      zonesCandidates: _zonesCandidates,
      zonesQuiBloquent: function(p1, p2, niveau, polys) { return _zonesQuiBloquent(p1, p2, niveau, polys, true); },
      mursQuiCoupent: function(p1, p2, niveau, grille) { return _mursQuiCoupent(p1, p2, niveau, grille, true); },
      longueurDansPolygone: _longueurDansPolygone,
      // Tolérance des zones à coût (TOLERANCE_ZONE_COUT_M) : seuil en px à une échelle, traversées d'un tracé.
      TOLERANCE_ZONE_COUT_M: TOLERANCE_ZONE_COUT_M,
      toleranceZonePx: _toleranceZonePx,
      traverseesTrace: _traverseesTrace,
      projeter: _projectOnSegment
    },
    computeRoute:      computeRoute,
    computeRouteOnRoads: computeRouteOnRoads,   // roads fournies (plan non chargé)
    computeReachable:  computeReachable,
    resolvePointById:  resolvePointById,
    buildNetworkGraph: buildNetworkGraph,
    grapheDeTraces:    _grapheDeTraces,
    collecterTraces:   _collecterToutesLesRoads,
    snapPointToGraph:  snapPointToGraph,
    // Carrefours d'un chemin calculé ailleurs (parcours de balayage) : mêmes règles, même guidage.
    carrefoursSurChemin: function(graph, path, echelle) { return _carrefoursSurChemin(graph, path, echelle); }
  };
})();
