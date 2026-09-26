/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// 🪧 GUIDAGE DE L'ITINÉRAIRE — consignes « dans X m, tourner à gauche »
// =========================
// Étude et décisions KARMA : docs/ETUDE_GUIDAGE.md (fait foi).
//
// Ce module transforme un itinéraire calculé (road `type === "itinerary"`)
// en CONSIGNES. Il ne calcule aucun chemin : il lit ce que le pathfinder a
// rendu — `points` (le trajet sur tracé), `carrefours` (nœuds du graphe posés
// sur le trajet, d'où partent au moins 3 directions) et `raccords` (le trajet
// à vol d'oiseau entre chaque étape et le tracé où elle s'accroche).
//
// Règles (cf l'étude, §« Logique quand annoncer ») :
//   • un croisement se dit, même pour aller tout droit ;
//   • un virage SANS croisement ne se dit que s'il est franc — le tracé ne
//     montre pas toutes les ouvertures réelles (chambre à piliers) ;
//   • l'angle se mesure sur une fenêtre de quelques mètres, pas au segment
//     voisin (le dessin à la main tremble) ;
//   • les événements trop proches fusionnent en un seul ;
//   • on parle TOUJOURS en mètres, jamais « la 3e à gauche ».
//
// API :
//   window.ItiGuidage.construire(road, opts) → plan de guidage | null
//       opts.scale (px/m) · opts.pois [{x,y,nom}] — sinon lus dans l'app
//   window.ItiGuidage.projeter(guide, p, sMin, sMax) → { s, dist, x, y }
//   window.ItiGuidage.texteAction(consigne) → libellé traduit de la manœuvre
//   window.ItiGuidage.longueurRaccordsPx(road) → px à vol d'oiseau à compter
//   window.ItiGuidage.alerteRaccord(road) → { distM, role, label } | null
//   window.ItiGuidage.ouvrirFeuilleDeRoute(road)
//
// Convention de cap : degrés, 0 = haut du plan, sens horaire (= tracking.js).
// Un écart positif entre cap de sortie et cap d'entrée = virage à DROITE.
// =========================

