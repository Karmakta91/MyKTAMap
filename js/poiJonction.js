/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// poiJonction.js — POI qui relie des niveaux (escalier, puits à échelons, puits sans échelon)
// =====================================================================
// Modèle : `niveaux` (entiers, ⊇ {level}) + `accroches` [{level, x, y}] = raccords VALIDÉS par l'utilisateur, un
// par galerie où le passage débouche. Point sans `niveaux` = son seul `level` (anciens plans inchangés).
// ⚠️ Tags « entre niveaux » jes / jpe / jps : JAMAIS une sortie de surface (check-poi-jonction.js). peo / eso
// peuvent aussi porter `niveaux` (puits de surface qui dessert des étages) et restent des sorties.
// L'itinéraire n'emprunte que les raccords validés (pathfinder.js > _injecterJonctionsPoi) ; la proposition se
// fait dans un rayon de 5 m (échelle du plan), 50 px sur un plan sans échelle.
// Expose window.KtaPoiJonction : modèle (niveaux, moyen, estJonction, pointsJonction, passeNiveaux), formulaire
// (htmlFormulaire, brancherFormulaire, appliquer), fiche (htmlFiche, brancherMarqueur), proposerRaccords.
// Doc : docs/architecture/multilevel-pathfinding.md §26.11.

