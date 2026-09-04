/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// 🔄 calqueSession.js — RAPATRIER UN CALQUE DE DONNEES DANS LA SESSION
// =====================================================================
// LE BESOIN (KARMA, 04/09/2026) : sur un releve de Bordeaux importe du SIG,
// corriger un front de taille en trace imposait HUIT etapes — passer par
// l'Editeur de donnees, exporter le calque en JSON, le convertir en session
// via l'ecran Conversion, masquer le calque a la main, reimporter le fichier
// en session, corriger, reconvertir, reinjecter dans le ZIP.
//
// 🩸 LA CAUSE N'EST PAS UN BOUTON MANQUANT, ELLE EST STRUCTURELLE :
//   « Un data layer est rendu UNE seule fois a l'import — on ne peut pas
//     re-render comme renderRoads/Structures » (utils.js, registre des ghosts)
// Les objets de SESSION ont `renderRoads()` / `renderZones()` /
// `renderStructures()`, qui reconstruisent le rendu depuis l'etat. Le calque,
// non. Tout ce detour existe donc pour amener la donnee la ou un re-render
// existe. `convertirObjet.js` l'assume dans son en-tete : « SESSION UNIQUEMENT ».
//
// 🎯 CE QUE CE MODULE FAIT, ET CE QU'IL NE REFAIT PAS : la transformation
// calque -> session existe DEJA (`sessionExporter.js > _exportConvData2Session`)
// et c'est un pur remappage — `roads` reste `roads`, `zones` reste `zones`.
// Rien a reinventer. Ce qui manquait, c'est de le faire EN PLACE, sans
// aller-retour par un fichier, et avec un verrou qui empeche le doublon.
//
// ⚖️ POURQUOI LE CALQUE ENTIER, ET PAS OBJET PAR OBJET (arbitrage KARMA) :
// le rapatriement par objet serait 5x moins lourd en session, mais il reporte
// la douleur sur la RECONSTRUCTION DU ZIP — il faudrait retirer les originaux
// un a un pour eviter les doublons. Or les roads et les zones N'ONT PAS D'ID
// (`data-formats.md` : snapshot brut `{type, points, label?, level?}`), donc
// il faudrait une cle derivee de la GEOMETRIE... que `tabledit.dedup` casserait
// en silence, puisqu'il retire les sommets identiques consecutifs.
// Le calque entier, lui, donne UNE SEULE SOURCE DE VERITE : la reconstruction
// devient « l'export de session REMPLACE le fichier du calque ». Pas d'ids,
// pas de dedoublonnage, pas de doublon possible — par construction.
//
// 💰 SON PRIX, MESURE (04/09, sur les extraits Gironde) : 225 octets par objet
// en format session. Un releve SIG de 5 000 objets pese donc ~1,1 Mo, quand
// `localStorage` plafonne vers 5 Mo POUR TOUT LE DOMAINE et que
// `SessionPersist` re-serialise la session ENTIERE a chaque sauvegarde. D'ou
// `peser()` et `occupationLocalStorage()` : on ANNONCE le cout avant, on ne le
// decouvre pas au QuotaExceededError.
//
// 🔒 LE VERROU (regle KARMA) : un calque rapatrie est INTERDIT D'AFFICHAGE,
// automatiquement. Deblocable en recochant sa case — on affiche alors
// volontairement les deux, pour comparer. Le retour inverse tout.
//
// 🩸 DEUX PIEGES QUE CE MODULE DOIT TENIR, ET QUI SE PAIENT CHER :
//   1. « Effacer la session » doit RENDRE le calque. Le verrou vit dans la
//      session ; si l'effacement emporte la copie mais laisse le verrou, le
//      releve disparait et le plan a l'air vide. Les deux tombent ensemble.
//   2. Au chargement, le verrou ne s'applique QUE SI la copie est reellement
//      la. Cas mortel : la sauvegarde a echoue sur quota (1,1 Mo, c'est
//      exactement le seuil), on recharge, le verrou masque le calque et la
//      copie manque -> plan vide sans explication. `appliquerVerrous()` verifie
//      donc la presence AVANT de masquer, et deverrouille en le disant.
//
// API : window.CalqueSession = {
//   estRapatrie, listeRapatries, peser, occupationLocalStorage,
//   rapatrier, restituer, compterCopie, appliquerVerrous,
//   getSessionState, loadSessionState, CLE_SOURCE
// };
// 100 % local, aucune surface reseau nouvelle (le `fetch` du calque est celui
// que `ajouterPointsDepuisJSON` fait deja au chargement du plan).
// =====================================================================