(function() {
  "use strict";

  const G = {};

  // ---- Seuils (mètres / degrés) — à caler sur des plans réels (étude §Inconnues)
  const FENETRE_M        = 4;    // angle mesuré sur 4 m avant et après
  const FUSION_M         = 6;    // événements à moins de 6 m → un seul (zigzag du dessin)
  // Virage SANS croisement : dit seulement s'il est franc. Calé sur un plan
  // réel (27/09/2026) : à 50°, 9 consignes sur 15 étaient des coudes du
  // dessin et des zigzags, sans aucun choix possible.
  const VIRAGE_MIN_DEG   = 60;
  const TOUT_DROIT_DEG   = 25;
  const LEGER_DEG        = 60;
  const DEMI_TOUR_DEG    = 135;
  const AMBIGU_DEG       = 35;   // deux sorties plus proches → « la branche de gauche »
  const REVERS_DEG       = 30;   // sortie = le chemin d'où l'on vient
  const REPERE_M         = 5;
  const CARREFOUR_TOL_PX = 3;
  const RACCORD_MIN_M    = 1;    // en dessous : pas de consigne « rejoindre le tracé »
  const RACCORD_ALERTE_M = 50;   // décision KARMA : au-delà, on avertit sans bloquer

  function _t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }

  function _echelle(opts) {
    if (opts && Number(opts.scale) > 0) return Number(opts.scale);
    const s = window.APP_CONFIG && Number(window.APP_CONFIG.scale);
    return (s > 0) ? s : 1;
  }

  function _norm180(d) { return ((d + 180) % 360 + 360) % 360 - 180; }

  function _cap(a, b) {
    const d = Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI;
    return (d + 360) % 360;
  }

  // ---- Géométrie du trajet (abscisse curviligne s, en px plan)
  function _preparer(points) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    }
    return { pts: points, cum: cum, total: cum[cum.length - 1] };
  }

  function _pointA(ch, s) {
    const pts = ch.pts, cum = ch.cum;
    if (s <= 0) return { x: pts[0].x, y: pts[0].y };
    if (s >= ch.total) return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const seg = cum[hi] - cum[lo];
    const t = seg > 0 ? (s - cum[lo]) / seg : 0;
    return { x: pts[lo].x + t * (pts[hi].x - pts[lo].x), y: pts[lo].y + t * (pts[hi].y - pts[lo].y) };
  }

  // Projection d'un point sur le trajet, éventuellement restreinte à [sMin, sMax].
  function _projeter(ch, p, sMin, sMax) {
    const pts = ch.pts, cum = ch.cum;
    const lo = (typeof sMin === "number") ? sMin : -Infinity;
    const hi = (typeof sMax === "number") ? sMax : Infinity;
    let best = null;
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] < lo || cum[i - 1] > hi) continue;
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      let t = l2 > 1e-9 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const x = a.x + t * dx, y = a.y + t * dy;
      const d = Math.hypot(p.x - x, p.y - y);
      if (!best || d < best.dist) best = { s: cum[i - 1] + t * (cum[i] - cum[i - 1]), dist: d, x: x, y: y };
    }
    return best;
  }

  function _capEntre(ch, s1, s2) {
    const a = Math.max(0, s1), b = Math.min(ch.total, s2);
    if (b - a < 0.5) return null;
    return _cap(_pointA(ch, a), _pointA(ch, b));
  }

  // ---- Points nommés servant de repères
  function _poisDeLApp() {
    const out = [];
    function _ajout(arr) {
      if (!Array.isArray(arr)) return;
      arr.forEach(function(p) {
        if (p && typeof p.x === "number" && typeof p.y === "number" && p.nom) {
          out.push({ x: p.x, y: p.y, nom: String(p.nom) });
        }
      });
    }
    try { if (typeof window.getEditorPoints === "function") _ajout(window.getEditorPoints()); } catch(e) {}
    try { if (typeof window.getAllEmbeddedPoints === "function") _ajout(window.getAllEmbeddedPoints()); } catch(e) {}
    return out;
  }

  function _repereProche(pois, p, rayonPx) {
    let best = null;
    for (let i = 0; i < pois.length; i++) {
      const d = Math.hypot(pois[i].x - p.x, pois[i].y - p.y);
      if (d <= rayonPx && (!best || d < best.d)) best = { d: d, nom: pois[i].nom };
    }
    return best ? best.nom : null;
  }

  function _sensNiveau(de, vers) {
    const zDe = (typeof window.getProfondeurNiveau === "function") ? window.getProfondeurNiveau(de) : null;
    const zVers = (typeof window.getProfondeurNiveau === "function") ? window.getProfondeurNiveau(vers) : null;
    // Profondeur = altitude relative (plus grand = plus haut), comme le numéro de niveau.
    if (zDe !== null && zVers !== null && zDe !== zVers) return zVers > zDe ? "monter" : "descendre";
    return vers > de ? "monter" : "descendre";
  }

  // =========================
  // CONSTRUCTION DES CONSIGNES
  // =========================
  function construire(road, opts) {
    opts = opts || {};
    if (!road || !Array.isArray(road.points) || road.points.length < 2) return null;
    const e = _echelle(opts);
    const ch = _preparer(road.points);
    const L = ch.total;
    const W = Math.max(3, FENETRE_M * e);
    const fusionPx = FUSION_M * e;

    function capIn(s)  { return _capEntre(ch, s - W, s); }
    function capOut(s) { return _capEntre(ch, s, s + W); }

    // 1) Candidats : croisements posés sur le trajet…
    const cands = [];
    (Array.isArray(road.carrefours) ? road.carrefours : []).forEach(function(c) {
      const pr = _projeter(ch, c);
      if (pr && pr.dist <= CARREFOUR_TOL_PX && pr.s > 0.5 && pr.s < L - 0.5) {
        cands.push({ s: pr.s, carrefour: c });
      }
    });
    // …et virages francs du dessin (maxima locaux, à une fenêtre près)
    const virages = [];
    for (let i = 1; i < road.points.length - 1; i++) {
      const s = ch.cum[i];
      const ci = capIn(s), co = capOut(s);
      if (ci === null || co === null) continue;
      const d = Math.abs(_norm180(co - ci));
      if (d >= VIRAGE_MIN_DEG) virages.push({ s: s, angle: d });
    }
    virages.forEach(function(v) {
      const dominant = virages.every(function(w) {
        return w === v || Math.abs(w.s - v.s) > W || w.angle < v.angle || (w.angle === v.angle && w.s > v.s);
      });
      if (dominant) cands.push({ s: v.s, virage: v.angle });
    });
    cands.sort(function(a, b) { return a.s - b.s; });

    // 2) Grappes : tout ce qui se suit à moins de FUSION_M ne fait qu'un
    const grappes = [];
    cands.forEach(function(c) {
      const g = grappes[grappes.length - 1];
      if (g && c.s - g[g.length - 1].s <= fusionPx) g.push(c);
      else grappes.push([c]);
    });

    const pois = Array.isArray(opts.pois) ? opts.pois : _poisDeLApp();
    const repPx = REPERE_M * e;
    const consignes = [];

    grappes.forEach(function(g) {
      const sIn = g[0].s, sOut = g[g.length - 1].s;
      const ci = capIn(sIn), co = capOut(sOut);
      if (ci === null || co === null) return;
      const delta = _norm180(co - ci);
      const abs = Math.abs(delta);
      const avecCarrefour = g.filter(function(c) { return c.carrefour; });
      if (!avecCarrefour.length && abs < VIRAGE_MIN_DEG) return;   // simple coude du dessin

      let rep = avecCarrefour.length ? avecCarrefour[0] : g.reduce(function(a, b) {
        return (b.virage || 0) > (a.virage || 0) ? b : a;
      });
      const pt = _pointA(ch, rep.s);
      const c = { s: rep.s, x: pt.x, y: pt.y, angle: Math.round(delta), carrefour: avecCarrefour.length > 0 };
      const cote = delta > 0 ? "droite" : "gauche";

      if (abs < TOUT_DROIT_DEG) {
        c.type = "toutDroit";
      } else if (abs > DEMI_TOUR_DEG) {
        c.type = "demiTour";
      } else {
        c.type = "virage";
        c.cote = cote;
        c.force = abs < LEGER_DEG ? "leger" : "franc";
      }

      // Ambiguïté : une autre sortie trop proche de celle qu'on prend
      if (c.carrefour && c.type !== "demiTour") {
        const sorties = (rep.carrefour.sorties || []).filter(function(sx) {
          return Math.abs(_norm180(sx - (ci + 180))) > REVERS_DEG;
        });
        if (sorties.length >= 2) {
          let choisie = sorties[0];
          sorties.forEach(function(sx) {
            if (Math.abs(_norm180(sx - co)) < Math.abs(_norm180(choisie - co))) choisie = sx;
          });
          const rivale = sorties.filter(function(sx) { return sx !== choisie; })
            .find(function(sx) { return Math.abs(_norm180(choisie - sx)) < AMBIGU_DEG; });
          if (rivale !== undefined) {
            c.type = "branche";
            c.cote = _norm180(choisie - rivale) > 0 ? "droite" : "gauche";
            delete c.force;
          }
        }
      }
      c.repere = _repereProche(pois, pt, repPx);
      consignes.push(c);
    });

    // 3) Changements de niveau (le trajet porte le niveau de chaque point)
    let dernier = null, sTransit = null;
    for (let i = 0; i < road.points.length; i++) {
      const lv = road.points[i].level;
      if (Number.isInteger(lv)) {
        if (dernier !== null && lv !== dernier) {
          const sN = (sTransit !== null) ? sTransit : ch.cum[i];
          const pt = _pointA(ch, sN);
          consignes.push({
            s: sN, x: pt.x, y: pt.y, type: "niveau", de: dernier, vers: lv,
            sens: _sensNiveau(dernier, lv), repere: _repereProche(pois, pt, repPx)
          });
        }
        dernier = lv;
        sTransit = null;
      } else if (sTransit === null) {
        sTransit = ch.cum[i];
      }
    }

    // 4) Étapes intermédiaires et arrivée
    const raccords = Array.isArray(road.raccords) ? road.raccords : [];
    raccords.forEach(function(r) {
      if (r.role !== "etape") return;
      const pr = _projeter(ch, r.vers);
      if (!pr) return;
      consignes.push({ s: pr.s, x: pr.x, y: pr.y, type: "etape", nom: r.label, raccordPx: r.distPx || 0 });
    });
    const rArr = raccords.find(function(r) { return r.role === "arrivee"; }) || null;
    const fin = _pointA(ch, L);
    consignes.push({ s: L, x: fin.x, y: fin.y, type: "arrivee",
                     nom: rArr ? rArr.label : null, raccordPx: rArr ? (rArr.distPx || 0) : 0,
                     de: rArr ? rArr.de : null });

    consignes.sort(function(a, b) { return a.s - b.s; });

    const rDep = raccords.find(function(r) { return r.role === "depart"; }) || null;
    return {
      ch: ch,
      echelle: e,
      longueurPx: L,
      consignes: consignes,
      depart: (rDep && (rDep.distPx || 0) / e >= RACCORD_MIN_M) ? rDep : null,
      alerteRaccord: alerteRaccord(road, e)
    };
  }

  // =========================
  // RACCORDS À VOL D'OISEAU (décision K : dessinés ET comptés)
  // =========================
  // Départ et arrivée : un aller simple. Étape intermédiaire hors tracé : il
  // faut y aller ET en revenir, donc deux fois.
  function longueurRaccordsPx(road) {
    if (!road || !Array.isArray(road.raccords)) return 0;
    return road.raccords.reduce(function(acc, r) {
      const d = Number(r && r.distPx) || 0;
      return acc + (r && r.role === "etape" ? 2 * d : d);
    }, 0);
  }

  function alerteRaccord(road, echelle) {
    if (!road || !Array.isArray(road.raccords)) return null;
    const e = echelle || _echelle();
    let pire = null;
    road.raccords.forEach(function(r) {
      const m = (Number(r && r.distPx) || 0) / e;
      if (m > RACCORD_ALERTE_M && (!pire || m > pire.distM)) pire = { distM: m, role: r.role, label: r.label };
    });
    return pire;
  }

  // =========================
  // TEXTES (traduits au rendu, jamais au chargement)
  // =========================
  function texteAction(c) {
    if (!c) return "";
    let txt;
    switch (c.type) {
      case "virage":
        txt = _t("guid.act." + (c.force === "leger" ? "leger" : "tourner") + (c.cote === "droite" ? "Droite" : "Gauche"));
        break;
      case "branche":   txt = _t(c.cote === "droite" ? "guid.act.brancheDroite" : "guid.act.brancheGauche"); break;
      case "toutDroit": txt = _t("guid.act.toutDroit"); break;
      case "demiTour":  txt = _t("guid.act.demiTour"); break;
      case "niveau":
        txt = _t(c.sens === "monter" ? "guid.act.monter" : "guid.act.descendre",
                 { niveau: _t("guid.niveau", { n: c.vers }) });
        break;
      case "etape":     txt = c.nom ? _t("guid.act.etapeNom", { nom: c.nom }) : _t("guid.act.etape"); break;
      case "arrivee":   txt = c.nom ? _t("guid.act.arriveeNom", { nom: c.nom }) : _t("guid.act.arrivee"); break;
      default:          txt = "";
    }
    if (c.repere && c.type !== "etape" && c.type !== "arrivee") txt += _t("guid.repere", { nom: c.repere });
    return txt;
  }

  // Les actions sont en minuscule : elles s'insèrent dans « Dans 40 m, … ».
  // Seules, elles prennent la majuscule.
  function _majuscule(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }

  function _fmtM(m) {
    return (typeof window.formatDistance === "function") ? window.formatDistance(m, 0) : Math.round(m) + " m";
  }

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // =========================
  // FEUILLE DE ROUTE (lot 1) — toutes les consignes, sans tracker
  // =========================
  function ouvrirFeuilleDeRoute(road) {
    const guide = construire(road);
    if (!guide) return;
    const e = guide.echelle;
    const ancien = document.getElementById("kta-guid-feuille");
    if (ancien) ancien.remove();

    const totalM = (guide.longueurPx + longueurRaccordsPx(road)) / e;
    let lignes = "";
    if (guide.alerteRaccord) {
      lignes += '<div class="kta-guid-alerte">⚠️ ' +
        _esc(_t("guid.alerte.raccordLoin", { dist: _fmtM(guide.alerteRaccord.distM) })) + '</div>';
    }
    let n = 0;
    if (guide.depart) {
      n++;
      lignes += _ligne(n, guide.depart.vers, _t("guid.feuille.rejoindre", { dist: _fmtM(guide.depart.distPx / e) }), "🪢");
    }
    let sPrec = 0;
    guide.consignes.forEach(function(c) {
      n++;
      const apres = (c.s - sPrec) / e;
      sPrec = c.s;
      let txt = texteAction(c);
      txt = (apres >= 1) ? _t("guid.feuille.apres", { dist: _fmtM(apres), action: txt }) : _majuscule(txt);
      if ((c.type === "arrivee" || c.type === "etape") && c.raccordPx / e >= RACCORD_MIN_M) {
        txt += _t("guid.feuille.puisRaccord", { dist: _fmtM(c.raccordPx / e) });
      }
      lignes += _ligne(n, c, txt, _icone(c));
    });

    const modal = document.createElement("div");
    modal.id = "kta-guid-feuille";
    modal.className = "kta-readme-modal-overlay kta-guid-feuille-overlay";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-guid-feuille-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _esc(_t("guid.feuille.titre")) + '</span>' +
          '<button class="kta-panneau-close" id="kta-guid-feuille-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p class="kta-guid-feuille-resume">' +
            _esc(_t("guid.feuille.resume", { dist: _fmtM(totalM), n: guide.consignes.length })) + '</p>' +
          '<ol class="kta-guid-feuille-liste">' + lignes + '</ol>' +
          '<p class="kta-guid-feuille-note">' + _esc(_t("guid.feuille.note")) + '</p>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);

    function fermer() { modal.remove(); }
    modal.querySelector("#kta-guid-feuille-close").addEventListener("click", fermer);
    modal.addEventListener("click", function(ev) {
      if (ev.target === modal) { fermer(); return; }
      const li = ev.target.closest && ev.target.closest(".kta-guid-feuille-ligne");
      if (!li || !window.map || typeof convertCoord !== "function") return;
      const x = parseFloat(li.dataset.x), y = parseFloat(li.dataset.y);
      if (!isFinite(x) || !isFinite(y)) return;
      // On montre l'endroit : la feuille ET la modale Itinéraire s'effacent.
      fermer();
      const iti = document.getElementById("kta-itinerary-modal");
      if (iti) iti.remove();
      window.map.setView(convertCoord(x, y), Math.max(window.map.getZoom(), 0), { animate: false });
    });
  }

  function _icone(c) {
    switch (c.type) {
      case "virage":    return c.cote === "droite" ? "↱" : "↰";
      case "branche":   return c.cote === "droite" ? "⤷" : "⤶";
      case "toutDroit": return "⬆";
      case "demiTour":  return "↶";
      case "niveau":    return c.sens === "monter" ? "⤴" : "⤵";
      case "etape":     return "📍";
      case "arrivee":   return "🏁";
      default:          return "•";
    }
  }

  function _ligne(n, p, texte, icone) {
    const coords = (p && typeof p.x === "number") ? ' data-x="' + p.x + '" data-y="' + p.y + '"' : "";
    return '<li class="kta-guid-feuille-ligne"' + coords + ' title="' + _esc(_t("guid.feuille.voir")) + '">' +
             '<span class="kta-guid-feuille-num">' + n + '</span>' +
             '<span class="kta-guid-feuille-icone">' + icone + '</span>' +
             '<span class="kta-guid-feuille-txt">' + _esc(texte) + '</span>' +
           '</li>';
  }

  // =========================
  // EXPORT
  // =========================
  G.construire           = construire;
  G.projeter             = function(guide, p, sMin, sMax) { return guide ? _projeter(guide.ch, p, sMin, sMax) : null; };
  G.pointA               = function(guide, s) { return guide ? _pointA(guide.ch, s) : null; };
  G.texteAction          = texteAction;
  G.icone                = _icone;
  G.majuscule            = _majuscule;
  G.longueurRaccordsPx   = longueurRaccordsPx;
  G.alerteRaccord        = alerteRaccord;
  G.ouvrirFeuilleDeRoute = ouvrirFeuilleDeRoute;
  G.RACCORD_ALERTE_M     = RACCORD_ALERTE_M;

  window.ItiGuidage = G;
  console.log("[ItiGuidage] Module chargé");
})();
