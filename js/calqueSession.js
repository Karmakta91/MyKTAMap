/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// CALQUESESSION.JS — Rapatrier un calque de données dans la session
// =====================================================================
// 🩸 Un calque de données est rendu UNE seule fois à l'import (pas de re-rendu, cf. utils.js) ; seuls les objets
// de SESSION ont renderRoads() / renderZones() / renderStructures(). Pour corriger un calque, son contenu doit
// donc passer en session. La transformation existe déjà (sessionExporter.js > _exportConvData2Session, simple
// remappage) : ce module la fait EN PLACE, sans aller-retour par un fichier, avec un verrou contre le doublon.
// Le calque ENTIER, pas objet par objet (décision produit) : roads et zones N'ONT PAS D'ID (data-formats.md), il
// faudrait une clé dérivée de la géométrie, que `tabledit.dedup` casserait en silence. Calque entier = UNE source
// de vérité : « l'export de session REMPLACE le fichier du calque », aucun doublon possible.
// Prix : ~225 octets par objet en session (~1,1 Mo pour 5 000 objets) ; `peser()` et `occupationLocalStorage()`
// annoncent le coût AVANT (SessionPersist réécrit toute la session à chaque sauvegarde).
// 🔒 Verrou : un calque rapatrié est MASQUÉ automatiquement ; recocher sa case affiche les deux (comparaison) ;
// la restitution inverse tout. Le verrou est LOCAL : « rapatrier » reprend les copies déjà là (synchro relue
// d'abord sur un plan d'extension ; impossible à relire : l'utilisateur est prévenu et choisit de recopier) et ne
// recrée jamais un objet qu'une trace de copie valable dit supprimé.
// 🩸 Deux pièges :
//   1. « Effacer la session » doit RENDRE le calque : copie et verrou tombent ensemble, sinon plan vide.
//   2. Au chargement, le verrou ne s'applique QUE SI la copie est là (sauvegarde ratée sur quota → plan vide
//      sans explication) : appliquerVerrous() vérifie AVANT de masquer, et déverrouille en le disant.
// 🩸 Plan d'extension (☁️) : la restitution se PARTAGE par un enregistrement « calque restitué à T »
//   (restitutionsDepuis → synchro sortante ; appliquerRestitutions ← entrante), état LOCAL de la session. Supprimer
//   une copie pose une trace de COPIE (KtaUid.tombstoneCopie, 🔒 jamais dans un fichier : exportée puis fusionnée,
//   elle détruirait l'objet du calque) ; la restitution la fait tomber. Règle : docs/architecture/session-data.md.
// Ajouts intégrés : un objet dessiné à la main peut rejoindre un calque en modification (integrerAjouts) ; il se
//   comporte alors en copie (exporté avec le calque, retiré à sa restitution).
// Nouvelle version du plan (js/majPlan.js) : contenuCalque (le fichier sans téléchargement), retirerIntegres (les
//   objets à la main versés dans le plan quittent la session, trace datée sous le fichier).
// API : window.CalqueSession = { estRapatrie, listeRapatries, peser, occupationLocalStorage, rapatrier, restituer,
//   exporterCalque, contenuCalque, retirerIntegres, compterCopie, appliquerVerrous, resynchroniser (import de
//   session, synchro), getSessionState, loadSessionState, restitutionPartagee, libelle, restitutionsDepuis,
//   appliquerRestitutions, calqueDesTraces, candidatsAjout, integrerAjouts, compterAjouts, CLE_SOURCE, CLE_DEPUIS,
//   CLE_AJOUT }
// 100 % local (le `fetch` du calque est celui que ajouterPointsDepuisJSON fait déjà). Garde-fou :
// check-calque-session.js.

