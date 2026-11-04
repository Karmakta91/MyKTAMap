/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// addons/mkmg/js/coeur.js — add-on « mkmg » : jeu en vagues dans la vue 3D, sur le plan ouvert. Chargé par la vue 3D
// seule (vue3d.js > ADDONS_CODE, code « six vers le bas »), jamais au démarrage ; charge à son tour son.js et
// monde.js et joueur.js (bras et fusil en vue à hauteur d'yeux, silhouette verte en vue plongeante). Expose
// window.KtaAddons.mkmg = { lancer(), quitter(), etat(), essai } (etat, essai : checkup). Une vague =
// rejoindre un point B (POI de plus en plus loin, sinon un point des tracés) avec des égarés et, dès la vague 2, la
// silhouette (monde.js) ; fusil à deux coups (rage après 20 égarés : santé pleine, 30 s de tir auto), munitions,
// piles et champignons ramassés en passant ; viseur à la souris capturée (PC) ; santé à 0 = fin,
// meilleure vague retenue par difficulté. La pile de la lampe s'use (lampe qui baisse et vacille, à plat = lueur de
// quelques mètres : ctx.regler({ lampe })) ; l'eau ralentit (ctx.regler({ vitesse })) ; près d'un effondrement, des
// éboulis couvrent les grognements. Dès la vague 4, sur un plan multi-niveau, B est parfois à un autre niveau ; toutes
// les 5 vagues, un gardien garde B. Difficulté : facile = tracés + itinéraire du jeu + guidage ; moyen = tracés +
// itinéraire ; difficile = rien.
// 🔒 Ne touche ni tracker, ni session, ni filtres, ni l'itinéraire de l'app : la greffe (KtaVue3D.greffer) est son
// seul accès ; ses trajets sont calculés par Pathfinder.computeRoute (lecture) et dessinés dans son propre groupe.
// ⚠️ contrat (décision produit) : refusé sur une installation reliée à un serveur, pendant le suivi du tracker, une
// sortie d'urgence ou le mode Secours ; textes fr/en/es ici, jamais dans lang/*.json ; scores sous sa propre clé.
// Doc : docs/architecture/addons.md · Garde-fou : scripts/smoke/checkup-vue-3d.js

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
      "hud.reduire": "Réduire", "hud.agrandir": "Agrandir", "hud.tues": "Égarés tués", "hud.tirs": "Balles tirées",
      "hud.touches": "Balles au but",
      "hud.sansNom": "un point du réseau", "hud.tirer": "Tirer", "hud.cartouches": "Cartouches",
      "hud.viser": "Clic sur la scène : viser à la souris · Échap pour la libérer",
      "hud.rage": "Rage", "hud.ragePrete": "Rage prête ! (bouton au-dessus du fusil, ou R)",
      "hud.rageCharge": "Rage : {n} / {m} égarés",
      "hud.rageActive": "RAGE ! Santé au max, garde le doigt sur la détente",
      "hud.rageFin": "La rage retombe",
      "hud.recharge": "Recharge…", "hud.vide": "Plus de cartouches", "hud.plusCartouches": "+{n} cartouches",
      "hud.plusSante": "+{n} santé", "hud.recule": "Elle recule…",
      "fin.titre": "Tu es resté sous terre", "fin.texte": "Vague {n} · {r} réussie(s)",
      "fin.meilleure": "Meilleure vague ({diff}) : {m}", "fin.rejouer": "Rejouer",
      "hud.tropTard": "Trop tard ! Ils arrivent de partout…", "hud.tenaille": "Pris en tenaille : fuis !",
      "hud.lampe": "Lampe", "hud.plusPile": "+{n} % de pile", "hud.pileFaible": "La lampe faiblit…",
      "hud.pileVide": "Plus de pile : avance à tâtons", "hud.objectifNiveau": "Rejoins : {nom} · niveau {n}",
      "hud.hurle": "Un hurlement… ils accourent !", "hud.gardien": "Gardien",
      "hud.gardienVague": "Quelque chose garde la sortie…", "hud.gardienAbattu": "Le gardien est tombé !"
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
      "hud.reduire": "Collapse", "hud.agrandir": "Expand", "hud.tues": "Lost ones killed", "hud.tirs": "Shots fired",
      "hud.touches": "Hits",
      "hud.sansNom": "a point of the network", "hud.tirer": "Shoot", "hud.cartouches": "Shells",
      "hud.viser": "Click the scene to aim with the mouse · Esc to release it",
      "hud.rage": "Rage", "hud.ragePrete": "Rage ready! (button above the shotgun, or R)",
      "hud.rageCharge": "Rage: {n} / {m} lost ones", "hud.rageActive": "RAGE! Full health, hold the trigger",
      "hud.rageFin": "The rage fades",
      "hud.recharge": "Reloading…", "hud.vide": "Out of shells", "hud.plusCartouches": "+{n} shells",
      "hud.plusSante": "+{n} health", "hud.recule": "It backs away…",
      "fin.titre": "You stayed underground", "fin.texte": "Wave {n} · {r} cleared",
      "fin.meilleure": "Best wave ({diff}): {m}", "fin.rejouer": "Play again",
      "hud.tropTard": "Too late! They come from everywhere…", "hud.tenaille": "Caught in a pincer: run!",
      "hud.lampe": "Lamp", "hud.plusPile": "+{n}% battery", "hud.pileFaible": "The lamp is fading…",
      "hud.pileVide": "Battery dead: feel your way", "hud.objectifNiveau": "Reach: {nom} · level {n}",
      "hud.hurle": "A howl… they're coming!", "hud.gardien": "Guardian",
      "hud.gardienVague": "Something guards the way out…", "hud.gardienAbattu": "The guardian has fallen!"
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
      "hud.reduire": "Reducir", "hud.agrandir": "Ampliar", "hud.tues": "Perdidos abatidos", "hud.tirs": "Disparos",
      "hud.touches": "Aciertos",
      "hud.sansNom": "un punto de la red", "hud.tirer": "Disparar", "hud.cartouches": "Cartuchos",
      "hud.viser": "Clic en la escena: apuntar con el ratón · Esc para soltarlo",
      "hud.rage": "Furia", "hud.ragePrete": "¡Furia lista! (botón sobre la escopeta, o R)",
      "hud.rageCharge": "Furia: {n} / {m} perdidos", "hud.rageActive": "¡FURIA! Salud al máximo, mantén el gatillo",
      "hud.rageFin": "La furia se apaga",
      "hud.recharge": "Recargando…", "hud.vide": "Sin cartuchos", "hud.plusCartouches": "+{n} cartuchos",
      "hud.plusSante": "+{n} salud", "hud.recule": "Retrocede…",
      "fin.titre": "Te quedaste bajo tierra", "fin.texte": "Oleada {n} · {r} superada(s)",
      "fin.meilleure": "Mejor oleada ({diff}): {m}", "fin.rejouer": "Jugar otra vez",
      "hud.tropTard": "¡Demasiado tarde! Llegan por todas partes…", "hud.tenaille": "Atrapado en tenaza: ¡huye!",
      "hud.lampe": "Linterna", "hud.plusPile": "+{n} % de batería", "hud.pileFaible": "La linterna se apaga…",
      "hud.pileVide": "Sin batería: avanza a tientas", "hud.objectifNiveau": "Llega a: {nom} · nivel {n}",
      "hud.hurle": "Un aullido… ¡vienen corriendo!", "hud.gardien": "Guardián",
      "hud.gardienVague": "Algo vigila la salida…", "hud.gardienAbattu": "¡El guardián ha caído!"
    }
  };

  // Réglages du jeu (m, points, par seconde, ms) : premiers essais, à revoir au jeu.
  const REGLES = {
    departM: 40, pasM: 30, minM: 10, candidats: 8, arriveeM: 2, sante: 100, endurance: 100,
    videParS: 22, repriseParS: 14, souffleReprise: 30, coeurSous: 5, regardM: 5, majHudMs: 150, messageMs: 2200,
    cartouches: { canon: 2, reserve: 6 }, eclairMs: 90, imageMs: 33, blesseMs: 600, coupMs: 250, tapeMs: 250,
    tapePx: 6,
    // Viseur (souris capturée) : px rejoués par px de souris, refus avant de rendre le glisser, Échap ignoré après.
    viseur: { id: 7331, k: 1, refus: 3, echapMs: 300 },
    // Rage (décision produit) : prête après `tues` égarés tués hors rage ; `dureeS` s de tir automatique (un coup
    // toutes les `cadenceMs` tant que la détente est tenue), munitions illimitées, `chargeur` coups avant recharge.
    rage: { tues: 20, dureeS: 30, chargeur: 25, cadenceMs: 110 },
    // Chrono d'une vague (décision produit) : longueur du trajet vers B à `vitesse` m/s (+ `parVague`, `max` au plus)
    // plus une marge qui fond ; sans trajet, la distance à vol d'oiseau × `sansTrajet`. À 0 : horde et santé.
    chrono: { vitesse: 1.4, parVague: 0.08, max: 2.4, marge: 30, margeParVague: 2, margeMin: 10, sansTrajet: 1.4,
      alerteS: 10 },
    tropTard: { degats: 25, horde: 6, parVague: 1, rayonM: 12, groupes: 3 },
    // Sandwich (décision produit) : un groupe devant soi SUR le trajet, un autre derrière, à mi-parcours de chaque
    // vague, et au hasard dès la vague `hasardDes`, de plus en plus souvent.
    tenaille: { mi: 0.5, devantM: 18, derriereM: 15, n: 2, parDeuxVagues: 1, hasardDes: 3, hasardS: [40, 70],
      hasardParVague: 0.1 },
    // Pile (décision produit) : s'use de `parS` % par seconde ; sous `faible` %, la lampe baisse jusqu'à `min` (lueur
    // de quelques mètres, jamais le noir) et vacille (×`vacille`, de plus en plus souvent).
    pile: { max: 100, parS: 0.55, faible: 25, min: 0.08, vacille: 0.35, vacilleHz: 2.5, vacilleMs: [50, 200] },
    respireSous: 50, eau: { x: 0.6, ploufM: 0.6, testMs: 200 },
    eboulis: { rayonM: 15, s: [8, 20], masqueMs: 2500, testMs: 1000 },
    // B à un autre niveau (plan multi-niveau) : dès la vague `des`, une fois sur `1 / chance` ; jamais en vague boss.
    autreNiveau: { des: 4, chance: 0.4 }, gardienTous: 5,
    // Trajet recalé (on fuit, le trajet suit) : à plus de `ecartM` du trajet pendant `tenirMs`, au plus une fois
    // toutes les `entreMs`.
    recalage: { ecartM: 6, tenirMs: 1500, entreMs: 3000 }
  };
  const DIFFICULTES = {
    facile: { traces: true, route: true, guidage: true },
    moyen: { traces: true, route: true, guidage: false },
    difficile: { traces: false, route: false, guidage: false }
  };
  const ROUTE = { largeur: 0.3, y: 0.08 };
  // Chevrons du sens du trajet, posés sur le ruban (m) : un tous les `pas`, longueur `l`, épaisseur des branches `ep`.
  const CHEVRON = { pas: 2, l: 0.26, ep: 0.06, y: 0.09 };
  const BALISE = { rayon: 0.25, anneau: [0.6, 0.85], opacite: 0.55 };
  const CLE_SCORES = "myktamap_mkmg_v1";
  const SCRIPTS = ["addons/mkmg/js/son.js", "addons/mkmg/js/monde.js", "addons/mkmg/js/joueur.js"];

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
  function _joueur() { return window.KtaAddons.mkmgJoueur; }
  function _jouer(nom, force, angle) { const S = _son(); if (S) S.jouer(nom, force, angle); }

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
      majHud: 0, reussies: 0, restantM: null, ennemis: [], objets: [], cadavres: [], gabarits: null, niveauMonde: null,
      canon: REGLES.cartouches.canon, reserve: REGLES.cartouches.reserve, rechargeFin: 0, fin: false, tues: 0,
      tirs: 0, touches: 0,
      blesseT: 0, ecouteurs: [], saleT: 0, carte: null, mondes: {}, pile: REGLES.pile.max, lampeK: 1, eau: false,
      eauT: 0, plouf: null, eboulisT: 0, eboulisProchain: 0, masqueFin: 0, pileAlerte: 0,
      ecartT: 0, recaleT: 0, recale: false, recalages: 0,
      rageTues: 0, rageFin: 0, rageCanon: 0, rechargeRage: false, gachette: false, prochainTir: 0 };
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
      // Pas de vue plongeante pendant la partie (décision produit) : voir d'en haut serait tricher. Pas de fiche au
      // toucher non plus : un tir au doigt ouvrirait celle d'un pilier ou d'un POI.
      ctx.regler({ traces: p.regle.traces, itineraire: false, guidage: false, plongee: false, reglagesFiges: true,
        fiches: false });
      _monterHud(ctx);
      _joueur().monter(p, ctx);
      _brancher();
      _son().ambiance(true);
      _nouvelleVague();
    }
    // 🩸 Reprise du contexte : groupe neuf, les objets d'avant sont morts avec l'ancien (jamais dispose()).
    if (raison === "reprise") { p.traits = []; _monde().dessiner(p, ctx, true); _joueur().monter(p, ctx, true); }
    // Autre niveau (passage 🪜) : le monde quitté attend là (refuge), celui d'ici est repris ou peuplé à moitié.
    if (raison === "refaite" && p.niveauMonde !== null && ctx.niveau !== p.niveauMonde && !p.fin) {
      _monde().changerNiveau(p, ctx);
    }
    _dessiner();
  }

  function _surImage(ctx, dt) {
    const p = _p;
    if (!p) return;
    p.ctx = ctx;
    const t = performance.now();
    _joueur().image(p, ctx, dt);
    if (p.fin) return;
    if (ctx.court && !p.souffle) {
      p.endurance = Math.max(0, p.endurance - REGLES.videParS * dt);
      if (p.endurance === 0) { p.souffle = true; ctx.regler({ course: false }); _jouer("souffle"); }
    } else {
      p.endurance = Math.min(REGLES.endurance, p.endurance + REGLES.repriseParS * dt);
      if (p.souffle && p.endurance >= REGLES.souffleReprise) { p.souffle = false; ctx.regler({ course: true }); }
    }
    if (p.rechargeFin && t >= p.rechargeFin) {
      if (p.rechargeRage) { p.rageCanon = REGLES.rage.chargeur; p.rechargeRage = false; } else {
        const n = Math.min(REGLES.cartouches.canon - p.canon, p.reserve);
        p.canon += n; p.reserve -= n;
      }
      p.rechargeFin = 0;
    }
    if (p.rageFin && t >= p.rageFin) _finRage(p);
    if (p.gachette && p.rageFin && t >= p.prochainTir) _tirer();
    _pile(p, ctx, t, dt);
    _eau(p, ctx, t);
    _eboulis(p, ctx, t);
    const r = _monde().animer(p, ctx, dt);
    // Un éboulis couvre grognements et pas un moment.
    r.sons.forEach(function (s) {
      if (t < p.masqueFin && (s[0] === "grogne" || s[0] === "pas")) return;
      _jouer(s[0], s[1], s[2]);
    });
    if (r.hurle) _message(_t("hud.hurle"));
    // Respiration seulement en courant (sous respireSous d'endurance) ou à bout de souffle : jamais au repos.
    const respire = p.souffle ? 1 : ctx.court && p.endurance < REGLES.respireSous ?
      1 - p.endurance / REGLES.respireSous : 0;
    _son().respiration(respire);
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
      } else if (type === "pile") {
        const n = _monde().REGLES.piles.gain;
        p.pile = Math.min(REGLES.pile.max, p.pile + n);
        _jouer("pile");
        _message(_t("hud.plusPile", { n: n }));
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
    if (p.cible && (p.cible.niveau === undefined || p.cible.niveau === ctx.niveau)) {
      const pos = ctx.pos, d = Math.hypot(p.cible.x - pos.x, p.cible.y - pos.y) / ctx.sc;
      if (d <= REGLES.arriveeM) { _vagueReussie(); return; }
    }
    if (p.chronoFin && !p.chronoDepasse && t >= p.chronoFin) _tropTard(p, ctx);
    _guetter(p, ctx, t);
    _recaler(p, ctx, t);
    if (t - p.majHud > REGLES.majHudMs) { p.majHud = t; _majHud(); }
    // Les menaces bougent sans nous : une image redemandée, 30 par seconde au plus (iPhone, plan dense).
    if (t - p.saleT >= REGLES.imageMs) { p.saleT = t; ctx.sale(); }
  }

  // Pile de la lampe : s'use, la lampe baisse et vacille sous le seuil faible, lueur minimale à plat.
  function _pile(p, ctx, t, dt) {
    const L = REGLES.pile;
    p.pile = Math.max(0, p.pile - L.parS * dt);
    let k = p.pile >= L.faible ? 1 : L.min + (1 - L.min) * p.pile / L.faible;
    if (p.pile < L.faible) {
      const freq = L.vacilleHz * (1 - p.pile / L.faible) + 0.4;
      if (t > (p.vacilleFin || 0) && Math.random() < dt * freq) {
        p.vacilleFin = t + L.vacilleMs[0] + Math.random() * (L.vacilleMs[1] - L.vacilleMs[0]);
      }
      if (t < p.vacilleFin) k *= L.vacille;
    }
    if (Math.abs(k - p.lampeK) > 0.005) { p.lampeK = k; ctx.regler({ lampe: k }); }
    // Messages au passage des seuils (1 = faible, 2 = à plat), oubliés quand une pile les remonte.
    const palier = p.pile <= 0 ? 2 : p.pile < L.faible ? 1 : 0;
    if (palier > p.pileAlerte) _message(_t(palier === 2 ? "hud.pileVide" : "hud.pileFaible"));
    p.pileAlerte = palier;
  }

  // Eau : pas ralenti (ctx.regler({ vitesse })) et éclaboussures en avançant.
  function _eau(p, ctx, t) {
    const E = REGLES.eau, pos = ctx.pos;
    if (t - p.eauT >= E.testMs) {
      p.eauT = t;
      const dedans = _monde().dansEau(ctx, pos.x, pos.y);
      if (dedans !== p.eau) { p.eau = dedans; ctx.regler({ vitesse: dedans ? E.x : 1 }); p.plouf = null; }
    }
    if (!p.eau) return;
    if (!p.plouf) p.plouf = { x: pos.x, y: pos.y };
    if (Math.hypot(pos.x - p.plouf.x, pos.y - p.plouf.y) / ctx.sc >= E.ploufM) {
      p.plouf = { x: pos.x, y: pos.y };
      _jouer("eclabousse", 0.6 + Math.random() * 0.4);
    }
  }

  // Effondrement à moins de rayonM : éboulis au hasard, situés, qui couvrent les grognements un moment.
  function _eboulis(p, ctx, t) {
    const B = REGLES.eboulis;
    if (t - p.eboulisT < B.testMs) return;
    p.eboulisT = t;
    const pos = ctx.pos, sc = ctx.sc;
    let best = null, bd = Infinity;
    _monde().zonesDe(ctx.niveau, ["effondrement"]).forEach(function (z) {
      z.points.forEach(function (q) {
        const d = Math.hypot(q.x - pos.x, q.y - pos.y) / sc;
        if (d < bd) { bd = d; best = q; }
      });
    });
    if (!best || bd > B.rayonM) { p.eboulisProchain = 0; return; }
    if (!p.eboulisProchain) { p.eboulisProchain = t + (B.s[0] + Math.random() * (B.s[1] - B.s[0])) * 1000 / 2; return; }
    if (t < p.eboulisProchain) return;
    p.eboulisProchain = t + (B.s[0] + Math.random() * (B.s[1] - B.s[0])) * 1000;
    p.masqueFin = t + B.masqueMs;
    _jouer("eboulis", 1 - 0.5 * bd / B.rayonM, _monde().angle(ctx, best));
  }

  function _demonter(ctx, raison) {
    const p = _p;
    if (!p) return;
    if (p.viseur) p.viseur.liberer();
    p.ecouteurs.forEach(function (x) { x[0].removeEventListener(x[1], x[2], x[3]); });
    if (raison !== "contexte") _vider();
    if (_monde()) _monde().liberer(p, raison === "contexte");
    if (_joueur()) _joueur().liberer(p, raison === "contexte");
    if (_son()) _son().arreter();
    clearTimeout(p.messageMinuterie);
    _p = null;
    console.log("[Mkmg] partie terminée (" + raison + ", " + p.reussies + " vague(s) réussie(s))");
  }

  function quitter() { if (_p && _p.retirer) _p.retirer(); }

  // ── Commandes : bouton, Espace, souris capturée (sinon clic bref) sur la scène ───────────────────────

  function _brancher() {
    const p = _p;
    const on = function (cible, type, f, opt) {
      cible.addEventListener(type, f, opt);
      p.ecouteurs.push([cible, type, f, opt]);
    };
    // 🩸 Son relancé à chaque geste (iOS le suspend sur une interruption et ne le rend que dans un geste).
    on(document, "pointerdown", function () { _son().reveiller(); }, true);
    on(document, "visibilitychange", function () { if (document.visibilityState === "visible") _son().reveiller(); });
    // 🩸 R est aussi le raccourci « Recherche » de la carte (shortcuts.js, écouteur de document posé avant le jeu) :
    // pris sur window en capture et arrêté là, sinon la recherche s'ouvre par-dessus la partie.
    on(window, "keydown", function (ev) {
      if (ev.code !== "KeyR" || ev.ctrlKey || ev.metaKey || ev.altKey || document.getElementById("kta-confirm-oui")) {
        return;
      }
      ev.stopPropagation();
      ev.preventDefault();
      if (!ev.repeat) _rage();
    }, true);
    on(document, "keydown", function (ev) {
      _son().reveiller();
      if (ev.repeat || document.getElementById("kta-confirm-oui")) return;
      if (ev.code !== "Space") return;
      ev.preventDefault();
      _gachette(true);
    });
    on(document, "keyup", function (ev) { if (ev.code === "Space") p.gachette = false; });
    // Détente relâchée où que ce soit (window en capture : le viseur arrête le pointerup de la souris capturée sur
    // window, mais pas les autres écouteurs du même nœud).
    const lacher = function () { p.gachette = false; };
    on(window, "pointerup", lacher, true);
    on(window, "pointercancel", lacher, true);
    on(window, "blur", lacher);
    const cv = document.querySelector("#kta-vue3d .kta-v3d-canvas");
    if (cv) {
      _brancherViseur(p, cv, on);
      // Souris non capturable (navigateur, refus répétés) : glisser pour regarder, clic bref pour tirer.
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

  // Viseur à la souris (PC) : un clic sur la scène capture la souris (Pointer Lock) ; elle tourne alors la vue sans
  // bouton enfoncé, le clic gauche tire, Échap la rend. La vue 3D n'en sait rien : la souris capturée lui rejoue un
  // glisser du doigt (pointerdown / pointermove / pointercancel synthétiques sur la scène), son seul geste de regard.
  // 🩸 Les vrais événements de souris sur la scène sont arrêtés en capture sur window : la vue les compterait comme
  // un deuxième doigt (inclinaison) et le glisser rejoué se figerait. Le glisser rejoué est toujours clos
  // (pointercancel) : un doigt resté posé bloquerait le regard à la souris après la partie.
  // 🩸 L'Échap qui rend la souris ne doit pas fermer la vue : arrêté pendant la capture et juste après (selon le
  // navigateur, keydown part avant ou après pointerlockchange).
  function _brancherViseur(p, cv, on) {
    if (typeof cv.requestPointerLock !== "function") return;
    const V = REGLES.viseur, v = { x: 0, y: 0, pose: false, rendu: 0, refus: 0 };
    const capte = function () { return document.pointerLockElement === cv; };
    const rejouer = function (type) {
      cv.dispatchEvent(new PointerEvent(type, { pointerId: V.id, pointerType: "mouse", clientX: v.x, clientY: v.y,
        bubbles: true, cancelable: true }));
    };
    const poser = function () { if (!v.pose) { v.x = 0; v.y = 0; v.pose = true; rejouer("pointerdown"); } };
    const lever = function () { if (v.pose) { v.pose = false; rejouer("pointercancel"); } };
    const tourner = function (dx, dy) { poser(); v.x += dx * V.k; v.y += dy * V.k; rejouer("pointermove"); };
    const souris = function (ev) {
      return ev.isTrusted && ev.pointerType === "mouse" && ev.target === cv && v.refus < V.refus;
    };
    on(window, "pointerdown", function (ev) {
      if (!souris(ev)) return;
      ev.stopPropagation();
      ev.preventDefault();
      _son().reveiller();
      if (capte()) { if (ev.button === 0) _gachette(true); return; }
      if (p.fin) return;
      try {
        const r = cv.requestPointerLock();
        if (r && typeof r.catch === "function") r.catch(function () { v.refus++; });
      } catch (err) { v.refus++; }
    }, true);
    on(window, "pointerup", function (ev) { if (souris(ev)) ev.stopPropagation(); }, true);
    on(window, "pointermove", function (ev) {
      if (!souris(ev)) return;
      ev.stopPropagation();
      if (capte() && (ev.movementX || ev.movementY)) tourner(ev.movementX, ev.movementY);
    }, true);
    on(document, "pointerlockchange", function () {
      if (capte()) { v.refus = 0; poser(); return; }
      v.rendu = performance.now();
      lever();
      if (!p.fin) _message(_t("hud.viser"));
    });
    on(window, "keydown", function (ev) {
      if (ev.key !== "Escape" || !(capte() || performance.now() - v.rendu < V.echapMs)) return;
      ev.stopPropagation();
      ev.preventDefault();
      if (capte()) document.exitPointerLock();
    }, true);
    p.viseur = {
      liberer: function () { if (capte()) document.exitPointerLock(); lever(); },
      tourner: tourner, lever: lever, capte: capte
    };
    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) _message(_t("hud.viser"));
  }

  function _tirer() {
    const p = _p;
    if (!p || p.fin || !p.ctx || p.rechargeFin) return;
    const ctx = p.ctx, rage = !!p.rageFin;
    if (!rage && p.canon === 0) {
      if (p.reserve > 0) _recharger(); else { _jouer("vide"); _message(_t("hud.vide")); }
      return;
    }
    // En rage, les cartouches ne sont pas comptées : seul le chargeur de la rage descend.
    if (rage) { p.rageCanon--; p.prochainTir = performance.now() + REGLES.rage.cadenceMs; } else p.canon--;
    _jouer("tir");
    _eclair();
    _joueur().tir(p);
    if (p.hud) {
      // Recul du bouton rejoué à chaque coup : la classe retirée puis remise après un reflow.
      p.hud.tirer.classList.remove("mkmg-recul");
      void p.hud.tirer.offsetWidth;
      p.hud.tirer.classList.add("mkmg-recul");
    }
    p.tirs++;
    const r = _monde().tirer(p, ctx);
    if (r.touche) p.touches++;
    if (r.tue) { p.tues++; _jouer("mort"); }
    // Les égarés tués pendant la rage ne rechargent pas la suivante (pas de rage sans fin).
    if (r.tue && !rage && ++p.rageTues === REGLES.rage.tues) { _jouer("vague"); _message(_t("hud.ragePrete")); }
    else if (r.tue && r.touche === "gardien") _message(_t("hud.gardienAbattu"));
    if (r.touche === "silhouette") _message(_t("hud.recule"));
    if (rage ? p.rageCanon === 0 : p.canon === 0 && p.reserve > 0) _recharger();
    _majHud();
    ctx.sale();
  }

  function _recharger() {
    const p = _p;
    p.rechargeFin = performance.now() + _monde().REGLES.tir.recharge * 1000;
    p.rechargeRage = !!p.rageFin;
    _jouer("recharge");
  }

  // Rage : prête après REGLES.rage.tues égarés tués ; bouton au-dessus du fusil ou touche R.
  function _rage() {
    const p = _p;
    if (!p || p.fin || p.rageFin || p.rageTues < REGLES.rage.tues) return;
    const R = REGLES.rage;
    p.rageTues = 0;
    p.rageFin = performance.now() + R.dureeS * 1000;
    p.rageCanon = R.chargeur;
    p.sante = REGLES.sante;   // la rage rend toute la santé (décision produit)
    // Une recharge du fusil en cours est abandonnée : la rage tire tout de suite (les cartouches restent comptées).
    p.rechargeFin = 0;
    p.rechargeRage = false;
    p.prochainTir = 0;
    _jouer("vague");
    _message(_t("hud.rageActive"));
    _majHud();
  }

  function _finRage(p) {
    p.rageFin = 0;
    if (p.rechargeRage) { p.rechargeFin = 0; p.rechargeRage = false; }
    if (p.canon === 0 && p.reserve > 0) _recharger();
    _message(_t("hud.rageFin"));
    _majHud();
  }

  // Détente tenue (bouton, clic gauche de la souris capturée, Espace) : tir automatique pendant la rage.
  function _gachette(oui) {
    const p = _p;
    if (!p) return;
    p.gachette = oui;
    if (oui) _tirer();
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

  // Place libre (règle du pas de la vue, hors remblais, effondrement, inaccessible : monde.js > placeOk) la plus
  // proche de q, en couronnes de 0,25 m jusqu'à 8 m ; q sinon.
  function _placeLibre(ctx, q) {
    const ok = _monde().placeOk;
    if (ok(ctx, q.x, q.y)) return { x: q.x, y: q.y };
    for (let r = 0.25; r <= 8; r += 0.25) {
      const n = Math.max(8, Math.round(2 * Math.PI * r / 0.25));
      for (let k = 0; k < n; k++) {
        const a = k * 2 * Math.PI / n, x = q.x + Math.cos(a) * r * ctx.sc, y = q.y + Math.sin(a) * r * ctx.sc;
        if (ok(ctx, x, y)) return { x: x, y: y };
      }
    }
    return { x: q.x, y: q.y };
  }

  // nivVers : niveau de l'arrivée s'il diffère du départ (trajet par les jonctions).
  async function _route(de, vers, niv, nivVers) {
    const P = window.Pathfinder;
    if (!P || typeof P.computeRoute !== "function") return null;
    const lvl = niv === null || niv === undefined ? undefined : niv;
    const lvlB = nivVers === undefined ? lvl : nivVers;
    try {
      const r = await P.computeRoute([{ x: de.x, y: de.y, level: lvl }, { x: vers.x, y: vers.y, level: lvlB }]);
      return r && Array.isArray(r.path) && r.path.length >= 2 ? r.path : null;
    } catch (e) { return null; }
  }

  async function _nouvelleVague() {
    const p = _p;
    if (!p || !p.ctx) return;
    p.vague++;
    p.chronoFin = 0; p.chronoDepasse = false; p.tenailleMi = false; p.prochaineTenaille = 0;
    const jeton = ++p.calcul, ctx = p.ctx, pos = ctx.pos, niv = ctx.niveau, sc = ctx.sc;
    const voulu = REGLES.departM + REGLES.pasM * (p.vague - 1);
    p.cible = null; p.route = null; p.longueurs = null; p.cherche = true;
    _monde().peupler(p, ctx);
    _dessiner();
    _majHud();
    const candidats = function (liste, autre) {
      return liste.map(function (q) {
        const c = { x: q.x, y: q.y, nom: q.nom || q.name || q.label || _t("hud.sansNom"),
          d: Math.hypot(q.x - pos.x, q.y - pos.y) / sc };
        if (autre) c.niveau = _niveauDe(q);
        return c;
      }).filter(function (c) { return c.d >= REGLES.minM || autre; })
        .sort(function (a, b) { return Math.abs(a.d - voulu) - Math.abs(b.d - voulu); }).slice(0, REGLES.candidats);
    };
    const cands = candidats(_pois(niv), false);
    const repli = _pointDesTraces(niv, pos, sc, voulu);
    if (repli) cands.push(repli);
    // Vague boss : B sur ce niveau (le gardien y est posé) ; sinon, parfois, à un autre niveau du plan.
    const boss = p.vague % REGLES.gardienTous === 0, AN = REGLES.autreNiveau;
    const autre = !boss && niv !== null && niv !== undefined && p.vague >= AN.des && window.APP_CONFIG &&
      window.APP_CONFIG.multiLevel === true && Math.random() < AN.chance;
    const listes = [cands];
    if (autre) {
      listes.unshift(candidats(_pois(null).filter(function (q) { return _niveauDe(q) !== niv; }), true));
    }
    let cible = null, route = null;
    for (let l = 0; l < listes.length && !route; l++) {
      for (let i = 0; i < listes[l].length && !route; i++) {
        route = await _route(pos, listes[l][i], niv, listes[l][i].niveau);
        if (_p !== p || jeton !== p.calcul) return;
        if (route) cible = listes[l][i];
      }
    }
    // Aucun trajet (plan sans tracés) : la cible la plus proche du voulu, sans itinéraire.
    if (!cible) cible = cands[0] || null;
    // ⚠️ contrat (décision produit) : un POI relevé hors de la galerie (dans la roche, une salle sans tracé) est
    // validé DANS la galerie, au bout du trajet sur les tracés ; et jamais dans une structure (pilier, mur, front) :
    // la place libre la plus proche de ce point (règle du pas de la vue, hors remblais, effondrement, inaccessible).
    // B à un autre niveau : le bout du trajet (sur les tracés de ce niveau-là ; la règle du pas d'ici n'y vaut rien).
    if (cible && cible.niveau !== undefined) {
      const b = route[route.length - 1];
      cible = Object.assign({}, cible, { x: b.x, y: b.y });
    } else if (cible) cible = Object.assign({}, cible, _placeLibre(ctx, route ? route[route.length - 1] : cible));
    p.cible = cible;
    p.cherche = false;
    p.route = route;
    p.longueurs = route ? _cumuls(route) : null;
    _lancerChrono(p, ctx, cible, route);
    _dessiner();
    _majHud();
    if (cible && boss && _monde().poserGardien(p, ctx, cible)) _message(_t("hud.gardienVague"));
    else if (cible) _message(_objectif(cible));
  }

  // On a fui loin du trajet (facile, moyen : le ruban ne mènerait plus nulle part) : nouveau trajet d'ici à B, à
  // la même cible et sans toucher au chrono. Aussi en difficile, pour la tenaille posée sur le trajet.
  function _recaler(p, ctx, t) {
    const R = REGLES.recalage;
    if (!p.cible || !p.route || p.recale || t - p.recaleT < R.entreMs) return;
    const pos = ctx.pos;
    if (_proche(p.route, p.longueurs, pos, ctx.niveau).d / ctx.sc <= R.ecartM) { p.ecartT = 0; return; }
    if (!p.ecartT) { p.ecartT = t; return; }
    if (t - p.ecartT < R.tenirMs) return;
    p.recale = true;
    p.recaleT = t;
    const jeton = p.calcul, cible = p.cible;
    _route(pos, cible, ctx.niveau, cible.niveau).then(function (route) {
      p.recale = false;
      p.ecartT = 0;
      if (_p !== p || jeton !== p.calcul || p.cible !== cible || !route) return;
      p.route = route;
      p.longueurs = _cumuls(route);
      p.recalages++;
      _dessiner();
      _majHud();
    });
  }

  function _objectif(c) {
    return c.niveau === undefined ? _t("hud.objectif", { nom: c.nom })
      : _t("hud.objectifNiveau", { nom: c.nom, n: c.niveau });
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

  // ── Chrono et embuscades ─────────────────────────────────────────────────────────────────────────────

  function _lancerChrono(p, ctx, cible, route) {
    if (!cible) return;
    const C = REGLES.chrono, n = p.vague - 1, sc = ctx.sc;
    const long = route ? _cumuls(route)[route.length - 1] / sc
      : Math.hypot(cible.x - ctx.pos.x, cible.y - ctx.pos.y) / sc * C.sansTrajet;
    const vitesse = Math.min(C.max, C.vitesse + C.parVague * n);
    const marge = Math.max(C.margeMin, C.marge - C.margeParVague * n);
    p.chronoFin = performance.now() + (long / vitesse + marge) * 1000;
    p.chronoDepasse = false;
    const H = REGLES.tenaille;
    p.prochaineTenaille = p.vague >= H.hasardDes ? performance.now() + _delaiTenaille(p) : 0;
  }

  function _delaiTenaille(p) {
    const H = REGLES.tenaille, s = H.hasardS[0] + Math.random() * (H.hasardS[1] - H.hasardS[0]);
    return s * 1000 / (1 + H.hasardParVague * (p.vague - H.hasardDes));
  }

  // Chrono à 0 : santé perdue et horde en plusieurs groupes autour de soi ; la vague continue, B reste à atteindre.
  function _tropTard(p, ctx) {
    const T = REGLES.tropTard, pos = ctx.pos, n = T.horde + T.parVague * (p.vague - 1);
    p.chronoDepasse = true;
    p.sante = Math.max(0, p.sante - T.degats);
    // Groupes répartis autour de soi ; un groupe tombé hors du plan (ou dans la roche) est reposé ailleurs.
    const a0 = Math.random() * Math.PI * 2, r = T.rayonM * ctx.sc;
    let poses = 0;
    for (let g = 0; g < T.groupes * 3 && poses < n; g++) {
      const a = a0 + g * 2 * Math.PI / T.groupes + (g >= T.groupes ? Math.random() : 0);
      poses += _monde().surgir(p, ctx, { x: pos.x + Math.cos(a) * r, y: pos.y + Math.sin(a) * r },
        Math.min(Math.ceil(n / T.groupes), n - poses), 4);
    }
    _jouer("blesse"); _jouer("grogne", 1); _coup();
    _message(_t("hud.tropTard"));
  }

  // Sandwich : un groupe devant SUR le trajet du jeu (vers B), un autre derrière (sur le trajet déjà fait, sinon dans
  // le dos). Sans trajet : devant et derrière selon le cap.
  function _tenaille(p, ctx) {
    const H = REGLES.tenaille, sc = ctx.sc, pos = ctx.pos, n = H.n + H.parDeuxVagues * Math.floor(p.vague / 2);
    let devant, derriere;
    if (p.route && p.longueurs) {
      const s = _abscisse(p.route, p.longueurs, pos), tot = p.longueurs[p.longueurs.length - 1];
      devant = _pointA(p.route, p.longueurs, Math.min(tot, s + H.devantM * sc));
      if (s >= H.derriereM * sc) derriere = _pointA(p.route, p.longueurs, s - H.derriereM * sc);
    }
    const a = ctx.cap * Math.PI / 180;
    if (!devant) devant = { x: pos.x + Math.sin(a) * H.devantM * sc, y: pos.y - Math.cos(a) * H.devantM * sc };
    if (!derriere) derriere = { x: pos.x - Math.sin(a) * H.derriereM * sc, y: pos.y + Math.cos(a) * H.derriereM * sc };
    const poses = _monde().surgir(p, ctx, devant, n) + _monde().surgir(p, ctx, derriere, n);
    if (poses) { _jouer("grogne", 1); _message(_t("hud.tenaille")); }
    return poses;
  }

  // Mi-parcours du trajet vers B (une fois par vague) et tenailles au hasard dès la vague hasardDes.
  function _guetter(p, ctx, t) {
    const H = REGLES.tenaille;
    if (!p.tenailleMi && p.route && p.longueurs) {
      const tot = p.longueurs[p.longueurs.length - 1];
      if (tot > 0 && _abscisse(p.route, p.longueurs, ctx.pos) / tot >= H.mi) { p.tenailleMi = true; _tenaille(p, ctx); }
    }
    if (p.prochaineTenaille && t >= p.prochaineTenaille) {
      p.prochaineTenaille = t + _delaiTenaille(p);
      _tenaille(p, ctx);
    }
  }

  // ── Fin de partie et scores (clé locale à part, jamais dans la session) ──────────────────────────────

  function _lireScores() {
    try { return JSON.parse(localStorage.getItem(CLE_SCORES) || "{}") || {}; } catch (e) { return {}; }
  }

  function _finPartie() {
    const p = _p;
    p.fin = true;
    if (p.viseur) p.viseur.liberer();   // la souris rendue pour toucher la carte de fin
    // La carte de fin est sous les commandes (calque de la greffe) : joystick et pavé retirés le temps de toucher.
    p.ctx.regler({ course: false, commandes: false });
    _son().proximite(0);
    _son().respiration(0);
    _son().ambiance(false);
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
  function _abscisse(path, cum, pos) { return _proche(path, cum, pos).s; }

  // Point du trajet le plus proche : abscisse s et écart d (px). niv : seulement les segments de ce niveau.
  function _proche(path, cum, pos, niv) {
    let best = Infinity, s = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1e-9;
      if (niv !== undefined && niv !== null && ((Number.isInteger(a.level) && a.level !== niv) ||
        (Number.isInteger(b.level) && b.level !== niv))) continue;
      const k = Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / l2));
      const d = Math.hypot(a.x + dx * k - pos.x, a.y + dy * k - pos.y);
      if (d < best) { best = d; s = cum[i - 1] + k * Math.sqrt(l2); }
    }
    return { s: s, d: best };
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

  // Un chevron « ^ » au sol en (cx, cz) m, pointe dans le sens (ux, uz) : deux branches (2 triangles chacune).
  function _chevron(out, cx, cz, ux, uz) {
    const l = CHEVRON.l, ep = CHEVRON.ep, y = CHEVRON.y, nx = -uz, nz = ux;
    const px = cx + ux * l / 2, pz = cz + uz * l / 2;
    [-1, 1].forEach(function (cote) {
      const qx = cx - ux * l / 2 + cote * nx * l / 2, qz = cz - uz * l / 2 + cote * nz * l / 2;
      const bx = qx - px, bz = qz - pz, bl = Math.hypot(bx, bz), ox = -bz / bl * ep / 2, oz = bx / bl * ep / 2;
      out.push(px + ox, y, pz + oz, qx + ox, y, qz + oz, qx - ox, y, qz - oz,
        px + ox, y, pz + oz, qx - ox, y, qz - oz, px - ox, y, pz - oz);
    });
  }

  function _dessiner() {
    const p = _p;
    if (!p || !p.ctx) return;
    const ctx = p.ctx, T = ctx.THREE, sc = ctx.sc;
    _vider();
    p.nChevrons = 0;
    const accent = new T.Color(_couleur("--kta-accent", "") || 0xf4c542);
    if (p.route && p.regle.route) {
      const pos = [], chev = [], niv = ctx.niveau;
      let cum = 0, prochain = CHEVRON.pas / 2;
      for (let i = 1; i < p.route.length; i++) {
        const a = p.route[i - 1], b = p.route[i];
        const ax = a.x / sc, az = a.y / sc, bx = b.x / sc, bz = b.y / sc, l = Math.hypot(bx - ax, bz - az);
        const autre = niv !== null && ((Number.isInteger(a.level) && a.level !== niv) ||
          (Number.isInteger(b.level) && b.level !== niv));
        if (l < 1e-6) continue;
        const ux = (bx - ax) / l, uz = (bz - az) / l;
        if (!autre) {
          const nx = -uz * ROUTE.largeur / 2, nz = ux * ROUTE.largeur / 2, y = ROUTE.y;
          pos.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz,
            ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
        }
        // Chevrons tous les CHEVRON.pas m le long du trajet (abscisse continue, même sur un autre niveau).
        for (; prochain <= cum + l; prochain += CHEVRON.pas) {
          if (!autre) _chevron(chev, ax + ux * (prochain - cum), az + uz * (prochain - cum), ux, uz);
        }
        cum += l;
      }
      if (pos.length) {
        const g = new T.BufferGeometry();
        g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
        const m = new T.MeshBasicMaterial({ color: accent, side: T.DoubleSide, toneMapped: false,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        _ajouter(new T.Mesh(g, m));
      }
      // Sens du trajet : chevrons sombres sur le ruban doré, pointe vers B (comme l'itinéraire de la vue 3D).
      if (chev.length) {
        const g = new T.BufferGeometry();
        g.setAttribute("position", new T.Float32BufferAttribute(chev, 3));
        const m = new T.MeshBasicMaterial({ color: new T.Color(_couleur("--kta-sur-accent", "") || 0x1a1405),
          side: T.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4,
          polygonOffsetUnits: -4 });
        const mesh = new T.Mesh(g, m);
        mesh.renderOrder = 1;
        _ajouter(mesh);
        p.nChevrons = chev.length / 36;
      }
    }
    // Balise de la cible (facile, moyen) : colonne et anneau au sol, éteints par le brouillard au loin.
    if (p.cible && p.regle.route && (p.cible.niveau === undefined || p.cible.niveau === ctx.niveau)) {
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
    // Jauges en haut à gauche, hors du panneau : toujours visibles, même panneau réduit.
    h.jauges = _el(ctx.hud, "div", "mkmg-jauges");
    h.sante = _barre(h.jauges, _t("hud.sante"));
    h.endurance = _barre(h.jauges, _t("hud.endurance"));
    h.endurance.parentNode.parentNode.classList.add("mkmg-jauge-endurance");
    h.lampe = _barre(h.jauges, _t("hud.lampe"));
    h.lampe.parentNode.parentNode.classList.add("mkmg-jauge-lampe");
    h.gardien = _barre(h.jauges, _t("hud.gardien"));
    h.gardien.parentNode.parentNode.classList.add("mkmg-jauge-gardien");
    h.gardien.parentNode.parentNode.hidden = true;
    // Panneau en haut à droite, réductible (retenu sur l'appareil) : en-tête (vague, chrono) et guidage toujours là.
    h.panneau = _el(ctx.hud, "div", "mkmg-panneau");
    const tete = _el(h.panneau, "div", "mkmg-tete");
    h.vague = _el(tete, "div", "mkmg-vague");
    h.chrono = _el(tete, "div", "mkmg-chrono");
    h.plier = _el(tete, "button", "mkmg-plier");
    h.plier.type = "button";
    h.plier.addEventListener("click", function () { _plier(!h.panneau.classList.contains("mkmg-reduit")); });
    h.guide = _el(h.panneau, "div", "mkmg-guide");
    h.fleche = _el(h.guide, "span", "mkmg-fleche", "↑");
    h.reste = _el(h.guide, "span", "mkmg-reste");
    h.corps = _el(h.panneau, "div", "mkmg-corps");
    h.objectif = _el(h.corps, "div", "mkmg-objectif");
    h.stats = _el(h.corps, "div", "mkmg-stats");
    h.quitter = _el(h.corps, "button", "mkmg-bouton", _t("hud.quitter"));
    h.quitter.type = "button";
    h.quitter.addEventListener("click", quitter);
    h.tirer = _el(ctx.hud, "button", "mkmg-tirer");
    h.tirer.type = "button";
    h.tirer.title = _t("hud.tirer");
    h.tirer.setAttribute("aria-label", _t("hud.tirer"));
    const img = _el(h.tirer, "img", "mkmg-tirer-image");
    img.src = "addons/mkmg/img/fusil.svg";
    img.alt = "";
    img.draggable = false;
    // Menu contextuel de l'appui long (Android, souris) : jamais sur les boutons du jeu.
    h.tirer.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    h.tirer.addEventListener("pointerdown", function (ev) { ev.preventDefault(); _gachette(true); });
    h.cartouches = _el(h.tirer, "span", "mkmg-cartouches");
    h.rage = _el(ctx.hud, "button", "mkmg-rage");
    h.rage.type = "button";
    h.rage.addEventListener("pointerdown", function (ev) { ev.preventDefault(); _rage(); });
    h.rage.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    h.message = _el(ctx.hud, "div", "mkmg-message");
    h.message.hidden = true;
    h.message.setAttribute("aria-live", "polite");
    p.hud = h;
    let reduit = false;
    try { reduit = localStorage.getItem(CLE_PANNEAU) === "reduit"; } catch (e) { /* stockage refusé */ }
    _plier(reduit);
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

  // Panneau réduit ou non, retenu sur cet appareil (clé à part, jamais la session).
  const CLE_PANNEAU = "myktamap_mkmg_panneau_v1";
  function _plier(reduit) {
    const h = _p && _p.hud;
    if (!h) return;
    h.panneau.classList.toggle("mkmg-reduit", reduit);
    h.plier.textContent = reduit ? "▸" : "▾";
    h.plier.title = _t(reduit ? "hud.agrandir" : "hud.reduire");
    h.plier.setAttribute("aria-label", h.plier.title);
    h.plier.setAttribute("aria-expanded", reduit ? "false" : "true");
    try { localStorage.setItem(CLE_PANNEAU, reduit ? "reduit" : "ouvert"); } catch (e) { /* stockage refusé */ }
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
    const chrono = p.chronoFin ? Math.max(0, (p.chronoFin - performance.now()) / 1000) : null;
    h.chrono.hidden = chrono === null;
    if (chrono !== null) {
      h.chrono.textContent = "⏱ " + Math.floor(chrono / 60) + ":" + String(Math.floor(chrono % 60)).padStart(2, "0");
      h.chrono.classList.toggle("mkmg-chrono-alerte", chrono <= REGLES.chrono.alerteS);
    }
    h.sante.style.width = Math.round(p.sante / REGLES.sante * 100) + "%";
    h.endurance.style.width = Math.round(p.endurance / REGLES.endurance * 100) + "%";
    h.endurance.parentNode.parentNode.classList.toggle("mkmg-souffle", p.souffle);
    h.endurance.parentNode.parentNode.title = p.souffle ? _t("hud.souffle") : "";
    h.lampe.style.width = Math.round(p.pile / REGLES.pile.max * 100) + "%";
    h.lampe.parentNode.parentNode.classList.toggle("mkmg-faible", p.pile < REGLES.pile.faible);
    const g = p.ennemis.find(function (o) { return o.type === "gardien"; });
    h.gardien.parentNode.parentNode.hidden = !g;
    if (g) h.gardien.style.width = Math.round(Math.max(0, g.pv) / g.pvMax * 100) + "%";
    const R = REGLES.rage, rage = !!p.rageFin, prete = !rage && p.rageTues >= R.tues;
    h.cartouches.textContent = p.rechargeFin ? "…" : rage ? "∞ · " + p.rageCanon : p.canon + " · " + p.reserve;
    h.rage.textContent = rage ? String(Math.max(0, Math.ceil((p.rageFin - performance.now()) / 1000))) :
      prete ? _t("hud.rage") : Math.min(p.rageTues, R.tues) + "/" + R.tues;
    h.rage.disabled = p.fin || !(prete || rage);
    h.rage.classList.toggle("mkmg-rage-prete", prete);
    h.rage.classList.toggle("mkmg-rage-active", rage);
    h.rage.title = rage ? _t("hud.rageActive") : prete ? _t("hud.ragePrete") :
      _t("hud.rageCharge", { n: Math.min(p.rageTues, R.tues), m: R.tues });
    h.rage.setAttribute("aria-label", h.rage.title);
    h.tirer.classList.toggle("mkmg-tirer-rage", rage);
    h.tirer.title = _t("hud.tirer") + " — " + _t("hud.cartouches") + " : " + p.canon + " + " + p.reserve +
      (p.rechargeFin ? " (" + _t("hud.recharge") + ")" : "");
    h.stats.textContent = _t("hud.tues") + " : " + p.tues + " · " + _t("hud.tirs") + " : " + p.tirs + " · " +
      _t("hud.touches") + " : " + p.touches;
    h.tirer.disabled = p.fin;
    if (!p.cible) {
      h.objectif.textContent = p.cherche ? _t("hud.recherche") : _t("hud.aucune");
      h.guide.hidden = true;
      return;
    }
    h.objectif.textContent = _objectif(p.cible);
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
      rage: { tues: p.rageTues, active: !!p.rageFin, canon: p.rageCanon,
        bouton: !!p.hud && !p.hud.rage.disabled }, recalages: p.recalages, ecartM: p.route && p.ctx ?
        +(_proche(p.route, p.longueurs, p.ctx.pos, p.ctx.niveau).d / p.ctx.sc).toFixed(1) : null,
      viseur: !!(p.viseur && p.viseur.capte()),
      traits: p.traits.length, chevrons: p.nChevrons || 0, calcul: p.calcul, canon: p.canon, reserve: p.reserve,
      recharge: !!p.rechargeFin,
      fin: p.fin, tues: p.tues, tirs: p.tirs, touches: p.touches,
      reduit: !!p.hud && p.hud.panneau.classList.contains("mkmg-reduit"), scores: _lireScores(),
      coeur: +(p.coeur || 0).toFixed(2),
      msMonde: +(p.msMonde || 0).toFixed(3), joueur: _joueur().etat(p), son: _son().etat(),
      tenailleMi: p.tenailleMi,
      chronoDepasse: p.chronoDepasse,
      chronoReste: p.chronoFin ? Math.round((p.chronoFin - performance.now()) / 1000) : null,
      ennemis: p.ennemis.map(function (o) { return { type: o.type, x: o.x, y: o.y, pv: o.pv, vu: !!o.vu }; }),
      objets: p.objets.map(function (o) { return { type: o.type, x: o.x, y: o.y }; }),
      cadavres: (p.cadavres || []).length, pile: Math.round(p.pile), lampe: +p.lampeK.toFixed(2), eau: p.eau,
      cibleNiveau: p.cible && p.cible.niveau !== undefined ? p.cible.niveau : null,
      mondes: Object.keys(p.mondes || {}).length, niveauMonde: p.niveauMonde };
  }

  // Mise en place d'une situation (checkup seulement) : vider le monde, poser un ennemi ou un objet, la santé.
  const essai = {
    vider: function () { if (_p) _monde().vider(_p); },
    poser: function (type, x, y) {
      if (!_p || !_p.ctx) return;
      const marcheur = ["egare", "rampant", "hurleur", "gardien"].indexOf(type) >= 0;
      const o = type === "egare" ? { type: type, x: x, y: y, pv: _monde().REGLES.egares.pv, vitesse: 1.2, grogneT: 9 }
        : marcheur ? Object.assign(_monde().nouveau(_p, type, x, y), { grogneT: 9 }) : { type: type, x: x, y: y };
      (marcheur || type === "silhouette" ? _p.ennemis : _p.objets).push(o);
      _monde().dessiner(_p, _p.ctx, false);
    },
    pile: function (v) { if (_p) _p.pile = v; },
    rage: function (n) { if (_p) { _p.rageTues = n; _majHud(); } },
    rageFin: function () { if (_p && _p.rageFin) _p.rageFin = performance.now(); },
    sante: function (v) { if (_p) _p.sante = v; },
    chrono: function (ms) { if (_p) { _p.chronoFin = performance.now() + ms; _p.chronoDepasse = false; } },
    tenaille: function () { if (_p && _p.ctx) _tenaille(_p, _p.ctx); },
    // Regard rejoué comme la souris capturée (dx, dy en px), glisser clos aussitôt.
    viser: function (dx, dy) { if (_p && _p.viseur) { _p.viseur.tourner(dx, dy); _p.viseur.lever(); } }
  };

  window.KtaAddons = window.KtaAddons || {};
  window.KtaAddons.mkmg = { lancer: lancer, quitter: quitter, etat: etat, essai: essai };
})();
