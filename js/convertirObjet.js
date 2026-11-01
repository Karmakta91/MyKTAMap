/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// CONVERTIROBJET.JS — Changer un objet de TYPE, et au besoin de FAMILLE (aussi : supprimer, lot, niveau)
// =====================================================================
// Pourquoi ce n'est pas cosmétique : à l'import SIG, tout part souvent en « front de taille » (la géométrie ne dit
// pas ce que l'objet EST). Or le Pathfinder ne construit son graphe QUE sur les `roads` (getRoads +
// getAllEmbeddedRoads) : un relevé tout en structures n'a AUCUN itinéraire. Reclasser un vecteur le fait exister.
// Règle : fermé = zone ou pilier, ouvert = tracé ou front de taille ; fermé se lit par le TYPE, ou par la GÉOMÉTRIE.
//     OUVERT   ⇄   tracés (galeries)  ⇄  structures polylignes (fronts)
//     FERMÉ    ⇄   zones              ⇄  structures polygones (piliers, murs)
// Ouvert → fermé seulement pour un CONTOUR FERMÉ SEUL (≥ 3 segments, bouts écartés de moins de 1,5 × le plus grand
// côté, forme compacte, aucun bout qui touche une autre ligne : sinon c'est un MORCEAU de pilier). Aucun point
// inventé. Fermé → ouvert : jamais. Lot : RECOLLAGE des lignes qui forment ensemble une boucle (trouverBoucles,
// recollerLot). 🩸 Une galerie en U serrée passe pour fermée : le lot montre le compte avant et s'annule en un ⏪.
// Conservés : `points`, `level`, `description`, `uid` ; seul le type (donc la famille) change.
// Exclus des cibles : `jonction` (fromLevel / toLevel, impossibles à deviner : outil multi-niveau ; ses niveaux se
// changent par changerNiveauxJonction, jamais par Convertir) et `itinerary` (trajet CALCULÉ, pas une donnée du relevé).
// ⚠️ SESSION UNIQUEMENT : un objet de calque est en lecture seule ; « 🔄 Modifier » le copie d'abord (js/calqueSession.js).
// ⚠️ Points (POI) : jamais convertis ; ce module n'atteint pas lui-même leur liste. Le Tableur lui fait appliquer un
// tableau de points par l'accès qu'il fournit (appliquerTableau, `opts.acces`). Garde-fou : check-calque-session.js.

