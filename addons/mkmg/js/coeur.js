/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// addons/mkmg/js/coeur.js — add-on « mkmg » : jeu en vagues dans la vue 3D, sur le plan ouvert. Chargé par la vue 3D
// seule (vue3d.js > ADDONS_CODE, code « six vers le bas »), jamais au démarrage. Expose window.KtaAddons.mkmg =
// { lancer(), etat() } (etat : checkup). Une vague = rejoindre un point B (POI du plan de plus en plus loin, sinon un
// point des tracés) depuis là où l'on est ; santé et endurance (le pas rapide la vide ; à bout de souffle, plus de
// course). Difficulté : facile = tracés + itinéraire du jeu + guidage ; moyen = tracés + itinéraire ; difficile =
// rien.
// 🔒 Ne touche ni tracker, ni session, ni filtres, ni l'itinéraire de l'app : la greffe (KtaVue3D.greffer) est son
// seul accès ; son trajet est calculé par Pathfinder.computeRoute (lecture) et dessiné dans son propre groupe.
// ⚠️ contrat (décision produit) : refusé sur une installation reliée à un serveur, pendant le suivi du tracker, une
// sortie d'urgence ou le mode Secours ; textes fr/en/es ici, jamais dans lang/*.json.
// Doc : docs/architecture/tracking.md § Greffe de la vue 3D · Garde-fou : scripts/smoke/checkup-vue-3d.js

