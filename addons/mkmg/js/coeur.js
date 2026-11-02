/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// addons/mkmg/js/coeur.js — add-on « mkmg » : jeu en vagues dans la vue 3D, sur le plan ouvert. Chargé par la vue 3D
// seule (vue3d.js > ADDONS_CODE, code « six vers le bas »), jamais au démarrage ; charge à son tour son.js et
// monde.js. Expose window.KtaAddons.mkmg = { lancer(), quitter(), etat(), essai } (etat, essai : checkup). Une vague =
// rejoindre un point B (POI de plus en plus loin, sinon un point des tracés) avec des égarés et, dès la vague 2, la
// silhouette (monde.js) ; fusil à deux coups, munitions et champignons ramassés en passant ; santé à 0 = fin, meilleure
// vague retenue par difficulté. Difficulté : facile = tracés + itinéraire du jeu + guidage ; moyen = tracés +
// itinéraire ; difficile = rien.
// 🔒 Ne touche ni tracker, ni session, ni filtres, ni l'itinéraire de l'app : la greffe (KtaVue3D.greffer) est son
// seul accès ; ses trajets sont calculés par Pathfinder.computeRoute (lecture) et dessinés dans son propre groupe.
// ⚠️ contrat (décision produit) : refusé sur une installation reliée à un serveur, pendant le suivi du tracker, une
// sortie d'urgence ou le mode Secours ; textes fr/en/es ici, jamais dans lang/*.json ; scores sous sa propre clé.
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
      "hud.sansNom": "un point du réseau", "hud.tirer": "Tirer", "hud.cartouches": "Cartouches",
      "hud.recharge": "Recharge…", "hud.vide": "Plus de cartouches", "hud.plusCartouches": "+{n} cartouches",
      "hud.plusSante": "+{n} santé", "hud.recule": "Elle recule…",
      "fin.titre": "Tu es resté sous terre", "fin.texte": "Vague {n} · {r} réussie(s)",
      "fin.meilleure": "Meilleure vague ({diff}) : {m}", "fin.rejouer": "Rejouer"
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
      "hud.sansNom": "a point of the network", "hud.tirer": "Shoot", "hud.cartouches": "Shells",
      "hud.recharge": "Reloading…", "hud.vide": "Out of shells", "hud.plusCartouches": "+{n} shells",
      "hud.plusSante": "+{n} health", "hud.recule": "It backs away…",
      "fin.titre": "You stayed underground", "fin.texte": "Wave {n} · {r} cleared",
      "fin.meilleure": "Best wave ({diff}): {m}", "fin.rejouer": "Play again"
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
      "hud.sansNom": "un punto de la red", "hud.tirer": "Disparar", "hud.cartouches": "Cartuchos",
      "hud.recharge": "Recargando…", "hud.vide": "Sin cartuchos", "hud.plusCartouches": "+{n} cartuchos",
      "hud.plusSante": "+{n} salud", "hud.recule": "Retrocede…",
      "fin.titre": "Te quedaste bajo tierra", "fin.texte": "Oleada {n} · {r} superada(s)",
      "fin.meilleure": "Mejor oleada ({diff}): {m}", "fin.rejouer": "Jugar otra vez"
    }
  };

  // Réglages du jeu (m, points, par seconde, ms) : premiers essais, à revoir au jeu.
  const REGLES = {
    departM: 40, pasM: 30, minM: 10, candidats: 8, arriveeM: 2, sante: 100, endurance: 100,
    videParS: 22, repriseParS: 14, souffleReprise: 30, coeurSous: 5, regardM: 5, majHudMs: 150, messageMs: 2200,
    cartouches: { canon: 2, reserve: 6 }, eclairMs: 90, imageMs: 33, blesseMs: 600, coupMs: 250, tapeMs: 250,
    tapePx: 6
  };
  const DIFFICULTES = {
    facile: { traces: true, route: true, guidage: true },
    moyen: { traces: true, route: true, guidage: false },
    difficile: { traces: false, route: false, guidage: false }
  };
  const ROUTE = { largeur: 0.3, y: 0.08 };
  const BALISE = { rayon: 0.25, anneau: [0.6, 0.85], opacite: 0.55 };
  const CLE_SCORES = "myktamap_mkmg_v1";
  const SCRIPTS = ["addons/mkmg/js/son.js", "addons/mkmg/js/monde.js"];

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

  function _son() { return window.KtaAddons.mkmgSon; }
  function _monde() { return window.KtaAddons.mkmgMonde; }
  function _jouer(nom, force) { const S = _son(); if (S) S.jouer(nom, force); }

  // ── Démarrage ─────────────────────────────────────────────────────────────────────────────────────────

  function _refus() {
    const X = window.KtaExtensions;
    // Installation reliée : refusé, sauf si son hébergeur l'autorise (data/reglages.json > addons.mkmg,
    // ktaInstance.js).
    const I = window.KtaInstance && window.KtaInstance.etat(), permis = !!(I && I.reglages && I.reglages.addons &&
      I.reglages.addons.mkmg === true);
    if (X && typeof X.etat === "function" && X.etat().etat !== "off" && !permis) return "refus.installation";
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

  // Sons et monde, chargés une fois, dans l'ordre (même origine, précachés).
  function _chargerScripts() {
    return SCRIPTS.reduce(function (prec, src) {
      return prec.then(function () {
        if (document.querySelector('script[src="' + src + '"]')) return true;
        return new Promise(function (ok, ko) {
          const s = document.createElement("script");
          s.src = src;
          s.addEventListener("load", function () { ok(true); });
          s.addEventListener("error", function () { s.remove(); ko(new Error(src)); });
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve(true));
  }

  function lancer() {
    const K = window.KtaVue3D;
    if (_p || !K || !K.etat().ouvert) return;
    const refus = _refus();
    if (refus) { window.ktaAlerte(_t(refus)); return; }
    _chargerCss();
    _chargerScripts().then(function () {
      const choix = { valeur: "facile", options: ["facile", "moyen", "difficile"].map(function (d) {
        return { valeur: d, titre: _t("diff." + d), aide: _t("diff." + d + ".aide") };
      }) };
      return window.ktaConfirm(_esc(_t("confirmer.texte")), {
        titre: _esc(_t("confirmer.titre")), okLabel: _esc(_t("confirmer.oui")),
        cancelLabel: _esc(_t("confirmer.non")), choix: choix
      }).then(function (oui) {
        if (!oui || _p || _refus() || !K.etat().ouvert) return;
        _son().demarrer();   // 🩸 dans la suite du geste (bouton) : sinon le son reste suspendu
        _demarrer(DIFFICULTES[choix.valeur] ? choix.valeur : "facile");
      });
    }).catch(function (err) { console.warn("[Mkmg] fichier introuvable :", err && err.message); });
  }

  function _demarrer(diff) {
    _p = { diff: diff, regle: DIFFICULTES[diff], vague: 0, sante: REGLES.sante, endurance: REGLES.endurance,
      souffle: false, cible: null, route: null, longueurs: null, calcul: 0, ctx: null, hud: null, traits: [],
      majHud: 0, reussies: 0, restantM: null, ennemis: [], objets: [], gabarits: null, niveauMonde: null,
      canon: REGLES.cartouches.canon, reserve: REGLES.cartouches.reserve, rechargeFin: 0, fin: false, tues: 0,
      blesseT: 0, ecouteurs: [], saleT: 0, carte: null };
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
      _brancher();
      _nouvelleVague();
    }
    // 🩸 Reprise du contexte : groupe neuf, les objets d'avant sont morts avec l'ancien (jamais dispose()).
    if (raison === "reprise") { p.traits = []; _monde().dessiner(p, ctx, true); }
    // Autre niveau (passage 🪜) : le monde de la vague est refait là où l'on est.
    if (raison === "refaite" && p.niveauMonde !== null && ctx.niveau !== p.niveauMonde && !p.fin) {
      _monde().vider(p);
      _monde().peupler(p, ctx);
    }
    _dessiner();
  }

  function _surImage(ctx, dt) {
    const p = _p;
    if (!p) return;
    p.ctx = ctx;
    const t = performance.now();
    if (p.fin) return;
    if (ctx.court && !p.souffle) {
      p.endurance = Math.max(0, p.endurance - REGLES.videParS * dt);
      if (p.endurance === 0) { p.souffle = true; ctx.regler({ course: false }); _jouer("souffle"); }
    } else {
      p.endurance = Math.min(REGLES.endurance, p.endurance + REGLES.repriseParS * dt);
      if (p.souffle && p.endurance >= REGLES.souffleReprise) { p.souffle = false; ctx.regler({ course: true }); }
    }
    if (p.rechargeFin && t >= p.rechargeFin) {
      const n = Math.min(REGLES.cartouches.canon - p.canon, p.reserve);
      p.canon += n; p.reserve -= n; p.rechargeFin = 0;
    }
    const r = _monde().animer(p, ctx, dt);
    r.sons.forEach(function (s) { _jouer(s[0], s[1]); });
    // Battement de cœur (décision produit) : seulement à bout de souffle ou sous coeurSous % d'endurance, fort et
    // rapide à sec, de plus en plus lent pendant la reprise, éteint une fois le souffle revenu.
    const seuil = p.souffle ? REGLES.souffleReprise : REGLES.coeurSous;
    p.coeur = p.endurance < seuil ? Math.max(0.2, 1 - p.endurance / seuil) : 0;
    _son().proximite(p.coeur);
    r.ramasse.forEach(function (type) {
      if (type === "munitions") {
        const n = _monde().REGLES.munitions.gain;
        p.reserve += n;
        _jouer("ramasse");
        _message(_t("hud.plusCartouches", { n: n }));
      } else {
        const n = _monde().REGLES.champignons.soin;
        p.sante = Math.min(REGLES.sante, p.sante + n);
        _jouer("soin");
        _message(_t("hud.plusSante", { n: n }));
      }
    });
    if (r.degats > 0) {
      p.sante = Math.max(0, p.sante - r.degats);
      if (t - p.blesseT > REGLES.blesseMs) { p.blesseT = t; _jouer("blesse"); _coup(); }
    }
    if (p.sante <= 0) { _finPartie(); return; }
    if (p.cible) {
      const pos = ctx.pos, d = Math.hypot(p.cible.x - pos.x, p.cible.y - pos.y) / ctx.sc;
      if (d <= REGLES.arriveeM) { _vagueReussie(); return; }
    }
    if (t - p.majHud > REGLES.majHudMs) { p.majHud = t; _majHud(); }
    // Les menaces bougent sans nous : une image redemandée, 30 par seconde au plus (iPhone, plan dense).
    if (t - p.saleT >= REGLES.imageMs) { p.saleT = t; ctx.sale(); }
  }

  function _demonter(ctx, raison) {
    const p = _p;
    if (!p) return;
    p.ecouteurs.forEach(function (x) { x[0].removeEventListener(x[1], x[2], x[3]); });
    if (raison !== "contexte") _vider();
    if (_monde()) _monde().liberer(p, raison === "contexte");
    if (_son()) _son().arreter();
    clearTimeout(p.messageMinuterie);
    _p = null;
    console.log("[Mkmg] partie terminée (" + raison + ", " + p.reussies + " vague(s) réussie(s))");
  }

  function quitter() { if (_p && _p.retirer) _p.retirer(); }

  // ── Commandes : bouton, Espace, clic bref de la souris sur la scène ───────────────────────────────────

  function _brancher() {
    const p = _p;
    const on = function (cible, type, f, opt) {
      cible.addEventListener(type, f, opt);
      p.ecouteurs.push([cible, type, f, opt]);
    };
    on(document, "keydown", function (ev) {
      if (ev.code !== "Space" || ev.repeat || document.getElementById("kta-confirm-oui")) return;
      ev.preventDefault();
      _tirer();
    });
    const cv = document.querySelector("#kta-vue3d .kta-v3d-canvas");
    if (cv) {
      let appui = null;
      on(cv, "pointerdown", function (ev) {
        appui = ev.pointerType === "mouse" && ev.button === 0 ? { x: ev.clientX, y: ev.clientY, t: performance.now() }
          : null;
      });
      on(cv, "pointerup", function (ev) {
        if (appui && performance.now() - appui.t < REGLES.tapeMs &&
          Math.hypot(ev.clientX - appui.x, ev.clientY - appui.y) < REGLES.tapePx) _tirer();
        appui = null;
      });
    }
  }

  function _tirer() {
    const p = _p;
    if (!p || p.fin || !p.ctx || p.rechargeFin) return;
    const ctx = p.ctx;
    if (p.canon === 0) {
      if (p.reserve > 0) _recharger(); else { _jouer("vide"); _message(_t("hud.vide")); }
      return;
    }
    p.canon--;
    _jouer("tir");
    _eclair();
    if (p.hud) {
      // Recul du bouton rejoué à chaque coup : la classe retirée puis remise après un reflow.
      p.hud.tirer.classList.remove("mkmg-recul");
      void p.hud.tirer.offsetWidth;
      p.hud.tirer.classList.add("mkmg-recul");
    }
    const r = _monde().tirer(p, ctx);
    if (r.tue) { p.tues++; _jouer("mort"); }
    if (r.touche === "silhouette") _message(_t("hud.recule"));
    if (p.canon === 0 && p.reserve > 0) _recharger();
    _majHud();
    ctx.sale();
  }

  function _recharger() {
    const p = _p;
    p.rechargeFin = performance.now() + _monde().REGLES.tir.recharge * 1000;
    _jouer("recharge");
  }

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

  // Place libre (règle du pas de la vue) la plus proche de q, en couronnes de 0,25 m jusqu'à 6 m ; q sinon.
  function _placeLibre(ctx, q) {
    if (ctx.libre(q.x, q.y)) return { x: q.x, y: q.y };
    for (let r = 0.25; r <= 6; r += 0.25) {
      const n = Math.max(8, Math.round(2 * Math.PI * r / 0.25));
      for (let k = 0; k < n; k++) {
        const a = k * 2 * Math.PI / n, x = q.x + Math.cos(a) * r * ctx.sc, y = q.y + Math.sin(a) * r * ctx.sc;
        if (ctx.libre(x, y)) return { x: x, y: y };
      }
    }
    return { x: q.x, y: q.y };
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
    _monde().peupler(p, ctx);
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
    // ⚠️ contrat (décision produit) : un POI relevé hors de la galerie (dans la roche, une salle sans tracé) est
    // validé DANS la galerie, au bout du trajet sur les tracés ; et jamais dans une structure (pilier, mur, front) :
    // la place libre la plus proche de ce point (règle du pas de la vue, ctx.libre).
    if (cible) cible = Object.assign({}, cible, _placeLibre(ctx, route ? route[route.length - 1] : cible));
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
    _jouer("vague");
    _message(_t("hud.reussie", { n: p.vague }));
    _nouvelleVague();
  }

  // ── Fin de partie et scores (clé locale à part, jamais dans la session) ──────────────────────────────

  function _lireScores() {
    try { return JSON.parse(localStorage.getItem(CLE_SCORES) || "{}") || {}; } catch (e) { return {}; }
  }

  function _finPartie() {
    const p = _p;
    p.fin = true;
    p.ctx.regler({ course: false });
    _son().proximite(0);
    _jouer("fin");
    const scores = _lireScores(), avant = Number(scores[p.diff]) || 0;
    scores[p.diff] = Math.max(avant, p.reussies);
    try { localStorage.setItem(CLE_SCORES, JSON.stringify(scores)); } catch (e) { /* stockage refusé : sans score */ }
    const h = p.hud, f = _el(p.ctx.hud, "div", "mkmg-fin");
    f.setAttribute("role", "dialog");
    _el(f, "div", "mkmg-fin-titre", _t("fin.titre"));
    _el(f, "div", "mkmg-fin-texte", _t("fin.texte", { n: p.vague, r: p.reussies }));
    _el(f, "div", "mkmg-fin-texte", _t("fin.meilleure", { diff: _t("diff." + p.diff), m: scores[p.diff] }));
    const bts = _el(f, "div", "mkmg-fin-boutons");
    const rejouer = _el(bts, "button", "mkmg-bouton mkmg-bouton-primaire", _t("fin.rejouer"));
    rejouer.type = "button";
    rejouer.addEventListener("click", function () {
      const diff = p.diff;
      quitter();
      _son().demarrer();
      _demarrer(diff);
    });
    const q = _el(bts, "button", "mkmg-bouton", _t("hud.quitter"));
    q.type = "button";
    q.addEventListener("click", quitter);
    h.fin = f;
    _majHud();
    try { rejouer.focus({ preventScroll: true }); } catch (e) { /* focus refusé : sans effet */ }
    console.log("[Mkmg] fin de partie : vague " + p.vague + ", " + p.reussies + " réussie(s), " + p.tues + " égaré(s)");
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
    p.traits.forEach(function (o) {
      if (o.parent) o.parent.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    p.traits = [];
  }

  function _ajouter(o) { _p.ctx.groupe.add(o); _p.traits.push(o); }

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
    h.coup = _el(ctx.hud, "div", "mkmg-coup");
    h.panneau = _el(ctx.hud, "div", "mkmg-panneau");
    h.vague = _el(h.panneau, "div", "mkmg-vague");
    h.sante = _barre(h.panneau, _t("hud.sante"));
    h.endurance = _barre(h.panneau, _t("hud.endurance"));
    h.endurance.parentNode.parentNode.classList.add("mkmg-jauge-endurance");
    h.cartouches = _el(h.panneau, "div", "mkmg-cartouches");
    h.objectif = _el(h.panneau, "div", "mkmg-objectif");
    h.guide = _el(h.panneau, "div", "mkmg-guide");
    h.fleche = _el(h.guide, "span", "mkmg-fleche", "↑");
    h.reste = _el(h.guide, "span", "mkmg-reste");
    h.quitter = _el(h.panneau, "button", "mkmg-bouton", _t("hud.quitter"));
    h.quitter.type = "button";
    h.quitter.addEventListener("click", quitter);
    h.tirer = _el(ctx.hud, "button", "mkmg-tirer");
    h.tirer.type = "button";
    h.tirer.title = _t("hud.tirer");
    h.tirer.setAttribute("aria-label", _t("hud.tirer"));
    const img = _el(h.tirer, "img", "mkmg-tirer-image");
    img.src = "addons/mkmg/img/fusil.svg";
    img.alt = "";
    h.tirer.addEventListener("pointerdown", function (ev) { ev.preventDefault(); _tirer(); });
    h.message = _el(ctx.hud, "div", "mkmg-message");
    h.message.hidden = true;
    h.message.setAttribute("aria-live", "polite");
    p.hud = h;
    _majHud();
  }

  // Éclair du tir : liseré doré bref sur le calque (une lumière de plus que la lampe coûterait sur chaque pixel).
  function _eclair() {
    const h = _p && _p.hud;
    if (!h) return;
    h.coup.classList.add("mkmg-eclair-actif");
    clearTimeout(_p.eclairMinuterie);
    _p.eclairMinuterie = setTimeout(function () { h.coup.classList.remove("mkmg-eclair-actif"); }, REGLES.eclairMs);
  }

  function _coup() {
    const h = _p && _p.hud;
    if (!h) return;
    h.coup.classList.add("mkmg-coup-actif");
    clearTimeout(_p.coupMinuterie);
    _p.coupMinuterie = setTimeout(function () { h.coup.classList.remove("mkmg-coup-actif"); }, REGLES.coupMs);
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
    h.cartouches.textContent = "🔫 " + p.canon + " · " + p.reserve + " " + _t("hud.cartouches").toLowerCase() +
      (p.rechargeFin ? " · " + _t("hud.recharge") : "");
    h.tirer.disabled = p.fin;
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
    if (!p) return { enCours: false, scores: _lireScores() };
    return { enCours: true, diff: p.diff, vague: p.vague, reussies: p.reussies, sante: Math.round(p.sante),
      endurance: Math.round(p.endurance), souffle: p.souffle, cible: p.cible ? { x: p.cible.x, y: p.cible.y,
        nom: p.cible.nom } : null, route: p.route ? p.route.length : 0, restantM: p.restantM,
      traits: p.traits.length, calcul: p.calcul, canon: p.canon, reserve: p.reserve, recharge: !!p.rechargeFin,
      fin: p.fin, tues: p.tues, scores: _lireScores(), coeur: +(p.coeur || 0).toFixed(2),
      msMonde: +(p.msMonde || 0).toFixed(3),
      ennemis: p.ennemis.map(function (o) { return { type: o.type, x: o.x, y: o.y, pv: o.pv, vu: !!o.vu }; }),
      objets: p.objets.map(function (o) { return { type: o.type, x: o.x, y: o.y }; }) };
  }

  // Mise en place d'une situation (checkup seulement) : vider le monde, poser un ennemi ou un objet, la santé.
  const essai = {
    vider: function () { if (_p) _monde().vider(_p); },
    poser: function (type, x, y) {
      if (!_p || !_p.ctx) return;
      const o = type === "egare" ? { type: type, x: x, y: y, pv: _monde().REGLES.egares.pv, vitesse: 1.2, grogneT: 9 }
        : { type: type, x: x, y: y };
      (type === "egare" || type === "silhouette" ? _p.ennemis : _p.objets).push(o);
      _monde().dessiner(_p, _p.ctx, false);
    },
    sante: function (v) { if (_p) _p.sante = v; }
  };

  window.KtaAddons = window.KtaAddons || {};
  window.KtaAddons.mkmg = { lancer: lancer, quitter: quitter, etat: etat, essai: essai };
})();