window.CalqueSession = (function () {
  "use strict";

  // Marqueur pose sur CHAQUE objet rapatrie. C'est lui qui rend le retour
  // possible (on sait quoi retirer) et l'export capable de declarer quel
  // calque il remplace. Prefixe `_` : convention du projet pour « interne ».
  const CLE_SOURCE = "_srcCalque";

  // Ids des calques rapatries. C'est TOUT l'etat persistant du module — le
  // reste (les objets) vit deja dans la session, et le verrou se deduit.
  let _rapatries = [];

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

  // Les quatre familles, avec leur accesseur de session. Les points se disent
  // `editorPoints` cote session et `data` cote calque : le decalage est
  // historique, on le traverse ici une fois pour toutes.
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

  // ── etat ──────────────────────────────────────────────────────────────
  function estRapatrie(id) { return _rapatries.indexOf(id) >= 0; }
  function listeRapatries() { return _rapatries.slice(); }

  // Combien d'objets de session viennent de ce calque. Sert au retour, et
  // surtout au garde-fou du chargement (piege 2 de l'en-tete).
  function compterCopie(id) {
    let n = 0;
    FAMILLES.forEach(function (fam) {
      _lire(fam).forEach(function (o) { if (o && o[CLE_SOURCE] === id) n++; });
    });
    return n;
  }

  // ── mesures : on annonce le cout AVANT, on ne le subit pas apres ───────
  function occupationLocalStorage() {
    let octets = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || "";
        // UTF-16 : 2 octets par unite de code. Approximation standard, et
        // volontairement PESSIMISTE — mieux vaut alerter trop tot que
        // decouvrir le QuotaExceededError une fois la session perdue.
        octets += (k.length + v.length) * 2;
      }
    } catch (e) { return null; }
    return octets;
  }

  function _octets(x) {
    try { return new Blob([JSON.stringify(x)]).size; }
    catch (e) { return JSON.stringify(x).length; }
  }

  // Poids qu'aurait le calque une fois en session. On mesure le VRAI JSON
  // plutot que d'appliquer les 225 o/objet releves le 04/09 : cette moyenne
  // vaut pour les releves Gironde, pas pour un calque de douze points.
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

  // ── rapatriement ──────────────────────────────────────────────────────
  // Retourne une promesse : { ok:true, stats, total } ou { ok:false, code }.
  // Le `fetch` est celui que `ajouterPointsDepuisJSON` fait deja au chargement
  // du plan — aucune surface reseau nouvelle, et la donnee est FRAICHE : on ne
  // recopie pas un cache memoire qui aurait pu deriver.
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
          // Copie DEFENSIVE : l'objet du calque ne doit pas etre mute, et
          // l'objet de session ne doit partager aucune reference avec lui.
          const copies = src.map(function (o) {
            const c = JSON.parse(JSON.stringify(o));
            c[CLE_SOURCE] = id;
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

  // ── retour ────────────────────────────────────────────────────────────
  // Retire de la session TOUT ce qui portait la marque de ce calque, leve le
  // verrou, remet le calque sur la carte. Les objets que l'utilisateur a
  // CREES depuis (sans la marque) ne sont pas touches.
  function restituer(id) {
    if (!estRapatrie(id)) return { ok: false, code: "pasRapatrie" };
    let retires = 0;
    FAMILLES.forEach(function (fam) {
      const avant = _lire(fam);
      const apres = avant.filter(function (o) { return !o || o[CLE_SOURCE] !== id; });
      if (apres.length !== avant.length) {
        retires += (avant.length - apres.length);
        _ecrire(fam, apres);
      }
    });
    _rapatries = _rapatries.filter(function (x) { return x !== id; });
    _afficher(id);
    _persister();
    _log("calque « " + id + " » restitue — " + retires + " objet(s) retire(s) de la session");
    return { ok: true, retires: retires };
  }

  // ── verrou d'affichage ────────────────────────────────────────────────
  function _masquer(id) {
    const g = _groupe(id);
    try { if (g && window.map && window.map.hasLayer(g)) window.map.removeLayer(g); } catch (e) {}
  }
  function _afficher(id) {
    const g = _groupe(id);
    try { if (g && window.map && !window.map.hasLayer(g)) window.map.addLayer(g); } catch (e) {}
  }

  // Appelee APRES la restauration de session (donc quand la copie est censee
  // etre la). ⚠️ Piege 2 de l'en-tete : on ne masque QUE si la copie existe.
  // Un verrou sans copie donnerait un plan vide sans explication — on prefere
  // deverrouiller et le dire.
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

  // ── persistance (hooks SessionPersist, patron de LegendCustomization) ──
  function getSessionState() {
    return _rapatries.length ? { rapatries: _rapatries.slice() } : null;
  }

  function loadSessionState(st) {
    const src = (st && typeof st === "object" && Array.isArray(st.rapatries)) ? st.rapatries : [];
    _rapatries = src.filter(function (x) { return typeof x === "string" && x; });
  }

  function _persister() {
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch (e) {}
    }
    // Le panneau de filtres porte les cases des calques : il doit refleter
    // le verrou tout de suite, pas au prochain rendu.
    if (window.FilterPanel && typeof window.FilterPanel.refresh === "function") {
      try { window.FilterPanel.refresh(); } catch (e) {}
    }
  }

  return {
    CLE_SOURCE:             CLE_SOURCE,
    estRapatrie:            estRapatrie,
    listeRapatries:         listeRapatries,
    compterCopie:           compterCopie,
    peser:                  peser,
    occupationLocalStorage: occupationLocalStorage,
    rapatrier:              rapatrier,
    restituer:              restituer,
    appliquerVerrous:       appliquerVerrous,
    getSessionState:        getSessionState,
    loadSessionState:       loadSessionState
  };
})();

console.log("[CalqueSession] Module charge — API window.CalqueSession prete");