window.CalqueSession = (function () {
  "use strict";

  // Marqueur posé sur CHAQUE objet rapatrié : il rend la restitution possible (on sait quoi retirer) et dit à
  // l'export quel calque il remplace. Préfixe `_` = interne.
  const CLE_SOURCE = "_srcCalque";
  // Instant du rapatriement (ms), posé avec la marque : une restitution « à T » ne touche que les copies d'un
  // rapatriement antérieur à T — celles d'un nouveau rapatriement (après T) restent.
  const CLE_DEPUIS = "_srcCalqueDepuis";
  // Posée (true) avec la marque sur un objet dessiné à la main puis intégré au calque : seule différence avec une
  // copie, elle permet à la restitution de dire combien d'AJOUTS elle retire. Retirée avec la marque.
  const CLE_AJOUT = "_srcCalqueAjout";

  // Ids des calques rapatriés (les objets vivent dans la session, le verrou se déduit).
  let _rapatries = [];
  // Restitutions connues sur ce plan : { calqueId: T } (la plus récente), et celles faites ICI à envoyer :
  // { calqueId: { avant: T, uids: [...] } } — les uids servent au serveur, qui ne lit pas un objet chiffré.
  let _restitutions = {};
  let _aEnvoyer = {};
  const MAX_ID = 200;

  function _log(msg, extra) {
    if (extra !== undefined) console.log("[CalqueSession] " + msg, extra);
    else console.log("[CalqueSession] " + msg);
  }

  function _cfgCalque(id) {
    const pc = window.PLAN_CONFIG;
    const arr = (pc && Array.isArray(pc.dataLayers)) ? pc.dataLayers : [];
    return arr.find(function (d) { return d && d.id === id; }) || null;
  }

  function _groupe(id) {
    return (window.dataLayerGroups && window.dataLayerGroups[id]) || null;
  }

  // Les quatre familles et leur accesseur de session. ⚠️ Les points se disent `editorPoints` côté session et
  // `data` côté calque : on traverse ce décalage ici, une fois pour toutes.
  const FAMILLES = [
    { cle: "editorPoints", get: "getEditorPoints", set: "setEditorPoints", calque: ["data", "editorPoints"] },
    { cle: "roads",        get: "getRoads",        set: "setRoads",        calque: ["roads"] },
    { cle: "zones",        get: "getZones",        set: "setZones",        calque: ["zones"] },
    { cle: "structures",   get: "getStructures",   set: "setStructures",   calque: ["structures"] }
  ];

  function _lire(fam) {
    const f = window[fam.get];
    return (typeof f === "function") ? (f() || []) : [];
  }

  function _ecrire(fam, arr) {
    const f = window[fam.set];
    if (typeof f === "function") f(arr);
  }

  function _depuisCalque(json, fam) {
    for (const k of fam.calque) {
      if (Array.isArray(json[k])) return json[k];
    }
    return [];
  }

  // ── État ──────────
  function estRapatrie(id) { return _rapatries.indexOf(id) >= 0; }
  function listeRapatries() { return _rapatries.slice(); }

  // Nombre d'objets de session venus de ce calque (restitution, et garde-fou du chargement : piège 2).
  function compterCopie(id) {
    let n = 0;
    FAMILLES.forEach(function (fam) {
      _lire(fam).forEach(function (o) { if (o && o[CLE_SOURCE] === id) n++; });
    });
    return n;
  }

  // ── Mesures : le coût est annoncé AVANT ──────────
  function occupationLocalStorage() {
    let octets = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || "";
        // UTF-16 : 2 octets par unité de code, approximation volontairement PESSIMISTE (alerter trop tôt plutôt
        // que découvrir le QuotaExceededError une fois la session perdue).
        octets += (k.length + v.length) * 2;
      }
    } catch (e) { return null; }
    return octets;
  }

  function _octets(x) {
    try { return new Blob([JSON.stringify(x)]).size; }
    catch (e) { return JSON.stringify(x).length; }
  }

  // Poids du calque une fois en session, mesuré sur le VRAI JSON (la moyenne de 225 o/objet ne vaut que pour de
  // gros relevés).
  function peser(id) {
    const lc = _cfgCalque(id);
    if (!lc || !lc.file) return Promise.resolve(null);
    return fetch(lc.file)
      .then(function (r) { return r.json(); })
      .then(function (json) {
        let objets = 0, octets = 0;
        FAMILLES.forEach(function (fam) {
          const arr = _depuisCalque(json, fam);
          objets += arr.length;
          if (arr.length) octets += _octets(arr);
        });
        return { objets: objets, octets: octets, label: lc.label || id };
      })
      .catch(function (e) {
        console.warn("[CalqueSession] pesee impossible pour « " + id + " » :", e);
        return null;
      });
  }

  // ── Rapatriement ──────────
  // Rend une promesse : { ok:true, stats, total, evites, repris? } ou { ok:false, code }. Le `fetch` est celui du
  // chargement du plan (aucune surface réseau nouvelle) et la donnée est FRAÎCHE (pas de cache mémoire qui aurait
  // dérivé).
  // 🩸 Le calque peut déjà être en modification AILLEURS (plan d'extension) : ses copies, retouchées ou supprimées
  // par les autres, vivent dans la session synchronisée. Recopier le fichier les écraserait (copies datées de
  // maintenant : « le plus récent gagne » ressusciterait chez tous les objets supprimés). D'où, dans l'ordre :
  //   1. des copies marquées de ce calque sont déjà ici → elles sont REPRISES (`repris`), rien n'est recopié ;
  //   2. plan d'extension avec la prise relireChangements → la synchro est relue d'abord (copies reçues = reprises) ;
  //      relecture impossible (hors ligne, serveur muet) → l'utilisateur est PRÉVENU sans être bloqué (décision
  //      produit) : `opts.confirmerSansSynchro()` → Promise<bool> (true = recopier, l'étape 3 s'applique ; false =
  //      `annule`, rien ne change). Sans ce rappel : refus `synchroImpossible` ;
  //   3. sinon recopie du fichier, SAUF les objets qu'une trace de copie encore valable dit supprimés (`evites`) :
  //      la trace reste, l'objet n'est pas recréé. Tous supprimés : le calque passe en modification vide, comme
  //      chez celui qui les a supprimés.
  // Plan local (sans extension) : seuls 1 et 3 jouent, tout reste sur l'appareil.
  function rapatrier(id, opts) {
    if (!id) return Promise.resolve({ ok: false, code: "idManquant" });
    if (estRapatrie(id)) return Promise.resolve({ ok: false, code: "dejaRapatrie" });
    const lc = _cfgCalque(id);
    if (!lc || !lc.file) return Promise.resolve({ ok: false, code: "calqueInconnu" });
    if (compterCopie(id) > 0) return Promise.resolve(_reprendre(id));

    return _relireSiPartage()
      .then(function (lu) {
        if (compterCopie(id) > 0) return _reprendre(id);
        const copier = function () {
          return fetch(lc.file)
            .then(function (r) { return r.json(); })
            .then(function (json) { return _copierFichier(id, json); });
        };
        if (lu !== false) return copier();
        const confirmer = opts && typeof opts.confirmerSansSynchro === "function" ? opts.confirmerSansSynchro : null;
        if (!confirmer) return { ok: false, code: "synchroImpossible" };
        return Promise.resolve().then(confirmer).then(function (oui) {
          // Pendant la question, une synchro a pu apporter les copies (ou un autre geste rapatrier le calque).
          if (estRapatrie(id) || compterCopie(id) > 0) return _reprendre(id);
          return oui === true ? copier() : { ok: false, code: "annule" };
        }, function () { return { ok: false, code: "annule" }; });
      })
      .catch(function (e) {
        console.warn("[CalqueSession] rapatriement echoue pour « " + id + " » :", e);
        return { ok: false, code: "lectureEchouee", detail: e && e.message };
      });
  }

  function _copierFichier(id, json) {
    const traces = _tracesValables(id);
    const K = window.KtaUid;
    const stats = { editorPoints: 0, roads: 0, zones: 0, structures: 0 };
    let evites = 0;
    // 🩸 `updatedAt` = maintenant (horloge de synchro, pas `date_update` qui reste la date du relevé) : la copie
    // garde l'uid de l'original et sa date de génération ; une synchro qui n'envoie que « ce qui a changé depuis »
    // n'en enverrait que les copies retouchées, et un autre appareil masquerait le calque pour n'en montrer que
    // quelques objets.
    const maintenant = Date.now();
    FAMILLES.forEach(function (fam) {
      const src = _depuisCalque(json, fam);
      if (!src.length) return;
      const copies = [];
      src.forEach(function (o) {
        if (!o || typeof o !== "object") return;
        const uid = (typeof o.uid === "string" && o.uid) ? o.uid : null;
        // ⚠️ Trace de copie au moins aussi récente que l'objet du fichier : supprimé en modification (ici ou
        // ailleurs), la suppression l'emporte quelle que soit l'heure de ce rapatriement.
        if (uid && traces.has(uid) && traces.get(uid) >= (Number(o.updatedAt) || 0)) { evites++; return; }
        // Copie DÉFENSIVE : l'objet du calque n'est pas muté et l'objet de session ne partage aucune référence.
        const c = JSON.parse(JSON.stringify(o));
        c[CLE_SOURCE] = id;
        c[CLE_DEPUIS] = maintenant;
        c.updatedAt = maintenant;
        // Trace plus ancienne que l'objet du fichier (objet versé depuis dans une nouvelle version du plan,
        // retirerIntegres) ou trace ordinaire : elle visait une version d'avant, elle tombe.
        if (K && uid) K.untombstone(uid);
        copies.push(c);
      });
      if (!copies.length) return;
      _ecrire(fam, _lire(fam).concat(copies));   // les setters redessinent
      stats[fam.cle] = copies.length;
    });

    const total = stats.editorPoints + stats.roads + stats.zones + stats.structures;
    if (total === 0 && evites === 0) return { ok: false, code: "calqueVide" };

    _rapatries.push(id);
    _masquer(id);
    _persister();
    _log("calque « " + id + " » rapatrie en session (" + evites + " objet(s) supprime(s) non recree(s))", stats);
    return { ok: true, stats: stats, total: total, evites: evites };
  }

  // Traces de copie du calque `id` encore valables : uid → deletedAt. Une trace antérieure ou égale à la dernière
  // restitution connue du calque ne vaut plus (l'objet du fichier est revenu).
  function _tracesValables(id) {
    const out = new Map();
    const K = window.KtaUid;
    if (!K || typeof K.getTracesCopie !== "function") return out;
    const T = _restitutions[id] || 0;
    K.getTracesCopie().forEach(function (t) {
      if (t && t.calque === id && t.deletedAt > T) out.set(t.uid, t.deletedAt);
    });
    return out;
  }

  // Copies déjà là (synchro, import de session) : le calque passe en modification sur elles.
  function _reprendre(id) {
    if (!estRapatrie(id)) _rapatries.push(id);
    _masquer(id);
    _persister();
    _log("calque « " + id + " » deja en modification : " + compterCopie(id) + " copie(s) reprise(s), rien recopie");
    return _resultatRepris(id);
  }
  function _resultatRepris(id) {
    const stats = { editorPoints: 0, roads: 0, zones: 0, structures: 0 };
    FAMILLES.forEach(function (fam) {
      _lire(fam).forEach(function (o) { if (o && o[CLE_SOURCE] === id) stats[fam.cle]++; });
    });
    const total = stats.editorPoints + stats.roads + stats.zones + stats.structures;
    return { ok: true, repris: true, stats: stats, total: total, evites: 0 };
  }

  // Plan d'extension : la synchro est relue avant de copier (KtaExtensions.relireChangements). → Promise : true
  // (relue), false (impossible), null (rien à relire : plan local, ou extension sans la prise).
  function _relireSiPartage() {
    const PR = window.PlanRegistry, planId = window._currentLoadedPlanId;
    const e = (PR && typeof PR.findById === "function" && planId) ? PR.findById(planId) : null;
    const X = window.KtaExtensions;
    if (!e || e.type !== "ext" || !X || typeof X.relireChangements !== "function") return Promise.resolve(null);
    return Promise.resolve().then(function () { return X.relireChangements(planId); })
      .then(function (r) { return r === true ? true : (r === null ? null : false); }, function () { return false; });
  }

  // ── Restitution ──────────
  // Retire de la session TOUT ce qui porte la marque du calque, lève le verrou, remet le calque sur la carte. Les
  // objets CRÉÉS depuis (sans la marque) ne sont pas touchés. Sur un plan d'extension modifiable, la restitution
  // est notée pour les autres appareils (« restitué à T » + uids retirés) ; `opts.local` = jamais notée
  // (« Effacer la session » : la copie du serveur doit revenir, pas disparaître chez tout le monde).
  function restituer(id, opts) {
    if (!estRapatrie(id)) return { ok: false, code: "pasRapatrie" };
    let retires = 0;
    let T = Date.now();
    const uids = [];
    FAMILLES.forEach(function (fam) {
      const avant = _lire(fam);
      const apres = avant.filter(function (o) {
        if (!o || o[CLE_SOURCE] !== id) return true;
        if (typeof o.uid === "string" && o.uid) uids.push(o.uid);
        // T couvre toutes les copies retirées ici, même datées un peu en avance.
        if (typeof o.updatedAt === "number" && Number.isFinite(o.updatedAt) && o.updatedAt > T) T = o.updatedAt;
        return false;
      });
      if (apres.length !== avant.length) {
        retires += (avant.length - apres.length);
        _ecrire(fam, apres);
      }
    });
    _rapatries = _rapatries.filter(function (x) { return x !== id; });
    // Les traces des copies supprimées tombent : l'objet du fichier revient. Leurs uids partent avec la note (le
    // serveur d'une organisation chiffrée ne lit pas la marque : sans eux, la trace resterait chez lui).
    uids.push.apply(uids, _oublierTraces(id));
    const partagee = !(opts && opts.local === true) && _restitutionPartagee();
    if (partagee) {
      _restitutions[id] = Math.max(_restitutions[id] || 0, T);
      const deja = _aEnvoyer[id] ? _aEnvoyer[id].uids : [];
      _aEnvoyer[id] = { avant: _restitutions[id], uids: Array.from(new Set(deja.concat(uids))) };
    }
    _afficher(id);
    _persister();
    _log("calque « " + id + " » restitue — " + retires + " objet(s) retire(s) de la session" +
         (partagee ? " (restitution partagee, avant " + T + ")" : ""));
    return { ok: true, retires: retires, partagee: partagee };
  }

  // Traces de copie du calque `id` (KtaUid), datées au plus tard de `avant` : retirées. → uids.
  function _oublierTraces(id, avant) {
    const K = window.KtaUid;
    return (K && typeof K.oublierTracesCopie === "function") ? K.oublierTracesCopie(id, avant) : [];
  }
  function _aDesTraces(id) {
    const K = window.KtaUid;
    return !!(K && typeof K.getTracesCopie === "function" && K.getTracesCopie().some(function (t) { return t.calque === id; }));
  }

  // uid → id du calque dont le fichier contient un objet de cet uid (copie marquée en session, ou objet chargé d'un
  // calque du plan ouvert), sinon null. Index bâti à l'appel : à rappeler après un changement. Sert à ranger une
  // trace de suppression (historyManager.js, synchro reçue, import sur plan partagé) : 🔒 une trace sur un tel uid
  // est une trace de COPIE, jamais dans un fichier.
  function calqueDesTraces() {
    const m = new Map();
    const noter = function (uid, calque) {
      if (typeof uid === "string" && uid && typeof calque === "string" && calque && !m.has(uid)) m.set(uid, calque);
    };
    FAMILLES.forEach(function (fam) {
      _lire(fam).forEach(function (o) { if (o) noter(o.uid, o[CLE_SOURCE]); });
    });
    (Array.isArray(window._ktaDataMarkers) ? window._ktaDataMarkers : []).forEach(function (mk) {
      if (mk) noter(mk._ktaUid, mk._ktaLayerId);
    });
    [window._ktaDataPolygons, window._ktaDataStructurePolygons].forEach(function (reg) {
      (Array.isArray(reg) ? reg : []).forEach(function (e) { if (e) noter(e.uid, e.layerId); });
    });
    if (typeof window.ktaCalquesDesRoadsEmbarquees === "function") {
      window.ktaCalquesDesRoadsEmbarquees().forEach(function (e) { noter(e.uid, e.calque); });
    }
    return function (uid) { return m.get(uid) || null; };
  }

  // Plan d'extension ouvert et modifiable : seul cas où la restitution part aux autres. Notée sur un plan en
  // lecture seule, elle partirait plus tard, périmée, si le droit change.
  function _restitutionPartagee() {
    const PR = window.PlanRegistry, id = window._currentLoadedPlanId;
    const e = (PR && typeof PR.findById === "function" && id) ? PR.findById(id) : null;
    if (!e || e.type !== "ext") return false;
    const X = window.KtaExtensions;
    try { return !(X && typeof X.lectureSeule === "function" && X.lectureSeule(id)); } catch (er) { return false; }
  }

  // Nom affiché d'un calque du plan ouvert (son id à défaut).
  function libelle(id) {
    const lc = _cfgCalque(id);
    return (lc && lc.label) || id;
  }

  // ── Restitution partagée : sortante ──────────
  // Restitutions faites ICI après `ts` (ms) : [{ calque, avant, uids }] (copies).
  function restitutionsDepuis(ts) {
    const seuil = (typeof ts === "number" && Number.isFinite(ts)) ? ts : 0;
    return Object.keys(_aEnvoyer).filter(function (id) { return _aEnvoyer[id].avant > seuil; }).map(function (id) {
      return { calque: id, avant: _aEnvoyer[id].avant, uids: _aEnvoyer[id].uids.slice() };
    });
  }

  // uid d'une copie GARDÉE après une restitution (cf. appliquerRestitutions) : dérivé de l'uid et de T, donc le
  // même sur tous les appareils (pas de doublon entre eux), et différent de l'objet du calque (une trace de
  // suppression sur lui ne vise jamais l'original). Même préfixe : celui de la copie.
  function _uidGarde(uid, T) {
    const h = function (graine) {
      let x = graine >>> 0;
      for (let i = 0; i < uid.length; i++) { x ^= uid.codePointAt(i); x = Math.imul(x, 16777619) >>> 0; }
      return x.toString(36);
    };
    const pre = /^(pt|rd|zn|st)_/.test(uid) ? uid.slice(0, 3) : "pt_";
    return pre + h(2166136261) + h(1315423911) + "_r" + Math.floor(T).toString(36);
  }

  // ── Restitution partagée : entrante ──────────
  // `liste` = [{ calque, avant }] d'un autre appareil, ajoutée aux restitutions connues ; puis TOUTES sont
  // appliquées (une copie périmée arrivée après coup est traitée pareil). Copie marquée du calque L restitué à T :
  //   - rapatriée après T (`_srcCalqueDepuis` > T) : intacte, le calque est de nouveau en modification ;
  //   - modifiée au plus tard à T : RETIRÉE, la restitution l'emporte (décision produit) ;
  //   - modifiée APRÈS T : GARDÉE en objet ordinaire (uid dérivé, marque retirée, date inchangée) et signalée —
  //     rien de perdu, et le calque d'origine n'est pas masqué pour quelques objets ;
  //   - sans date de rapatriement et modifiée après T : intacte (provenance inconnue ; la convertir changerait
  //     peut-être tout un calque rapatrié en objets « à la main »).
  // Ne touche JAMAIS un objet sans la marque. → { retires, gardes, change } ; l'appelant resynchronise.
  function appliquerRestitutions(liste) {
    let nouvelle = false;
    (Array.isArray(liste) ? liste : []).forEach(function (r) {
      if (!r || typeof r.calque !== "string" || !r.calque || r.calque.length > MAX_ID) return;
      const T = Number(r.avant);
      if (!Number.isFinite(T) || T <= 0) return;
      if (!(_restitutions[r.calque] >= T)) { _restitutions[r.calque] = T; nouvelle = true; }
    });
    let retires = 0, gardes = 0;
    const parCalque = {};
    FAMILLES.forEach(function (fam) {
      const avant = _lire(fam);
      const apres = [];
      const deja = new Set(avant.map(function (o) { return o && o.uid; }));
      const index = new Map();   // uid → position dans `apres`
      const poser = function (o) {
        const k = (o && o.uid) ? index.get(o.uid) : undefined;
        if (k === undefined) { if (o && o.uid) index.set(o.uid, apres.length); apres.push(o); return; }
        // Copie déjà gardée (autre tour, autre appareil) : la plus récente reste, pas de doublon.
        if ((Number(o.updatedAt) || 0) > (Number(apres[k].updatedAt) || 0)) apres[k] = o;
      };
      let change = false;
      avant.forEach(function (o) {
        const L = o ? o[CLE_SOURCE] : undefined;
        const T = (L !== undefined) ? _restitutions[L] : undefined;
        if (T === undefined) { poser(o); return; }
        const R = o[CLE_DEPUIS];
        if (typeof R === "number" && R > T) { poser(o); return; }
        if ((Number(o.updatedAt) || 0) <= T) { retires++; change = true; return; }
        if (typeof R !== "number") { poser(o); return; }
        const c = JSON.parse(JSON.stringify(o));
        delete c[CLE_SOURCE];
        delete c[CLE_DEPUIS];
        delete c[CLE_AJOUT];
        c.uid = _uidGarde(String(o.uid || ""), T);
        change = true;
        if (!deja.has(c.uid)) { gardes++; parCalque[L] = (parCalque[L] || 0) + 1; }
        poser(c);
      });
      if (change) _ecrire(fam, apres);
    });
    // Traces de copie antérieures à la restitution de leur calque : tombées (l'objet du fichier est revenu).
    let traces = 0;
    Object.keys(_restitutions).forEach(function (L) { traces += _oublierTraces(L, _restitutions[L]).length; });
    const change = retires > 0 || gardes > 0;
    if (change || nouvelle || traces) _persister();
    if (change) _log("restitution recue — " + retires + " copie(s) retiree(s), " + gardes + " gardee(s) en session");
    if (gardes && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      Object.keys(parCalque).forEach(function (L) {
        const lc = _cfgCalque(L);
        try {
          window.OOMGuard.showToast(window.I18n.t("calque.restitution.gardes",
            { n: parCalque[L], calque: (lc && lc.label) || L }), "warn");
        } catch (e) {}
      });
    }
    // `change` vrai aussi pour une trace tombée : l'appelant resynchronise (calque gardé par ses seules traces libéré).
    return { retires: retires, gardes: gardes, change: change || traces > 0 };
  }

  // ── Intégrer des ajouts : un objet dessiné à la main rejoint un calque en modification ──────────
  // L'objet reçoit la marque ET la date de rapatriement des copies du calque (pas l'instant de l'intégration) : il
  // se comporte en copie retouchée maintenant.
  //   - exporté avec le calque (exporterCalque lit la marque), retiré à sa restitution locale ou reçue ;
  //   - 🔒 supprimé, il reçoit une trace de COPIE (historyManager.js > _tracer), jamais dans un fichier : une fois
  //     exporté, son uid EST dans le fichier du calque, une trace exportée l'y détruirait par la fusion de calques ;
  //   - une restitution reçue postérieure au rapatriement mais antérieure à l'intégration le GARDE en objet
  //     ordinaire sous un uid dérivé (règle des copies modifiées après T) : avec l'instant de l'intégration, il
  //     resterait marqué et laisserait le calque masqué pour lui seul.
  // Seuls les objets SANS marque sont candidats : un objet appartient à un seul calque, et une copie (uid d'un objet
  // de calque) ne change jamais de calque. L'itinéraire calculé n'en est pas un.
  function _estCandidat(o) {
    return !!o && o[CLE_SOURCE] === undefined && o.type !== "itinerary" && typeof o.uid === "string" && !!o.uid;
  }

  // { editorPoints: [...], roads: [...], zones: [...], structures: [...] } (références de session, lecture seule).
  function candidatsAjout() {
    const out = {};
    FAMILLES.forEach(function (fam) { out[fam.cle] = _lire(fam).filter(_estCandidat); });
    return out;
  }

  // Objets intégrés à ce calque (ils partiront à sa restitution : la fenêtre le dit).
  function compterAjouts(id) {
    let n = 0;
    FAMILLES.forEach(function (fam) {
      _lire(fam).forEach(function (o) { if (o && o[CLE_SOURCE] === id && o[CLE_AJOUT] === true) n++; });
    });
    return n;
  }

  // Date du rapatriement en cours : la plus récente des copies (une copie d'un rapatriement plus ancien a été
  // retirée par sa restitution). Aucune copie datée (rapatriement antérieur à la date) : maintenant.
  function _depuisCopies(id) {
    let R = 0;
    FAMILLES.forEach(function (fam) {
      _lire(fam).forEach(function (o) {
        if (o && o[CLE_SOURCE] === id && typeof o[CLE_DEPUIS] === "number" && Number.isFinite(o[CLE_DEPUIS]) &&
            o[CLE_DEPUIS] > R) R = o[CLE_DEPUIS];
      });
    });
    return R > 0 ? R : Date.now();
  }

  // `uids` = objets choisis. 🔒 Refus en lecture seule (garde des outils de dessin, qui le dit). Une seule entrée
  // d'historique (⏪ rend les objets tels qu'avant) ; chaque objet est daté (KtaUid.touch) pour partir à la synchro.
  // → { ok:true, total, stats } ou { ok:false, code }.
  function integrerAjouts(id, uids) {
    if (!estRapatrie(id)) return { ok: false, code: "pasRapatrie" };
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) {
      return { ok: false, code: "lectureSeule" };
    }
    const voulus = new Set((Array.isArray(uids) ? uids : []).filter(function (u) { return typeof u === "string" && u; }));
    if (!voulus.size) return { ok: false, code: "rienChoisi" };
    const H = window.HistoryManager;
    const avant = (H && typeof H.captureState === "function") ? H.captureState() : null;
    const R = _depuisCopies(id);
    const K = window.KtaUid;
    const stats = { editorPoints: 0, roads: 0, zones: 0, structures: 0 };
    let total = 0;
    FAMILLES.forEach(function (fam) {
      const arr = _lire(fam);
      let n = 0;
      arr.forEach(function (o) {
        if (!_estCandidat(o) || !voulus.has(o.uid)) return;
        o[CLE_SOURCE] = id;
        o[CLE_DEPUIS] = R;
        o[CLE_AJOUT] = true;
        if (K && typeof K.touch === "function") K.touch(o); else o.updatedAt = Date.now();
        n++;
      });
      if (n) { _ecrire(fam, arr.slice()); stats[fam.cle] = n; total += n; }
    });
    if (!total) return { ok: false, code: "rienChoisi" };
    if (avant && typeof H.record === "function") {
      try { H.record(window.I18n.t("calque.ajouts.historique", { n: total }), avant); }
      catch (e) { console.warn("[CalqueSession] historique de l'integration :", e); }
    }
    _persister();
    _log("calque « " + id + " » : " + total + " ajout(s) integre(s)", stats);
    return { ok: true, total: total, stats: stats };
  }

  // ── Retour vers le ZIP : UN fichier de la forme de l'original ──────────
  // Le convertisseur session → calque existant éclate la sortie (points / roads / zones / structure.json) : bien
  // pour fabriquer un plan, inutilisable pour REMPLACER un calque. Dans « Modifier un plan », chaque calque est UNE
  // LIGNE (id + sélecteur de fichier) : y déposer ce fichier remplace son contenu, sans doublon possible.
  // 🩸 LES TABLEAUX VIDES SONT ÉCRITS, PAS OMIS : c'est un remplacement. Toutes les zones supprimées → `zones: []`,
  // sinon les anciennes reviennent au rechargement (suppression annulée en silence).
  // La marque `_srcCalque` est RETIRÉE (outil interne de session, rien à faire dans un ZIP partagé).
  function exporterCalque(id) {
    const r = contenuCalque(id);
    if (!r.ok) return r;
    // `file` est RÉSOLU au chargement (parfois en `blob:`), son basename n'est pas fiable ; l'id est celui de la
    // ligne du Générateur.
    const nom = id + ".json";
    _telecharger(r.payload, nom);
    _log("calque « " + id + " » exporte vers " + nom + " (" + r.total + " objets)");
    return { ok: true, total: r.total, horsCalque: r.horsCalque, nom: nom, stats: r.payload };
  }

  // Même contenu qu'exporterCalque, sans téléchargement (assistant « Mettre à jour le plan »).
  // → { ok:true, payload, total, horsCalque } ou { ok:false, code }.
  function contenuCalque(id) {
    if (!estRapatrie(id)) return { ok: false, code: "pasRapatrie" };
    // 🔒 Le fichier EST le contenu du calque : il faut le droit d'exporter tout le plan (un export limité aux
    // ajouts d'un auteur ne suffit pas). Le refus se dit par le goulot (message).
    if (typeof window.ktaExportPlanRefuse === "function" && window.ktaExportPlanRefuse()) {
      return { ok: false, code: "exportRefuse" };
    }
    const payload = { data: [], roads: [], zones: [], structures: [] };
    let horsCalque = 0;
    FAMILLES.forEach(function (fam) {
      // Côté calque, les points se disent `data` (cf. FAMILLES).
      const cible = (fam.cle === "editorPoints") ? "data" : fam.cle;
      _lire(fam).forEach(function (o) {
        if (!o) return;
        if (o[CLE_SOURCE] === id) {
          const c = JSON.parse(JSON.stringify(o));
          delete c[CLE_SOURCE];
          delete c[CLE_DEPUIS];
          delete c[CLE_AJOUT];
          payload[cible].push(c);
        } else if (o[CLE_SOURCE] === undefined) {
          // Objet créé à la main en session : il n'appartient pas au calque, on ne l'y verse pas d'autorité. On le
          // COMPTE pour le dire (sinon l'utilisateur croirait son travail embarqué).
          horsCalque++;
        }
      });
    });

    const total = payload.data.length + payload.roads.length
                + payload.zones.length + payload.structures.length;
    return { ok: true, payload: payload, total: total, horsCalque: horsCalque };
  }

  // ── Objets dessinés à la main versés dans une nouvelle version du plan : les retirer de la session ──────────
  // L'assistant « Mettre à jour le plan » écrit ces objets dans un calque daté `ts` (leur `updatedAt` dans le
  // fichier). 🩸 Une trace de suppression plus récente que `ts` détruirait l'objet du calque à une fusion
  // (export complet → « Fusion de calques » ou import ZIP du Générateur) : la trace est posée à `ts - 1`, assez
  // tard pour retirer la copie de session des autres appareils (modifiée au plus tard avant l'assistant), assez
  // tôt pour que le fichier gagne toute fusion. Un objet modifié depuis (`updatedAt` ≥ ts) est GARDÉ : sa
  // retouche n'est pas dans le fichier. Pas d'historique : la nouvelle version contient déjà les objets.
  // Seuls les objets sans marque de calque sont visés. → { ok:true, retires, gardes } ou { ok:false, code }.
  function retirerIntegres(uids, ts) {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) {
      return { ok: false, code: "lectureSeule" };
    }
    const T = Number(ts);
    if (!Number.isFinite(T) || T <= 1) return { ok: false, code: "dateInvalide" };
    const voulus = new Set((Array.isArray(uids) ? uids : []).filter(function (u) { return typeof u === "string" && u; }));
    const K = window.KtaUid;
    let retires = 0, gardes = 0;
    FAMILLES.forEach(function (fam) {
      const avant = _lire(fam);
      const apres = avant.filter(function (o) {
        if (!_estCandidat(o) || !voulus.has(o.uid)) return true;
        if ((Number(o.updatedAt) || 0) >= T) { gardes++; return true; }
        if (K && typeof K.tombstone === "function") K.tombstone(o.uid, T - 1);
        retires++;
        return false;
      });
      if (apres.length !== avant.length) _ecrire(fam, apres);
    });
    if (retires) _persister();
    _log(retires + " objet(s) integre(s) au plan retire(s) de la session, " + gardes + " garde(s) (modifie(s) depuis)");
    return { ok: true, retires: retires, gardes: gardes };
  }

  function _telecharger(obj, nom) {
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = nom;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {
      console.warn("[CalqueSession] telechargement impossible :", e);
    }
  }

  // ── Verrou d'affichage ──────────
  function _masquer(id) {
    const g = _groupe(id);
    try { if (g && window.map && window.map.hasLayer(g)) window.map.removeLayer(g); } catch (e) {}
  }
  function _afficher(id) {
    const g = _groupe(id);
    try { if (g && window.map && !window.map.hasLayer(g)) window.map.addLayer(g); } catch (e) {}
  }

  // Appelée APRÈS la restauration de session. ⚠️ Piège 2 : on ne masque QUE si la copie existe ; un verrou sans
  // copie donnerait un plan vide, on préfère déverrouiller et le dire.
  function appliquerVerrous() {
    const perdus = [];
    _rapatries.slice().forEach(function (id) {
      // Toutes les copies supprimées (leurs traces le disent) : le calque reste en modification, vide.
      if (compterCopie(id) > 0 || _aDesTraces(id)) {
        _masquer(id);
      } else {
        perdus.push(id);
        _rapatries = _rapatries.filter(function (x) { return x !== id; });
        _afficher(id);
      }
    });
    if (perdus.length) {
      console.warn("[CalqueSession] verrou leve sur " + perdus.join(", ") +
                   " : la copie de session est absente (quota depasse ?). " +
                   "Le calque d'origine est reaffiche — rien n'est perdu cote plan.");
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        try {
          window.OOMGuard.showToast(
            window.I18n.t("calque.verrou.perdu", { n: perdus.length }), "warn");
        } catch (e) {}
      }
    }
    _invaliderLectures();
    return { verrouilles: _rapatries.slice(), liberes: perdus };
  }

  // ── Import d'une session, objets reçus d'une synchro : la liste se DÉDUIT des marques ──────────
  // 🩸 Un fichier de session ou une synchro emporte les objets marqués, PAS `_rapatries` (sauvegarde locale
  // seulement). Sans ce recalage : sur un autre appareil, le calque d'origine se réaffiche PAR-DESSUS sa copie,
  // « Exporter » refuse (`pasRapatrie`) et « rapatrier » est reproposé (doublons) ; une session importée SANS la
  // copie d'un calque verrouillé le laisse masqué et vide (piège 2). Appelée par l'import de session et par
  // KtaExtensions.appliquerChangements.
  // Reconstruire depuis les marques = une seule source de vérité, et les sessions déjà exportées marchent.
  // La marque d'un calque ABSENT du plan ouvert est retirée : l'objet devient « créé à la main », compté dans
  // l'alerte d'export au lieu de rester orphelin.
  function resynchroniser() {
    const pc = window.PLAN_CONFIG;
    if (!pc) return null;
    const connus = {};
    (Array.isArray(pc.dataLayers) ? pc.dataLayers : []).forEach(function (d) {
      if (d && d.id) connus[d.id] = true;
    });

    const presents = [];
    let orphelins = 0;
    FAMILLES.forEach(function (fam) {
      _lire(fam).forEach(function (o) {
        if (!o || o[CLE_SOURCE] === undefined) return;
        const id = o[CLE_SOURCE];
        if (connus[id]) {
          if (presents.indexOf(id) < 0) presents.push(id);
        } else {
          delete o[CLE_SOURCE];   // mutation en place : l'objet EST celui de la session
          delete o[CLE_DEPUIS];
          delete o[CLE_AJOUT];
          orphelins++;
        }
      });
    });

    // Calque en modification dont toutes les copies ont été supprimées : ses traces de copie le gardent (sinon
    // l'original reviendrait chez tous, suppression défaite à l'écran).
    _rapatries.forEach(function (id) { if (connus[id] && presents.indexOf(id) < 0 && _aDesTraces(id)) presents.push(id); });
    const liberes = _rapatries.filter(function (id) { return presents.indexOf(id) < 0; });
    liberes.forEach(_afficher);
    _rapatries = presents;
    presents.forEach(_masquer);
    _persister();
    _log("resynchronisation — en modification : [" + presents.join(", ") +
         "], liberes : [" + liberes.join(", ") + "], marques orphelines retirees : " + orphelins);
    return { rapatries: presents.slice(), liberes: liberes, orphelins: orphelins };
  }

  // ── Persistance (hooks SessionPersist, comme LegendCustomization) ──────────
  // ⚠️ État LOCAL (sauvegarde de session de l'appareil) : un fichier de session n'emporte ni la liste ni les
  // restitutions (sessionExporter.js ne lit pas getSessionState).
  function getSessionState() {
    const st = {};
    if (_rapatries.length) st.rapatries = _rapatries.slice();
    if (Object.keys(_restitutions).length) st.restitutions = Object.assign({}, _restitutions);
    if (Object.keys(_aEnvoyer).length) st.aEnvoyer = JSON.parse(JSON.stringify(_aEnvoyer));
    return Object.keys(st).length ? st : null;
  }

  function loadSessionState(st) {
    const o = (st && typeof st === "object") ? st : {};
    const src = Array.isArray(o.rapatries) ? o.rapatries : [];
    _rapatries = src.filter(function (x) { return typeof x === "string" && x; });
    _restitutions = {};
    _aEnvoyer = {};
    const okId = function (k) { return typeof k === "string" && k && k.length <= MAX_ID; };
    const okT = function (T) { return typeof T === "number" && Number.isFinite(T) && T > 0; };
    if (o.restitutions && typeof o.restitutions === "object") {
      Object.keys(o.restitutions).forEach(function (k) {
        if (okId(k) && okT(o.restitutions[k])) _restitutions[k] = o.restitutions[k];
      });
    }
    if (o.aEnvoyer && typeof o.aEnvoyer === "object") {
      Object.keys(o.aEnvoyer).forEach(function (k) {
        const r = o.aEnvoyer[k];
        if (!okId(k) || !r || !okT(r.avant) || !Array.isArray(r.uids)) return;
        _aEnvoyer[k] = { avant: r.avant, uids: r.uids.filter(function (u) { return typeof u === "string" && u; }) };
      });
    }
  }

  // Le verrou change ce que lisent getAllEmbedded* (utils.js > ktaCalquesEnModification) : les caches bâtis sur ces
  // lectures (graphe de navigation, modèle de galerie de la vue 3D) se refont, et une vue ouverte est prévenue
  // (utils.js > ktaSignalerDonneesPlan).
  function _invaliderLectures() {
    if (typeof window.ktaSignalerDonneesPlan === "function") window.ktaSignalerDonneesPlan("calques");
    try { if (window.RoadGraph && typeof window.RoadGraph.invalidate === "function") window.RoadGraph.invalidate(); } catch (e) {}
    try { if (window.KtaGalerie && typeof window.KtaGalerie.invalider === "function") window.KtaGalerie.invalider(); } catch (e) {}
  }

  function _persister() {
    _invaliderLectures();
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch (e) {}
    }
    // Le panneau de filtres porte les cases des calques : il reflète le verrou tout de suite.
    if (window.FilterPanel && typeof window.FilterPanel.refresh === "function") {
      try { window.FilterPanel.refresh(); } catch (e) {}
    }
  }

  return {
    CLE_SOURCE:             CLE_SOURCE,
    CLE_DEPUIS:             CLE_DEPUIS,
    CLE_AJOUT:              CLE_AJOUT,
    estRapatrie:            estRapatrie,
    listeRapatries:         listeRapatries,
    compterCopie:           compterCopie,
    peser:                  peser,
    occupationLocalStorage: occupationLocalStorage,
    rapatrier:              rapatrier,
    restituer:              restituer,
    exporterCalque:         exporterCalque,
    contenuCalque:          contenuCalque,
    retirerIntegres:        retirerIntegres,
    resynchroniser:         resynchroniser,
    restitutionPartagee:    _restitutionPartagee,
    libelle:                libelle,
    restitutionsDepuis:     restitutionsDepuis,
    appliquerRestitutions:  appliquerRestitutions,
    calqueDesTraces:        calqueDesTraces,
    appliquerVerrous:       appliquerVerrous,
    candidatsAjout:         candidatsAjout,
    compterAjouts:          compterAjouts,
    integrerAjouts:         integrerAjouts,
    getSessionState:        getSessionState,
    loadSessionState:       loadSessionState
  };
})();

console.log("[CalqueSession] Module charge — API window.CalqueSession prete");