(function () {
  "use strict";

  const TAGS_ENTRE_NIVEAUX = ["jes", "jpe", "jps"];
  // Accès de surface qui peuvent AUSSI desservir des niveaux : restent des sorties.
  const TAGS_SURFACE_NIVEAUX = ["peo", "eso"];
  // Moyen de passage (consigne de guidage, coût vertical) : escalier, échelle, corde.
  const MOYEN = { jes: "escalier", eso: "escalier", jpe: "echelons", peo: "echelons", jps: "corde" };
  // Coût vertical par niveau franchi quand les profondeurs ne sont pas saisies (décision produit).
  const FORFAIT_M = { escalier: 10, echelons: 20, corde: 20 };
  const RAYON_M = 5;
  const RAYON_PX_SANS_ECHELLE = 50;
  // Raccords proposés par niveau (galeries distinctes, la plus proche d'abord).
  const MAX_PAR_NIVEAU = 3;

  function _t(cle, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(cle, p) : cle;
  }
  function _esc(s) { return window.ktaEsc(s); }
  function _mlOn() { return !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true); }
  function _fmtNiv(n) {
    return (typeof window.ktaFormatNiveau === "function") ? window.ktaFormatNiveau(n) : String(n);
  }

  // ── Modèle ──────────
  function tagDe(p) { return (p && Array.isArray(p.tags) && p.tags[0]) ? String(p.tags[0]) : ""; }
  function porteNiveaux(tag) {
    return TAGS_ENTRE_NIVEAUX.indexOf(tag) >= 0 || TAGS_SURFACE_NIVEAUX.indexOf(tag) >= 0;
  }
  function moyen(tag) { return MOYEN[tag] || null; }
  function forfaitM(tag) { const m = MOYEN[tag]; return m ? FORFAIT_M[m] : 0; }

  // Niveaux du point, triés, sans doublon, `level` toujours inclus.
  function niveaux(p) {
    if (!p) return [0];
    const lvl = Number.isInteger(p.level) ? p.level : 0;
    const out = [lvl];
    (Array.isArray(p.niveaux) ? p.niveaux : []).forEach(function (n) {
      if (Number.isInteger(n) && out.indexOf(n) < 0) out.push(n);
    });
    return out.sort(function (a, b) { return a - b; });
  }

  // Jonction = tag qui porte des niveaux ET au moins deux niveaux, en plan multi-niveau.
  function estJonction(p) {
    return _mlOn() && porteNiveaux(tagDe(p)) && niveaux(p).length >= 2;
  }

  // Raccords validés des niveaux du point (un raccord d'un niveau décoché depuis est ignoré).
  function accroches(p) {
    const nv = niveaux(p);
    return (Array.isArray(p && p.accroches) ? p.accroches : []).filter(function (a) {
      return a && Number.isInteger(a.level) && nv.indexOf(a.level) >= 0 &&
             typeof a.x === "number" && typeof a.y === "number";
    });
  }

  // POI jonctions du plan ouvert : session + calques.
  function pointsJonction() {
    const out = [];
    function _ajout(arr) { (Array.isArray(arr) ? arr : []).forEach(function (p) { if (estJonction(p)) out.push(p); }); }
    try { if (typeof window.getEditorPoints === "function") _ajout(window.getEditorPoints()); } catch (e) {}
    try { if (typeof window.getAllEmbeddedPoints === "function") _ajout(window.getAllEmbeddedPoints()); } catch (e) {}
    return out;
  }

  // Filtre d'affichage : visible si un de ses niveaux est affiché (règle des jonctions en tracé).
  function passeNiveaux(liste, visibles) {
    if (!_mlOn()) return true;
    const v = Array.isArray(visibles) ? visibles : [0];
    return liste.some(function (n) { return v.indexOf(n) >= 0; });
  }

  // ── Proposition des raccords ──────────
  function rayon() {
    const e = window.APP_CONFIG && Number(window.APP_CONFIG.scale);
    return (e > 0) ? { px: RAYON_M * e, metres: true, m: RAYON_M }
                   : { px: RAYON_PX_SANS_ECHELLE, metres: false, m: null };
  }
  function _texteRayon(r) {
    return r.metres ? _t("poiJonction.rayonM", { m: r.m }) : _t("poiJonction.rayonPx", { px: Math.round(r.px) });
  }
  function _distTexte(px) {
    const e = window.APP_CONFIG && Number(window.APP_CONFIG.scale);
    if (!(e > 0)) return Math.round(px) + " px";
    return (typeof window.formatDistance === "function") ? window.formatDistance(px / e, 1)
      : (px / e).toFixed(1) + " m";
  }

  function _galeries() {
    const s = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    const e = (typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : [];
    return s.concat(e).filter(function (r) {
      return r && r.type !== "jonction" && r.type !== "itinerary" && !r._preview &&
             Array.isArray(r.points) && r.points.length >= 2;
    });
  }

  function _projeter(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    let t = l2 > 1e-9 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a.x + t * dx, y = a.y + t * dy;
    return { x: x, y: y, d: Math.hypot(p.x - x, p.y - y) };
  }

  // → { rayon, parNiveau: { "<n>": [{level, x, y, distPx}] } } : galeries de chaque niveau dans le rayon, la plus
  // proche d'abord, une proposition par galerie.
  function proposerRaccords(x, y, liste) {
    const r = rayon();
    const out = {};
    const galeries = _galeries();
    (liste || []).forEach(function (n) {
      const props = [];
      galeries.forEach(function (g) {
        if ((Number.isInteger(g.level) ? g.level : 0) !== n) return;
        let best = null;
        for (let i = 1; i < g.points.length; i++) {
          const pr = _projeter({ x: x, y: y }, g.points[i - 1], g.points[i]);
          if (!best || pr.d < best.d) best = pr;
        }
        if (best && best.d <= r.px) {
          props.push({ level: n, x: Math.round(best.x * 100) / 100, y: Math.round(best.y * 100) / 100,
                       distPx: best.d });
        }
      });
      props.sort(function (a, b) { return a.distPx - b.distPx; });
      out[String(n)] = props.slice(0, MAX_PAR_NIVEAU);
    });
    return { rayon: r, parNiveau: out };
  }

  // ── Formulaire du POI (editor.js > afficherFormulaire) ──────────
  // Bloc « Niveaux desservis » : cases des niveaux du plan, puis les raccords proposés (à valider) et validés.
  // Rendu vide hors multi-niveau ; masqué tant que le tag n'est pas un passage (jes / jpe / jps / peo / eso).
  function htmlFormulaire(tag) {
    if (!_mlOn()) return "";
    const cache = porteNiveaux(tag) ? "" : " hidden";
    return '<div class="kta-poi-jonction" id="kta-poi-jonction"' + cache + '>' +
             '<div class="kta-cfg-label">' + _esc(_t("poiJonction.titre")) + '</div>' +
             '<div class="kta-poi-jonction-niveaux" id="kta-poi-jonction-niveaux"></div>' +
             '<p class="kta-poi-jonction-aide">' + _esc(_t("poiJonction.aide")) + '</p>' +
             '<div class="kta-poi-jonction-rayon" id="kta-poi-jonction-rayon"></div>' +
             '<div class="kta-poi-jonction-raccords" id="kta-poi-jonction-raccords"></div>' +
           '</div>';
  }

  // `ctx` = { x, y, point|null, tag(): string, level(): entier } → { lire() : { applicable, niveaux, accroches } }.
  function brancherFormulaire(modal, ctx) {
    const bloc = modal.querySelector("#kta-poi-jonction");
    if (!bloc) return { lire: function () { return { applicable: false }; } };
    const zoneNiv = bloc.querySelector("#kta-poi-jonction-niveaux");
    const zoneRac = bloc.querySelector("#kta-poi-jonction-raccords");
    const zoneRay = bloc.querySelector("#kta-poi-jonction-rayon");
    const coches = new Set(ctx.point ? niveaux(ctx.point) : [ctx.level()]);
    // Raccords validés : clé "niveau|x|y" → raccord. Ceux du point au départ, puis ce que l'utilisateur coche.
    const valides = new Map();
    (ctx.point ? accroches(ctx.point) : []).forEach(function (a) { valides.set(_cle(a), a); });

    function _cle(a) { return a.level + "|" + Math.round(a.x) + "|" + Math.round(a.y); }

    function _rendreNiveaux() {
      const lvl = ctx.level();
      coches.add(lvl);
      const proposes = (typeof window.ktaNiveauxProposes === "function" && window.ktaNiveauxProposes(lvl)) || [lvl];
      coches.forEach(function (n) { if (proposes.indexOf(n) < 0) proposes.push(n); });
      proposes.sort(function (a, b) { return a - b; });
      zoneNiv.innerHTML = proposes.map(function (n) {
        // Le niveau du point est toujours desservi : sa case est cochée et figée.
        return '<label class="kta-poi-jonction-niv"><input type="checkbox" data-niv="' + n + '"' +
               (coches.has(n) ? " checked" : "") + (n === lvl ? " disabled" : "") + '> ' +
               _esc(_t("niveauObjet.option", { n: _fmtNiv(n) })) + '</label>';
      }).join("");
    }

    function _rendreRaccords() {
      const liste = Array.from(coches).sort(function (a, b) { return a - b; });
      const prop = proposerRaccords(ctx.x, ctx.y, liste);
      zoneRay.textContent = _texteRayon(prop.rayon);
      if (liste.length < 2) {
        zoneRac.innerHTML = '<p class="kta-poi-jonction-alerte">' + _esc(_t("poiJonction.unNiveau")) + '</p>';
        return;
      }
      let html = "";
      liste.forEach(function (n) {
        const lignes = [];
        const vus = new Set();
        valides.forEach(function (a, k) {
          if (a.level !== n) return;
          vus.add(k);
          lignes.push({ a: a, coche: true, texte: _t("poiJonction.valide", { n: _fmtNiv(n) }) });
        });
        (prop.parNiveau[String(n)] || []).forEach(function (a) {
          if (vus.has(_cle(a))) return;
          lignes.push({ a: a, coche: false,
                        texte: _t("poiJonction.prop", { n: _fmtNiv(n), dist: _distTexte(a.distPx) }) });
        });
        if (!lignes.length) {
          html += '<p class="kta-poi-jonction-alerte">' +
                  _esc(_t("poiJonction.aucune", { n: _fmtNiv(n),
                    rayon: prop.rayon.metres ? prop.rayon.m + " m" : Math.round(prop.rayon.px) + " px" })) + '</p>';
          return;
        }
        lignes.forEach(function (l) {
          html += '<label class="kta-poi-jonction-raccord"><input type="checkbox" data-acc-niv="' + l.a.level +
                  '" data-acc-x="' + l.a.x + '" data-acc-y="' + l.a.y + '"' + (l.coche ? " checked" : "") + '> ' +
                  _esc(l.texte) + '</label>';
        });
      });
      zoneRac.innerHTML = html;
    }

    function _maj() {
      const ok = porteNiveaux(ctx.tag());
      if (ok) bloc.removeAttribute("hidden"); else bloc.setAttribute("hidden", "");
      if (!ok) return;
      _rendreNiveaux();
      _rendreRaccords();
    }

    zoneNiv.addEventListener("change", function (e) {
      const cb = e.target;
      if (!cb || !cb.dataset || cb.dataset.niv === undefined) return;
      const n = Number.parseInt(cb.dataset.niv, 10);
      if (cb.checked) coches.add(n); else coches.delete(n);
      _rendreRaccords();
    });
    zoneRac.addEventListener("change", function (e) {
      const cb = e.target;
      if (!cb || !cb.dataset || cb.dataset.accNiv === undefined) return;
      const a = { level: Number.parseInt(cb.dataset.accNiv, 10),
                  x: Number(cb.dataset.accX), y: Number(cb.dataset.accY) };
      if (cb.checked) valides.set(_cle(a), a); else valides.delete(_cle(a));
    });
    _maj();

    return {
      rafraichir: _maj,
      lire: function () {
        if (!porteNiveaux(ctx.tag())) return { applicable: true, niveaux: null, accroches: null };
        const lvl = ctx.level();
        coches.add(lvl);
        const liste = Array.from(coches).sort(function (a, b) { return a - b; });
        const acc = [];
        valides.forEach(function (a) {
          if (liste.indexOf(a.level) >= 0) acc.push({ level: a.level, x: a.x, y: a.y });
        });
        return { applicable: true, niveaux: liste, accroches: acc };
      }
    };
  }

  // Écrit le résultat du formulaire sur le point (mutation en place) ; true si quelque chose a changé.
  // Moins de deux niveaux, ou tag qui n'est plus un passage : les champs partent.
  function appliquer(point, lu) {
    if (!point || !lu || !lu.applicable) return false;
    const avant = JSON.stringify([point.niveaux, point.accroches]);
    if (lu.niveaux && lu.niveaux.length >= 2) {
      point.niveaux = lu.niveaux.slice();
      point.accroches = (lu.accroches || []).slice();
    } else {
      delete point.niveaux;
      delete point.accroches;
    }
    return JSON.stringify([point.niveaux, point.accroches]) !== avant;
  }

  // ── Fiche (popup) ──────────
  function htmlFiche(point) {
    if (!estJonction(point)) return "";
    const nv = niveaux(point).map(_fmtNiv).join(" · ");
    const n = accroches(point).length;
    const rac = n === 0 ? _t("poiJonction.fiche.raccords0")
              : n === 1 ? _t("poiJonction.fiche.raccords1") : _t("poiJonction.fiche.raccordsN", { n: n });
    let html = '<div class="kta-popup-jonction">' + _esc(_t("poiJonction.fiche.niveaux", { liste: nv })) +
               ' — <span class="' + (n === 0 ? "kta-tx-warn" : "") + '">' + _esc(rac) + '</span>';
    if (moyen(tagDe(point)) === "corde") html += '<br>' + _esc(_t("poiJonction.fiche.corde"));
    return html + '</div>';
  }

  // Raccords dessinés seulement pendant que la fiche du point est ouverte (décision produit).
  let _calque = null;
  function masquerRaccords() {
    if (_calque) { try { _calque.remove(); } catch (e) {} }
    _calque = null;
  }
  function afficherRaccords(point) {
    masquerRaccords();
    if (!window.map || typeof L === "undefined" || !estJonction(point)) return;
    const acc = accroches(point);
    if (!acc.length) return;
    const st = (typeof window.ktaResolveStyle === "function")
      ? (window.ktaResolveStyle("roads", "jonction") || {}) : {};
    _calque = L.layerGroup();
    acc.forEach(function (a) {
      L.polyline([window.convertCoord(point.x, point.y), window.convertCoord(a.x, a.y)], {
        color: st.color, weight: 3, opacity: 1, dashArray: "4 4", interactive: false
      }).addTo(_calque);
      L.circleMarker(window.convertCoord(a.x, a.y), {
        radius: 5, color: st.color, weight: 2, fillColor: st.color, fillOpacity: 1, interactive: false
      }).addTo(_calque);
    });
    _calque.addTo(window.map);
  }
  function brancherMarqueur(marker, point) {
    if (!marker || typeof marker.on !== "function") return;
    marker.on("popupopen", function () { afficherRaccords(point); });
    marker.on("popupclose", masquerRaccords);
  }

  window.KtaPoiJonction = {
    TAGS_ENTRE_NIVEAUX: TAGS_ENTRE_NIVEAUX.slice(),
    TAGS_SURFACE_NIVEAUX: TAGS_SURFACE_NIVEAUX.slice(),
    porteNiveaux: porteNiveaux,
    moyen: moyen,
    forfaitM: forfaitM,
    niveaux: niveaux,
    accroches: accroches,
    estJonction: estJonction,
    pointsJonction: pointsJonction,
    passeNiveaux: passeNiveaux,
    rayon: rayon,
    proposerRaccords: proposerRaccords,
    htmlFormulaire: htmlFormulaire,
    brancherFormulaire: brancherFormulaire,
    appliquer: appliquer,
    htmlFiche: htmlFiche,
    afficherRaccords: afficherRaccords,
    masquerRaccords: masquerRaccords,
    brancherMarqueur: brancherMarqueur
  };
})();
