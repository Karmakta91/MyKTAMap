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
// Règle stricte : fermé = zone ou pilier, ouvert = tracé ou front de taille.
//     OUVERT   ⇄   tracés (galeries)  ⇄  structures polylignes (fronts)
//     FERMÉ    ⇄   zones              ⇄  structures polygones (piliers, murs)
// La frontière porte les MINIMUMS DE POINTS (2 pour un front, 3 pour une zone) : la traverser obligerait à INVENTER
// de la géométrie relevée. Refus assumé, et dit.
// Conservés : `points`, `level`, `description` ; seul le type (donc la famille) change.
// Exclus des cibles : `jonction` (fromLevel / toLevel, impossibles à deviner : outil multi-niveau ; ses niveaux se
// changent par changerNiveauxJonction, jamais par Convertir) et `itinerary` (trajet CALCULÉ, pas une donnée du relevé).
// ⚠️ SESSION UNIQUEMENT : un objet de calque est en lecture seule ; on le rapatrie d'abord (js/calqueSession.js).
// Garde-fou : check-calque-session.js (🩸 ce fichier ne doit contenir AUCUNE mention du nom de liste des points de
// session, même en commentaire).

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
  // source exclue.
  function listerCibles(famille, type) {
    const ouvert = _estOuvert(famille, type);
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
  function _versType(obj, typeCible) {
    const neuf = Object.assign({}, obj, { type: typeCible });
    delete neuf.fromLevel;
    delete neuf.toLevel;
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
    listes[famille].splice(idx, 1);

    listes[familleCible].push(_versType(actuel, typeCible));

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
  function convertirLot(items, familleCible, typeCible) {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return { convertis: 0, sautes: 0, echecs: (items || []).length };   // 🔒 lecture seule
    const bilan = { convertis: 0, sautes: 0, echecs: 0 };
    if (!Array.isArray(items) || !items.length || !familleCible || !typeCible) return bilan;
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

    items.forEach(function (it) {
      if (!it || !it.obj || !listes[it.famille]) { bilan.echecs++; return; }
      if (it.famille === familleCible && it.obj.type === typeCible) { bilan.sautes++; return; }
      const idx = _indexDe(listes[it.famille], it.obj);
      if (idx < 0) { bilan.echecs++; return; }
      const neuf = Object.assign({}, listes[it.famille][idx], { type: typeCible });
      listes[it.famille].splice(idx, 1);
      listes[familleCible].push(_versType(neuf, typeCible));
      touchees[it.famille] = true;
      touchees[familleCible] = true;
      bilan.convertis++;
    });

    if (bilan.convertis === 0) return bilan;   // rien écrit, donc rien à annuler
    Object.keys(touchees).forEach(function (f) { _ecrivain(f)(listes[f]); });
    if (window.HistoryManager && avant && window.HistoryManager.record) {
      window.HistoryManager.record(_t("convert.histoireLot", { n: bilan.convertis }), avant);
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
  // sans validation de type (un point n'en a pas), `categorie` = celle de l'historique. Ce module ne nomme pas cette
  // liste (check-calque-session.js : « Convertir » ne gère pas les points) : c'est l'appelant qui la fournit.
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
  // l'intersection ferait disparaître des cibles légitimes sans explication).
  function listerCiblesLot(items) {
    const vues = {}, out = [];
    (items || []).forEach(function (it) {
      if (!it || !it.obj) return;
      listerCibles(it.famille, it.obj.type).forEach(function (c) {
        const k = c.famille + ":" + c.type;
        if (vues[k]) return;
        vues[k] = true;
        out.push(c);
      });
    });
    return out;
  }

  function ouvrir(famille, obj, opts) {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;   // 🔒 lecture seule
    if (!obj) return;
    opts = opts || {};
    const lot = Array.isArray(opts.lot) && opts.lot.length ? opts.lot : null;
    const existante = document.getElementById("kta-convert-modal");
    if (existante) existante.remove();

    const cibles = lot ? listerCiblesLot(lot) : listerCibles(famille, obj.type);
    const ouvert = _estOuvert(famille, obj.type);
    const catSrc = CAT_DE_FAMILLE[famille] || famille;
    const nomSrc = _libelle(catSrc, obj.type);

    function _esc(s) { return window.ktaEsc(s); }

    // Regroupées par catégorie : changer de famille change tout (un tracé entre dans le calcul d'itinéraire, pas une
    // structure), ça doit se voir.
    const parCat = {};
    cibles.forEach(function (c) { (parCat[c.cat] = parCat[c.cat] || []).push(c); });

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

    const niveau = Number.isInteger(obj.level) ? obj.level : 0;
    const modal = document.createElement("div");
    modal.id = "kta-convert-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-convert-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _esc(_t("convert.titre")) + '</span>' +
          '<button class="kta-panneau-close" id="kta-convert-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p class="kta-convert-source">' +
            _esc(lot
              ? _t("convert.lotSource", { n: lot.length })
              : _t("convert.source", { type: nomSrc, niveau: (niveau < 0 ? niveau : "+" + niveau) })) +
          '</p>' +
          '<p class="kta-convert-regle">' +
            _esc(_t(ouvert ? "convert.regleOuvert" : "convert.regleFerme")) +
          '</p>' +
          // Entrée du mode lot, absente quand on EST déjà en lot.
          (lot ? '' :
            '<button class="kta-btn kta-btn-ghost kta-convert-multi" type="button" id="kta-convert-multi">' +
              _esc(_t("convert.selMulti")) +
            '</button>') +
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
        // Les setters re-rendent la carte : la popup ouverte pointerait un layer détruit, on la ferme avant.
        try { if (window.map && window.map.closePopup) window.map.closePopup(); } catch (e) {}
        fermer();
        if (lot) {
          const bilan = convertirLot(lot, fam, typ);
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(_t("convert.lotBilan", bilan), "info");
          }
        } else {
          convertir(famille, obj, fam, typ);
        }
      });
    });

    const btnMulti = document.getElementById("kta-convert-multi");
    if (btnMulti && window.SelectionMulti) {
      btnMulti.addEventListener("click", function () {
        // La modale disparaît le temps de la désignation (elle couvre la carte à cliquer) et revient à la validation.
        try { if (window.map && window.map.closePopup) window.map.closePopup(); } catch (e) {}
        fermer();
        window.SelectionMulti.ouvrir({ famille: famille, obj: obj }, function (sel) {
          ouvrir(famille, obj, { lot: sel });
        });
      });
    }
  }

  window.KtaConvertir = {
    ouvrir:        ouvrir,
    convertir:     convertir,
    convertirLot:  convertirLot,   // N objets d un coup
    listerCiblesLot: listerCiblesLot,
    supprimer:     supprimer,   // depuis la popup de l objet
    changerNiveau: changerNiveau,   // liste « Niveau » de la popup (multi-niveau)
    changerNiveauxJonction: changerNiveauxJonction,   // fiche d'une jonction (fromLevel / toLevel)
    appliquerTableau: appliquerTableau,   // « Appliquer à la session » du Tableur
    listerCibles:  listerCibles,
    estOuvert:     _estOuvert
  };
})();
