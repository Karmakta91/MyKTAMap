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
//   • un virage SANS croisement ne se dit pas : tant qu'il n'y a qu'un chemin,
//     suivre la galerie suffit (retour KARMA, catacombes, 27/09/2026) ;
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
//   window.ItiGuidage.onPosition(pos)   — appelé par tracking.js à chaque pas
//   window.ItiGuidage.rafraichir()      — recalcule l'affichage du bandeau
//   window.ItiGuidage.etat()            — { visible, mode, icone, picto, principal, sous, fleche, urgence }
//   window.ItiGuidage.getPref() / setPref("auto" | "jamais")
//   window.ItiGuidage.agir("recalculer" | "ici" | "ignorer") — boutons d'un écart
//
// Convention de cap : degrés, 0 = haut du plan, sens horaire (= tracking.js).
// Un écart positif entre cap de sortie et cap d'entrée = virage à DROITE.
// =========================

(function() {
  "use strict";

  const G = {};

  // ---- Seuils (mètres / degrés) — à caler sur des plans réels (étude §Inconnues)
  const FENETRE_M        = 4;    // angle mesuré sur 4 m avant et après
  // Croisements qui se suivent à ≤ 5 m l'un du précédent = UN carrefour (une
  // zone). Même valeur que pathfinder.js > ZONE_ECART_M, qui mesure les sorties
  // de la zone entière. KARMA : « 20 m c'est beaucoup trop, plutôt 5 ».
  const ZONE_ECART_M     = 5;
  const PICTO_MIN_SORTIES = 4;   // décision 2:a : schéma du carrefour à partir de 4 galeries
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
    const ecartPx = ZONE_ECART_M * e;

    function capIn(s)  { return _capEntre(ch, s - W, s); }
    function capOut(s) { return _capEntre(ch, s, s + W); }

    // 1) Candidats : les croisements posés sur le trajet, ET RIEN D'AUTRE.
    // 🩸 27/09/2026 (retour KARMA sur les catacombes) — les virages francs du
    // dessin SANS croisement étaient annoncés aussi (« le tracé ne montre pas
    // toutes les ouvertures »). Sur un réseau de galeries, c'est du bruit :
    // tant qu'il n'y a qu'un chemin, suivre la galerie suffit. Un virage ne se
    // dit donc qu'à un croisement, là où il y a un choix à faire.
    const cands = [];
    (Array.isArray(road.carrefours) ? road.carrefours : []).forEach(function(c) {
      const pr = _projeter(ch, c);
      if (pr && pr.dist <= CARREFOUR_TOL_PX && pr.s > 0.5 && pr.s < L - 0.5) {
        cands.push({ s: pr.s, carrefour: c });
      }
    });
    cands.sort(function(a, b) { return a.s - b.s; });

    // 2) Grappes = carrefours. De proche en proche : un croisement rejoint le
    // carrefour s'il est à ≤ ZONE_ECART_M du PRÉCÉDENT. Un grand carrefour est
    // une zone de plusieurs croisements (décision 1:a) ; une seule consigne la
    // couvre, mesurée de son entrée à sa sortie.
    // 🩸 L'ancien piège du chaînage (deux virages à gauche = « demi-tour ») ne
    // revient pas : seuls des croisements sont candidats désormais, et
    // « demi-tour » exige que le trajet se replie (`replie` plus bas).
    const grappes = [];
    cands.forEach(function(c) {
      const g = grappes[grappes.length - 1];
      if (g && c.s - g[g.length - 1].s <= ecartPx) g.push(c);
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
      // Consigne posée à l'ENTRÉE du carrefour (décision 4) : « maintenant »
      // tombe avant d'être dans la salle, pas en son milieu.
      const rep = g[0];
      const pt = _pointA(ch, rep.s);
      const c = { s: rep.s, x: pt.x, y: pt.y, angle: Math.round(delta), carrefour: true };
      // Sorties du carrefour ENTIER si le pathfinder a reconnu une zone
      // (comparée par position : après un rechargement, les membres portent
      // des copies, plus la même référence).
      const zoneMembre = g.map(function(x) { return x.carrefour.zone; }).find(Boolean) || null;
      const sortiesCarrefour = (zoneMembre && Array.isArray(zoneMembre.sorties)) ? zoneMembre.sorties
        : (rep.carrefour.sorties || []);
      const cote = delta > 0 ? "droite" : "gauche";

      // « Faire demi-tour » seulement si le trajet REVIENT SUR LUI-MÊME (une
      // fenêtre avant et une fenêtre après se superposent). Un virage en
      // épingle par une galerie de liaison a le même angle mais part ailleurs :
      // c'est un virage.
      const replie = Math.hypot(_pointA(ch, sIn - W).x - _pointA(ch, sOut + W).x,
                                _pointA(ch, sIn - W).y - _pointA(ch, sOut + W).y) < W * 0.5;
      if (abs < TOUT_DROIT_DEG) {
        c.type = "toutDroit";
      } else if (abs > DEMI_TOUR_DEG && replie) {
        c.type = "demiTour";
      } else {
        c.type = "virage";
        c.cote = cote;
        c.force = abs < LEGER_DEG ? "leger" : "franc";   // > 135° sans repli = virage franc aussi
      }

      // Ambiguïté : une autre sortie trop proche de celle qu'on prend
      if (c.carrefour && c.type !== "demiTour") {
        const sorties = sortiesCarrefour.filter(function(sx) {
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
      // Schéma du carrefour (décision 2:a) : les galeries en rayons, relatives
      // au sens de marche (0° = devant). Pas de comptage : on les montre.
      if (sortiesCarrefour.length >= PICTO_MIN_SORTIES && c.type !== "demiTour") {
        let choisie = sortiesCarrefour[0], arrivee = sortiesCarrefour[0];
        sortiesCarrefour.forEach(function(sx) {
          if (Math.abs(_norm180(sx - co)) < Math.abs(_norm180(choisie - co))) choisie = sx;
          if (Math.abs(_norm180(sx - (ci + 180))) < Math.abs(_norm180(arrivee - (ci + 180)))) arrivee = sx;
        });
        c.picto = {
          rayons:  sortiesCarrefour.map(function(sx) { return Math.round(_norm180(sx - ci)); }),
          choisie: Math.round(_norm180(choisie - ci)),
          arrivee: Math.round(_norm180(arrivee - ci))
        };
      }
      // Nom du lieu (décision 3:a) : un point nommé DANS le carrefour ouvre la
      // consigne (« À « Carrefour Raspail », tourner à gauche »). Le rayon suit
      // la zone : le point nommé d'un grand carrefour tombait à 8–19 m des
      // nœuds, hors des 5 m du repère ordinaire.
      const centre = zoneMembre || pt;
      c.lieu = _repereProche(pois, centre, (zoneMembre ? zoneMembre.r : 0) + repPx);
      c.repere = c.lieu ? null : _repereProche(pois, pt, repPx);
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
  // Le texte dépend du bout qui est loin (test terrain 30/09) : « vérifie ta position »
  // ne vaut que pour le DÉPART. Une étape posée loin des galeries (POI à 68 m d'une
  // galerie) accusait à tort la position de l'équipe, que l'app venait de poser.
  function texteAlerteRaccord(a) {
    if (!a) return "";
    const dist = _fmtM(a.distM);
    if (a.role === "depart") return _t("guid.alerte.raccordLoin", { dist: dist });
    return a.label ? _t("guid.alerte.raccordLoinEtape", { nom: a.label, dist: dist })
                   : _t("guid.alerte.raccordLoinPoint", { dist: dist });
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
    if (c.lieu && c.carrefour) return _t("guid.lieu", { nom: c.lieu, action: txt });
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
      lignes += '<div class="kta-guid-alerte">⚠️ ' + _esc(texteAlerteRaccord(guide.alerteRaccord)) + '</div>';
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
      lignes += _ligne(n, c, txt, c.picto ? _pictoSvg(c.picto, 28) : _icone(c));
    });
    // 🌀 Itinéraire inter-plans (01/10/2026) : la feuille s'arrête au portail —
    // une ligne par plan suivant dit ce qui attend derrière (`road.suite`,
    // posée par interPlanRoute). Pas de consignes détaillées : elles se
    // calculent à l'échelle du plan suivant, une fois l'étape tracée là-bas.
    (Array.isArray(road.suite) ? road.suite : []).forEach(function(sv) {
      n++;
      const nb = sv.croisements || 0;
      lignes += _ligne(n, null, _t("guid.feuille.suite", {
        portail: sv.portail || "?", plan: sv.plan || "?", dist: _fmtM(sv.distM || 0),
        croisements: _t(nb === 0 ? "guid.feuille.croisements0" : (nb === 1 ? "guid.feuille.croisements1" : "guid.feuille.croisementsN"), { n: nb })
      }), "🌀");
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

  // Schéma d'un carrefour (décision 2:a) — « vue d'intersection » des GPS :
  // chaque galerie est un rayon, celle d'où l'on vient en bas, celle à prendre
  // en doré. Uniquement des nombres dans le SVG (angles calculés ici) : rien
  // qui vienne de l'utilisateur, d'où l'innerHTML sans risque côté appelants.
  function _pictoSvg(p, taille) {
    if (!p || !Array.isArray(p.rayons)) return "";
    const t = taille || 40, c = t / 2, L = t * 0.44;
    function bout(a) {
      const r = a * Math.PI / 180;
      return [(c + L * Math.sin(r)).toFixed(1), (c - L * Math.cos(r)).toFixed(1)];
    }
    function trait(a, cls) {
      const q = bout(a);
      return '<line x1="' + c + '" y1="' + c + '" x2="' + q[0] + '" y2="' + q[1] + '" class="' + cls + '"/>';
    }
    let out = '<svg class="kta-guid-picto" viewBox="0 0 ' + t + ' ' + t + '" width="' + t + '" height="' + t +
              '" aria-hidden="true">';
    p.rayons.forEach(function(a) {
      if (a !== p.choisie && a !== p.arrivee) out += trait(a, "kta-guid-picto-autre");
    });
    out += trait(p.arrivee, "kta-guid-picto-arrivee");
    out += trait(p.choisie, "kta-guid-picto-choisie");
    const q = bout(p.choisie);
    out += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + (t * 0.08).toFixed(1) + '" class="kta-guid-picto-bout"/>';
    out += '<circle cx="' + c + '" cy="' + c + '" r="' + (t * 0.06).toFixed(1) + '" class="kta-guid-picto-centre"/>';
    return out + '</svg>';
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
  // 🪧 BANDEAU EN DIRECT (lot 2)
  // =========================
  // Décisions KARMA (docs/ETUDE_GUIDAGE.md) :
  //   1:c  automatique dès qu'un itinéraire coexiste avec un tracker actif OU
  //        une position confirmée (« Je suis ici », 01/10/2026) ; réglage
  //        Auto / Jamais (tuile 🪧 du menu Tracker) ; la croix = « Jamais ».
  //   2:b  prochaine consigne + « puis… » ; toucher = feuille de route.
  //   3/L  toujours en mètres ; sans navigation intelligente : « ~ » + arrondi
  //        10 m + UNE suggestion de l'activer.
  //   D/E/F  écart ou demi-tour → [Recalculer d'ici] [Je suis ici] [Ignorer],
  //        jamais de recalcul automatique ; sans navigation intelligente,
  //        « Je suis ici » en premier ; « Ignorer » = silence jusqu'au retour
  //        sur le chemin.
  //   I/J  hors tracé au départ → « Rejoindre le tracé » + flèche relative au
  //        téléphone vers le point le plus proche du trajet.
  //
  // Alimenté par tracking.js > updateMap (chaque pas / recalage) et par un
  // battement d'1 s (apparition / disparition quand l'itinéraire ou le suivi
  // changent). Le calcul des consignes n'est refait QUE si la road change.
  const LS_PREF   = "myktamap_guidage_v1";                 // "auto" | "jamais"
  const LS_ASTUCE = "myktamap_guidage_astuce_smartnav";    // suggestion déjà faite
  const MAINTENANT_M = 8;      // en dessous : « Maintenant : … »
  const CONTINUER_M  = 100;    // au-delà : « Continuer sur … »

  let _el = null;
  let _road = null, _guide = null;
  let _sPrev = 0, _sMax = 0, _dejaSurTrajet = false;
  let _horsCompte = 0, _demiCompte = 0;
  let _alerte = null;          // null | "ecart" | "demi"
  let _ignoreEcart = false;
  let _dernierRendu = "";
  let _etat = { visible: false };

  function getPref() {
    try { return localStorage.getItem(LS_PREF) === "jamais" ? "jamais" : "auto"; } catch(e) { return "auto"; }
  }
  function setPref(v) {
    try { localStorage.setItem(LS_PREF, v === "jamais" ? "jamais" : "auto"); } catch(e) {}
    _maj();
  }

  function _roadActive() {
    const roads = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    return roads.find(function(r) { return r && r.type === "itinerary" && !r._preview; }) || null;
  }
  function _smartNav() { return !!(window.APP_CONFIG && window.APP_CONFIG.smartNav === true); }
  // Seuils de présence sur le trajet : avec la navigation intelligente la
  // position est calée sur les galeries, donc serrée ; sans, le PDR dérive.
  function _seuils() {
    // demiM / demiPas : recul sur le trajet qui fait parler de demi-tour, et
    // sur combien de positions de suite. Sans calage, 10 m ne suffisaient pas :
    // mesuré sur un trajet réel bruité à 4 m, 3 faux « demi-tour » en 350 m.
    return _smartNav() ? { surM: 3, horsM: 6, pas: 3, demiM: 10, demiPas: 3 }
                       : { surM: 8, horsM: 15, pas: 5, demiM: 20, demiPas: 5 };
  }
  function _suiviActif() {
    return !!(typeof window.getTrackingActif === "function" && window.getTrackingActif());
  }
  // 01/10/2026 (KARMA 1:a) — guidage SANS suivi : on avance de plaque en plaque
  // (« 📍 Je suis ici »). Il faut alors une position CONFIRMÉE : sans elle, la
  // position vaut le départ du plan et le bandeau donnerait de fausses consignes.
  function _positionConfirmee() {
    if (typeof window.getTrackingPositionEtat !== "function") return false;
    const e = window.getTrackingPositionEtat();
    return !!(e && e.confirmee);
  }

  function _fmtDirect(m) {
    if (!_smartNav()) {
      return "~" + _fmtM(Math.max(10, Math.round(m / 10) * 10));
    }
    return _fmtM(m > 20 ? Math.round(m / 5) * 5 : Math.max(1, Math.round(m)));
  }

  function _reinitialiser(road) {
    _road = road;
    _guide = road ? construire(road) : null;
    _sPrev = 0; _sMax = 0; _dejaSurTrajet = false;
    _horsCompte = 0; _demiCompte = 0;
    _alerte = null; _ignoreEcart = false;
  }

  function _creerBandeau() {
    if (_el && _el.isConnected) return _el;
    _el = document.createElement("div");
    _el.id = "kta-guid-bandeau";
    _el.className = "kta-guid-bandeau";
    _el.setAttribute("role", "status");
    _el.setAttribute("aria-live", "polite");
    _el.innerHTML =
      '<div class="kta-guid-ligne">' +
        '<button type="button" class="kta-guid-corps">' +
          '<span class="kta-guid-icone"></span>' +
          '<span class="kta-guid-textes">' +
            '<span class="kta-guid-principal"></span>' +
            '<span class="kta-guid-sous"></span>' +
          '</span>' +
        '</button>' +
        '<button type="button" class="kta-guid-fermer">✕</button>' +
      '</div>' +
      '<div class="kta-guid-actions"></div>';
    _el.style.display = "none";
    document.body.appendChild(_el);
    _el.querySelector(".kta-guid-corps").addEventListener("click", function() {
      if (_road) ouvrirFeuilleDeRoute(_road);
    });
    // 01/10/2026 (KARMA 2:a) — la croix ÉTEINT le guidage (réglage « Jamais »,
    // la tuile 🪧 du menu Tracker passe à off) ; la tuile le rallume aussitôt.
    // Avant, elle masquait seulement CET itinéraire, et la tuile ne savait pas
    // lever ce masquage : il fallait recalculer l'itinéraire pour le retrouver.
    _el.querySelector(".kta-guid-fermer").addEventListener("click", function() {
      setPref("jamais");
      _toast(_t("guid.toast.masque"), "info");
    });
    _el.querySelector(".kta-guid-actions").addEventListener("click", function(ev) {
      const b = ev.target.closest && ev.target.closest("[data-guid-action]");
      if (b) _action(b.getAttribute("data-guid-action"));
    });
    return _el;
  }

  function _cacher() {
    if (_el) _el.style.display = "none";
    _dernierRendu = "";
    _etat = { visible: false };
  }

  function _toast(msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, type || "info");
  }

  function _positionTracker() {
    const p = (typeof window.getTrackingPosition === "function") ? window.getTrackingPosition() : null;
    return (p && typeof p.x === "number" && typeof p.y === "number") ? p : null;
  }

  function _action(nom) {
    const pos = _positionTracker();
    if (nom === "recalculer") {
      _alerte = null; _horsCompte = 0; _demiCompte = 0;
      if (_road && _road.urgence && window.SortieUrgence && typeof window.SortieUrgence.relancerDepuis === "function") {
        // Décision G : en sortie d'urgence, la sortie la plus proche D'ICI.
        if (pos) window.SortieUrgence.relancerDepuis(pos);
      } else if (pos && typeof window.itineraireReplanifierDepuis === "function") {
        window.itineraireReplanifierDepuis(pos.x, pos.y);
      }
    } else if (nom === "ici") {
      _alerte = null; _horsCompte = 0; _demiCompte = 0;
      // Le picker partagé RECALE le tracker : la replanification existante
      // (interfaceItineraire > _onTrackerRecale) prend le relais.
      if (typeof window.ktaDemanderPositionCarte === "function") {
        window.ktaDemanderPositionCarte(function() {}, { icone: "📍", texte: _t("guid.pick") });
      }
    } else if (nom === "ignorer") {
      if (_alerte === "ecart") _ignoreEcart = true;          // F : jusqu'au retour sur le chemin
      if (_alerte === "demi") { _sMax = _sPrev; _demiCompte = 0; }   // on repart de là
      _alerte = null;
    }
    _maj();
  }

  // Projection de la position sur le trajet, en préférant l'avancée : sur un
  // trajet qui repasse au même endroit (aller-retour vers un cul-de-sac), la
  // fenêtre part juste derrière la dernière position connue.
  function _progression(pos) {
    const e = _guide.echelle;
    const S = _seuils();
    let pr = _projeter(_guide.ch, pos, _sPrev - 5 * e, _sPrev + 60 * e);
    if (!pr || pr.dist > S.surM * e) {
      const pr2 = _projeter(_guide.ch, pos, _sPrev - 30 * e, _sPrev + 60 * e);
      if (pr2 && (!pr || pr2.dist < pr.dist)) pr = pr2;
    }
    if (!pr || pr.dist > S.horsM * e) {
      const pr3 = _projeter(_guide.ch, pos);
      if (pr3 && (!pr || pr3.dist < pr.dist)) pr = pr3;
    }
    return pr;
  }

  function _calculer(pos) {
    const e = _guide.echelle;
    const S = _seuils();
    const pr = _progression(pos);
    if (!pr) return null;
    const distM = pr.dist / e;
    const surTrajet = distM <= S.surM;

    // Jamais encore sur le trajet : on le rejoint (décisions I/J)
    if (!_dejaSurTrajet && !surTrajet) {
      return { mode: "rejoindre", distM: distM, cible: { x: pr.x, y: pr.y }, pos: pos };
    }
    if (surTrajet) {
      if (!_dejaSurTrajet) _dejaSurTrajet = true;
      if (_ignoreEcart) { _ignoreEcart = false; _toast(_t("guid.retour"), "info"); }
      if (_alerte === "ecart") { _alerte = null; _toast(_t("guid.retour"), "info"); }
      _demiCompte = (pr.s < _sMax - S.demiM * e) ? _demiCompte + 1 : 0;
      _sPrev = pr.s;
      if (pr.s > _sMax) _sMax = pr.s;
      if (_alerte === "demi" && pr.s >= _sMax - 2 * e) _alerte = null;
      _horsCompte = 0;
    } else {
      _horsCompte = (distM > S.horsM) ? _horsCompte + 1 : _horsCompte;
    }
    if (!_alerte && !_ignoreEcart && _horsCompte >= S.pas) _alerte = "ecart";
    if (!_alerte && _demiCompte >= S.demiPas) _alerte = "demi";

    const cs = _guide.consignes;
    // La consigne reste affichée jusqu'à ce qu'on l'ait FRANCHIE (0,5 m après
    // le point) : sinon « Maintenant » disparaissait juste avant le croisement.
    let k = cs.findIndex(function(c) { return c.s > _sPrev - 0.5 * e; });
    if (k < 0) k = cs.length - 1;
    return {
      mode: _alerte || "guide",
      distM: distM,
      consigne: cs[k],
      suivante: cs[k + 1] || null,
      resteM: (cs[k].s - _sPrev) / e,
      reculM: (_sMax - _sPrev) / e
    };
  }

  function _rendu(r) {
    const el = _creerBandeau();
    let icone = "", principal = "", sous = "", fleche = null, actions = [], picto = "";
    const urgence = !!(_road && _road.urgence);

    if (r.mode === "rejoindre") {
      icone = "⬆";
      principal = _t("guid.bandeau.rejoindre", { dist: _fmtDirect(r.distM) });
      sous = _t("guid.bandeau.rejoindreSous");
      // Flèche relative au téléphone (décision J) : cap vers le tracé moins
      // le cap de marche. Sans boussole, pas de flèche — elle mentirait.
      const cap = (typeof window.getPlanRelHeading === "function") ? window.getPlanRelHeading() : null;
      if (typeof cap === "number" && isFinite(cap)) fleche = Math.round(_norm180(_cap(r.pos, r.cible) - cap));
      else icone = "🪢";
    } else if (r.mode === "ecart" || r.mode === "demi") {
      icone = "⚠️";
      principal = _t(r.mode === "ecart" ? "guid.ecart.titre" : "guid.demi.titre");
      sous = (r.mode === "ecart")
        ? _t("guid.ecart.detail", { dist: _fmtDirect(r.distM) })
        : _t("guid.demi.detail", { dist: _fmtDirect(r.reculM) });
      // E : sans navigation intelligente la position est douteuse → se
      // resituer d'abord. G : en urgence, « Recalculer » vise la sortie la
      // plus proche d'ici.
      const recalc = { id: "recalculer", label: _t(urgence ? "guid.btn.sortieProche" : "guid.btn.recalculer") };
      const ici = { id: "ici", label: _t("guid.btn.jeSuisIci") };
      actions = _smartNav() ? [recalc, ici] : [ici, recalc];
      actions.push({ id: "ignorer", label: _t("guid.btn.ignorer") });
    } else {
      const c = r.consigne;
      icone = _icone(c);
      if (c.picto) picto = _pictoSvg(c.picto, 40);
      const action = texteAction(c);
      if (c.type === "arrivee" && r.resteM <= MAINTENANT_M) {
        principal = _majuscule(action);
        if ((c.raccordPx || 0) / _guide.echelle >= RACCORD_MIN_M) {
          sous = _t("guid.bandeau.puisRaccord", { dist: _fmtM(c.raccordPx / _guide.echelle) });
        }
      } else if (r.resteM <= MAINTENANT_M) {
        principal = _t("guid.bandeau.maintenant", { action: action });
      } else if (r.resteM > CONTINUER_M && c.type !== "arrivee") {
        principal = _t("guid.bandeau.continuer", { dist: _fmtDirect(r.resteM) });
        sous = _t("guid.bandeau.puis", { action: action });
      } else {
        principal = _t("guid.bandeau.dans", { dist: _fmtDirect(r.resteM), action: action });
      }
      if (!sous && r.suivante) sous = _t("guid.bandeau.puis", { action: texteAction(r.suivante) });
    }

    _etat = {
      visible: true, mode: r.mode, icone: icone, principal: principal, sous: sous,
      fleche: fleche, urgence: urgence, picto: picto
    };

    const cle = [r.mode, icone, principal, sous, fleche, urgence, picto,
                 actions.map(function(a) { return a.id; }).join()].join("|");
    el.style.display = "";
    if (cle === _dernierRendu) return;
    _dernierRendu = cle;

    el.classList.toggle("kta-guid-alerte-on", r.mode === "ecart" || r.mode === "demi");
    el.classList.toggle("kta-guid-urgence", urgence);
    const ic = el.querySelector(".kta-guid-icone");
    if (picto) ic.innerHTML = picto; else ic.textContent = icone;   // picto : SVG de nombres seuls
    ic.style.transform = (fleche !== null) ? "rotate(" + fleche + "deg)" : "";
    el.querySelector(".kta-guid-principal").textContent = principal;
    const sEl = el.querySelector(".kta-guid-sous");
    sEl.textContent = sous;
    sEl.style.display = sous ? "" : "none";
    const corps = el.querySelector(".kta-guid-corps");
    corps.title = _t("guid.bandeau.ouvrir");
    const fermer = el.querySelector(".kta-guid-fermer");
    // Décision C : pas de croix en sortie d'urgence.
    fermer.style.display = urgence ? "none" : "";
    fermer.title = _t("guid.bandeau.fermer");
    fermer.setAttribute("aria-label", _t("guid.bandeau.fermer"));
    el.querySelector(".kta-guid-actions").innerHTML = actions.map(function(a, i) {
      return '<button type="button" class="kta-btn ' + (i === 0 ? "kta-btn-primary" : "kta-btn-ghost") +
             ' kta-guid-btn" data-guid-action="' + a.id + '">' + _esc(a.label) + '</button>';
    }).join("");
  }

  function _maj(posForcee) {
    const road = _roadActive();
    if (road !== _road) _reinitialiser(road);
    const urgence = !!(road && road.urgence);
    // En sortie d'urgence le guidage s'affiche même réglé sur « Jamais » :
    // c'est l'utilisateur qui vient de demander le chemin vers la sortie.
    const voulu = !!(road && _guide && (_suiviActif() || _positionConfirmee()) &&
                     (urgence || getPref() === "auto"));
    if (!voulu) { _cacher(); return; }
    const pos = (posForcee && typeof posForcee.x === "number") ? posForcee : _positionTracker();
    if (!pos) { _cacher(); return; }
    const r = _calculer(pos);
    if (!r) { _cacher(); return; }
    _rendu(r);

    // Décision L : UNE suggestion, la première fois, si les mètres sont approximatifs.
    if (!_smartNav()) {
      let dejaDit = false;
      try { dejaDit = localStorage.getItem(LS_ASTUCE) === "1"; } catch(e) {}
      if (!dejaDit) {
        try { localStorage.setItem(LS_ASTUCE, "1"); } catch(e) {}
        _toast(_t("guid.astuce.smartNav"), "info");
      }
    }
  }

  function onPosition(pos) {
    try { _maj(pos); } catch(e) { console.warn("[ItiGuidage] mise à jour échouée :", e); }
  }

  let _battement = null;
  function _demarrer() {
    if (_battement) return;
    _battement = setInterval(function() { try { _maj(); } catch(e) {} }, 1000);
  }
  if (typeof document !== "undefined" && document.addEventListener) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", _demarrer);
    else _demarrer();
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
  G.pictoSvg             = _pictoSvg;
  G.longueurRaccordsPx   = longueurRaccordsPx;
  G.alerteRaccord        = alerteRaccord;
  G.texteAlerteRaccord   = texteAlerteRaccord;
  G.ouvrirFeuilleDeRoute = ouvrirFeuilleDeRoute;
  G.RACCORD_ALERTE_M     = RACCORD_ALERTE_M;
  // Lot 2 — bandeau en direct
  G.onPosition           = onPosition;          // tracking.js > updateMap
  G.rafraichir           = function() { _maj(); };
  G.etat                 = function() { return Object.assign({}, _etat); };   // lu par l'écran XL
  G.getPref              = getPref;
  G.agir                 = _action;                      // "recalculer" | "ici" | "ignorer" (boutons d'écart)
  G.setPref              = setPref;

  window.ItiGuidage = G;
  console.log("[ItiGuidage] Module chargé");
})();
