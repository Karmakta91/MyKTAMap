/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// selectionZone.js — sélection par zone dessinée et suppression en lot (sélection multiple 🎯)
// =====================================================================
// La zone se dessine avec l'outil ♦️ Surface (measure.js) : la mesure en cours est mise de côté, la zone tracée
// à sa place, puis la mesure est rendue telle quelle (commencer / terminer / abandonner).
// ⚠️ « Dans la zone » = ENTIÈREMENT dedans : tous les sommets (ou le point lui-même). Un objet à cheval n'est ni
//   pris ni coupé (décision produit). Niveau ACTIF seulement (APP_CONFIG.activeLevel ; plan à un niveau : tout).
// Exclus : itinéraire calculé, jonctions entre niveaux (tracé `jonction`, zone `pente`, POI jonction), aperçus,
//   mesures (elles ne sont pas des objets). Objets de calque : jamais touchés, seulement COMPTÉS (le calque passe
//   d'abord en « 🔄 Modifier » : ses copies sont alors en session et se suppriment comme le reste).
// 🩸 Suppression = UN instantané, UNE entrée ⏪, une écriture par famille : HistoryManager.record pose les traces
//   de suppression (KtaUid) par diff des uid, comme pour une suppression unitaire (copie de calque : trace de copie,
//   jamais dans un fichier, cf. historyManager.js > _tracer).
// 🩸 Photos d'un point supprimé : gardées, « sans point » (comme supprimerPointEditor) ; ⏪ rend le point et son uid,
//   donc ses photos. Points portails (liaison vers un autre plan) : gardés, la purge des liaisons ne s'annule pas.
// Expose : window.KtaSelectionZone = { dansZone, commencer, enCours, nbSommets, retirerSommet, terminer,
//   abandonner, preparer, supprimerLot, confirmerEtSupprimer, FAMILLES }.
// Garde-fou : scripts/check-selection-multi.js · checkup : scripts/smoke/checkup-suppr-zone.js
(function () {
  "use strict";

  const FAMILLES = ["editorPoints", "roads", "zones", "structures"];
  const GET = { editorPoints: "getEditorPoints", roads: "getRoads", zones: "getZones", structures: "getStructures" };
  const SET = { editorPoints: "setEditorPoints", roads: "setRoads", zones: "setZones", structures: "setStructures" };
  // `pente` (zone jonction) : traitée comme le tracé jonction (décision produit).
  const EXCLUS = { itinerary: true, jonction: true, pente: true };

  function _t(k, p) {
    return (window.I18n && window.I18n.t) ? window.I18n.t(k, p) : k;
  }
  function _esc(s) { return window.ktaEsc(s); }
  function _lire(famille) {
    const g = GET[famille];
    return (g && typeof window[g] === "function") ? (window[g]() || []) : [];
  }

  // ── Géométrie ────────────────────────────────────────
  function _dedans(p, poly) {
    return typeof window.ktaPointInPolygon === "function" && window.ktaPointInPolygon(p, poly);
  }
  function _boite(poly) {
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    poly.forEach(function (p) {
      if (p.x < b.x0) b.x0 = p.x; if (p.x > b.x1) b.x1 = p.x;
      if (p.y < b.y0) b.y0 = p.y; if (p.y > b.y1) b.y1 = p.y;
    });
    return b;
  }
  // La boîte écarte vite les objets lointains (relevé SIG de 20 000 objets) avant le ray-casting.
  function _toutDedans(points, poly, b) {
    if (!Array.isArray(points) || !points.length) return false;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) return false;
      if (!_dedans(p, poly)) return false;
    }
    return true;
  }

  // Niveau actif, ou null sur un plan à un niveau (tout compte).
  function _niveauActif() {
    const c = window.APP_CONFIG || {};
    if (c.multiLevel !== true) return null;
    return Number.isInteger(c.activeLevel) ? c.activeLevel : 0;
  }
  function _auNiveau(lvl, niveau) {
    return niveau === null || (Number.isInteger(lvl) ? lvl : 0) === niveau;
  }
  // Zone sur plusieurs niveaux : au niveau si c'est l'un des siens (poiJonction.js > ktaNiveauxObjet).
  function _zoneAuNiveau(z, niveau) {
    if (niveau === null || typeof window.ktaNiveauxObjet !== "function") return _auNiveau(z.level, niveau);
    return window.ktaNiveauxObjet(z).indexOf(niveau) >= 0;
  }

  function _estPoiJonction(p) {
    const J = window.KtaPoiJonction;
    try { return !!(J && typeof J.estJonction === "function" && J.estJonction(p)); } catch (e) { return false; }
  }
  function _calqueRapatrie(id) {
    const CS = window.CalqueSession;
    try { return !!(id && CS && typeof CS.estRapatrie === "function" && CS.estRapatrie(id)); } catch (e) { return false; }
  }

  // Objets de session entièrement dans `poly` (coordonnées plan), au niveau actif, et objets de calque qui le
  // seraient (jamais touchés : rendus pour être comptés, sans doublon d'une zone à l'autre).
  // → { items: [{ famille, obj }], calque: [{ famille, ref }] } (`ref` = marqueur ou entrée du registre du calque).
  function dansZone(poly) {
    const res = { items: [], calque: [] };
    if (!Array.isArray(poly) || poly.length < 3) return res;
    const b = _boite(poly), niveau = _niveauActif();
    FAMILLES.forEach(function (famille) {
      _lire(famille).forEach(function (obj) {
        if (!obj || obj._preview || EXCLUS[obj.type]) return;
        if (!(famille === "zones" ? _zoneAuNiveau(obj, niveau) : _auNiveau(obj.level, niveau))) return;
        if (famille === "editorPoints") {
          if (_estPoiJonction(obj) || !_toutDedans([obj], poly, b)) return;
        } else if (!_toutDedans(obj.points, poly, b)) {
          return;
        }
        res.items.push({ famille: famille, obj: obj });
      });
    });
    // Calques de données (lecture seule). Un calque en « Modifier » est en session : pas compté deux fois.
    (Array.isArray(window._ktaDataMarkers) ? window._ktaDataMarkers : []).forEach(function (m) {
      if (!m || typeof m.getLatLng !== "function" || _calqueRapatrie(m._ktaLayerId)) return;
      if (Array.isArray(m._ktaNiveaux) || !_auNiveau(m._ktaLevel, niveau)) return;
      const ll = m.getLatLng(), H = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
      if (_toutDedans([{ x: ll.lng, y: H - ll.lat }], poly, b)) res.calque.push({ famille: "editorPoints", ref: m });
    });
    [["roads", window._ktaDataPolylines], ["zones", window._ktaDataPolygons],
     ["structures", window._ktaDataStructurePolygons]].forEach(function (c) {
      (Array.isArray(c[1]) ? c[1] : []).forEach(function (e) {
        // Les ronds d'extrémité de jonction n'ont pas de `points` : écartés avec les jonctions.
        if (!e || !Array.isArray(e.points) || EXCLUS[e.type] || _calqueRapatrie(e.layerId)) return;
        if (!(c[0] === "zones" ? _zoneAuNiveau(e, niveau) : _auNiveau(e.level, niveau))) return;
        if (!_toutDedans(e.points, poly, b)) return;
        res.calque.push({ famille: c[0], ref: e });
      });
    });
    return res;
  }

  // ── Dessin de la zone : l'outil ♦️ Surface, mesure en cours mise de côté ──
  let _garde = null;   // { points, mode } de la mesure Surface d'avant

  function commencer() {
    if (_garde || typeof window.getMeasurePointsSurface !== "function" ||
        typeof window.setMeasurePointsSurface !== "function" || typeof window.setMeasureMode !== "function") {
      return false;
    }
    // Un mode de dessin armé recevrait les mêmes clics (sommet de tracé posé sous la zone).
    if (typeof window._desactiverTousLesModes === "function") {
      try { window._desactiverTousLesModes(); } catch (e) {}
    }
    _garde = {
      points: (window.getMeasurePointsSurface() || []).slice(),
      mode: (typeof window.getMeasureMode === "function") ? window.getMeasureMode() : "distance"
    };
    window.setMeasurePointsSurface([]);
    window.setMeasureMode("surface");
    window.modeMesure = true;
    return true;
  }
  function enCours() { return !!_garde; }
  function nbSommets() {
    return (_garde && typeof window.getMeasurePointsSurface === "function")
      ? (window.getMeasurePointsSurface() || []).length : 0;
  }
  function retirerSommet() {
    if (_garde && typeof window.removeLastMeasurePoint === "function") window.removeLastMeasurePoint();
  }
  function _rendre() {
    const g = _garde;
    _garde = null;
    window.modeMesure = false;
    window.setMeasurePointsSurface(g.points);
    window.setMeasureMode(g.mode);
  }
  // → contour tracé (copie) ou null (moins de 3 sommets) ; la mesure d'avant est rendue dans les deux cas.
  function terminer() {
    if (!_garde) return null;
    const pts = (window.getMeasurePointsSurface() || []).map(function (p) { return { x: p.x, y: p.y }; });
    _rendre();
    return pts.length >= 3 ? pts : null;
  }
  function abandonner() {
    if (_garde) _rendre();
  }

  // ── Suppression ──────────────────────────────────────
  function _planId() { return window._currentLoadedPlanId || null; }

  function _estPortail(p) {
    const IPL = window.InterPlanLinks;
    if (!p || !IPL || typeof IPL.getLinksForPoint !== "function" || !_planId()) return false;
    try { return IPL.getLinksForPoint(_planId(), p).length > 0; } catch (e) { return false; }
  }

  // Lot → { parFamille: { famille: [obj] }, portails } (portails gardés, exclus déjà écartés).
  function preparer(items) {
    const out = { parFamille: { editorPoints: [], roads: [], zones: [], structures: [] }, portails: 0 };
    (items || []).forEach(function (it) {
      if (!it || !it.obj || !out.parFamille[it.famille] || it.obj._preview || EXCLUS[it.obj.type]) return;
      if (it.famille === "editorPoints" && _estPoiJonction(it.obj)) return;
      if (it.famille === "editorPoints" && _estPortail(it.obj)) { out.portails++; return; }
      out.parFamille[it.famille].push(it.obj);
    });
    return out;
  }

  // Position par référence, puis par uid (une synchro a pu remplacer l'objet par une copie de même uid).
  function _indexDe(liste, obj) {
    const i = liste.indexOf(obj);
    if (i >= 0 || !obj || typeof obj.uid !== "string" || !obj.uid) return i;
    return liste.findIndex(function (o) { return o && o.uid === obj.uid; });
  }

  // `parFamille` = { famille: [obj] } (familles décochées absentes ou vides). → { supprimes, echecs, parFamille }.
  // Listes lues d'un bloc AVANT toute écriture ; seules les familles touchées sont réécrites (un rendu chacune).
  function supprimerLot(parFamille) {
    const bilan = { supprimes: 0, echecs: 0, parFamille: { editorPoints: 0, roads: 0, zones: 0, structures: 0 } };
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return bilan;   // 🔒 lecture seule
    const avant = (window.HistoryManager && window.HistoryManager.captureState)
      ? window.HistoryManager.captureState() : null;
    const listes = {};
    FAMILLES.forEach(function (f) { listes[f] = _lire(f).slice(); });
    const retires = { editorPoints: [] };
    FAMILLES.forEach(function (f) {
      const objs = (parFamille && Array.isArray(parFamille[f])) ? parFamille[f] : [];
      if (!objs.length) return;
      if (typeof window[SET[f]] !== "function") { bilan.echecs += objs.length; return; }
      objs.forEach(function (o) {
        const i = _indexDe(listes[f], o);
        if (i < 0) { bilan.echecs++; return; }
        if (f === "editorPoints") retires.editorPoints.push(listes[f][i]);
        listes[f].splice(i, 1);
        bilan.parFamille[f]++;
        bilan.supprimes++;
      });
    });
    if (!bilan.supprimes) return bilan;   // rien écrit, rien à annuler
    // Fiche des photos figée à l'état du point AVANT sa disparition (Outils > Mes photos les retrouve).
    if (retires.editorPoints.length && _planId() && window.MyKTAMapPhotos &&
        typeof window.MyKTAMapPhotos.majFichesPoints === "function") {
      window.MyKTAMapPhotos.majFichesPoints(_planId(), retires.editorPoints);
    }
    FAMILLES.forEach(function (f) { if (bilan.parFamille[f]) window[SET[f]](listes[f]); });
    if (bilan.parFamille.roads && window.RoadGraph && typeof window.RoadGraph.invalidate === "function") {
      window.RoadGraph.invalidate();
    }
    if (window.HistoryManager && avant && window.HistoryManager.record) {
      window.HistoryManager.record(_t("selm.suppr.histoire", { n: bilan.supprimes }), avant);
    }
    if (window.SessionPersist && window.SessionPersist.save) window.SessionPersist.save();
    try { if (window.map && window.map.closePopup) window.map.closePopup(); } catch (e) {}
    return bilan;
  }

  // Photos des points du lot (par uid, ou par nom pour une photo rangée par nom). → Promise<number>.
  function _compterPhotos(points) {
    const P = window.MyKTAMapPhotos;
    if (!points.length || !_planId() || !P || typeof P.listerPlan !== "function") return Promise.resolve(0);
    const cles = new Set();
    points.forEach(function (p) {
      if (typeof p.uid === "string" && p.uid) cles.add(p.uid);
      if (p.id != null && String(p.id)) cles.add(String(p.id));
    });
    return Promise.resolve(P.listerPlan(_planId())).then(function (arr) {
      return (arr || []).filter(function (r) { return r && cles.has(String(r.pointId || "")); }).length;
    }).catch(function () { return 0; });
  }

  // Objets cochés, pour la prise suppressionLot : [{ famille, uid }].
  function _objetsCoches(pf, coches) {
    const out = [];
    FAMILLES.forEach(function (f) {
      if (!coches[f]) return;
      pf[f].forEach(function (o) { out.push({ famille: f, uid: typeof o.uid === "string" && o.uid ? o.uid : null }); });
    });
    return out;
  }
  function _cle(objets) {
    return objets.map(function (o) { return o.famille + ":" + (o.uid || "?"); }).sort().join("|");
  }

  // Une extension peut refuser la suppression du lot sur son plan (KtaExtensions.suppressionLot). → Promise<bool>
  // (true = permis). Refus : rien n'est supprimé, ktaAlerte dit pourquoi (message de l'extension, sinon générique).
  // Sans extension ou plan local : permis, sans attente.
  function _permis(objets) {
    const K = window.KtaExtensions;
    const v = (K && typeof K.suppressionLot === "function") ? K.suppressionLot(_planId(), objets) : null;
    if (!v) return Promise.resolve(true);
    return Promise.resolve(v).then(function (r) {
      if (r && r.permis === true) return true;
      if (typeof window.ktaAlerte === "function") {
        window.ktaAlerte((r && r.message) || _t("selm.suppr.refuseExtension"));
      }
      return false;
    });
  }

  // Confirmation : une case par famille avec son nombre, photos, portails gardés et objets de calque ignorés
  // annoncés ; le bouton dit combien partent. → Promise<bilan | null> (null = annulé, refusé ou rien à supprimer).
  // 🩸 Les cases vivent dans le message de ktaConfirm (HTML voulu) : lues par leur écouteur avant la fermeture.
  // `nCalque` = objets de calque vus dans la ou les zones (ignorés). `opts.familles` : familles cochées d'emblée
  // (les autres restent proposées, décochées) ; absent = toutes celles du lot.
  // 🔒 KtaExtensions.suppressionLot est consultée AVANT la fenêtre (objets cochés d'emblée), puis relue au clic si
  // les cases ont changé : un refus ne supprime rien.
  function confirmerEtSupprimer(items, nCalque, opts) {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return Promise.resolve(null);
    const prep = preparer(items);
    const pf = prep.parFamille;
    const total = function (coches) {
      return FAMILLES.reduce(function (s, f) { return s + (coches[f] ? pf[f].length : 0); }, 0);
    };
    if (!total({ editorPoints: 1, roads: 1, zones: 1, structures: 1 })) {
      if (typeof window.ktaAlerte === "function") {
        window.ktaAlerte(_t(prep.portails ? "selm.suppr.quePortails" : "selm.suppr.rien", { n: prep.portails }));
      }
      return Promise.resolve(null);
    }
    const familles = (opts && Array.isArray(opts.familles)) ? opts.familles : null;
    const coches = {};
    FAMILLES.forEach(function (f) { coches[f] = pf[f].length > 0 && (!familles || familles.indexOf(f) >= 0); });
    const objetsAvant = _objetsCoches(pf, coches);
    const verif = objetsAvant.length ? _permis(objetsAvant) : Promise.resolve(true);
    return verif.then(function (ok) {
      if (!ok) return null;
      return _compterPhotos(pf.editorPoints).then(function (photos) {
        return _fenetre(pf, prep, coches, total, photos, nCalque, _cle(objetsAvant));
      });
    });
  }

  function _fenetre(pf, prep, coches, total, photos, nCalque, cleAvant) {
    let cases = "";
    FAMILLES.forEach(function (f) {
      const n = pf[f].length;
      cases += '<label class="kta-selm-case"><input type="checkbox" data-kta-selm-fam="' + f + '"' +
        (coches[f] ? " checked" : "") + (n ? "" : " disabled") + '> ' +
        _esc(_t("selm.suppr.fam." + f, { n: n })) + '</label>';
    });
    const niveau = _niveauActif();
    const notes = [];
    if (niveau !== null) notes.push(_t("selm.suppr.niveau", { n: niveau > 0 ? "+" + niveau : String(niveau) }));
    if (photos) notes.push(_t("selm.suppr.photos", { n: photos }));
    if (prep.portails) notes.push(_t("selm.suppr.portails", { n: prep.portails }));
    if (nCalque) notes.push(_t("selm.suppr.calques", { n: nCalque }));
    notes.push(_t("selm.suppr.annuler"));
    const message = _esc(_t("selm.suppr.question")) +
      '<span class="kta-selm-cases">' + cases + '</span>' +
      notes.map(function (n) { return _esc(n); }).join("\n");
    const p = window.ktaConfirm(message, {
      titre: _esc(_t("selm.suppr.titre")),
      okLabel: _esc(_t("selm.suppr.ok", { n: total(coches) }))
    });
    // ktaConfirm a monté sa fenêtre de façon synchrone : on branche les cases de CETTE fenêtre.
    const ov = Array.prototype.slice.call(document.querySelectorAll(".kta-readme-modal-overlay")).filter(function (o) {
      return !!o.querySelector("[data-kta-selm-fam]");
    }).pop();
    if (ov) {
      const oui = ov.querySelector("#kta-confirm-oui");
      if (oui && !total(coches)) oui.disabled = true;
      ov.querySelectorAll("[data-kta-selm-fam]").forEach(function (cb) {
        cb.addEventListener("change", function () {
          coches[cb.getAttribute("data-kta-selm-fam")] = cb.checked;
          const n = total(coches);
          if (oui) { oui.textContent = _t("selm.suppr.ok", { n: n }); oui.disabled = n === 0; }
        });
      });
    }
    return p.then(function (oui) {
      if (!oui || !total(coches)) return null;
      const objets = _objetsCoches(pf, coches);
      const verif = _cle(objets) === cleAvant ? Promise.resolve(true) : _permis(objets);
      return verif.then(function (ok) {
        if (!ok) return null;
        const choisis = {};
        FAMILLES.forEach(function (f) { choisis[f] = coches[f] ? pf[f] : []; });
        const bilan = supprimerLot(choisis);
        if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(_t("selm.suppr.bilan", bilan), bilan.supprimes ? "success" : "warn");
        }
        return bilan;
      });
    });
  }

  window.KtaSelectionZone = {
    FAMILLES: FAMILLES,
    dansZone: dansZone,
    commencer: commencer,
    enCours: enCours,
    nbSommets: nbSommets,
    retirerSommet: retirerSommet,
    terminer: terminer,
    abandonner: abandonner,
    preparer: preparer,
    supprimerLot: supprimerLot,
    confirmerEtSupprimer: confirmerEtSupprimer
  };
})();