(function () {
  "use strict";

  const TEXTES = {
    fr: {
      "confirmer.titre": "⛏️ Six pieds sous terre",
      "confirmer.texte": "Descendre plus bas ? La carrière n'est plus tout à fait la même.",
      "confirmer.oui": "Descendre", "confirmer.non": "Rester ici",
      "diff.facile": "Facile", "diff.facile.aide": "Tracés, itinéraire et guidage",
      "diff.moyen": "Moyen", "diff.moyen.aide": "Tracés et itinéraire",
      "diff.difficile": "Difficile", "diff.difficile.aide": "Aucune indication",
      "refus.installation": "Pas sur cette installation.",
      "refus.suivi": "Termine d'abord ta sortie : arrête le suivi du tracker.",
      "refus.urgence": "Pas pendant une sortie d'urgence.",
      "refus.secours": "Pas pendant le mode Secours.",
      "hud.vague": "Vague {n}", "hud.sante": "Santé", "hud.endurance": "Endurance",
      "hud.objectif": "Rejoins : {nom}", "hud.restant": "{d} restants", "hud.recherche": "Recherche d'une destination…",
      "hud.aucune": "Aucune destination sur ce niveau : il faut des POI ou des tracés.",
      "hud.reussie": "Vague {n} réussie !", "hud.souffle": "À bout de souffle", "hud.quitter": "Quitter",
      "hud.sansNom": "un point du réseau"
    },
    en: {
      "confirmer.titre": "⛏️ Six feet under",
      "confirmer.texte": "Go deeper? The quarry is not quite the same down there.",
      "confirmer.oui": "Go down", "confirmer.non": "Stay here",
      "diff.facile": "Easy", "diff.facile.aide": "Paths, route and guidance",
      "diff.moyen": "Medium", "diff.moyen.aide": "Paths and route",
      "diff.difficile": "Hard", "diff.difficile.aide": "No hints",
      "refus.installation": "Not on this installation.",
      "refus.suivi": "Finish your trip first: stop the tracker.",
      "refus.urgence": "Not during an emergency exit.",
      "refus.secours": "Not during Rescue mode.",
      "hud.vague": "Wave {n}", "hud.sante": "Health", "hud.endurance": "Stamina",
      "hud.objectif": "Reach: {nom}", "hud.restant": "{d} left", "hud.recherche": "Looking for a destination…",
      "hud.aucune": "No destination on this level: points or paths are needed.",
      "hud.reussie": "Wave {n} cleared!", "hud.souffle": "Out of breath", "hud.quitter": "Quit",
      "hud.sansNom": "a point of the network"
    },
    es: {
      "confirmer.titre": "⛏️ Dos metros bajo tierra",
      "confirmer.texte": "¿Bajar más? La cantera ya no es del todo la misma.",
      "confirmer.oui": "Bajar", "confirmer.non": "Quedarme aquí",
      "diff.facile": "Fácil", "diff.facile.aide": "Trazados, itinerario y guiado",
      "diff.moyen": "Medio", "diff.moyen.aide": "Trazados e itinerario",
      "diff.difficile": "Difícil", "diff.difficile.aide": "Ninguna indicación",
      "refus.installation": "No en esta instalación.",
      "refus.suivi": "Termina primero tu salida: detén el seguimiento.",
      "refus.urgence": "No durante una salida de emergencia.",
      "refus.secours": "No durante el modo Rescate.",
      "hud.vague": "Oleada {n}", "hud.sante": "Salud", "hud.endurance": "Resistencia",
      "hud.objectif": "Llega a: {nom}", "hud.restant": "faltan {d}", "hud.recherche": "Buscando un destino…",
      "hud.aucune": "Ningún destino en este nivel: hacen falta puntos o trazados.",
      "hud.reussie": "¡Oleada {n} superada!", "hud.souffle": "Sin aliento", "hud.quitter": "Salir",
      "hud.sansNom": "un punto de la red"
    }
  };

  // Réglages du jeu (m, points, par seconde) : premiers essais, à revoir au jeu.
  const REGLES = {
    departM: 40, pasM: 30, minM: 10, candidats: 8, arriveeM: 2, sante: 100, endurance: 100,
    videParS: 22, repriseParS: 14, souffleReprise: 30, regardM: 5, majHudMs: 150, messageMs: 2200
  };
  const DIFFICULTES = {
    facile: { traces: true, route: true, guidage: true },
    moyen: { traces: true, route: true, guidage: false },
    difficile: { traces: false, route: false, guidage: false }
  };
  const ROUTE = { largeur: 0.3, y: 0.08 };
  const BALISE = { rayon: 0.25, anneau: [0.6, 0.85], opacite: 0.55 };

  let _p = null;   // partie en cours (null = aucune)

  function _t(cle, p) {
    const lang = window.I18n && typeof window.I18n.getLang === "function" ? window.I18n.getLang() : "fr";
    const s = (TEXTES[lang] && TEXTES[lang][cle]) || TEXTES.fr[cle] || cle;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return p && p[k] !== undefined ? String(p[k]) : m; });
  }

  function _esc(s) { return window.ktaEsc(s); }

  function _dist(d) {
    return typeof window.formatDistance === "function" ? window.formatDistance(d, 0) : Math.round(d) + " m";
  }

  // ── Démarrage ─────────────────────────────────────────────────────────────────────────────────────────

  function _refus() {
    const X = window.KtaExtensions;
    if (X && typeof X.etat === "function" && X.etat().etat !== "off") return "refus.installation";
    if (typeof window.getTrackingActif === "function" && window.getTrackingActif() === true) return "refus.suivi";
    const roads = typeof window.getRoads === "function" ? window.getRoads() || [] : [];
    const urgence = roads.some(function (r) { return r && r.type === "itinerary" && r.urgence; });
    if (urgence || (window.EmergencyMode && window.EmergencyMode.isActif())) return "refus.urgence";
    if (window.SecoursMode && typeof window.SecoursMode.isOpen === "function" && window.SecoursMode.isOpen()) {
      return "refus.secours";
    }
    return null;
  }

  function _chargerCss() {
    if (document.getElementById("mkmg-css")) return;
    const l = document.createElement("link");
    l.id = "mkmg-css";
    l.rel = "stylesheet";
    l.href = "addons/mkmg/css/coeur.css";
    document.head.appendChild(l);
  }

  function lancer() {
    const K = window.KtaVue3D;
    if (_p || !K || !K.etat().ouvert) return;
    const refus = _refus();
    if (refus) { window.ktaAlerte(_t(refus)); return; }
    _chargerCss();
    const choix = { valeur: "facile", options: ["facile", "moyen", "difficile"].map(function (d) {
      return { valeur: d, titre: _t("diff." + d), aide: _t("diff." + d + ".aide") };
    }) };
    window.ktaConfirm(_esc(_t("confirmer.texte")), {
      titre: _esc(_t("confirmer.titre")), okLabel: _esc(_t("confirmer.oui")),
      cancelLabel: _esc(_t("confirmer.non")), choix: choix
    }).then(function (oui) {
      if (!oui || _p || _refus() || !K.etat().ouvert) return;
      _demarrer(DIFFICULTES[choix.valeur] ? choix.valeur : "facile");
    });
  }

  function _demarrer(diff) {
    _p = { diff: diff, regle: DIFFICULTES[diff], vague: 0, sante: REGLES.sante, endurance: REGLES.endurance,
      souffle: false, cible: null, route: null, longueurs: null, calcul: 0, ctx: null, hud: null, objets: [],
      message: null, messageFin: 0, majHud: 0, reussies: 0, restantM: null };
    const retirer = window.KtaVue3D.greffer({ nom: "mkmg", scene: _scene, surImage: _surImage, demonter: _demonter });
    if (!retirer) { _p = null; return; }
    if (_p) _p.retirer = retirer;
    console.log("[Mkmg] partie lancée (" + diff + ")");
  }

  // ── Greffe ────────────────────────────────────────────────────────────────────────────────────────────

  function _scene(ctx, raison) {
    const p = _p;
    if (!p) return;
    p.ctx = ctx;
    if (raison === "greffe") {
      ctx.regler({ traces: p.regle.traces, itineraire: false, guidage: false });
      _monterHud(ctx);
      _nouvelleVague();
    }
    // 🩸 Reprise du contexte : groupe neuf, les objets d'avant sont morts avec l'ancien (jamais dispose()).
    if (raison === "reprise") p.objets = [];
    _dessiner();
  }

  function _surImage(ctx, dt) {
    const p = _p;
    if (!p) return;
    p.ctx = ctx;
    if (ctx.court && !p.souffle) {
      p.endurance = Math.max(0, p.endurance - REGLES.videParS * dt);
      if (p.endurance === 0) { p.souffle = true; ctx.regler({ course: false }); }
    } else {
      p.endurance = Math.min(REGLES.endurance, p.endurance + REGLES.repriseParS * dt);
      if (p.souffle && p.endurance >= REGLES.souffleReprise) { p.souffle = false; ctx.regler({ course: true }); }
    }
    const t = performance.now();
    if (p.cible) {
      const pos = ctx.pos, d = Math.hypot(p.cible.x - pos.x, p.cible.y - pos.y) / ctx.sc;
      if (d <= REGLES.arriveeM) { _vagueReussie(); return; }
    }
    if (t - p.majHud > REGLES.majHudMs) { p.majHud = t; _majHud(); }
  }

  function _demonter(ctx, raison) {
    const p = _p;
    if (!p) return;
    if (raison !== "contexte") _vider();
    _p = null;
    console.log("[Mkmg] partie terminée (" + raison + ", " + p.reussies + " vague(s) réussie(s))");
  }

  function quitter() { if (_p && _p.retirer) _p.retirer(); }

  // ── Vagues ────────────────────────────────────────────────────────────────────────────────────────────

  function _tab(f) { try { return (typeof f === "function" ? f() : []) || []; } catch (e) { return []; } }

  function _niveauDe(o) { return Number.isInteger(o.level) ? o.level : 0; }

  function _surNiveau(o, niv) { return niv === null || niv === undefined || _niveauDe(o) === niv; }

  function _pois(niv) {
    return _tab(window.getEditorPoints).concat(_tab(window.getAllEmbeddedPoints)).filter(function (q) {
      return q && Number.isFinite(q.x) && Number.isFinite(q.y) && _surNiveau(q, niv);
    });
  }

  // Sommets des tracés du niveau (repli d'un plan sans POI) : le plus proche de la distance voulue.
  function _pointDesTraces(niv, pos, sc, voulu) {
    let meilleur = null, ecart = Infinity;
    _tab(window.getRoads).concat(_tab(window.getAllEmbeddedRoads)).forEach(function (r) {
      if (!r || r.type === "itinerary" || r.type === "jonction" || !Array.isArray(r.points)) return;
      if (!_surNiveau(r, niv)) return;
      r.points.forEach(function (q) {
        if (!q || !Number.isFinite(q.x)) return;
        const d = Math.hypot(q.x - pos.x, q.y - pos.y) / sc;
        if (d >= REGLES.minM && Math.abs(d - voulu) < ecart) { ecart = Math.abs(d - voulu); meilleur = q; }
      });
    });
    return meilleur ? { x: meilleur.x, y: meilleur.y, nom: _t("hud.sansNom") } : null;
  }

  async function _route(de, vers, niv) {
    const P = window.Pathfinder;
    if (!P || typeof P.computeRoute !== "function") return null;
    const lvl = niv === null || niv === undefined ? undefined : niv;
    try {
      const r = await P.computeRoute([{ x: de.x, y: de.y, level: lvl }, { x: vers.x, y: vers.y, level: lvl }]);
      return r && Array.isArray(r.path) && r.path.length >= 2 ? r.path : null;
    } catch (e) { return null; }
  }

  async function _nouvelleVague() {
    const p = _p;
    if (!p || !p.ctx) return;
    p.vague++;
    const jeton = ++p.calcul, ctx = p.ctx, pos = ctx.pos, niv = ctx.niveau, sc = ctx.sc;
    const voulu = REGLES.departM + REGLES.pasM * (p.vague - 1);
    p.cible = null; p.route = null; p.longueurs = null; p.cherche = true;
    _dessiner();
    _majHud();
    const cands = _pois(niv).map(function (q) {
      return { x: q.x, y: q.y, nom: q.nom || q.name || q.label || _t("hud.sansNom"),
        d: Math.hypot(q.x - pos.x, q.y - pos.y) / sc };
    }).filter(function (c) { return c.d >= REGLES.minM; })
      .sort(function (a, b) { return Math.abs(a.d - voulu) - Math.abs(b.d - voulu); }).slice(0, REGLES.candidats);
    const repli = _pointDesTraces(niv, pos, sc, voulu);
    if (repli) cands.push(repli);
    let cible = null, route = null;
    for (let i = 0; i < cands.length && !route; i++) {
      route = await _route(pos, cands[i], niv);
      if (_p !== p || jeton !== p.calcul) return;
      if (route) cible = cands[i];
    }
    // Aucun trajet (plan sans tracés) : la cible la plus proche du voulu, sans itinéraire.
    if (!cible) cible = cands[0] || null;
    p.cible = cible;
    p.cherche = false;
    p.route = route;
    p.longueurs = route ? _cumuls(route) : null;
    _dessiner();
    _majHud();
    if (cible) _message(_t("hud.objectif", { nom: cible.nom }));
  }

  function _vagueReussie() {
    const p = _p;
    p.reussies++;
    p.endurance = REGLES.endurance;
    if (p.souffle) { p.souffle = false; p.ctx.regler({ course: true }); }
    _message(_t("hud.reussie", { n: p.vague }));
    _nouvelleVague();
  }

  // ── Trajet : longueurs cumulées, reste à parcourir, point à suivre ─────────────────────────────────────

  function _cumuls(path) {
    const c = [0];
    for (let i = 1; i < path.length; i++) {
      c.push(c[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    }
    return c;
  }

  // Abscisse (px) du point du trajet le plus proche de pos.
  function _abscisse(path, cum, pos) {
    let best = Infinity, s = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1e-9;
      const k = Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / l2));
      const d = Math.hypot(a.x + dx * k - pos.x, a.y + dy * k - pos.y);
      if (d < best) { best = d; s = cum[i - 1] + k * Math.sqrt(l2); }
    }
    return s;
  }

  function _pointA(path, cum, s) {
    for (let i = 1; i < path.length; i++) {
      if (cum[i] >= s) {
        const a = path[i - 1], b = path[i], k = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1e-9);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    return path[path.length - 1];
  }

  // ── Scène : trajet au sol, balise de la cible ─────────────────────────────────────────────────────────

  function _couleur(nom, defaut) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
    return v || defaut;
  }

  function _vider() {
    const p = _p;
    if (!p) return;
    p.objets.forEach(function (o) {
      if (o.parent) o.parent.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    p.objets = [];
  }

  function _ajouter(o) { _p.ctx.groupe.add(o); _p.objets.push(o); }

  function _dessiner() {
    const p = _p;
    if (!p || !p.ctx) return;
    const ctx = p.ctx, T = ctx.THREE, sc = ctx.sc;
    _vider();
    const accent = new T.Color(_couleur("--kta-accent", "") || 0xf4c542);
    if (p.route && p.regle.route) {
      const pos = [], niv = ctx.niveau;
      for (let i = 1; i < p.route.length; i++) {
        const a = p.route[i - 1], b = p.route[i];
        if (niv !== null && ((Number.isInteger(a.level) && a.level !== niv) || (Number.isInteger(b.level) &&
          b.level !== niv))) continue;
        const ax = a.x / sc, az = a.y / sc, bx = b.x / sc, bz = b.y / sc, l = Math.hypot(bx - ax, bz - az);
        if (l < 1e-6) continue;
        const nx = -(bz - az) / l * ROUTE.largeur / 2, nz = (bx - ax) / l * ROUTE.largeur / 2, y = ROUTE.y;
        pos.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz,
          ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
      }
      if (pos.length) {
        const g = new T.BufferGeometry();
        g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
        const m = new T.MeshBasicMaterial({ color: accent, side: T.DoubleSide, toneMapped: false,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        _ajouter(new T.Mesh(g, m));
      }
    }
    // Balise de la cible (facile, moyen) : colonne et anneau au sol, éteints par le brouillard au loin.
    if (p.cible && p.regle.route) {
      const cx = p.cible.x / sc, cz = p.cible.y / sc, h = ctx.hauteur;
      const col = new T.Mesh(new T.CylinderGeometry(BALISE.rayon, BALISE.rayon, h, 16, 1, true),
        new T.MeshBasicMaterial({ color: accent, transparent: true, opacity: BALISE.opacite, toneMapped: false,
          depthWrite: false, side: T.DoubleSide }));
      col.position.set(cx, h / 2, cz);
      _ajouter(col);
      const an = new T.Mesh(new T.RingGeometry(BALISE.anneau[0], BALISE.anneau[1], 32),
        new T.MeshBasicMaterial({ color: accent, toneMapped: false, side: T.DoubleSide }));
      an.rotation.x = -Math.PI / 2;
      an.position.set(cx, 0.05, cz);
      _ajouter(an);
    }
    ctx.sale();
  }

  // ── Interface du jeu (calque de la greffe) ────────────────────────────────────────────────────────────

  function _el(parent, tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  }

  function _barre(parent, nom) {
    const l = _el(parent, "div", "mkmg-jauge");
    _el(l, "span", "mkmg-jauge-nom", nom);
    const fond = _el(l, "span", "mkmg-jauge-fond");
    return _el(fond, "span", "mkmg-jauge-plein");
  }

  function _monterHud(ctx) {
    const p = _p, h = {};
    h.panneau = _el(ctx.hud, "div", "mkmg-panneau");
    h.vague = _el(h.panneau, "div", "mkmg-vague");
    h.sante = _barre(h.panneau, _t("hud.sante"));
    h.endurance = _barre(h.panneau, _t("hud.endurance"));
    h.endurance.parentNode.parentNode.classList.add("mkmg-jauge-endurance");
    h.objectif = _el(h.panneau, "div", "mkmg-objectif");
    h.guide = _el(h.panneau, "div", "mkmg-guide");
    h.fleche = _el(h.guide, "span", "mkmg-fleche", "↑");
    h.reste = _el(h.guide, "span", "mkmg-reste");
    h.quitter = _el(h.panneau, "button", "mkmg-quitter", _t("hud.quitter"));
    h.quitter.type = "button";
    h.quitter.addEventListener("click", quitter);
    h.message = _el(ctx.hud, "div", "mkmg-message");
    h.message.hidden = true;
    h.message.setAttribute("aria-live", "polite");
    p.hud = h;
    _majHud();
  }

  function _message(txt) {
    const p = _p;
    if (!p || !p.hud) return;
    p.hud.message.textContent = txt;
    p.hud.message.hidden = false;
    clearTimeout(p.messageMinuterie);
    p.messageMinuterie = setTimeout(function () { if (p.hud) p.hud.message.hidden = true; }, REGLES.messageMs);
  }

  function _majHud() {
    const p = _p;
    if (!p || !p.hud || !p.ctx) return;
    const h = p.hud, ctx = p.ctx;
    h.vague.textContent = _t("hud.vague", { n: p.vague }) + " · " + _t("diff." + p.diff);
    h.sante.style.width = Math.round(p.sante / REGLES.sante * 100) + "%";
    h.endurance.style.width = Math.round(p.endurance / REGLES.endurance * 100) + "%";
    h.endurance.parentNode.parentNode.classList.toggle("mkmg-souffle", p.souffle);
    h.endurance.parentNode.parentNode.title = p.souffle ? _t("hud.souffle") : "";
    if (!p.cible) {
      h.objectif.textContent = p.cherche ? _t("hud.recherche") : _t("hud.aucune");
      h.guide.hidden = true;
      return;
    }
    h.objectif.textContent = _t("hud.objectif", { nom: p.cible.nom });
    const pos = ctx.pos;
    let reste = null, vise = p.cible;
    if (p.route && p.longueurs) {
      const s = _abscisse(p.route, p.longueurs, pos), tot = p.longueurs[p.longueurs.length - 1];
      reste = (tot - s) / ctx.sc;
      vise = _pointA(p.route, p.longueurs, Math.min(tot, s + REGLES.regardM * ctx.sc));
    }
    p.restantM = reste;
    // Guidage (facile) : flèche vers le trajet quelques mètres devant soi ; reste à parcourir (facile, moyen).
    h.guide.hidden = !p.regle.route;
    h.fleche.hidden = !p.regle.guidage;
    if (p.regle.guidage) {
      const ang = Math.atan2(vise.x - pos.x, -(vise.y - pos.y)) * 180 / Math.PI;
      h.fleche.style.transform = "rotate(" + Math.round(ang - ctx.cap) + "deg)";
    }
    h.reste.textContent = reste === null ? "" : _t("hud.restant", { d: _dist(reste) });
  }

  // État de la partie (checkup).
  function etat() {
    const p = _p;
    if (!p) return { enCours: false };
    return { enCours: true, diff: p.diff, vague: p.vague, reussies: p.reussies, sante: p.sante,
      endurance: Math.round(p.endurance), souffle: p.souffle, cible: p.cible ? { x: p.cible.x, y: p.cible.y,
        nom: p.cible.nom } : null, route: p.route ? p.route.length : 0, restantM: p.restantM,
      objets: p.objets.length, calcul: p.calcul };
  }

  window.KtaAddons = window.KtaAddons || {};
  window.KtaAddons.mkmg = { lancer: lancer, quitter: quitter, etat: etat };
})();