(function () {
  "use strict";

  // Famille de stockage ↔ catégorie de légende : `roads` se dit `traces` côté LegendCustomization ; décalage traversé
  // ici une fois pour toutes.
  const CAT_DE_FAMILLE = { roads: "traces", zones: "zones", structures: "structures" };
  const FAMILLE_DE_CAT = { traces: "roads", zones: "zones", structures: "structures" };

  const CIBLES_INTERDITES = { jonction: true, itinerary: true };

  function _t(cle, params) {
    return (window.I18n && typeof window.I18n.t === "function")
      ? window.I18n.t(cle, params) : cle;
  }

  // OUVERT (polyligne) ou FERMÉ (polygone) ? C'est le TYPE qui tranche, pas la géométrie (les mêmes `points` se
  // peignent en trait ou en surface) ; `isStructurePolylineType` lit la géométrie déclarée, customs compris.
  function _estOuvert(famille, type) {
    if (famille === "roads") return true;
    if (famille === "zones") return false;
    return (typeof window.isStructurePolylineType === "function")
      ? !!window.isStructurePolylineType(type) : false;
  }

  // ── Contour fermé par la géométrie ──────────
  // ⚠️ Deux seuils (décision produit, mesurés sur un relevé SIG réel) :
  //  - écart premier → dernier point < 1,5 × le PLUS GRAND côté existant : un pilier allongé livré sans son grand
  //    côté passe (au côté moyen, ses petits côtés le faisaient refuser) ;
  //  - compacité 4πA/P² ≥ 0,2 du polygone refermé : le contour d'un réseau de galeries ramifié (ou un crochet) se
  //    refermerait aussi, mais converti en pilier il remplirait les galeries. Un pilier jusqu'à ~10:1 passe.
  // Le compte affiché avant le lot et l'annulation unique restent le filet.
  const SEUIL_FERME = 1.5;
  const SEUIL_COMPACITE = 0.2;
  // Écart « quasi nul » (≤ 1 % du côté moyen) : le dernier point répète le premier, il sera retiré à la conversion.
  const SEUIL_DOUBLON = 0.01;

  // → { doublon } si les points forment un contour fermé, sinon null. Après retrait du doublon, ≥ 3 points restent
  // (un polygone de 2 points n'en est pas un).
  function _analyseContour(points) {
    if (!Array.isArray(points) || points.length < 3) return null;
    let somme = 0, grand = 0, aire2 = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      if (i > 0) {
        const c = Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
        somme += c;
        if (c > grand) grand = c;
      }
      const q = points[(i + 1) % points.length];   // le dernier se raccorde au premier : aire du polygone refermé
      aire2 += p.x * q.y - q.x * p.y;
    }
    const moyen = somme / (points.length - 1);
    if (!(moyen > 0)) return null;
    const a = points[0], b = points[points.length - 1];
    const ecart = Math.hypot(b.x - a.x, b.y - a.y);
    const doublon = ecart <= moyen * SEUIL_DOUBLON;
    if (doublon && points.length - 1 < 3) return null;
    if (!(ecart < grand * SEUIL_FERME)) return null;
    const perimetre = somme + ecart;
    const compacite = 4 * Math.PI * (Math.abs(aire2) / 2) / (perimetre * perimetre);
    return (compacite >= SEUIL_COMPACITE) ? { doublon: doublon } : null;
  }

  // Objet OUVERT par son type (tracé, front), jamais une jonction ni un itinéraire, dont la géométrie se referme.
  // 🩸 Au moins 3 SEGMENTS (4 points), sauf si le dernier point répète le premier (3 côtés après son retrait) : une
  // ligne de 2 segments (un V, un L) passe les deux seuils et deviendrait un triangle ; sur le terrain, c'est un
  // morceau de pilier. Géométrie seule : le voisinage (morceau) se juge par _contourSeul.
  function estContourFerme(famille, obj) {
    if (!obj || CIBLES_INTERDITES[obj.type] || !_estOuvert(famille, obj.type)) return false;
    const a = _analyseContour(obj.points);
    return !!a && (a.doublon || obj.points.length >= 4);
  }

  // Conversion permise pour CET objet ? Même forme : oui ; ouvert → fermé : seulement un contour fermé ; fermé →
  // ouvert : jamais. Défense en profondeur : la modale ne propose que ça, le lot et l'appel direct le revérifient.
  // `grille` (facultatif) : index des bouts (_indexBouts), construit une fois par lot.
  function _compatible(famille, obj, familleCible, typeCible, grille) {
    const src = _estOuvert(famille, obj.type), dst = _estOuvert(familleCible, typeCible);
    if (src === dst) return true;
    return src && !dst && _contourSeul(famille, obj, grille);
  }
  function _ferme(famille, obj, familleCible, typeCible) {
    return _estOuvert(famille, obj.type) && !_estOuvert(familleCible, typeCible);
  }

  // ── Recoller des lignes qui forment ensemble une boucle ──────────
  // À l'import SIG, un pilier arrive souvent en 2 à 4 LIGNES dont les bouts se touchent presque (jamais exactement) :
  // aucune n'est un contour fermé seule. Graphe : les bouts d'un même niveau à ≤ TOLERANCE_RECOLLAGE se regroupent en
  // nœuds, chaque ligne est une arête entre ses deux nœuds-bouts. Une composante d'au moins 2 arêtes dont TOUS les
  // nœuds sont de degré 2 (nœuds = arêtes) est une boucle simple ; elle est retenue si le polygone obtenu est compact
  // (même seuil qu'estContourFerme). Une branche, un T : jamais recollés. Une ligne n'entre que dans une boucle.
  // ⚠️ MORCEAU : une ligne dont un bout touche (≤ TOLERANCE_RECOLLAGE, même niveau) le bout d'une AUTRE ligne ouverte
  // de la session n'est jamais convertie seule, même si elle se referme (un « C » dont l'autre moitié est une ligne
  // voisine) : elle ne part que par le recollage, sinon elle reste et le message la compte. La session entière fait
  // foi, pas la sélection : sinon sélectionner une moitié de pilier la refermerait.
  // ⚠️ Tolérance FIXE en px de l'image du plan (décision produit, mesurée sur un relevé SIG réel : 5 px trouve la
  // quasi-totalité des boucles, 10 px n'en ajoute presque plus). Pas de réglage dans l'interface.
  const TOLERANCE_RECOLLAGE = 5;
  const PREFIXE_UID = { roads: "rd", zones: "zn", structures: "st" };

  function _niveauDe(o) { return Number.isInteger(o.level) ? o.level : 0; }

  // Identité d'une ligne dans l'index : uid (une référence périmée et sa copie de session sont la même ligne).
  function _cleLigne(o) { return (typeof o.uid === "string" && o.uid) ? "u:" + o.uid : o; }

  // Bouts de toutes les lignes ouvertes de la session (tracés, fronts ; ni jonction, ni itinéraire, ni aperçu), plus
  // celles de `items` absentes de la session. Grille de pas TOLERANCE par niveau : une recherche = 9 cases. Une
  // passe sur les deux familles, construite une fois par fenêtre ou par lot.
  function _indexBouts(items) {
    const T = TOLERANCE_RECOLLAGE, grille = new Map(), vus = new Set();
    const ajouter = function (famille, o) {
      if (!o || o._preview || !_candidateRecollage({ famille: famille, obj: o })) return;
      const cle = _cleLigne(o);
      if (vus.has(cle)) return;
      vus.add(cle);
      const niv = _niveauDe(o);
      [o.points[0], o.points[o.points.length - 1]].forEach(function (p) {
        const c = niv + ":" + Math.floor(p.x / T) + ":" + Math.floor(p.y / T);
        if (!grille.has(c)) grille.set(c, []);
        grille.get(c).push({ cle: cle, p: p });
      });
    };
    ["roads", "structures"].forEach(function (f) { _lire(f).forEach(function (o) { ajouter(f, o); }); });
    (items || []).forEach(function (it) { if (it) ajouter(it.famille, it.obj); });
    return grille;
  }

  // Un bout de `obj` touche-t-il le bout d'une AUTRE ligne ? (ses deux bouts proches l'un de l'autre : pas un morceau)
  function _estMorceau(obj, grille) {
    const p = obj && obj.points;
    if (!Array.isArray(p) || p.length < 2) return false;
    const T = TOLERANCE_RECOLLAGE, cle = _cleLigne(obj), niv = _niveauDe(obj);
    return [p[0], p[p.length - 1]].some(function (b) {
      if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return false;
      const cx = Math.floor(b.x / T), cy = Math.floor(b.y / T);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const proches = grille.get(niv + ":" + (cx + dx) + ":" + (cy + dy)) || [];
          if (proches.some(function (e) { return e.cle !== cle && Math.hypot(e.p.x - b.x, e.p.y - b.y) <= T; })) {
            return true;
          }
        }
      }
      return false;
    });
  }

  // Contour fermé convertible SEUL : fermé par sa géométrie et pas un morceau.
  function _contourSeul(famille, obj, grille) {
    if (!estContourFerme(famille, obj)) return false;
    return !_estMorceau(obj, grille || _indexBouts([{ famille: famille, obj: obj }]));
  }

  // Ligne candidate : ouverte par son type, ni jonction ni itinéraire, ≥ 2 points finis.
  function _candidateRecollage(it) {
    if (!it || !it.obj || CIBLES_INTERDITES[it.obj.type] || !_estOuvert(it.famille, it.obj.type)) return false;
    const p = it.obj.points;
    return Array.isArray(p) && p.length >= 2 &&
      p.every(function (q) { return q && Number.isFinite(q.x) && Number.isFinite(q.y); });
  }

  // Points d'une boucle simple dans l'ordre de parcours. Départ : première ligne de la composante, dans son sens ;
  // chaque suivante est inversée au besoin. 🩸 À chaque jonction les deux bouts presque confondus deviennent UN point,
  // celui de la ligne déjà parcourue ; la jonction de fermeture garde le premier point de la première ligne.
  function _parcourirBoucle(aretes, idxs, incidentes) {
    const out = [];
    let courante = idxs[0], sens = true;
    for (let k = 0; k < idxs.length; k++) {
      const ar = aretes[courante];
      const pts = sens ? ar.pts : ar.pts.slice().reverse();
      for (let i = (k === 0 ? 0 : 1); i < pts.length; i++) out.push({ x: pts[i].x, y: pts[i].y });
      if (k === idxs.length - 1) break;
      const noeud = sens ? ar.b : ar.a;
      const precedente = courante;
      courante = incidentes[noeud].find(function (j) { return j !== precedente; });
      sens = aretes[courante].a === noeud;
    }
    out.pop();   // dernier point = jonction de fermeture, fusionné avec le premier
    return out;
  }

  // `items` = [{ famille, obj }]. → { boucles: [{ items, points, level }], lignes, ignorees, contours, morceaux } :
  // `lignes` = lignes recollées ; `contours` = contours fermés seuls (_contourSeul, convertis seuls) ; `morceaux` =
  // lignes qui se referment mais touchent une autre ligne, hors boucle (restent) ; `ignorees` = autres lignes de la
  // sélection qui en touchent une autre sans former de boucle simple et compacte. `index` : _indexBouts. Lecture seule.
  function trouverBoucles(items, index) {
    const aretes = [];
    (items || []).forEach(function (it) {
      if (_candidateRecollage(it)) aretes.push({ it: it, pts: it.obj.points, niv: _niveauDe(it.obj), a: -1, b: -1 });
    });
    // Bouts regroupés en nœuds : union-find sur une grille de pas T (un bout ne compare que les 9 cases voisines).
    const T = TOLERANCE_RECOLLAGE;
    const bouts = [];
    aretes.forEach(function (ar) {
      bouts.push({ p: ar.pts[0], niv: ar.niv });
      bouts.push({ p: ar.pts[ar.pts.length - 1], niv: ar.niv });
    });
    const parent = bouts.map(function (_, i) { return i; });
    const racine = function (i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const grille = new Map();
    bouts.forEach(function (bt, i) {
      const cx = Math.floor(bt.p.x / T), cy = Math.floor(bt.p.y / T);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          (grille.get(bt.niv + ":" + (cx + dx) + ":" + (cy + dy)) || []).forEach(function (j) {
            const o = bouts[j].p;
            if (Math.hypot(o.x - bt.p.x, o.y - bt.p.y) <= T) parent[racine(i)] = racine(j);
          });
        }
      }
      const k = bt.niv + ":" + cx + ":" + cy;
      if (!grille.has(k)) grille.set(k, []);
      grille.get(k).push(i);
    });
    const numero = new Map();
    bouts.forEach(function (_, i) { const r = racine(i); if (!numero.has(r)) numero.set(r, numero.size); });
    const incidentes = [];
    for (let n = 0; n < numero.size; n++) incidentes.push([]);
    aretes.forEach(function (ar, i) {
      ar.a = numero.get(racine(2 * i));
      ar.b = numero.get(racine(2 * i + 1));
      incidentes[ar.a].push(i);
      incidentes[ar.b].push(i);   // ligne refermée sur un seul nœud : il la compte deux fois (degré 2)
    });
    // Composantes connexes, en passant par les nœuds.
    const vue = new Array(aretes.length).fill(false);
    const res = { boucles: [], lignes: 0, ignorees: 0 };
    aretes.forEach(function (_, depart) {
      if (vue[depart]) return;
      const idxs = [], noeuds = new Set(), pile = [depart];
      vue[depart] = true;
      while (pile.length) {
        const i = pile.pop();
        idxs.push(i);
        [aretes[i].a, aretes[i].b].forEach(function (n) {
          noeuds.add(n);
          incidentes[n].forEach(function (j) { if (!vue[j]) { vue[j] = true; pile.push(j); } });
        });
      }
      if (idxs.length < 2) return;   // ligne seule : rien à recoller
      idxs.sort(function (x, y) { return x - y; });   // ordre de la sélection : sa première ligne donne le départ
      const simple = noeuds.size === idxs.length &&
        Array.from(noeuds).every(function (n) { return incidentes[n].length === 2; });
      const points = simple ? _parcourirBoucle(aretes, idxs, incidentes) : null;
      if (!points || points.length < 3 || _analyseContour(points) === null) {
        // Les morceaux (lignes qui se referment) sont comptés à part, ci-dessous.
        res.ignorees += idxs.filter(function (i) { return !estContourFerme(aretes[i].it.famille, aretes[i].it.obj); }).length;
        return;
      }
      res.boucles.push({ items: idxs.map(function (i) { return aretes[i].it; }), points: points,
                         level: aretes[idxs[0]].niv });
      res.lignes += idxs.length;
    });
    const dansBoucle = new Set();
    res.boucles.forEach(function (bc) { bc.items.forEach(function (it) { dansBoucle.add(it); }); });
    const g = index || _indexBouts(items);
    res.contours = [];
    res.morceaux = 0;
    (items || []).forEach(function (it) {
      if (!it || !it.obj || dansBoucle.has(it) || !estContourFerme(it.famille, it.obj)) return;
      if (_estMorceau(it.obj, g)) res.morceaux++;
      else res.contours.push(it);
    });
    return res;
  }

  // L'objet recollé : champs de la PREMIÈRE ligne, type cible, points de la boucle, notes distinctes non vides
  // concaténées, uid NEUF. Les lignes d'origine sont supprimées : HistoryManager.record pose leurs traces de
  // suppression, comme pour toute suppression.
  // ⚠️ Marque de calque (`_srcCalque` et ses compagnes) : gardée seulement si TOUTES les lignes viennent du même
  // calque (la restitution retire alors l'objet recollé et rend les lignes du calque). Provenances mêlées : l'objet
  // recollé est un objet ordinaire de la session, une restitution ne le retire pas.
  function _recolle(boucle, familleCible, typeCible) {
    const objs = boucle.items.map(function (it) { return it.obj; });
    const neuf = Object.assign({}, objs[0], { type: typeCible, level: boucle.level, points: boucle.points });
    delete neuf.fromLevel;
    delete neuf.toLevel;
    delete neuf.uid;
    const notes = [];
    objs.forEach(function (o) {
      const d = (typeof o.description === "string") ? o.description.trim() : "";
      if (d && notes.indexOf(d) < 0) notes.push(d);
    });
    if (notes.length) neuf.description = notes.join("\n");
    else delete neuf.description;
    if (!objs.every(function (o) { return o._srcCalque === objs[0]._srcCalque; })) {
      delete neuf._srcCalque;
      delete neuf._srcCalqueDepuis;
      delete neuf._srcCalqueAjout;
    } else if (!objs.every(function (o) { return o._srcCalqueAjout === objs[0]._srcCalqueAjout; })) {
      delete neuf._srcCalqueAjout;   // copies et ajouts mêlés : traité en copie
    }
    if (window.KtaUid) {
      neuf.uid = window.KtaUid.genUid(PREFIXE_UID[familleCible]);
      window.KtaUid.touch(neuf);
    }
    return neuf;
  }

  function _libelle(cat, cle) {
    try {
      const LC = window.LegendCustomization;
      if (LC && typeof LC.getLabel === "function") {
        const l = LC.getLabel(cat, cle);
        if (l) return l;
      }
    } catch (e) {}
    return cle;
  }

  function _pastille(cat, cle) {
    try {
      if (typeof window.ktaTypeSwatchHtml === "function") {
        return window.ktaTypeSwatchHtml(cat, cle) || "";
      }
    } catch (e) {}
    return "";
  }

  // Cibles compatibles avec l'objet source, intégrées ET custom : [{ cat, famille, type, label, swatch }],
  // source exclue. `obj` (facultatif) : un contour fermé (estContourFerme) reçoit AUSSI les cibles fermées.
  function listerCibles(famille, type, obj, index) {
    const ouvert = _estOuvert(famille, type);
    const out = ouvert ? _cibles(famille, type, true) : [];
    const ferme = !ouvert || (!!obj && obj.type === type && _contourSeul(famille, obj, index));
    return ferme ? out.concat(_cibles(famille, type, false)) : out;
  }

  function _cibles(famille, type, ouvert) {
    const out = [];
    const cats = ouvert ? ["traces", "structures"] : ["zones", "structures"];

    cats.forEach(function (cat) {
      const famCible = FAMILLE_DE_CAT[cat];
      const builtins = (typeof window.ktaStyleBuiltins === "function")
        ? (window.ktaStyleBuiltins(cat) || []) : [];
      builtins.forEach(function (cle) {
        if (cat === "traces" && CIBLES_INTERDITES[cle]) return;
        // En « structures », seuls les types de la BONNE géométrie.
        if (cat === "structures" && _estOuvert("structures", cle) !== ouvert) return;
        if (famCible === famille && cle === type) return;   // c'est la source
        out.push({ cat: cat, famille: famCible, type: cle,
                   label: _libelle(cat, cle), swatch: _pastille(cat, cle) });
      });
      // Customs, mêmes règles : sans eux, un plan importé (types tous personnalisés) n'aurait presque aucune cible.
      let customs = [];
      try {
        const LC = window.LegendCustomization;
        if (LC && typeof LC.listCustomEntries === "function") {
          customs = LC.listCustomEntries(cat) || [];
        }
      } catch (e) {}
      customs.forEach(function (e) {
        if (!e || !e.id) return;
        if (cat === "structures" && _estOuvert("structures", e.id) !== ouvert) return;
        if (famCible === famille && e.id === type) return;
        out.push({ cat: cat, famille: famCible, type: e.id,
                   label: e.label || e.id, swatch: _pastille(cat, e.id) });
      });
    });
    return out;
  }

  // ── L'opération ──────────
  // 🩸 Les trois listes sont lues d'un bloc AVANT toute écriture : sinon une conversion dans la même famille (front →
  // pilier) retirerait l'objet, réécrirait la liste, la relirait et perdrait l'ajout. On n'écrit QUE les familles
  // touchées (`setStructures` relance un rendu complet, cher à 20 000 objets).
  // Accesseurs partagés par convertir, supprimer et le lot (pas de copie de la table), lus à chaque appel :
  // `window.setRoads` peut ne pas exister au chargement du module.
  function _lire(famille) {
    const g = { roads: "getRoads", zones: "getZones", structures: "getStructures" }[famille];
    return (g && typeof window[g] === "function") ? (window[g]() || []) : [];
  }
  function _ecrivain(famille) {
    const s = { roads: "setRoads", zones: "setZones", structures: "setStructures" }[famille];
    return (s && typeof window[s] === "function") ? window[s] : null;
  }

  // Position de l'objet dans sa liste : par RÉFÉRENCE d'abord (deux tracés sans uid peuvent être identiques), puis
  // par uid. 🩸 Une réception de synchro (ou une restauration) remplace l'objet par une COPIE de même uid : la
  // référence tenue par une fiche ou la fenêtre Convertir n'est plus dans la liste, l'uid si. → index, ou -1.
  function _indexDe(liste, obj) {
    const i = liste.indexOf(obj);
    if (i >= 0 || !obj || typeof obj.uid !== "string" || !obj.uid) return i;
    return liste.findIndex(function (o) { return o && o.uid === obj.uid; });
  }
  // Objet absent même par uid (supprimé ailleurs entre-temps) : dit, jamais un échec silencieux.
  function _introuvable(famille) {
    console.warn("[Convertir] objet introuvable dans", famille);
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(_t("convert.introuvable"), "warn");
    }
    return false;
  }

  // Même objet, autre type : une seule règle pour la fiche, le lot et le Tableur. On repart de l'objet d'origine
  // (rien n'est perdu, champs futurs compris) ; fromLevel / toLevel d'une jonction n'ont plus de sens ailleurs.
  // L'uid suit (Object.assign le recopie), la conversion est une modification (ETUDE_UID décision 10).
  // `fermer` (ouvert → fermé) : un dernier point qui répète le premier est retiré, rien d'autre (le polygone se
  // referme seul au rendu) ; nouveau tableau, l'objet d'origine reste intact pour l'historique.
  function _versType(obj, typeCible, fermer) {
    const neuf = Object.assign({}, obj, { type: typeCible });
    delete neuf.fromLevel;
    delete neuf.toLevel;
    if (fermer) {
      const a = _analyseContour(obj.points);
      if (a && a.doublon) neuf.points = obj.points.slice(0, -1);
    }
    if (window.KtaUid) window.KtaUid.touch(neuf);
    return neuf;
  }

  // Niveau posé EN PLACE (même objet, même uid) : une seule règle pour la fiche et le Tableur.
  function _poserNiveau(obj, niveau) {
    obj.level = niveau;
    if (window.KtaUid) window.KtaUid.touch(obj);
  }

  function convertir(famille, obj, familleCible, typeCible) {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return false;   // 🔒 lecture seule
    if (!obj || !famille || !familleCible || !typeCible) return false;
    const lire = {
      roads:      function () { return _lire("roads"); },
      zones:      function () { return _lire("zones"); },
      structures: function () { return _lire("structures"); }
    };
    const ecrire = {
      roads:      _ecrivain("roads"),
      zones:      _ecrivain("zones"),
      structures: _ecrivain("structures")
    };
    if (typeof ecrire[famille] !== "function" || typeof ecrire[familleCible] !== "function") {
      console.warn("[Convertir] setteur manquant :", famille, "→", familleCible);
      return false;
    }

    const avant = (window.HistoryManager && window.HistoryManager.captureState)
      ? window.HistoryManager.captureState() : null;

    const listes = {
      roads:      lire.roads().slice(),
      zones:      lire.zones().slice(),
      structures: lire.structures().slice()
    };
    const idx = _indexDe(listes[famille], obj);
    if (idx < 0) return _introuvable(famille);
    // L'objet de la liste fait foi (version courante, la référence reçue peut être périmée).
    const actuel = listes[famille][idx];
    if (!_compatible(famille, actuel, familleCible, typeCible)) {
      console.warn("[Convertir] forme incompatible :", actuel.type, "→", typeCible);
      return false;
    }
    listes[famille].splice(idx, 1);

    listes[familleCible].push(_versType(actuel, typeCible, _ferme(famille, actuel, familleCible, typeCible)));

    const touchees = (famille === familleCible) ? [famille] : [famille, familleCible];
    touchees.forEach(function (f) { ecrire[f](listes[f]); });

    if (window.HistoryManager && avant && window.HistoryManager.record) {
      window.HistoryManager.record(_t("convert.history"), avant);
    }
    if (window.SessionPersist && window.SessionPersist.save) window.SessionPersist.save();
    return true;
  }

  // ── Supprimer l'objet (même popup, référence directe sur l'objet) ──────────
  // 🩸 IDENTITÉ PAR RÉFÉRENCE puis par uid, jamais par contenu : deux tracés peuvent être identiques ; la popup porte
  // l'objet lui-même, que la synchro a pu remplacer par une copie de même uid (_indexDe).
  // 🩸 PAS DE CONFIRMATION, comme la suppression d'un POINT (`supprimerPointEditor`) : le filet est l'instantané
  // d'historique (Ctrl+Z / ⏪), sans lui l'objet serait perdu pour de bon.
  function supprimer(famille, obj) {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return false;   // 🔒 lecture seule
    if (!obj || !famille) return false;
    const ecrire = _ecrivain(famille);
    if (typeof ecrire !== "function") {
      console.warn("[Convertir] setteur manquant pour la suppression :", famille);
      return false;
    }
    const liste = _lire(famille).slice();
    const idx = _indexDe(liste, obj);
    if (idx < 0) return _introuvable(famille);
    const avant = (window.HistoryManager && window.HistoryManager.captureState)
      ? window.HistoryManager.captureState() : null;
    liste.splice(idx, 1);
    ecrire(liste);
    if (window.HistoryManager && avant && window.HistoryManager.record) {
      window.HistoryManager.record(_t("convert.histoireSuppr"), avant);
    }
    if (window.SessionPersist && window.SessionPersist.save) window.SessionPersist.save();
    return true;
  }

  // ── Changer le niveau (liste « Niveau » de la même popup) ──────────
  // Mutation EN PLACE (même objet, même uid) puis réécriture de la famille par son setteur (re-rendu filtré).
  // ⚠️ La valeur choisie est écrite telle quelle : le « niveau − 1 » de pilier-2 / front-2 (structures.js) n'est
  // qu'un défaut de création, jamais réappliqué ici.
  // Jonction (fromLevel / toLevel) et itinéraire : refusés, ils n'ont pas de `level`.
  // 🩸 Le graphe de navigation (roadGraph.js) est invalidé : un changement de niveau ne change ni le nombre de
  // tracés ni celui des sommets.
  function changerNiveau(famille, obj, niveau) {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return false;   // 🔒 lecture seule
    if (!obj || !famille || !Number.isInteger(niveau)) return false;
    if (CIBLES_INTERDITES[obj.type]) return false;
    const ecrire = _ecrivain(famille);
    if (typeof ecrire !== "function") {
      console.warn("[Convertir] setteur manquant pour le niveau :", famille);
      return false;
    }
    const liste = _lire(famille).slice();
    const idx = _indexDe(liste, obj);
    if (idx < 0) return _introuvable(famille);
    const cible = liste[idx];   // version courante (la référence reçue peut être une ancienne copie)
    if ((Number.isInteger(cible.level) ? cible.level : 0) === niveau) return false;   // rien à annuler
    const avant = (window.HistoryManager && window.HistoryManager.captureState)
      ? window.HistoryManager.captureState(famille) : null;
    _poserNiveau(cible, niveau);
    ecrire(liste);
    if (window.RoadGraph && typeof window.RoadGraph.invalidate === "function") window.RoadGraph.invalidate();
    if (window.HistoryManager && avant && window.HistoryManager.record) {
      window.HistoryManager.record(_t("niveauObjet.histoire", { n: niveau > 0 ? "+" + niveau : niveau }), avant, famille);
    }
    if (window.SessionPersist && window.SessionPersist.save) window.SessionPersist.save();
    return true;
  }

  // ── Changer les niveaux reliés par une jonction (fiche de la jonction) ──────────
  // `de` = niveau du PREMIER point, `vers` = celui du DERNIER : le Pathfinder accroche le premier nœud à fromLevel et
  // le dernier à toLevel (pathfinder.js > buildNetworkGraph), l'ordre n'est donc pas interchangeable.
  // ⚠️ Deux niveaux DIFFÉRENTS obligatoires : une jonction sur un seul niveau ne relierait rien et passerait les
  // filtres de niveau comme un pont. Les deux bouts changent en UN geste : un instantané, une entrée ⏪.
  // 🩸 Même objet muté en place (uid gardé, touch pour la synchro) puis graphe invalidé, comme changerNiveau.
  function changerNiveauxJonction(obj, de, vers) {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return false;   // 🔒 lecture seule
    if (!obj || obj.type !== "jonction" || !Number.isInteger(de) || !Number.isInteger(vers) || de === vers) return false;
    const ecrire = _ecrivain("roads");
    if (typeof ecrire !== "function") {
      console.warn("[Convertir] setteur manquant pour les niveaux d'une jonction");
      return false;
    }
    const liste = _lire("roads").slice();
    const idx = _indexDe(liste, obj);
    if (idx < 0) return _introuvable("roads");
    const cible = liste[idx];
    if (cible.type !== "jonction") return false;
    const niv = function (n) { return Number.isInteger(n) ? n : 0; };
    if (niv(cible.fromLevel) === de && niv(cible.toLevel) === vers) return false;   // rien à annuler
    const avant = (window.HistoryManager && window.HistoryManager.captureState)
      ? window.HistoryManager.captureState("roads") : null;
    cible.fromLevel = de;
    cible.toLevel = vers;
    if (window.KtaUid) window.KtaUid.touch(cible);
    ecrire(liste);
    if (window.RoadGraph && typeof window.RoadGraph.invalidate === "function") window.RoadGraph.invalidate();
    if (window.HistoryManager && avant && window.HistoryManager.record) {
      const f = function (n) { return n > 0 ? "+" + n : String(n); };
      window.HistoryManager.record(_t("jonctionFiche.histoire", { de: f(de), vers: f(vers) }), avant, "roads");
    }
    if (window.SessionPersist && window.SessionPersist.save) window.SessionPersist.save();
    return true;
  }

  // ── Conversion d'un lot ──────────
  // `items` = [{ famille, obj }].
  // 🩸 UN SEUL INSTANTANÉ, UNE ÉCRITURE PAR FAMILLE, UN SEUL RENDU : N appels à `convertir()` donneraient N re-rendus
  // complets et N entrées d'historique (N Ctrl+Z). Le lot est UN geste, il s'annule en UN geste.
  // 🩸 Une cible déjà atteinte n'est pas une erreur : sur une sélection mixte (40 fronts + 5 chemins → galerie), les
  // objets déjà du bon type sont SAUTÉS et comptés à part (masquer la cible rendrait la liste incompréhensible).
  // 🩸 Une source interdite (jonction, itinéraire) est sautée aussi : la fiche ne propose pas Convertir pour elle, le
  // lot ne doit pas la convertir par la bande (une jonction devenue tracé perd ses niveaux et ne relie plus rien).
  // Forme incompatible (ligne non fermée vers une surface, surface vers une ligne) : comptée en échec, jamais forcée.
  function convertirLot(items, familleCible, typeCible) {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return _lot(items, null, null, null);   // 🔒 lecture seule
    return _lot(items, familleCible, typeCible, null);
  }

  // Lot « recoller » : les contours fermés seuls sont convertis comme dans convertirLot, les lignes qui forment
  // ensemble une boucle (trouverBoucles) deviennent UN objet de la cible chacune ; le reste de la sélection n'est
  // pas touché. Même geste : un instantané, une entrée ⏪. Cible ouverte : rien n'est recollé (compté en échec).
  // → bilan de convertirLot + { recolles (objets créés), lignes (lignes consommées), ignorees }.
  function recollerLot(items, familleCible, typeCible) {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return _lot(items, null, null, null);   // 🔒 lecture seule
    const rec = trouverBoucles(items);
    const bilan = _lot(rec.contours, familleCible, typeCible, rec.boucles);
    bilan.ignorees = rec.ignorees;
    bilan.morceaux = rec.morceaux;
    return bilan;
  }

  function _lot(items, familleCible, typeCible, boucles) {
    const nBoucles = (boucles || []).length;
    const refus = { convertis: 0, sautes: 0, echecs: (items || []).length + nBoucles, recolles: 0, lignes: 0 };
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return refus;   // 🔒 lecture seule
    const bilan = { convertis: 0, sautes: 0, echecs: 0, recolles: 0, lignes: 0 };
    if (!Array.isArray(items) || (!items.length && !nBoucles) || !familleCible || !typeCible) return bilan;
    if (typeof _ecrivain(familleCible) !== "function") {
      console.warn("[Convertir] setteur manquant :", familleCible);
      bilan.echecs = items.length;
      return bilan;
    }

    const avant = (window.HistoryManager && window.HistoryManager.captureState)
      ? window.HistoryManager.captureState() : null;

    // Listes lues d'un bloc AVANT toute écriture (même raison que `convertir`).
    const listes = {
      roads:      _lire("roads").slice(),
      zones:      _lire("zones").slice(),
      structures: _lire("structures").slice()
    };
    const touchees = {};
    // Index des bouts lu AVANT toute écriture, une fois : seulement si la cible est fermée (règle du morceau).
    const index = _estOuvert(familleCible, typeCible) ? null : _indexBouts(items);

    items.forEach(function (it) {
      if (!it || !it.obj || !listes[it.famille]) { bilan.echecs++; return; }
      if (CIBLES_INTERDITES[it.obj.type]) { bilan.sautes++; return; }
      if (it.famille === familleCible && it.obj.type === typeCible) { bilan.sautes++; return; }
      const idx = _indexDe(listes[it.famille], it.obj);
      if (idx < 0) { bilan.echecs++; return; }
      const actuel = listes[it.famille][idx];
      if (!_compatible(it.famille, actuel, familleCible, typeCible, index)) { bilan.echecs++; return; }
      listes[it.famille].splice(idx, 1);
      listes[familleCible].push(_versType(actuel, typeCible, _ferme(it.famille, actuel, familleCible, typeCible)));
      touchees[it.famille] = true;
      touchees[familleCible] = true;
      bilan.convertis++;
    });

    // Boucles : toutes leurs lignes doivent être encore là (version courante), sinon la boucle entière est refusée.
    const fermeCible = !_estOuvert(familleCible, typeCible);
    (boucles || []).forEach(function (bc) {
      if (!fermeCible) { bilan.echecs++; return; }
      const pos = bc.items.map(function (it) {
        const liste = listes[it.famille];
        return liste ? { famille: it.famille, obj: liste[_indexDe(liste, it.obj)] } : { obj: undefined };
      });
      if (pos.some(function (p) { return !p.obj; })) { bilan.echecs++; return; }
      const neuf = _recolle({ items: pos, points: bc.points, level: bc.level }, familleCible, typeCible);
      pos.forEach(function (p) {
        // p.obj est l'élément même de la liste (trouvé par _indexDe) : la référence suffit, les index ont bougé.
        listes[p.famille].splice(listes[p.famille].indexOf(p.obj), 1);
        touchees[p.famille] = true;
      });
      listes[familleCible].push(neuf);
      touchees[familleCible] = true;
      bilan.recolles++;
      bilan.lignes += pos.length;
    });

    if (bilan.convertis === 0 && bilan.recolles === 0) return bilan;   // rien écrit, donc rien à annuler
    Object.keys(touchees).forEach(function (f) { _ecrivain(f)(listes[f]); });
    if (touchees.roads && window.RoadGraph && typeof window.RoadGraph.invalidate === "function") {
      window.RoadGraph.invalidate();
    }
    if (window.HistoryManager && avant && window.HistoryManager.record) {
      window.HistoryManager.record(bilan.recolles
        ? _t("convert.histoireRecoller", { n: bilan.recolles + bilan.convertis })
        : _t("convert.histoireLot", { n: bilan.convertis }), avant);
    }
    if (window.SessionPersist && window.SessionPersist.save) window.SessionPersist.save();
    return bilan;
  }

  // ── Appliquer un tableau (Tableur) à une famille de la session ──────────
  // `lignes` : lignes du Tableur, uid posés. Le tableau DEVIENT la famille, par uid :
  //   - uid connu : seules les cellules MODIFIÉES s'appliquent (`opts.origine(ligne)` = la ligne telle que chargée ;
  //     sans origine, toute colonne différente de la session) — type par _versType (cibles de listerCibles, même
  //     famille), niveau par _poserNiveau, autres colonnes en place + touch. 🩸 Sans cette comparaison, un fichier plus
  //     ancien que la session y remettrait ses vieilles valeurs sur chaque ligne non touchée. Géométrie (`points`) :
  //     toujours celle de la session (le Tableur ne l'édite pas). Objet sans changement : intact (pas de touch).
  //   - uid inconnu ou en double : ajout ; objet de la session absent du tableau : suppression (la trace de
  //     suppression est posée par HistoryManager.record, comme pour toute suppression).
  //   - 🩸 uid inconnu MAIS tracé comme supprimé (KtaUid.getTombstones) : un réimport ne ressuscite rien. Ligne non
  //     touchée → ignorée (comptée dans `ignores`) ; ligne modifiée → réajoutée (geste explicite), sa trace retirée par
  //     HistoryManager.record comme pour toute réapparition.
  //   - itinéraire calculé et aperçus (`_preview`) : jamais pris au tableau, toujours gardés.
  // Toutes les lignes sont validées AVANT toute écriture : la première fautive arrête tout →
  // { erreur: { ligne (1 = première), code, type } }, code ∈ typeInconnu | typeIncompatible | typeInterdit | niveau.
  // `opts.simuler` : rien n'est écrit (compte des suppressions avant la confirmation d'un plan partagé).
  // `opts.acces` = { lire, ecrire, categorie } : liste hors vecteurs (les POI du Tableur) — mêmes règles par uid,
  // sans validation de type (un point n'en a pas), `categorie` = celle de l'historique. ⚠️ L'appelant fournit la liste,
  // le module ne va jamais la chercher ; le point est muté en place (`_srcCalque` d'un calque rapatrié survit).
  // UN instantané, UNE écriture, UNE entrée d'historique (comme le lot). → { modifies, ajoutes, supprimes, ignores } ou null.
  function _typesConnus(cat) {
    const out = (typeof window.ktaStyleBuiltins === "function") ? (window.ktaStyleBuiltins(cat) || []).slice() : [];
    try {
      const LC = window.LegendCustomization;
      if (LC && typeof LC.listCustomEntries === "function") {
        (LC.listCustomEntries(cat) || []).forEach(function (e) { if (e && e.id) out.push(e.id); });
      }
    } catch (e) {}
    return out;
  }

  // `niveaux` d'un passage entre niveaux (poiJonction.js) : absent, ou liste d'entiers.
  function _niveauxLisibles(v) {
    return v == null || (Array.isArray(v) && v.every(Number.isInteger));
  }

  function appliquerTableau(famille, lignes, opts) {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return null;   // 🔒 lecture seule
    opts = opts || {};
    const acces = (opts.acces && typeof opts.acces.lire === "function") ? opts.acces : null;
    const vecteur = !acces;
    const ecrire = acces ? acces.ecrire : _ecrivain(famille);
    if ((vecteur && !CAT_DE_FAMILLE[famille]) || typeof ecrire !== "function" || !Array.isArray(lignes)) return null;
    const categorie = acces ? acces.categorie : famille;
    const connus = vecteur ? _typesConnus(CAT_DE_FAMILLE[famille]) : null;
    const horsJeu = function (o) { return !!(o && (o.type === "itinerary" || o._preview)); };
    const niveauDe = function (o) { return Number.isInteger(o.level) ? o.level : 0; };
    // date_update : posée par touch, jamais une saisie. `type` d'un vecteur : passe par _versType.
    const PAS_COLONNE = { points: true, uid: true, updatedAt: true, date_update: true, type: vecteur, level: true };
    const meme = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };

    const session = acces ? (acces.lire() || []) : _lire(famille);
    const parUid = new Map();
    session.forEach(function (o) { if (o && typeof o.uid === "string" && o.uid && !horsJeu(o)) parUid.set(o.uid, o); });
    const traces = new Set();
    if (window.KtaUid && typeof window.KtaUid.getTombstones === "function") {
      (window.KtaUid.getTombstones() || []).forEach(function (t) { if (t && t.uid) traces.add(t.uid); });
    }
    let ignores = 0;

    // 1. Validation et plan des écritures, sans rien toucher.
    const plan = [];
    const vus = new Set();
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      if (!l || typeof l !== "object" || horsJeu(l)) continue;
      const fautive = function (code) { return { erreur: { ligne: i + 1, code: code, type: String(l.type == null ? "" : l.type) } }; };
      const obj = (typeof l.uid === "string" && !vus.has(l.uid)) ? parUid.get(l.uid) : null;
      const orig = (typeof opts.origine === "function") ? opts.origine(l) : null;
      const touche = function (k) { return !orig || !meme(l[k], orig[k]); };
      if (!obj && orig && traces.has(l.uid) && !Object.keys(l).some(function (k) {
        return k !== "uid" && k !== "updatedAt" && k !== "date_update" && touche(k);
      })) { ignores++; continue; }
      if (!obj) {
        if (vecteur && connus.indexOf(l.type) < 0) return fautive("typeInconnu");
        if (l.level != null && !Number.isInteger(l.level)) return fautive("niveau");
        if (!_niveauxLisibles(l.niveaux)) return fautive("niveau");
        plan.push({ neuf: l });
        continue;
      }
      vus.add(l.uid);
      const op = { obj: obj, type: null, niveau: null, champs: null };
      if (vecteur && touche("type") && l.type !== obj.type) {
        const cibles = listerCibles(famille, obj.type).filter(function (c) { return c.famille === famille; })
          .map(function (c) { return c.type; });
        if (cibles.indexOf(l.type) < 0) {
          if (CIBLES_INTERDITES[l.type]) return fautive("typeInterdit");
          return fautive(connus.indexOf(l.type) < 0 ? "typeInconnu" : "typeIncompatible");
        }
        op.type = l.type;
      }
      if (touche("level") && l.level != null && !Number.isInteger(l.level)) return fautive("niveau");
      if (touche("niveaux") && !_niveauxLisibles(l.niveaux)) return fautive("niveau");
      if (touche("level") && l.level != null && l.level !== niveauDe(obj)) {
        if (CIBLES_INTERDITES[op.type || obj.type]) return fautive("niveau");
        op.niveau = l.level;
      }
      Object.keys(l).forEach(function (k) {
        if (PAS_COLONNE[k] || k.charAt(0) === "_" || l[k] === undefined || !touche(k) || meme(l[k], obj[k])) return;
        (op.champs = op.champs || {})[k] = l[k];
      });
      plan.push(op);
    }
    const bilan = { modifies: 0, ajoutes: 0, supprimes: 0, ignores: ignores };
    plan.forEach(function (op) {
      if (op.neuf) bilan.ajoutes++;
      else if (op.type || op.niveau !== null || op.champs) bilan.modifies++;
    });
    parUid.forEach(function (o, uid) { if (!vus.has(uid)) bilan.supprimes++; });
    if (opts.simuler) return bilan;
    if (!bilan.modifies && !bilan.ajoutes && !bilan.supprimes) return bilan;   // rien écrit, rien à annuler

    // 2. Écriture : un instantané, une liste, un rendu.
    const avant = (window.HistoryManager && window.HistoryManager.captureState)
      ? window.HistoryManager.captureState(categorie) : null;
    const liste = plan.map(function (op) {
      if (op.neuf) {
        const neuf = JSON.parse(JSON.stringify(op.neuf));
        if (typeof neuf.uid === "string" && parUid.has(neuf.uid)) delete neuf.uid;   // doublon : identité neuve
        if (window.KtaUid) window.KtaUid.touch(neuf);
        return neuf;
      }
      let obj = op.obj;
      if (op.champs) {
        Object.assign(obj, op.champs);
        if (window.KtaUid) window.KtaUid.touch(obj);
      }
      if (op.type) obj = _versType(obj, op.type);
      if (op.niveau !== null) _poserNiveau(obj, op.niveau);
      return obj;
    }).concat(session.filter(horsJeu));
    ecrire(liste);
    if (famille === "roads" && window.RoadGraph && typeof window.RoadGraph.invalidate === "function") {
      window.RoadGraph.invalidate();
    }
    if (window.HistoryManager && avant && window.HistoryManager.record) {
      window.HistoryManager.record(_t("convert.histoireTableau", { n: bilan.modifies + bilan.ajoutes + bilan.supprimes }),
        avant, categorie);
    }
    if (window.SessionPersist && window.SessionPersist.save) window.SessionPersist.save();
    return bilan;
  }

  // Cibles d'un LOT = UNION de celles de chaque objet (la source de l'un peut être la cible d'un autre :
  // l'intersection ferait disparaître des cibles légitimes sans explication). `avecFermes` : un contour fermé ouvre
  // aussi les cibles fermées (lot filtré « seulement les contours fermés »).
  function listerCiblesLot(items, avecFermes, index) {
    const vues = {}, out = [];
    const idx = avecFermes ? (index || _indexBouts(items)) : null;   // une fois pour tout le lot
    (items || []).forEach(function (it) {
      if (!it || !it.obj) return;
      listerCibles(it.famille, it.obj.type, avecFermes ? it.obj : null, idx).forEach(function (c) {
        const k = c.famille + ":" + c.type;
        if (vues[k]) return;
        vues[k] = true;
        out.push(c);
      });
    });
    return out;
  }

  function _esc(s) { return window.ktaEsc(s); }

  function _toastBilan(bilan) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(_t("convert.lotBilan", bilan), bilan.convertis > 0 ? "success" : "warn");
    }
  }

  function _toastRecoller(bilan) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(_t("convert.recollerBilan", bilan),
        (bilan.recolles + bilan.convertis) > 0 ? "success" : "warn");
    }
  }

  // Fenêtre commune (fiche, lot, calque). `o` = { source, regle, avant (HTML déjà échappé), cibles, choisir(c),
  // apresMontage(modal, fermer) }. Les choix sont regroupés par catégorie : changer de famille change tout (un tracé
  // entre dans le calcul d'itinéraire, pas une structure), ça doit se voir.
  function _modale(o) {
    const existante = document.getElementById("kta-convert-modal");
    if (existante) existante.remove();
    const parCat = {};
    o.cibles.forEach(function (c) { (parCat[c.cat] = parCat[c.cat] || []).push(c); });

    let corps = "";
    ["traces", "zones", "structures"].forEach(function (cat) {
      const liste = parCat[cat];
      if (!liste || !liste.length) return;
      corps +=
        '<div class="kta-convert-groupe">' +
          '<div class="kta-convert-groupe-titre">' + _esc(_t("convert.cat." + cat)) + '</div>' +
          liste.map(function (c) {
            return '<button class="kta-convert-choix" type="button" ' +
                     'data-famille="' + _esc(c.famille) + '" data-type="' + _esc(c.type) + '">' +
                     '<span class="kta-convert-swatch">' + (c.swatch || "") + '</span>' +
                     '<span class="kta-convert-label">' + _esc(c.label) + '</span>' +
                   '</button>';
          }).join("") +
        '</div>';
    });
    if (!corps) {
      corps = '<p class="kta-convert-vide">' + _esc(_t("convert.aucuneCible")) + '</p>';
    }

    const modal = document.createElement("div");
    modal.id = "kta-convert-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-convert-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _esc(o.titre || _t("convert.titre")) + '</span>' +
          '<button class="kta-panneau-close" id="kta-convert-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p class="kta-convert-source">' + _esc(o.source) + '</p>' +
          '<p class="kta-convert-regle">' + _esc(o.regle) + '</p>' +
          (o.avant || "") +
          corps +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);

    const fermer = function () { modal.remove(); };
    document.getElementById("kta-convert-close").addEventListener("click", fermer);
    modal.addEventListener("click", function (e) { if (e.target === modal) fermer(); });
    modal.querySelectorAll(".kta-convert-choix").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const fam = btn.getAttribute("data-famille");
        const typ = btn.getAttribute("data-type");
        const c = o.cibles.find(function (x) { return x.famille === fam && x.type === typ; }) ||
          { famille: fam, type: typ, label: typ };
        // Les setters re-rendent la carte : la popup ouverte pointerait un layer détruit, on la ferme avant.
        try { if (window.map && window.map.closePopup) window.map.closePopup(); } catch (e) {}
        fermer();
        o.choisir(c);
      });
    });
    if (typeof o.apresMontage === "function") o.apresMontage(modal, fermer);
    return modal;
  }

  // `opts.lot` = [{ famille, obj }] (sélection multiple) ; `opts.fermes` : le lot est réduit à ses contours fermés
  // (case « seulement les contours fermés ») ; `opts.recoller` : les lignes qui forment ensemble une boucle sont
  // recollées en plus (case « recoller », cibles fermées seulement). Le compte est confirmé avant, un ⏪ annule tout.
  function ouvrir(famille, obj, opts) {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;   // 🔒 lecture seule
    if (!obj) return;
    opts = opts || {};
    const lot = Array.isArray(opts.lot) && opts.lot.length ? opts.lot : null;
    const ouvert = _estOuvert(famille, obj.type);
    const regleBase = _t(ouvert ? "convert.regleOuvert" : "convert.regleFerme");

    if (lot) {
      const index = _indexBouts(lot);   // une construction pour toute la fenêtre
      const contours = lot.filter(function (it) { return it && it.obj && _contourSeul(it.famille, it.obj, index); });
      // Cases visibles dès qu'une ligne est dans le lot ; grisées sans objet à traiter (elles disent pourquoi).
      const lignes = lot.some(function (it) { return it && it.obj && _estOuvert(it.famille, it.obj.type); });
      const rec = lignes ? trouverBoucles(lot, index)
        : { boucles: [], lignes: 0, ignorees: 0, contours: contours, morceaux: 0 };
      // Morceaux de pilier (se referment mais touchent une autre ligne) : jamais convertis seuls, dit à la confirmation.
      const noteMorceaux = rec.morceaux ? "\n" + _t("convert.morceauxReste", { k: rec.morceaux }) : "";
      const seuls = rec.contours.length;   // contours fermés convertis seuls quand on recolle
      const recoller = !!opts.recoller && rec.boucles.length > 0;
      const fermes = recoller || (!!opts.fermes && contours.length > 0);
      const caseHtml = function (id, coche, actif, texte) {
        return '<label class="kta-convert-fermes">' +
                 '<input type="checkbox" id="' + id + '"' + (coche ? " checked" : "") + (actif ? "" : " disabled") + '> ' +
                 '<span>' + _esc(texte) + '</span>' +
               '</label>';
      };
      const cases = lignes
        ? caseHtml("kta-convert-fermes", fermes, contours.length > 0 && !recoller,
                   _t("convert.fermesFiltre", { n: contours.length, m: lot.length })) +
          caseHtml("kta-convert-recoller", recoller, rec.boucles.length > 0,
                   _t("convert.recollerFiltre", { n: rec.boucles.length, l: rec.lignes }))
        : '';
      let source = _t("convert.lotSource", { n: lot.length }), regle = regleBase;
      let cibles = listerCiblesLot(lot, false);
      if (recoller) {
        source = _t("convert.lotSourceRecoller", { n: rec.boucles.length, l: rec.lignes, c: seuls, m: lot.length });
        regle = _t("convert.regleRecoller", { tol: TOLERANCE_RECOLLAGE });
        // Cibles FERMÉES seulement : une boucle recollée n'a de sens qu'en zone ou en pilier.
        const vues = {};
        cibles = [];
        const sources = rec.contours.slice();
        rec.boucles.forEach(function (bc) { sources.push.apply(sources, bc.items); });
        sources.forEach(function (it) {
          _cibles(it.famille, it.obj.type, false).forEach(function (c) {
            const k = c.famille + ":" + c.type;
            if (!vues[k]) { vues[k] = true; cibles.push(c); }
          });
        });
      } else if (fermes) {
        source = _t("convert.lotSourceFermes", { n: contours.length, m: lot.length });
        regle = _t("convert.regleContour");
        cibles = listerCiblesLot(contours, true, index);
      }
      _modale({
        source: source,
        regle: regle,
        avant: cases,
        cibles: cibles,
        choisir: function (c) {
          if (!fermes) { _toastBilan(convertirLot(lot, c.famille, c.type)); return; }
          const texte = recoller
            ? _t("convert.recollerConfirm", { n: rec.boucles.length, l: rec.lignes, type: c.label, c: seuls,
                 ignorees: rec.ignorees, autres: lot.length - rec.lignes - seuls - rec.ignorees - rec.morceaux })
            : _t("convert.fermesConfirm", { n: contours.length, type: c.label, autres: lot.length - contours.length });
          const texteComplet = texte + noteMorceaux;
          window.ktaConfirm(_esc(texteComplet), {
            titre: _esc(_t(recoller ? "convert.recollerTitre" : "convert.fermesTitre")),
            okLabel: _esc(_t("convert.fermesOk", { n: recoller ? rec.boucles.length + seuls : contours.length }))
          }).then(function (oui) {
            if (!oui) return;
            if (recoller) _toastRecoller(recollerLot(lot, c.famille, c.type));
            else _toastBilan(convertirLot(contours, c.famille, c.type));
          });
        },
        apresMontage: function (modal, fermer) {
          const cb = modal.querySelector("#kta-convert-fermes");
          const cr = modal.querySelector("#kta-convert-recoller");
          // Chaque case garde l'état de l'autre : décocher « recoller » rend la case des contours telle qu'elle était.
          const rouvrir = function (f, r) { fermer(); ouvrir(famille, obj, { lot: lot, fermes: f, recoller: r }); };
          if (cb) cb.addEventListener("change", function () { rouvrir(cb.checked, !!opts.recoller); });
          if (cr) cr.addEventListener("change", function () { rouvrir(!!opts.fermes, cr.checked); });
        }
      });
      return;
    }

    const niveau = Number.isInteger(obj.level) ? obj.level : 0;
    const index = _indexBouts([{ famille: famille, obj: obj }]);
    const contour = _contourSeul(famille, obj, index);
    // Se referme mais touche une autre ligne : morceau de pilier, la fiche dit pourquoi zone et pilier manquent.
    const morceau = !contour && estContourFerme(famille, obj);
    _modale({
      source: _t("convert.source", { type: _libelle(CAT_DE_FAMILLE[famille] || famille, obj.type),
                                     niveau: (niveau < 0 ? niveau : "+" + niveau) }),
      regle: contour ? _t("convert.regleContourObjet") : (morceau ? _t("convert.regleMorceau") : regleBase),
      // Entrée du mode lot.
      avant: '<button class="kta-btn kta-btn-ghost kta-convert-multi" type="button" id="kta-convert-multi">' +
               _esc(_t("convert.selMulti")) +
             '</button>',
      cibles: listerCibles(famille, obj.type, obj, index),
      choisir: function (c) { convertir(famille, obj, c.famille, c.type); },
      apresMontage: function (modal, fermer) {
        const btnMulti = modal.querySelector("#kta-convert-multi");
        if (!btnMulti || !window.SelectionMulti) return;
        btnMulti.addEventListener("click", function () {
          // La modale disparaît le temps de la désignation (elle couvre la carte à cliquer) et revient à la validation.
          try { if (window.map && window.map.closePopup) window.map.closePopup(); } catch (e) {}
          fermer();
          window.SelectionMulti.ouvrir({ famille: famille, obj: obj }, function (sel) {
            ouvrir(famille, obj, { lot: sel });
          });
        });
      }
    });
  }

  window.KtaConvertir = {
    ouvrir:        ouvrir,
    convertir:     convertir,
    convertirLot:  convertirLot,   // N objets d un coup
    recollerLot:   recollerLot,   // lot + lignes qui forment ensemble une boucle → un objet fermé chacune
    trouverBoucles: trouverBoucles,   // compte des boucles avant de valider (rien n'est modifié)
    listerCiblesLot: listerCiblesLot,
    supprimer:     supprimer,   // depuis la popup de l objet
    changerNiveau: changerNiveau,   // liste « Niveau » de la popup (multi-niveau)
    changerNiveauxJonction: changerNiveauxJonction,   // fiche d'une jonction (fromLevel / toLevel)
    appliquerTableau: appliquerTableau,   // « Appliquer à la session » du Tableur
    listerCibles:  listerCibles,
    estOuvert:     _estOuvert,
    estContourFerme: estContourFerme   // ligne dont les bouts se rejoignent (seuil relatif)
  };
})();
