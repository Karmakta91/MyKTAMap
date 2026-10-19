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
// la restitution inverse tout.
// 🩸 Deux pièges :
//   1. « Effacer la session » doit RENDRE le calque : copie et verrou tombent ensemble, sinon plan vide.
//   2. Au chargement, le verrou ne s'applique QUE SI la copie est là (sauvegarde ratée sur quota → plan vide
//      sans explication) : appliquerVerrous() vérifie AVANT de masquer, et déverrouille en le disant.
// 🩸 Plan d'extension (☁️) : la restitution se PARTAGE sans trace de suppression (une trace sur l'uid d'une copie,
//   exportée puis fusionnée, détruirait l'objet du calque). Un enregistrement par calque « restitué à T »
//   (restitutionsDepuis → synchro sortante ; appliquerRestitutions ← synchro entrante), gardé dans l'état LOCAL
//   de la session (jamais dans un fichier de session ni de calque). Règle : docs/architecture/session-data.md.
// API : window.CalqueSession = { estRapatrie, listeRapatries, peser, occupationLocalStorage, rapatrier, restituer,
//   exporterCalque, compterCopie, appliquerVerrous, resynchroniser (import de session, synchro), getSessionState,
//   loadSessionState, restitutionPartagee, libelle, restitutionsDepuis, appliquerRestitutions, CLE_SOURCE,
//   CLE_DEPUIS }
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
  // Rend une promesse : { ok:true, stats, total } ou { ok:false, code }. Le `fetch` est celui du chargement du plan
  // (aucune surface réseau nouvelle) et la donnée est FRAÎCHE (pas de cache mémoire qui aurait dérivé).
  function rapatrier(id) {
    if (!id) return Promise.resolve({ ok: false, code: "idManquant" });
    if (estRapatrie(id)) return Promise.resolve({ ok: false, code: "dejaRapatrie" });
    const lc = _cfgCalque(id);
    if (!lc || !lc.file) return Promise.resolve({ ok: false, code: "calqueInconnu" });

    return fetch(lc.file)
      .then(function (r) { return r.json(); })
      .then(function (json) {
        const stats = { editorPoints: 0, roads: 0, zones: 0, structures: 0 };
        FAMILLES.forEach(function (fam) {
          const src = _depuisCalque(json, fam);
          if (!src.length) return;
          // Copie DÉFENSIVE : l'objet du calque n'est pas muté et l'objet de session ne partage aucune référence.
          // 🩸 `updatedAt` = maintenant (horloge de synchro, pas `date_update` qui reste la date du relevé) : la
          // copie garde l'uid de l'original et sa date de génération ; une synchro qui n'envoie que « ce qui a
          // changé depuis » n'en enverrait que les copies retouchées, et un autre appareil masquerait le calque
          // pour n'en montrer que quelques objets.
          const maintenant = Date.now();
          const copies = src.map(function (o) {
            const c = JSON.parse(JSON.stringify(o));
            c[CLE_SOURCE] = id;
            c[CLE_DEPUIS] = maintenant;
            c.updatedAt = maintenant;
            return c;
          });
          _ecrire(fam, _lire(fam).concat(copies));   // les setters redessinent
          stats[fam.cle] = copies.length;
        });

        const total = stats.editorPoints + stats.roads + stats.zones + stats.structures;
        if (total === 0) return { ok: false, code: "calqueVide" };

        _rapatries.push(id);
        _masquer(id);
        _persister();
        _log("calque « " + id + " » rapatrie en session", stats);
        return { ok: true, stats: stats, total: total };
      })
      .catch(function (e) {
        console.warn("[CalqueSession] rapatriement echoue pour « " + id + " » :", e);
        return { ok: false, code: "lectureEchouee", detail: e && e.message };
      });
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
        if (typeof o.updatedAt === "number" && isFinite(o.updatedAt) && o.updatedAt > T) T = o.updatedAt;
        return false;
      });
      if (apres.length !== avant.length) {
        retires += (avant.length - apres.length);
        _ecrire(fam, apres);
      }
    });
    _rapatries = _rapatries.filter(function (x) { return x !== id; });
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
    const seuil = (typeof ts === "number" && isFinite(ts)) ? ts : 0;
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
      for (let i = 0; i < uid.length; i++) { x ^= uid.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
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
      if (!isFinite(T) || T <= 0) return;
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
        c.uid = _uidGarde(String(o.uid || ""), T);
        change = true;
        if (!deja.has(c.uid)) { gardes++; parCalque[L] = (parCalque[L] || 0) + 1; }
        poser(c);
      });
      if (change) _ecrire(fam, apres);
    });
    const change = retires > 0 || gardes > 0;
    if (change || nouvelle) _persister();
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
    return { retires: retires, gardes: gardes, change: change };
  }

  // ── Retour vers le ZIP : UN fichier de la forme de l'original ──────────
  // Le convertisseur session → calque existant éclate la sortie (points / roads / zones / structure.json) : bien
  // pour fabriquer un plan, inutilisable pour REMPLACER un calque. Dans « Modifier un plan », chaque calque est UNE
  // LIGNE (id + sélecteur de fichier) : y déposer ce fichier remplace son contenu, sans doublon possible.
  // 🩸 LES TABLEAUX VIDES SONT ÉCRITS, PAS OMIS : c'est un remplacement. Toutes les zones supprimées → `zones: []`,
  // sinon les anciennes reviennent au rechargement (suppression annulée en silence).
  // La marque `_srcCalque` est RETIRÉE (outil interne de session, rien à faire dans un ZIP partagé).
  function exporterCalque(id) {
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
    // `file` est RÉSOLU au chargement (parfois en `blob:`), son basename n'est pas fiable ; l'id est celui de la
    // ligne du Générateur.
    const nom = id + ".json";
    _telecharger(payload, nom);
    _log("calque « " + id + " » exporte vers " + nom + " (" + total + " objets)");
    return { ok: true, total: total, horsCalque: horsCalque, nom: nom, stats: payload };
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
      if (compterCopie(id) > 0) {
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
          orphelins++;
        }
      });
    });

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
    const okT = function (T) { return typeof T === "number" && isFinite(T) && T > 0; };
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

  function _persister() {
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
    estRapatrie:            estRapatrie,
    listeRapatries:         listeRapatries,
    compterCopie:           compterCopie,
    peser:                  peser,
    occupationLocalStorage: occupationLocalStorage,
    rapatrier:              rapatrier,
    restituer:              restituer,
    exporterCalque:         exporterCalque,
    resynchroniser:         resynchroniser,
    restitutionPartagee:    _restitutionPartagee,
    libelle:                libelle,
    restitutionsDepuis:     restitutionsDepuis,
    appliquerRestitutions:  appliquerRestitutions,
    appliquerVerrous:       appliquerVerrous,
    getSessionState:        getSessionState,
    loadSessionState:       loadSessionState
  };
})();

console.log("[CalqueSession] Module charge — API window.CalqueSession prete");
