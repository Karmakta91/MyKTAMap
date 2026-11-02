/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// vue3d.js — vue 3D à la première personne autour de la position du tracker, ouverte par le bouton cube de
// la barre de droite (interface.js > _ouvrirVue3D, qui la charge à la demande avec css/vue3d.css) ; three.js
// (lib/three/) n'est importé qu'à la première ouverture. Tout est précaché par sw.js (la 3D sert sous terre).
// Expose : window.KtaVue3D = { ouvrir(opts) → Promise<bool>, fermer() → Promise<bool recalé>, etat(), parois(),
//   textures(), mesurer(opts), basculerVue(), basculerSuivi(), basculerRendu(), basculerTextures(), incliner(deg),
//   changerNiveau(sens), avancer(m), tourner(deg), suivre(), placer(x, y, cap), reglerHauteur(m), origineItineraire(),
//   placerSurTracker(), trackerRecale(), charge(), gesteAnime(bool), greffer(g) (prise neutre d'un add-on,
//   _ctxGreffe) } ; code « six vers le bas » : kta:vue3dCode ;
//   opts : { distanceVue (m), tuiles (bool), depart {x, y, cap}, densiteMax, stats, attenteReprise (ms), retourFocus,
//   commandes ("joystick" | "pave" : sinon joystick au téléphone, pavé au PC ou option ⚙️, _commandesVoulues) }.
// Scène (m : x = x image / scale, z = y image / scale, y = hauteur), trois rendus retenus par plan : MIXTE (défaut :
// structures dressées partout, tracés en tubes seulement loin d'elles, ouverts en entrant dans une chambre),
// STRUCTURES seules (tracés au sol) ou GALERIE seule (tracés en tubes, js/galerieEmprise.js) ; zones, itinéraire
// (tirets, étapes, 🏁), ronds d'intersection de la carte, POI en panneaux (danger : halo rouge au sol ; favori : ⭐) ; membres, repères et itinéraires d'une extension
// (KtaPresences ; ma place libre leur est montrée, _publierPosition ; rien sans extension) ; un niveau, passages en
// volume (_construireVolume), changement de niveau derrière un fondu (_lancerGeste). Tuiles autour de soi, lampe
// frontale, rendu au mouvement seul.
// ⚠️ contrat : filtres = ceux de la carte (window._ktaRuntimeFilters, calques de données, niveaux visibles), lus à
// chaque construction et suivis par FilterPanel.onChange ; ≡ ouvre le même panneau (filterPanel.js) par-dessus.
// Masquer ne retire que le dessin : collisions, parois des tubes et passages 🪜 restent ; l'itinéraire, comme en 2D,
// ne suit aucun filtre et se redessine à `kta:itineraireChange` (road.js). Guidage : bandeau et chevrons
// (_lireGuidage) ; toucher un POI ouvre sa fiche de la carte (_ouvrirFiche, « Y aller » : origineItineraire). En
// libre, un tracker choisi comme départ depuis la vue y amène la place (placerSurTracker) ; un tracker recalé (« 📍 Je
// suis ici ») ne la bouge pas (trackerRecale).
// ⚠️ contrat : hauteur = celle de ⛏️ Volume exploité (config.js > get/setPlanHauteurGalerie), réglée aussi en 3D.
// ⚠️ contrat : déplacement = règle du pas, jamais une copie (tracking.js > ktaEstAccessible,
// ktaSegmentsBloquesParStructure ; galerie : KtaGalerie.segmentsBloques ; mixte : les deux règles, structures et
// KtaGalerie.paroisBloquent), sur la largeur d'un corps. Le tracker
// n'est pas déplacé (décision produit) : à la fermeture, « Je suis ici ? » propose de le recaler (position, niveau).
// 🩸 three.js est un module ES : import() dynamique, URL absolue (pas d'import map, la CSP refuse tout script en
// ligne). Fermer libère le contexte WebGL (forceContextLoss) : un navigateur en garde peu (iOS ~ 8, Chrome 16).
// Doc : docs/ETUDE_VUE_3D.md, tracking.md § Vue 3D, ui.md § Vue 3D · Garde-fou : scripts/smoke/checkup-vue-3d.js

(function () {
  "use strict";

  const URL_THREE = "lib/three/three.module.js";
  const DISTANCE_VUE = 30;          // m : au-delà, brouillard noir complet et tuiles masquées
  const TUILE = 16;                 // m : côté d'une tuile de géométrie
  const TUILES_PAR_IMAGE = 3;       // tuiles construites au plus par image après l'ouverture (pas d'à-coup)
  const HAUTEUR_DEFAUT = 2;         // m, comme ⛏️ Volume exploité
  const HAUTEUR_REGLAGE = { min: 1.5, max: 20 };  // m, bornes du réglage ⛏️ (20 m : rarement au-delà, décision produit)
  const HAUTEUR_PAS_FIN = 5;                      // m : pas de 0,1 m jusque-là, 0,5 m au-delà (160 touches sinon)
  const OEIL = 1.6;                 // m
  const RAYON_CORPS = 0.4;          // m : demi-largeur du corps, gardée devant et sur les côtés (un mur en ligne
                                    // de 0,4 m est dessiné à 0,2 m de son axe : on reste à 0,2 m de sa face)
  const RAILS = [0, -1, 1];         // couloirs balayés, en part de RAYON_CORPS de part et d'autre de l'axe
  const RAYONS = 12;                // rayons de RAYON_CORPS autour du point d'arrivée (un tous les 30°)
  const VITESSE = 2.8;              // m/s au pavé et au clavier (explorer, pas marcher : le tracker n'en dépend pas)
  const FACTEUR_RAPIDE = 2.5;       // pas rapide : Maj maintenue, ou ▲ maintenu plus de APPUI_LONG
  const APPUI_LONG = 600;           // ms
  const INCLINAISON = { defaut: 60, min: 15, max: 85, pas: 5 };   // ° de la vue plongeante (90 = verticale)
  const RECUL_PLONGEE = 18.4;       // m entre la caméra plongeante et le point visé, 2 m devant soi
  const ROTATION = 90;              // °/s
  const EPAISSEUR_MUR_LIGNE = 0.4;  // m
  const EPAISSEUR_FRONT = 0.3;      // m
  const LARGEUR_TRACE = 0.25;       // m
  // Itinéraire au sol (décision produit) : ruban de LARGEUR_ITI à --kta-interaction, liseré sombre (--kta-fond) de
  // ITI.lisere sur chaque bord, en tirets ITI.tiret / ITI.vide comme la 2D (dashArray « 12 6 » à l'échelle),
  // posés à des abscisses fixes du trajet (ils ne glissent pas). Non éclairé : lisible hors du faisceau.
  const LARGEUR_ITI = 0.35;         // m
  const ITI = { lisere: 0.04, tiret: 1.2, vide: 0.6, y: 0.05 };
  // Marqueurs de l'itinéraire : disque et mât à chaque étape, 🏁 en panneau à l'arrivée (m).
  const MARQUEUR = { rayon: 0.25, mat: 0.6, epMat: 0.03, y: 0.055 };
  // Ronds d'intersection (option de la carte) : disque à la couleur du rond 2D, au-dessus des rubans des tracés.
  const ROND = { rayon: 0.35, cotes: 16, y: 0.04 };
  // Joystick (téléphone) : débattement en px pour 0 → VITESSE, zone morte, course au-delà de `course` du
  // débattement tenu APPUI_LONG ; tailles de l'anneau et du bouton (px, posées par css/vue3d.css).
  const JOYSTICK = { debattement: 40, morte: 12, course: 0.85 };
  // Part de la hauteur du plan : remblais ET effondrement, deux volumes qui bouchent la galerie de la même façon
  // (même règle du pas, KtaGalerie). Une seule valeur : à 60 %, on voit par-dessus et on lit la galerie au-delà ;
  // un éboulis plus haut ferait un mur sans relief à hauteur d'yeux.
  const HAUTEUR_REMBLAIS = 0.6;
  const PANNEAU = { l: 1.6, h: 0.5 };   // m : taille d'un panneau de POI de près
  // De près : rien sous PRES.min, fondu jusqu'à PRES.net ; jamais plus large que PRES.ecran de la largeur de l'écran
  // (au téléphone en portrait, un panneau de 1,6 m à 2 m couvrait tout l'écran).
  const PRES = { min: 1, net: 2.2, ecran: 0.45 };
  const BRUIT_CAP = 2;              // ° : en suivi, un écart de cap plus petit (boussole) ne redessine pas
  const HAUTEUR_MUR = 0.98;         // part de la hauteur du plan : un mur passe toujours sous pilier et front
  // Sol et ciel de carrière (plafond, à la hauteur du plan) : même teinte sable calcaire, grain procédural répété
  // (bruit dessiné dans un canvas, aucune image téléchargée). Couleur de la scène, pas de la charte de l'UI.
  const COULEUR_CALCAIRE = "#c9b48c";
  const HACHURE_PAS = 0.6;   // m : période des hachures d'une zone inaccessible (sol et rideau)
  const GRAIN_TAILLE = 128;         // px du motif
  const GRAIN_METRES = 2;           // m couverts par un motif
  // Mode galerie : parois des galeries et des tubes en pierre de taille (🧱 Textures activé, PIERRE ci-dessous) ou
  // en moellons de calcaire taillés (🧱 coupé : assises horizontales à joints décalés, dessinées dans un canvas comme
  // le grain du sol), liseré au sol de la couleur du tracé, POI proches seulement. Pierre plus claire et plus grise
  // que le sol, joints de mortier : la paroi se détache du sol.
  const MOELLON = { couleur: "#d4c9b2", l: 0.4, h: 0.25, joint: 0.015 };   // teinte de base ; bloc et joint en m
  const MOELLONS_MOTIF = { l: 4, h: 4 };   // blocs par motif (1,6 × 1 m), répété en mètres sur la paroi
  const MOELLON_PX_M = 160;                // px du motif par mètre de paroi
  // Structures texturées (interrupteur 🧱 Textures de la tuile ⚙️, _textureDe) : appareil dessiné dans un canvas
  // (couleur et normal map), motif carré de `m` m sur `px` px (puissance de 2 : mipmaps). Coordonnées de texture en
  // mètres / m, posées face par face (_prisme). ⚠️ `px` borne le temps de dessin à l'ouverture (~4 ms par texture
  // de 256 px au PC, 4 fois plus au téléphone) : 512 px coûtait 0,4 s au téléphone ralenti.
  // Roche brute (piliers, fronts : la masse calcaire laissée en place, décision produit, jamais appareillée) :
  // motif de 3 m (85 px/m) — sans joints la répétition se voit plus, d'où un motif plus grand que l'appareil et des
  // taches à deux échelles ; strates tous les `strate` m (lit de `lit` m, ondulé de `onde` m), `fissures` fissures,
  // `grappes` grappes de traces d'outil (pic, broche). Longueurs en m.
  const ROCHE = { m: 3, px: 256, couleur: "#cdc1a3", strate: 0.42, lit: 0.012, onde: 0.15, fissures: 7, grappes: 40,
    grain: 0.07, relief: 4, graine: 53 };
  // Pierre de taille de carrière (parois des galeries et des tubes, 🧱 activé ; jamais les piliers ni les fronts) :
  // motif de 2 m (128 px/m), assises de hauteur tirée, blocs de longueur tirée, joints irréguliers (largeur, pente,
  // lit ondulé), arêtes émoussées. Longueurs en m.
  const PIERRE = { m: 2, px: 256, couleur: "#d5c9ad", mortier: "#8f8571", assise: [0.28, 0.46], bloc: [0.5, 1.1],
    joint: [0.008, 0.02], onde: 0.008, pente: 0.05, biseau: 0.03, relief: 2.2, graine: 29 };
  // Parpaing (murs) : motif de 1 m (256 px/m, un joint de 1 cm fait 2,6 px ; un appareil régulier se répète de
  // toute façon), blocs de 50 × 20 cm à joints droits, gris béton, pores.
  const PARPAING = { m: 1, px: 256, couleur: "#a3a29c", mortier: "#b5b1a6", l: 0.5, h: 0.2, joint: 0.01,
    biseau: 0.006, relief: 2.4, graine: 41 };
  // Remblais (zones `remblais`, 🧱 activé) : terre et sable calcaire tassés, cailloux et blocs de calcaire anguleux à
  // moitié enfouis, sans joints ni appareil (_pierraille). Motif de 2 m (128 px/m), coordonnées de texture en mètres
  // comme la roche : un caillou garde sa taille sur une zone de 1 m comme de 50 m. `tailles` : [rayon min, rayon
  // max (m), nombre par motif, saillie (part de la hauteur d'un bloc)], du gravier aux blocs ; `couvre` : part des
  // cailloux de la classe qui gardent leur nombre (le reste est tiré, la densité varie d'un motif à l'autre).
  const REMBLAIS = { m: 2, px: 256, terre: "#b09e7e", pierre: "#d6cdb7", tailles: [[0.008, 0.02, 520, 0.35],
    [0.025, 0.06, 90, 0.5], [0.07, 0.13, 14, 0.6], [0.16, 0.24, 3, 0.7]], facettes: [5, 8], allonge: 0.5,
    sable: 900, fissures: 0, relief: 3.2, graine: 61 };
  // Effondrement (fontis : éboulis du ciel tombé, 🧱 activé), volume comme le remblais (HAUTEUR_REMBLAIS) :
  // gros blocs cassés empilés en désordre, arêtes vives, fissures, débris, peu de terre. Motif de 4 m (64 px/m) :
  // les gros blocs se répéteraient à l'œil sur un motif plus petit ; relief plus fort, la lampe accroche les arêtes.
  const EBOULIS = { m: 4, px: 256, terre: "#857864", pierre: "#cbc2ab", tailles: [[0.02, 0.05, 460, 0.4],
    [0.07, 0.16, 125, 0.7], [0.2, 0.36, 39, 0.9], [0.42, 0.62, 12, 1]], facettes: [4, 7], allonge: 0.7,
    sable: 250, fissures: 3, relief: 5, graine: 67 };
  const TEXTURE_TYPE = { "pilier-1": "roche", "pilier-2": "roche", "front-1": "roche", "front-2": "roche",
    "mur": "parpaing", "mur-ligne": "parpaing" };
  const LISERE = 0.15;              // m
  // m : POI plus loin de l'axe d'un tracé = masqué en mode galerie (salles comprises). ⚠️ contrat : le rayon du
  // recalage du tracker (KtaGalerie.versGalerie), une seule valeur.
  const POI_GALERIE = window.KtaGalerie.PROCHE_M;
  const RECUL_PAROI = 0.08;         // m : POI hors du tube ramené contre la paroi, devant elle
  // POI danger : anneau au sol sous le panneau, rouge de la charte (--kta-erreur du thème sombre), non éclairé :
  // lisible hors du faisceau, éteint au loin par le brouillard comme le reste.
  const HALO = { r0: 0.45, r1: 0.7, y: 0.03, opacite: 0.85, fond: 0.18 };
  const MEMBRE = { rayon: 0.22, haut: 1.7, tete: 0.14 };   // m : silhouette d'un membre (extension)
  const PASSAGE = 2;                // m : distance d'un passage (POI jonction, bout de tracé jonction) qui montre 🪜
  // Panneau d'un passage (POI jonction) : lisible jusqu'à 1 m (là où 🪜 apparaît), effacé seulement sous 0,8 m.
  const PRES_PASSAGE = { min: 0.8, net: 1 };
  // Volumes des passages (_construireVolume) : `long` m sous le sol ou au-dessus du plafond (le reste se perd dans le
  // noir), escalier à `marches` marches, échelons tous les 0,3 m. Dimensions (escalier, puits, aération, rampe et sa
  // tranchée, cadre doré) : KtaGalerie.PASSAGE, d'où le tube s'ouvre sur la même emprise (galerieEmprise.js).
  const VOLUME = Object.assign({ long: 6, echelon: 0.3, marches: 10 }, window.KtaGalerie.PASSAGE);
  const COULEUR_FER = "#5e5a52";    // échelons, montants, grille : couleur de la scène, pas de la charte de l'UI
  // Geste d'un passage : fondu noir de `fondu` ms de part et d'autre de la bascule ; descente / montée de `ms` en tout
  // (la moitié dans chaque niveau), la caméra passant `auDela` m sous le sol ou au-dessus du plafond ; bandeau
  // « Niveau n » `bandeau` ms.
  const GESTE = { ms: 1000, fondu: 250, auDela: 0.8, bandeau: 2000 };
  const PASSAGE_ITI = 3;            // m : itinéraire à moins de cette distance de l'arrivée → cap vers sa consigne
  const ATTENTE_REPRISE = 8000;     // ms d'écran visible sans contexte avant de renoncer à la reprise
  const SEUIL_RECALAGE = 0.5;       // m d'écart avec le tracker sous lequel « Je suis ici ? » ne se pose pas
  // Chevrons au sol sur l'itinéraire, de sa position vers la prochaine consigne : un tous les `pas` m (posés à des
  // abscisses fixes du trajet : ils ne glissent pas quand on avance), sur `long` m au plus ; taille en m.
  const CHEVRON = { pas: 2, long: 30, l: 0.4, ep: 0.09, y: 0.07 };
  const GUIDAGE_MS = 250;           // ms entre deux lectures du guidage (bandeau, chevrons)
  // ⚠️ contrat (décision produit) : `n` appuis vers le bas (▼ du pavé, ↓ / S, coup bref du joystick vers le bas) en
  // moins de `ms`, sans autre commande de déplacement entre deux → `kta:vue3dCode` (detail.code = "bas6"). Coup de
  // joystick : relâché moins de `coup` ms après la sortie de la zone morte, toujours à plus de `angle`° de l'avant.
  const CODE_BAS = { n: 6, ms: 2000, coup: 500, angle: 135 };

  let THREE = null;
  let _import = null;
  let _e = null;                    // état de la vue ouverte (null = fermée)
  let _appareils = {};               // canvas des textures déjà dessinés (_texturesPeintes : structures, parois)
  const _appareilsMs = {};          // ms du premier dessin de chacun (checkup)
  let _dernierGl = null;            // contexte de la dernière vue fermée (checkup : libéré ou non)
  let _derniereFermeture = null;    // "utilisateur" | "contexte" (checkup)
  let _gesteAnime = true;           // false : passage sans fondu ni descente (checkup des parties anciennes)

  // Textes lus au rendu (langue courante) ; sans I18n, la clé.
  function _t(cle, p) { return window.I18n && typeof window.I18n.t === "function" ? window.I18n.t(cle, p) : cle; }

  function _fmtNiveau(n) {
    return typeof window.ktaFormatNiveau === "function" ? window.ktaFormatNiveau(n) : String(n);
  }

  // Toast de la vue ; `type` « warn » par défaut (un avertissement : perte du contexte WebGL).
  function _toast(texte, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(texte, type || "warn");
    }
  }

  function _alerte(cle) {
    if (typeof window.ktaAlerte === "function") window.ktaAlerte(_t(cle), { type: "erreur" });
  }

  function _echelle() {
    const sc = Number(window.APP_CONFIG && window.APP_CONFIG.scale);
    return Number.isFinite(sc) && sc > 0 ? sc : 0;
  }

  function _chargerThree() {
    if (THREE) return Promise.resolve(THREE);
    if (!_import) {
      _import = import(new URL(URL_THREE, document.baseURI).href)
        .then(function (m) { THREE = m; return m; })
        .catch(function (err) { _import = null; throw err; });
    }
    return _import;
  }

  function _chargerCss() {
    if (document.getElementById("kta-vue3d-css")) return Promise.resolve(true);
    return new Promise(function (resolve) {
      const l = document.createElement("link");
      l.id = "kta-vue3d-css";
      l.rel = "stylesheet";
      l.href = "css/vue3d.css";
      l.addEventListener("load", function () { resolve(true); });
      l.addEventListener("error", function () { resolve(false); });
      document.head.appendChild(l);
    });
  }

  // ── Données du plan (session + calques embarqués) et filtres de la carte ─────────────────────────────

  function _tab(f) { try { return (typeof f === "function" ? f() : []) || []; } catch (err) { return []; } }

  function _niveauCourant() {
    const c = window.APP_CONFIG || {};
    if (c.multiLevel !== true) return null;
    const suivi = typeof window.getTrackingActif === "function" && window.getTrackingActif();
    const lvlTracker = typeof window.getTrackerLevel === "function";
    if (_e && _e.mode === "suivi" && suivi && lvlTracker) return window.getTrackerLevel();
    const actif = Number.isInteger(c.activeLevel) ? c.activeLevel : 0;
    // Niveau pris par un passage (🪜) : gardé tant que le niveau actif de la carte ne change pas.
    if (_e && Number.isInteger(_e.niveauLibre)) {
      if (_e.actifVu === actif) return _e.niveauLibre;
      _e.niveauLibre = null;
    }
    return actif;
  }

  function _surNiveau(o, niveau) {
    return niveau === null || (Number.isInteger(o.level) ? o.level : 0) === niveau;
  }

  function _premierTag(p) { return (Array.isArray(p.tags) && p.tags[0]) || "default"; }

  // ⚠️ Les mêmes règles que la carte, lues à leur source : filtres ≡ (Set = types montrés, null = tout ;
  // filterPanel.js), calque coché (dataLayerGroups ; la session vit dans « editor »), niveau visible
  // (road.js > passeFiltreNiveau, POI jonction compris). Un objet sans calque connu reste montré.
  function _montre(o, cle, set, session) {
    const f = window._ktaRuntimeFilters || {}, g = window.dataLayerGroups || {}, map = window.map;
    if (f[set] instanceof Set && !f[set].has(cle)) return false;
    const calque = session ? "editor" : o.layerId;
    if (calque && g[calque] && map && typeof map.hasLayer === "function" && !map.hasLayer(g[calque])) return false;
    return typeof window.passeFiltreNiveau !== "function" || window.passeFiltreNiveau(o);
  }

  function _filtrer(session, embarques, set, cle) {
    const out = [];
    session.forEach(function (o) { if (o && _montre(o, cle(o), set, true)) out.push(o); });
    embarques.forEach(function (o) { if (o && _montre(o, cle(o), set, false)) out.push(o); });
    return out;
  }

  // Objets DESSINÉS du niveau (filtres de la carte appliqués ; l'itinéraire n'en suit aucun, comme en 2D) ; les
  // tracés jonction tous (passages 🪜).
  function _collecter(niveau) {
    const ok = function (o) { return o && Array.isArray(o.points) && _surNiveau(o, niveau); };
    const type = function (o) { return o.type; };
    const sessionRoads = _tab(window.getRoads).filter(function (r) { return r && !r._preview; });
    const embRoads = _tab(window.getAllEmbeddedRoads);
    // 🩸 L'itinéraire est UN tracé dont chaque point porte son niveau (pathfinder.js) : il est découpé en morceaux
    // du niveau affiché, sinon un itinéraire au −1 (tracé sans `level` = 0) disparaissait tout entier.
    // Chaque morceau garde l'abscisse (px, depuis le début du trajet) de ses points : tirets continus d'un morceau
    // et d'une tuile à l'autre.
    const itiDuNiveau = [];
    sessionRoads.forEach(function (r) {
      if (r.type !== "itinerary" || !Array.isArray(r.points)) return;
      const defaut = Number.isInteger(r.level) ? r.level : 0;
      let cur = [], abs = [], s = 0, prec = null;
      const fin = function (lvl) {
        if (cur.length > 1) itiDuNiveau.push(Object.assign({}, r, { points: cur, level: lvl, abscisses: abs }));
        cur = []; abs = [];
      };
      r.points.forEach(function (q) {
        if (q && prec && Number.isFinite(q.x) && Number.isFinite(prec.x)) s += Math.hypot(q.x - prec.x, q.y - prec.y);
        if (q) prec = q;
        const n = q && Number.isInteger(q.level) ? q.level : defaut;
        if (niveau === null || n === niveau) { cur.push(q); abs.push(s); return; }
        fin(niveau);
      });
      fin(niveau === null ? defaut : niveau);
    });
    const roads = (_permisGreffe("itineraire") ? itiDuNiveau : [])
      .concat(!_permisGreffe("traces") ? [] : _filtrer(sessionRoads.filter(function (r) {
        return r.type !== "itinerary";
      }), embRoads, "roadTypes", type));
    // Un POI jonction se montre sur chacun de ses niveaux, à son raccord validé de ce niveau s'il en a un.
    const J = window.KtaPoiJonction, points = [];
    const montres = _filtrer(_tab(window.getEditorPoints), _tab(window.getAllEmbeddedPoints), "tags", _premierTag);
    montres.forEach(function (p) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      if (_surNiveau(p, niveau)) { points.push(p); return; }
      if (niveau === null || !J || !J.estJonction(p) || J.niveaux(p).indexOf(niveau) < 0) return;
      const a = J.accroches(p).filter(function (q) { return q.level === niveau; })[0];
      points.push(Object.assign({}, p, { x: a ? a.x : p.x, y: a ? a.y : p.y, level: niveau, _v3dJonction: p }));
    });
    return {
      structures: _filtrer(_tab(window.getStructures), _tab(window.getAllEmbeddedStructures), "structTypes", type)
        .filter(ok),
      zones: _filtrer(_tab(window.getZones), _tab(window.getAllEmbeddedZones), "zoneTypes", type).filter(ok),
      roads: roads.filter(ok),
      jonctions: sessionRoads.concat(embRoads).filter(function (r) {
        return r && r.type === "jonction" && Array.isArray(r.points);
      }),
      points: points
    };
  }

  // Type de tracé montré par les filtres de la carte : liseré du mode galerie (le tube, lui, reste : collision).
  function _typeTraceMontre(type) {
    const f = window._ktaRuntimeFilters || {};
    return type === "itinerary" || !(f.roadTypes instanceof Set) || f.roadTypes.has(type);
  }

  // Passages du niveau vers un autre : POI jonction (niveaux liés, raccords validés) et bouts de tracé `jonction`
  // (pris dans les deux sens). → [{ x, y (px), poi?, cibles: [{ niveau, x, y (NaN = même position) }] }].
  function _passages(niveau, jonctions) {
    const out = [], J = window.KtaPoiJonction;
    if (niveau === null) return out;
    if (J && typeof J.pointsJonction === "function") {
      J.pointsJonction().forEach(function (p) {
        if (!J.moyen(_premierTag(p))) return;   // puits d'aération (pa) : ni 🪜 ni passage
        const nv = J.niveaux(p), acc = J.accroches(p);
        if (nv.indexOf(niveau) < 0) return;
        const raccord = function (n) { return acc.filter(function (a) { return a.level === n; })[0] || null; };
        const ici = (Number.isInteger(p.level) ? p.level : 0) === niveau ? p : (raccord(niveau) || p);
        const cibles = nv.filter(function (n) { return n !== niveau; }).map(function (n) {
          const a = raccord(n);
          return { niveau: n, x: a ? a.x : NaN, y: a ? a.y : NaN };
        });
        out.push({ x: ici.x, y: ici.y, poi: p, cibles: cibles });
      });
    }
    jonctions.forEach(function (r) {
      const pts = r.points.filter(function (p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); });
      if (pts.length < 2 || !Number.isInteger(r.fromLevel) || !Number.isInteger(r.toLevel)) return;
      const A = pts[0], B = pts[pts.length - 1];
      if (r.fromLevel === niveau && r.toLevel !== niveau) {
        out.push({ x: A.x, y: A.y, cibles: [{ niveau: r.toLevel, x: B.x, y: B.y }] });
      }
      if (r.toLevel === niveau && r.fromLevel !== niveau) {
        out.push({ x: B.x, y: B.y, cibles: [{ niveau: r.fromLevel, x: A.x, y: A.y }] });
      }
    });
    return out;
  }

  function _estLigne(type) {
    if (typeof window.isStructurePolylineType === "function") return window.isStructurePolylineType(type);
    return type === "mur-ligne" || type === "front-1" || type === "front-2";
  }

  // Couleur du canon (aplat, couleur choisie par l'utilisateur comprise) → THREE.Color, en cache par clé.
  function _couleur(cat, cle, champ) {
    const k = cat + "|" + cle + "|" + (champ || "");
    let c = _e.couleurs.get(k);
    if (c) return c;
    let hex = null;
    if (champ && typeof window.ktaResolveStyle === "function") {
      const s = window.ktaResolveStyle(cat, cle, { flat: true });
      hex = s && s[champ];
    }
    if (!hex && typeof window.ktaSwatchColor === "function") hex = window.ktaSwatchColor(cat, cle);
    c = new THREE.Color();
    try { c.setStyle(hex || "#888888"); } catch (err) { c.set(0x888888); }
    _e.couleurs.set(k, c);
    return c;
  }

  // ── Index des tuiles : chaque objet va dans la tuile de son centre ; la tuile retient l'emprise réelle ──────

  function _indexer(d, sc, taille) {
    const tuiles = new Map();
    const range = function (ix, iz) {
      const k = ix + "," + iz;
      let t = tuiles.get(k);
      if (!t) {
        t = { cle: k, s: [], z: [], r: [], p: [], g: [], a: [], x0: Infinity, z0: Infinity, x1: -Infinity,
          z1: -Infinity, obj: null, parois: null };
        tuiles.set(k, t);
      }
      return t;
    };
    const emprise = function (t, pts) {
      for (let i = 0; i < pts.length; i++) {
        const x = pts[i].x / sc, z = pts[i].y / sc;
        if (x < t.x0) t.x0 = x; if (x > t.x1) t.x1 = x;
        if (z < t.z0) t.z0 = z; if (z > t.z1) t.z1 = z;
      }
    };
    const centre = function (pts) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      }
      return [(x0 + x1) / 2 / sc, (y0 + y1) / 2 / sc];
    };
    const cle = function (x, z) { return taille ? [Math.floor(x / taille), Math.floor(z / taille)] : [0, 0]; };
    const objets = function (liste, champ) {
      for (let i = 0; i < liste.length; i++) {
        const o = liste[i];
        if (o.points.length < 2) continue;
        const c = centre(o.points), k = cle(c[0], c[1]);
        const t = range(k[0], k[1]);
        t[champ].push(o);
        emprise(t, o.points);
      }
    };
    // Galerie : d.galerie ; mixte : d.mixte (structures ET pièces des tubes, tracés en rubans au sol).
    const g = d.galerie, m = g || d.mixte;
    if (!g) objets(d.structures, "s");
    objets(d.zones, "z");
    // Pièces de l'emprise à la tuile de leur centre ; galerie : axes (liseré) aussi, et parmi les tracés seul
    // l'itinéraire reste un ruban.
    if (m) {
      for (let i = 0; i < m.pieces.length; i++) {
        const P = m.pieces[i], k = cle((P.x0 + P.x1) / 2 / sc, (P.y0 + P.y1) / 2 / sc), t = range(k[0], k[1]);
        t.g.push(i);
        emprise(t, [{ x: P.x0, y: P.y0 }, { x: P.x1, y: P.y1 }]);
      }
    }
    if (g) {
      for (let i = 0; i < m.aretes.length; i++) {
        const r = m.aretes[i], k = cle((r.ax + r.bx) / 2 / sc, (r.ay + r.by) / 2 / sc);
        range(k[0], k[1]).a.push(i);
      }
    }
    // Tracés : par segment (un tracé traverse tout le plan).
    for (let i = 0; i < d.roads.length; i++) {
      const r = d.roads[i], pts = r.points;
      // Jonctions jamais dessinées (décision produit) : le passage de niveau passe par 🪜 (_passages).
      if (r.type === "jonction") continue;
      if (g && r.type !== "itinerary") continue;
      for (let j = 0; j + 1 < pts.length; j++) {
        const a = pts[j], b = pts[j + 1];
        if (!a || !b) continue;
        const k = cle((a.x + b.x) / 2 / sc, (a.y + b.y) / 2 / sc);
        const t = range(k[0], k[1]);
        t.r.push({ type: r.type, a: a, b: b, s0: r.abscisses ? r.abscisses[j] : 0 });
        emprise(t, [a, b]);
      }
    }
    for (let i = 0; i < d.points.length; i++) {
      const p = d.points[i], k = cle(p.x / sc, p.y / sc);
      const t = range(k[0], k[1]);
      t.p.push(p);
      emprise(t, [p]);
    }
    return tuiles;
  }

  // Segment d'itinéraire du niveau de la scène (chevrons) : chaque point du chemin porte son niveau (pathfinder.js >
  // computeRoute), sinon celui du tracé (0 par défaut), la règle du ruban (_collecter).
  function _segmentDuNiveau(road, a, b, niveau) {
    if (niveau === null) return true;
    const defaut = Number.isInteger(road.level) ? road.level : 0;
    return (Number.isInteger(a.level) ? a.level : defaut) === niveau &&
      (Number.isInteger(b.level) ? b.level : defaut) === niveau;
  }

  // ── Géométrie : triangles non indexés, normales int8, couleurs uint8 (18 octets par sommet) ───────────

  function Lot() { this.p = []; this.n = []; this.c = []; this.uv = []; }

  const BLANC = { r: 1, g: 1, b: 1 };

  // Triangle orienté vers `n` (l'ordre des sommets est corrigé au besoin : face avant = côté de la normale).
  // `uv` facultatif : [ua, va, ub, vb, uc, vc] (lots texturés : sol, plafond, parois du mode galerie).
  Lot.prototype.tri = function (a, b, c, n, col, uv) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const inverse = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    if (inverse) { const t = b; b = c; c = t; }
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    if (uv) {
      if (inverse) this.uv.push(uv[0], uv[1], uv[4], uv[5], uv[2], uv[3]);
      else this.uv.push(uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]);
    }
    const nx = Math.round(n[0] * 127), ny = Math.round(n[1] * 127), nz = Math.round(n[2] * 127);
    const r = Math.round(col.r * 255), g = Math.round(col.g * 255), bl = Math.round(col.b * 255);
    for (let i = 0; i < 3; i++) { this.n.push(nx, ny, nz); this.c.push(r, g, bl); }
  };

  Lot.prototype.quad = function (a, b, c, d, n, col, uv) {
    this.tri(a, b, c, n, col, uv && [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]]);
    this.tri(a, c, d, n, col, uv && [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]]);
  };

  Lot.prototype.geometrie = function () {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Int8Array(this.n), 3, true));
    g.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(this.c), 3, true));
    if (this.uv.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  };

  // Contour en mètres, sans doublon de fermeture ; sens rendu positif (aire > 0 en x, z).
  function _anneau(points, sc) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const x = p.x / sc, z = p.y / sc;
      const der = out[out.length - 1];
      if (der && Math.abs(der[0] - x) < 1e-6 && Math.abs(der[1] - z) < 1e-6) continue;
      out.push([x, z]);
    }
    if (out.length > 2 && Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-6 &&
        Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
    let aire = 0;
    for (let i = 0, j = out.length - 1; i < out.length; j = i++) aire += out[j][0] * out[i][1] - out[i][0] * out[j][1];
    if (aire < 0) out.reverse();
    return out;
  }

  // `m` facultatif (m par motif) : coordonnées de texture en projection monde (x, z) / m, sans étirement.
  function _dessus(lot, ring, y, col, m) {
    const v2 = ring.map(function (q) { return new THREE.Vector2(q[0], q[1]); });
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(v2, []); } catch (err) { return; }
    const haut = [0, 1, 0];
    for (let i = 0; i < tris.length; i++) {
      const a = ring[tris[i][0]], b = ring[tris[i][1]], c = ring[tris[i][2]];
      lot.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], haut, col,
        m ? [a[0] / m, a[1] / m, b[0] / m, b[1] / m, c[0] / m, c[1] / m] : undefined);
    }
  }

  // Prisme : faces latérales vers l'extérieur (contour de sens positif), dessus facultatif.
  // `m` facultatif (m par motif) : coordonnées de texture en mètres, u = longueur de contour cumulée depuis `u0` m
  // (l'appareil tourne l'angle sans saut ; tiré de la position du premier sommet si absent : deux piliers voisins
  // ne montrent pas le même dessin), v = hauteur depuis le sol (une assise part toujours du sol).
  function _prisme(lot, ring, y0, y1, col, dessus, m, u0) {
    if (ring.length < 3) return;
    let s = !m ? 0 : u0 !== undefined ? u0 : _origineMotif(ring, m);
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const n = [dz / l, 0, -dx / l];
      const uv = m ? [s / m, y0 / m, (s + l) / m, y0 / m, (s + l) / m, y1 / m, s / m, y1 / m] : undefined;
      s += l;
      lot.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], n, col, uv);
    }
    if (dessus) _dessus(lot, ring, y1, col, m);
  }

  // Origine du motif sur un contour (m) : tirée de la position de son premier sommet, deux volumes voisins ne montrent
  // pas le même dessin. ⚠️ contrat : la même pour un remblais en chambre (_prisme) et découpé au tube (_remblaisGalerie).
  function _origineMotif(ring, m) { return ((ring[0][0] * 0.37 + ring[0][1] * 0.61) % m + m) % m; }

  // Mur d'épaisseur réelle le long d'une polyligne : un pavé par segment, prolongé d'une demi-épaisseur aux deux
  // bouts pour fermer les angles. `m` : texture comme _prisme, l'appareil suit la longueur parcourue.
  function _murLigne(lot, points, sc, ep, h, col, m) {
    const p0 = points[0];
    let parcouru = m && p0 ? ((p0.x / sc * 0.37 + p0.y / sc * 0.61) % m + m) % m : 0;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i], b = points[i + 1];
      if (!a || !b) continue;
      let ax = a.x / sc, az = a.y / sc, bx = b.x / sc, bz = b.y / sc;
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const ux = dx / l, uz = dz / l, e = ep / 2;
      ax -= ux * e; az -= uz * e; bx += ux * e; bz += uz * e;
      const nx = -uz * e, nz = ux * e;
      const ring = [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]];
      let aire = 0;
      for (let k = 0, j = 3; k < 4; j = k++) aire += ring[j][0] * ring[k][1] - ring[k][0] * ring[j][1];
      if (aire < 0) ring.reverse();
      _prisme(lot, ring, 0, h, col, true, m, m ? parcouru : undefined);
      parcouru += l;
    }
  }

  function _ruban(lot, a, b, sc, larg, y, col) {
    const ax = a.x / sc, az = a.y / sc, bx = b.x / sc, bz = b.y / sc;
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    if (l < 1e-6) return;
    const nx = -dz / l * larg / 2, nz = dx / l * larg / 2;
    const ex = dx / l * larg / 2, ez = dz / l * larg / 2;   // recouvrement aux jointures
    lot.quad([ax - ex + nx, y, az - ez + nz], [bx + ex + nx, y, bz + ez + nz], [bx + ex - nx, y, bz + ez - nz],
      [ax - ex - nx, y, az - ez - nz], [0, 1, 0], col);
  }

  // Bande de `larg` m de large de (ax, az) à (bx, bz) (m), à la hauteur y, sans recouvrement aux bouts.
  function _bande(lot, ax, az, bx, bz, larg, y, col) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    if (l < 1e-6) return;
    const nx = -dz / l * larg / 2, nz = dx / l * larg / 2;
    lot.quad([ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], [ax - nx, y, az - nz], [0, 1, 0], col);
  }

  // Segment d'itinéraire { a, b (px), s0 (abscisse de a, px) } en tirets (ITI) : chaque tiret est une bande claire
  // posée sur une bande sombre plus large et plus longue de ITI.lisere (le liseré). Phase prise sur l'abscisse du
  // trajet : les tirets se suivent d'un segment et d'une tuile à l'autre.
  function _rubanIti(lot, r) {
    const e = _e, sc = e.sc, ax = r.a.x / sc, az = r.a.y / sc, bx = r.b.x / sc, bz = r.b.y / sc;
    const L = Math.hypot(bx - ax, bz - az), s0 = (r.s0 || 0) / sc, P = ITI.tiret + ITI.vide;
    if (L < 1e-6) return;
    const ux = (bx - ax) / L, uz = (bz - az) / L, cols = _couleursIti(), m = ITI.lisere;
    for (let k = Math.floor(s0 / P); k * P < s0 + L; k++) {
      const d0 = Math.max(k * P, s0) - s0, d1 = Math.min(k * P + ITI.tiret, s0 + L) - s0;
      if (d1 - d0 < 0.01) continue;
      // Liseré prolongé de m aux bouts du tiret seulement (pas au raccord de deux segments d'un même tiret).
      const m0 = k * P >= s0 ? m : 0, m1 = k * P + ITI.tiret <= s0 + L ? m : 0;
      _bande(lot, ax + ux * (d0 - m0), az + uz * (d0 - m0), ax + ux * (d1 + m1), az + uz * (d1 + m1),
        LARGEUR_ITI + 2 * m, ITI.y - 0.005, cols.lisere);
      _bande(lot, ax + ux * d0, az + uz * d0, ax + ux * d1, az + uz * d1, LARGEUR_ITI, ITI.y, cols.ruban);
      if (k * P >= s0) e.itiTirets++;
    }
  }

  // Couleurs de l'itinéraire, jetons du thème sombre (la scène est noire dans les deux thèmes) : ruban
  // --kta-interaction, liseré --kta-fond.
  function _couleursIti() {
    const e = _e;
    if (e.itiCouleurs) return e.itiCouleurs;
    const j = _jetonsSombres(), ruban = new THREE.Color(), lisere = new THREE.Color();
    try { ruban.setStyle(j.interaction); } catch (err) { ruban.set(0x8cb4ff); }
    try { lisere.setStyle(j.fond); } catch (err) { lisere.set(0x0a0d18); }
    return (e.itiCouleurs = { ruban: ruban, lisere: lisere, hexRuban: j.interaction, hexLisere: j.fond });
  }

  // ⚠️ contrat (décision produit) : un mur (polygone ou en ligne) est toujours SOUS un pilier ou un front de son
  // niveau. Là où ils se chevauchent, le pilier ou le front l'emporte : le mur monte à HAUTEUR_MUR de la hauteur et
  // son matériau est reculé en profondeur (polygonOffset), d'où aucun scintillement sur les faces confondues et
  // un dessus de pilier toujours visible.
  function _estMur(type) { return type === "mur" || type === "mur-ligne"; }

  function _construireTuile(t) {
    if (_e.galerie) { _construireTuileGalerie(t); return; }
    const sc = _e.sc, h = _e.hauteur, mx = _e.mixte;
    const opaque = new Lot(), murs = new Lot(), transp = new Lot(), lumineux = new Lot(), rubans = new Lot();
    const hachSol = new Lot(), hachRideau = new Lot();
    // Mixte : parois des tubes (pièces de la tuile, bouts ouverts exclus), zones des tubes découpées comme en galerie.
    const parois = new Lot(), eauTube = new Lot(), remblaisTube = new Lot();
    if (mx) {
      t.parois = [];
      for (let i = 0; i < t.g.length; i++) {
        const ps = mx.paroisDe(t.g[i]);
        for (let k = 0; k < ps.length; k++) {
          const s = ps[k], x0 = s[0] / sc, z0 = s[1] / sc, x1 = s[2] / sc, z1 = s[3] / sc;
          _paroi(parois, x0, z0, x1, z1, h);
          t.parois.push([x0, z0, x1, z1]);
        }
      }
    }
    // Textures (🧱) : roche et parpaing dans leurs lots, couleur blanche (texture naturelle, jamais teintée par la
    // légende) ; un type sans texture garde sa couleur unie dans le lot d'origine. Remblais et effondrement (deux
    // volumes) texturés : un lot chacun, chambres et tubes ensemble (_zoneGalerie) ; 🧱 coupé, les lots d'origine.
    const roche = new Lot(), parpaing = new Lot(), tx = _e.textures === true;
    const remblaisTex = new Lot(), eboulis = new Lot();
    const lotsTube = { opaque: opaque, eau: eauTube, hachSol: hachSol, hachRideau: hachRideau,
      remblais: tx ? remblaisTex : remblaisTube, eboulis: tx ? eboulis : null, texRemblais: tx };
    for (let i = 0; i < t.s.length; i++) {
      const s = t.s[i], tex = _e.textures ? _textureDe(s.type) : null;
      const col = tex ? BLANC : _couleur("structures", s.type), m = tex ? (tex === "roche" ? ROCHE : PARPAING).m : undefined;
      const lot = tex === "roche" ? roche : tex === "parpaing" ? parpaing : _estMur(s.type) ? murs : opaque;
      const hs = _estMur(s.type) ? h * HAUTEUR_MUR : h;
      if (_estLigne(s.type)) {
        const ep = s.type === "mur-ligne" ? EPAISSEUR_MUR_LIGNE : EPAISSEUR_FRONT;
        _murLigne(lot, s.points, sc, ep, hs, col, m);
      } else {
        _prisme(lot, _anneau(s.points, sc), 0, hs, col, true, m);
      }
    }
    for (let i = 0; i < t.z.length; i++) {
      const z = t.z[i], ring = _anneau(z.points, sc);
      if (ring.length < 3) continue;
      if (mx && _zoneDeTube(z, ring, mx)) { _e.zonesTube++; _zoneGalerie(z, mx, lotsTube); continue; }
      if (z.type === "remblais" && tx) {
        _prisme(remblaisTex, ring, 0, h * HAUTEUR_REMBLAIS, BLANC, true, REMBLAIS.m);
      } else if (z.type === "remblais") {
        _prisme(opaque, ring, 0, h * HAUTEUR_REMBLAIS, _couleur("zones", z.type, "fillColor"), true);
      } else if (z.type === "effondrement" && tx) {
        _prisme(eboulis, ring, 0, h * HAUTEUR_REMBLAIS, BLANC, true, EBOULIS.m);
      } else if (z.type === "effondrement") {
        _prisme(opaque, ring, 0, h * HAUTEUR_REMBLAIS, _couleur("zones", z.type, "fillColor"), true);
      } else if (z.type === "eau") {
        _dessus(transp, ring, 0.04, _couleur("zones", z.type, "fillColor"));
      } else if (z.type === "inaccessible") {
        // Rouge hachuré comme sur la carte : sol et rideau (visible des deux côtés) en matériaux à hachures.
        _dessus(hachSol, ring, 0.02, _couleur("zones", z.type, "fillColor"));
        _prisme(hachRideau, ring, 0, h, _couleur("zones", z.type, "fillColor"), false);
      } else {
        _dessus(opaque, ring, 0.02, _couleur("zones", z.type, "fillColor"));   // types perso
      }
    }
    for (let i = 0; i < t.r.length; i++) {
      const r = t.r[i], col = _couleur("traces", r.type, "color");
      _compter(_e.rubans, r.type);
      if (r.type === "itinerary") _rubanIti(lumineux, r);
      else _ruban(rubans, r.a, r.b, sc, LARGEUR_TRACE, 0.03, col);
    }
    const groupe = new THREE.Group();
    const ajouter = function (lot, mat, ordre, famille) {
      const g = lot.geometrie();
      if (!g) return;
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = ordre;
      m.matrixAutoUpdate = false;
      m.userData.famille = famille;
      groupe.add(m);
    };
    ajouter(opaque, _e.mats.opaque, 0, "opaque");
    ajouter(rubans, _e.mats.rubans, 0, "rubans");
    ajouter(murs, _e.mats.murs, 0, "murs");
    if (roche.p.length || parpaing.p.length) _matsTextures();
    ajouter(roche, _e.mats.roche, 0, "opaque");
    ajouter(parpaing, _e.mats.parpaing, 0, "murs");
    ajouter(lumineux, _e.mats.iti, 1, "itineraire");
    ajouter(transp, _e.mats.transp, 2);
    ajouter(hachSol, _e.mats.hachSol, 0, "opaque");
    ajouter(hachRideau, _e.mats.hachRideau, 2);
    if (parois.p.length) _paroiTexturee();
    ajouter(parois, _e.mats.paroi, 0, "parois");
    ajouter(remblaisTube, _e.mats.opaque, 0, "remblais");
    if (remblaisTex.p.length) _matZone("remblais");
    ajouter(remblaisTex, _e.mats.remblais, 0, "remblais");
    if (eboulis.p.length) _matZone("eboulis");
    ajouter(eboulis, _e.mats.eboulis, 0, "effondrement");
    ajouter(eauTube, _e.mats.eauGalerie, 2, "eau");
    for (let i = 0; i < t.p.length; i++) {
      const p = t.p[i];
      // Mixte : POI dont l'axe le plus proche (10 m au plus) passe en tube → règle de la galerie (contre la paroi) ;
      // en chambre, près d'une structure ou loin de tout tracé → règle des structures (contre la face d'un pilier).
      const pp = mx && !mx.enChambre(p.x, p.y) ? mx.plusProche(p.x, p.y, POI_GALERIE * sc) : null;
      if (pp && mx.tubeAu(pp.arete, pp.t)) { _e.poiTube++; _ajouterPanneau(groupe, p, _contreParoi(p, pp)); }
      else _ajouterPanneau(groupe, p);
    }
    _e.scene.add(groupe);
    t.obj = groupe;
    _e.sale = true;
  }

  function _libererTuile(t) {
    if (!t.obj) return;
    t.obj.traverse(function (o) {
      // 🩸 Un Sprite partage la géométrie de three.js : ne jamais la libérer, seulement sa texture. Un halo de danger
      // partage celle de la vue (userData.partage), libérée à la fermeture.
      if (o.geometry && !o.isSprite && !o.userData.partage) o.geometry.dispose();
      if (o.isSprite && o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      if (o.isSprite) _e.panneaux.delete(o);
    });
    _e.scene.remove(t.obj);
    t.obj = null;
    t.parois = null;
  }

  // ── Mode galerie : les tracés en tubes (window.KtaGalerie, js/galerieEmprise.js), sans les structures ─────
  // ⚠️ contrat : parois = KtaGalerie (modèle > paroisDe, union des pièces, bouts ouverts exclus) :
  // tubes coupés au bord des dalles, aucune paroi qui en traverse une autre. Sol et plafond = les pièces elles-mêmes,
  // superposées sans défaut visible (même texture, posée en coordonnées monde). Zones découpées à l'emprise.

  // Découpe (Sutherland-Hodgman) d'un contour de sens positif par une pièce convexe de sens positif → contour | null.
  function _decouper(sujet, clip) {
    let out = sujet;
    for (let i = 0; i < clip.length && out.length; i++) {
      const a = clip[i], b = clip[(i + 1) % clip.length], ex = b[0] - a[0], ey = b[1] - a[1];
      const cote = function (p) { return ex * (p[1] - a[1]) - ey * (p[0] - a[0]); };
      const entree = out;
      out = [];
      for (let k = 0; k < entree.length; k++) {
        const P = entree[k], Q = entree[(k + 1) % entree.length], sp = cote(P), sq = cote(Q);
        if (sp >= 0) out.push(P);
        if ((sp >= 0) !== (sq >= 0)) {
          const t = sp / (sp - sq);
          out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
        }
      }
    }
    return out.length >= 3 ? out : null;
  }

  function _metres(pts, sc) { return pts.map(function (q) { return [q[0] / sc, q[1] / sc]; }); }

  // Pièce convexe (m) en éventail, à la hauteur y, normale vers le haut (sol) ou le bas (plafond), texture monde.
  function _dalleTexturee(lot, ring, y, haut) {
    const n = haut ? [0, 1, 0] : [0, -1, 0], g = GRAIN_METRES;
    for (let i = 1; i + 1 < ring.length; i++) {
      const a = ring[0], b = ring[i], c = ring[i + 1];
      lot.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], n, BLANC,
        [a[0] / g, a[1] / g, b[0] / g, b[1] / g, c[0] / g, c[1] / g]);
    }
  }

  // Paroi verticale (m) du sol au plafond, face vers l'intérieur de la galerie (à gauche du bord) : _paroiY.
  function _paroi(lot, x0, z0, x1, z1, h) {
    _paroiY(lot, [x0, z0], [x1, z1], 0, h);
  }

  function _construireTuileGalerie(t) {
    const e = _e, m = e.galerie, sc = e.sc, h = e.hauteur;
    const sol = new Lot(), plafond = new Lot(), parois = new Lot(), opaque = new Lot(), lumineux = new Lot();
    const rubans = new Lot();
    const eau = new Lot(), hachSol = new Lot(), hachRideau = new Lot(), remblais = new Lot(), eboulis = new Lot();
    t.parois = [];
    for (let i = 0; i < t.g.length; i++) {
      const ring = _metres(m.pieces[t.g[i]].pts, sc);
      _dalleTexturee(sol, ring, 0, true);
      _dalleTexturee(plafond, ring, h, false);
      const ps = m.paroisDe(t.g[i]);
      for (let k = 0; k < ps.length; k++) {
        const s = ps[k], x0 = s[0] / sc, z0 = s[1] / sc, x1 = s[2] / sc, z1 = s[3] / sc;
        _paroi(parois, x0, z0, x1, z1, h);
        t.parois.push([x0, z0, x1, z1]);
      }
    }
    // Liseré au sol : la couleur du type de tracé dans la légende.
    for (let i = 0; i < t.a.length; i++) {
      const r = m.aretes[t.a[i]];
      if (!_typeTraceMontre(r.type)) continue;
      const col = _couleur("traces", r.type, "color");
      _compter(e.liseres, r.type);
      _ruban(rubans, { x: r.ax, y: r.ay }, { x: r.bx, y: r.by }, sc, LISERE, 0.015, col);
    }
    // 🧱 : remblais et effondrement texturés (_zoneGalerie), le lot du remblais prend alors le matériau `remblais`.
    const tx = e.textures === true;
    const lots = { opaque: opaque, eau: eau, hachSol: hachSol, hachRideau: hachRideau, remblais: remblais,
      eboulis: tx ? eboulis : null, texRemblais: tx };
    for (let i = 0; i < t.z.length; i++) _zoneGalerie(t.z[i], m, lots);
    for (let i = 0; i < t.r.length; i++) {
      const r = t.r[i], col = _couleur("traces", r.type, "color");
      _compter(_e.rubans, r.type);
      if (r.type === "itinerary") _rubanIti(lumineux, r);
      else _ruban(rubans, r.a, r.b, sc, LARGEUR_TRACE, 0.03, col);
    }
    const groupe = new THREE.Group();
    const ajouter = function (lot, mat, ordre, famille) {
      const g = lot.geometrie();
      if (!g) return;
      const me = new THREE.Mesh(g, mat);
      me.renderOrder = ordre;
      me.matrixAutoUpdate = false;
      me.userData.famille = famille;
      if (famille === "plafond") me.visible = e.vue !== "plongee";
      groupe.add(me);
    };
    ajouter(sol, e.mats.solGalerie, 0, "sol");
    ajouter(plafond, e.mats.plafondGalerie, 0, "plafond");
    if (parois.p.length) _paroiTexturee();
    ajouter(parois, e.mats.paroi, 0, "parois");
    ajouter(opaque, e.mats.opaque, 0, "opaque");
    ajouter(rubans, e.mats.rubans, 0, "rubans");
    if (tx && remblais.p.length) _matZone("remblais");
    ajouter(remblais, tx ? e.mats.remblais : e.mats.opaque, 0, "remblais");
    if (eboulis.p.length) _matZone("eboulis");
    ajouter(eboulis, e.mats.eboulis, 0, "effondrement");
    ajouter(lumineux, e.mats.iti, 1, "itineraire");
    ajouter(eau, e.mats.eauGalerie, 2, "eau");
    ajouter(hachSol, e.mats.hachSol, 0, "inaccessible");
    ajouter(hachRideau, e.mats.hachRideau, 2, "rideau");
    for (let i = 0; i < t.p.length; i++) {
      const p = t.p[i];
      const pp = m.plusProche(p.x, p.y, POI_GALERIE * sc);
      if (!pp) { e.poiMasques++; continue; }
      _ajouterPanneau(groupe, p, _contreParoi(p, pp));
    }
    e.scene.add(groupe);
    t.obj = groupe;
    e.sale = true;
  }

  // Place [x, z] (m) d'un POI selon l'axe le plus proche `pp` (plusProche) : dans le tube, là où il est ; au-delà
  // de la paroi, ramené contre elle, RECUL_PAROI devant.
  function _contreParoi(p, pp) {
    const sc = _e.sc, w = pp.w / sc - RECUL_PAROI, d = pp.d / sc;
    let x = p.x / sc, z = p.y / sc;
    if (d > w && d > 1e-9) { x = pp.x / sc + (x - pp.x / sc) * w / d; z = pp.y / sc + (z - pp.y / sc) * w / d; }
    return [x, z];
  }

  // Mixte : une zone suit la règle de la galerie (découpée aux tubes) si elle touche un tube et qu'aucune structure
  // du niveau n'est à moins de SEUIL_CHAMBRE_M de son contour (échantillonné tous les mètres) ni de son centre ;
  // sinon elle est dans une chambre (ou hors de tout tube) et suit la règle des structures, dessinée entière.
  function _zoneDeTube(z, ring, m) {
    const sc = _e.sc;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cz = 0;
    ring.forEach(function (q) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
      cx += q[0] / ring.length; cz += q[1] / ring.length;
    });
    const touche = m.piecesPres(x0 * sc, y0 * sc, x1 * sc, y1 * sc).some(function (i) {
      return _decouper(ring, _metres(m.pieces[i].pts, sc)) !== null;
    });
    if (!touche || m.enChambre(cx * sc, cz * sc)) return false;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1])));
      for (let k = 0; k < n; k++) {
        if (m.enChambre((p[0] + (q[0] - p[0]) * k / n) * sc, (p[1] + (q[1] - p[1]) * k / n) * sc)) return false;
      }
    }
    return true;
  }

  // Zone en mode galerie : découpée à chaque pièce de l'emprise qu'elle touche. Eau à 4 cm ; remblais et
  // effondrement en volume (faces seulement là où il donne sur la galerie) ; inaccessible au sol + rideau en travers
  // du tube là où son contour coupe l'axe ; types perso au sol. `lots.texRemblais` / `lots.eboulis` (🧱) : remblais et
  // effondrement en blanc avec des coordonnées de texture en mètres, comme en chambre (_construireTuile) ; 🧱 coupé,
  // l'effondrement va au lot opaque, à la couleur de la légende.
  function _zoneGalerie(z, m, lots) {
    const e = _e, sc = e.sc, h = e.hauteur, ring = _anneau(z.points, sc);
    if (ring.length < 3) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ring.forEach(function (q) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    });
    const col = _couleur("zones", z.type, "fillColor");
    const pieces = m.piecesPres(x0 * sc, y0 * sc, x1 * sc, y1 * sc);
    for (let i = 0; i < pieces.length; i++) {
      const c = _decouper(ring, _metres(m.pieces[pieces[i]].pts, sc));
      if (!c) continue;
      e.zonesDecoupees[z.type] = (e.zonesDecoupees[z.type] || 0) + 1;
      if (z.type === "eau") _dessus(lots.eau, c, 0.04, col);
      else if (z.type === "inaccessible") _dessus(lots.hachSol, c, 0.02, col);
      else if (z.type === "remblais") {
        _remblaisGalerie(lots.remblais, c, ring, m, h * HAUTEUR_REMBLAIS, lots.texRemblais ? BLANC : col,
          lots.texRemblais ? REMBLAIS.m : undefined);
      } else if (z.type === "effondrement") {
        _remblaisGalerie(lots.eboulis || lots.opaque, c, ring, m, h * HAUTEUR_REMBLAIS, lots.eboulis ? BLANC : col,
          lots.eboulis ? EBOULIS.m : undefined, "facesEboulis");
      } else _dessus(lots.opaque, c, 0.02, col);
    }
    if (z.type !== "inaccessible") return;
    m.aretesPres(x0 * sc, y0 * sc, x1 * sc, y1 * sc).forEach(function (k) {
      const r = m.aretes[k], ax = r.ax / sc, az = r.ay / sc, bx = r.bx / sc, bz = r.by / sc, w = r.w / sc;
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      if (l < 1e-6) return;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const p = ring[j], q = ring[i], ex = q[0] - p[0], ez = q[1] - p[1], d = dx * ez - dz * ex;
        if (Math.abs(d) < 1e-12) continue;
        const rx = p[0] - ax, rz = p[1] - az, t = (rx * ez - rz * ex) / d, u = (rx * dz - rz * dx) / d;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const cx = ax + dx * t, cz = az + dz * t, nx = -dz / l * w, nz = dx / l * w;
        lots.hachRideau.quad([cx - nx, 0, cz - nz], [cx + nx, 0, cz + nz], [cx + nx, h, cz + nz], [cx - nx, h, cz - nz],
          [dx / l, 0, dz / l], col);
        e.rideaux.push([cx, cz]);
      }
    });
  }

  // Remblais (ou effondrement) découpé : dessus, et une face sur chaque bord qui donne sur la galerie (pas contre une
  // paroi ni à l'intérieur de la zone, où elle ne se verrait pas ou scintillerait contre la paroi). `tm` (m par
  // motif, 🧱) : coordonnées de texture de _prisme sur le contour entier de la zone (u = abscisse du bord sur `ring`,
  // même origine ; v = hauteur), dessus projeté au sol : une zone coupée par le tube garde le dessin d'une chambre.
  // `compteur` : compteur de faces de l'état (facesRemblais par défaut, facesEboulis).
  function _remblaisGalerie(lot, c, ring, m, hr, col, tm, compteur) {
    const sc = m.sc, dedansZone = function (x, z) {
      let r = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const p = ring[i], q = ring[j];
        if ((p[1] > z) !== (q[1] > z) && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) r = !r;
      }
      return r;
    };
    for (let i = 0; i < c.length; i++) {
      const p = c[i], q = c[(i + 1) % c.length], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const x = (p[0] + q[0]) / 2 + dz / l * 0.01, z = (p[1] + q[1]) / 2 - dx / l * 0.01;
      if (!m.dedans(x * sc, z * sc) || dedansZone(x, z)) continue;
      let uv;
      if (tm) {
        const s = (_origineMotif(ring, tm) + _abscisse(ring, p[0], p[1])) / tm;
        uv = [s, 0, s + l / tm, 0, s + l / tm, hr / tm, s, hr / tm];
      }
      lot.quad([p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], hr, q[1]], [p[0], hr, p[1]], [dz / l, 0, -dx / l], col, uv);
      _e[compteur || "facesRemblais"]++;
    }
    _dessus(lot, c, hr, col, tm);
  }

  // Abscisse (m) du point (x, z) sur le contour `ring`, depuis son premier sommet : celle du point le plus proche sur
  // le bord le plus proche (à égalité, le premier : un point posé sur ring[0] vaut 0, jamais le périmètre).
  function _abscisse(ring, x, z) {
    let best = Infinity, s = 0, cumul = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], dx = q[0] - p[0], dz = q[1] - p[1];
      const l2 = dx * dx + dz * dz, l = Math.sqrt(l2);
      const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2)) : 0;
      const d = Math.hypot(p[0] + dx * t - x, p[1] + dz * t - z);
      if (d < best - 1e-9) { best = d; s = cumul + t * l; }
      cumul += l;
    }
    return s;
  }

  // ── POI : panneau (icône + nom) toujours face à la caméra, à hauteur de tête ─────────────────────────
  // ⚠️ contrat (décision produit) : un panneau n'est JAMAIS caché par la géométrie (depthTest coupé, dessiné après
  // tout) : un POI relevé dans un pilier ou derrière reste lisible. Borné à la distance de vue, plus petit et plus
  // pâle au loin (_majPanneaux). Un POI dans un volume fermé (pilier, mur, type perso) est collé contre la face de
  // ce volume la plus proche de la caméra, pour ne pas sembler flotter dans la roche. En mode galerie (et dans les
  // tubes du mode mixte), `ou` [x, z] (m) fixe la place du panneau, dans le tube (_contreParoi).
  // POI danger (poiDanger.js > estDanger) : liseré rouge et halo rouge au sol (_ajouterPanneau), visible de près
  // aussi ; POI favori (Favoris.isFav) : ⭐ dans le coin haut droit du panneau.

  // Jetons de la charte du thème SOMBRE, quel que soit le thème affiché : lus dans la règle `:root` des feuilles
  // (style.css), que le thème clair surcharge sur html.kta-theme-light — getComputedStyle rendrait le clair.
  // Repli : les valeurs sombres de la charte. Lus une fois par ouverture (_e.jetonsSombres).
  const JETONS = {
    surface: ["--kta-surface", "#1a1f2e"], fond: ["--kta-fond", "#0a0d18"], texte: ["--kta-texte", "#e8eaf0"],
    accent: ["--kta-accent", "#f4c542"], erreur: ["--kta-erreur", "#ff8c8c"],
    interaction: ["--kta-interaction", "#8cb4ff"], ok: ["--kta-ok", "#6ee287"], avert: ["--kta-avert", "#ffb380"],
    violet: ["--kta-violet", "#a78bfa"], magenta: ["--kta-magenta", "#ff4ecb"], neutre: ["--kta-texte-3", "#98a1b3"]
  };
  function _jetonsSombres() {
    if (_e.jetonsSombres) return _e.jetonsSombres;
    const j = {};
    Object.keys(JETONS).forEach(function (c) { j[c] = JETONS[c][1]; });
    const feuilles = document.styleSheets;
    for (let i = 0; i < feuilles.length; i++) {
      let regles = null;
      try { regles = feuilles[i].cssRules; } catch (err) { continue; }   // feuille d'une autre origine
      for (let k = 0; regles && k < regles.length; k++) {
        const r = regles[k];
        if (r.selectorText !== ":root" || !r.style.getPropertyValue("--kta-surface")) continue;
        Object.keys(JETONS).forEach(function (c) { j[c] = r.style.getPropertyValue(JETONS[c][0]).trim() || j[c]; });
        return (_e.jetonsSombres = j);
      }
    }
    return (_e.jetonsSombres = j);
  }

  function _estDanger(p) {
    const D = window.KtaPoiDanger;
    return D && typeof D.estDanger === "function" ? D.estDanger(p) : _premierTag(p) === "danger";
  }

  // Passage entre niveaux qu'on peut prendre : POI jonction avec un moyen (escalier, échelons, corde ; pas pa).
  function _estPassage(p) {
    const J = window.KtaPoiJonction;
    return !!J && !!p && J.estJonction(p) && !!J.moyen(_premierTag(p));
  }

  // Couleur du tracé `jonction` du canon (celle de la légende), repli : magenta de la charte sombre.
  function _couleurJonction(coul) {
    const s = typeof window.ktaResolveStyle === "function"
      ? window.ktaResolveStyle("traces", "jonction", { flat: true }) : null;
    return (s && s.color) || coul.magenta;
  }

  function _estFavori(p) {
    const F = window.Favoris;
    try { return !!F && typeof F.isFav === "function" && F.isFav(p.id, p.uid); } catch (err) { return false; }
  }

  // Étoile pleine à 5 branches (canvas), centre (cx, cy), rayon r.
  function _etoile(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      if (i) ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  // Panneau aux couleurs de la charte, TOUJOURS celles du thème sombre (décision produit : la scène est noire dans
  // les deux thèmes, _jetonsSombres). Carte surface, liseré doré (rouge pour un danger, `opts.bord` pour un membre ou
  // un repère), icône dans un carré arrondi (sauf `opts.sansIcone`), nom ENTIER sur 3 lignes au plus (coupé aux
  // espaces, « … » au-delà), ⭐ en haut à droite d'un favori. `opts.y` : hauteur (m) à la place de la tête.
  // La hauteur du canvas suit le nombre de lignes ; `userData.ratio` garde la proportion pour l'échelle du sprite.
  function _panneau(p, ou, opts) {
    const o = opts || {};
    const W = 512, PAD = 18, ICONE = 76, LIGNE = 38, ETOILE = 40;
    const POLICE = "600 30px system-ui, -apple-system, sans-serif";
    const coul = _jetonsSombres();
    const danger = !o.bord && _estDanger(p), favori = !o.bord && _estFavori(p);
    const passage = !o.bord && _estPassage(p._v3dJonction || p);
    const bord = o.bord || (danger ? coul.erreur : passage ? _couleurJonction(coul) : coul.accent);
    // Même titre que la fiche 2D (utils.js > buildPointPopupHtml : `nom`) ; l'id n'est qu'un repli technique.
    const nom = String(p.nom || p.name || p.id || (Array.isArray(p.tags) && p.tags[0]) || "").slice(0, 120);
    let url = null;
    try {
      url = !o.sansIcone && typeof window.getIconUrlForPoint === "function" ? window.getIconUrlForPoint(p) : null;
    } catch (err) { url = null; }
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d");
    ctx.font = POLICE;
    const xTexte = url ? PAD + ICONE + 16 : PAD + 4, largeur = W - xTexte - PAD - (favori ? ETOILE : 0);
    const lignes = [];
    let cur = "";
    nom.split(/\s+/).filter(Boolean).forEach(function (mot) {
      // Un mot plus long que la ligne est coupé à la lettre.
      while (ctx.measureText(mot).width > largeur) {
        let n = mot.length - 1;
        while (n > 1 && ctx.measureText(mot.slice(0, n)).width > largeur) n--;
        if (cur) { lignes.push(cur); cur = ""; }
        lignes.push(mot.slice(0, n));
        mot = mot.slice(n);
      }
      const essai = cur ? cur + " " + mot : mot;
      if (ctx.measureText(essai).width <= largeur) cur = essai;
      else { lignes.push(cur); cur = mot; }
    });
    if (cur) lignes.push(cur);
    if (lignes.length > 3) {
      lignes.length = 3;
      let d = lignes[2];
      while (d && ctx.measureText(d + "…").width > largeur) d = d.slice(0, -1);
      lignes[2] = d + "…";
    }
    const H = Math.max((url ? ICONE : LIGNE) + 2 * PAD, lignes.length * LIGNE + 2 * PAD);
    // Sans icône (membre, repère) : carte coupée à la largeur du texte, même taille de lettres (userData.part).
    const L = o.sansIcone ? Math.min(W, Math.ceil(Math.max.apply(null, lignes.map(function (l) {
      return ctx.measureText(l).width;
    }).concat([0])) + xTexte + PAD + 4)) : W;
    cv.width = L; cv.height = H;
    const arrondi = function (x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };
    const dessiner = function (img) {
      ctx.clearRect(0, 0, L, H);
      arrondi(2, 2, L - 4, H - 4, 18);
      ctx.globalAlpha = 0.92; ctx.fillStyle = coul.surface; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = danger ? 5 : 3; ctx.strokeStyle = bord; ctx.stroke();
      if (url) {
        arrondi(PAD, (H - ICONE) / 2, ICONE, ICONE, 14);
        ctx.fillStyle = coul.fond; ctx.fill();
        if (img) {
          try { ctx.drawImage(img, PAD + 8, (H - ICONE) / 2 + 8, ICONE - 16, ICONE - 16); } catch (err) { /* illisible */ }
        }
      }
      if (passage) {
        // ↕ dans une pastille à la couleur du liseré, au coin de l'icône : le passage entre niveaux.
        const bx = url ? PAD + ICONE - 4 : L - PAD - 18, by = url ? (H - ICONE) / 2 + 4 : PAD + 14;
        ctx.beginPath(); ctx.arc(bx, by, 17, 0, Math.PI * 2); ctx.fillStyle = bord; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = coul.fond; ctx.stroke();
        ctx.fillStyle = coul.fond; ctx.font = "700 26px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("↕", bx, by + 1);
        ctx.textAlign = "start";
      }
      if (favori) {
        _etoile(ctx, L - PAD - ETOILE / 2 + 4, PAD + ETOILE / 2 - 2, ETOILE / 2 - 2);
        ctx.fillStyle = coul.accent; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = coul.fond; ctx.stroke();
      }
      ctx.fillStyle = coul.texte;
      ctx.font = POLICE;
      ctx.textBaseline = "middle";
      const y0 = H / 2 - (lignes.length - 1) * LIGNE / 2;
      lignes.forEach(function (l, i) { ctx.fillText(l, xTexte, y0 + i * LIGNE); });
    };
    dessiner(null);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, fog: true, depthWrite: false, depthTest: false,
      transparent: true });
    const sp = new THREE.Sprite(mat);
    sp.userData.ratio = H / L;
    sp.userData.part = L / W;
    sp.userData.fond = coul.surface;
    sp.scale.set(PANNEAU.l * sp.userData.part, PANNEAU.l * sp.userData.part * sp.userData.ratio, 1);
    const x = ou ? ou[0] : p.x / _e.sc, z = ou ? ou[1] : p.y / _e.sc;
    sp.position.set(x, Number.isFinite(o.y) ? o.y : Math.min(_e.oeil + 0.4, _e.hauteur - 0.3), z);
    sp.renderOrder = 10;
    const jonction = passage ? (p._v3dJonction || p) : null;
    // `point` : le POI d'origine (celui de la carte), dont la fiche s'ouvre au toucher (_toucher).
    sp.userData.poi = { x: x, z: z, anneau: ou ? null : _volumeContenant(x, z), nom: nom, jonction: jonction,
      danger: danger, favori: favori, bord: bord, genre: o.genre || "poi", point: p._v3dJonction || p };
    _e.panneaux.add(sp);
    if (url) {
      const img = new Image();
      img.addEventListener("load", function () {
        if (!_e || !mat.map) return;
        dessiner(img);
        tex.needsUpdate = true;
        _e.sale = true;
      });
      img.src = url;
    }
    return sp;
  }

  // Panneau d'un POI ajouté au groupe d'une tuile, avec le halo au sol d'un danger (anneau et disque pâle, rouge de
  // la charte, non éclairés). Le halo suit la place du panneau (_majPanneaux : face du pilier vue) et reste montré
  // de près, quand le panneau s'efface : on se tient dessus.
  function _ajouterPanneau(groupe, p, ou) {
    const sp = _panneau(p, ou);
    if (!sp) return null;
    groupe.add(sp);
    if (!sp.userData.poi.danger) return sp;
    const e = _e;
    if (!e.mats.halo) {
      const c = new THREE.Color();
      try { c.setStyle(_jetonsSombres().erreur); } catch (err) { c.set(0xff8c8c); }
      // toneMapped coupé : le rouge reste celui du jeton (ACES le délavait en saumon).
      e.mats.halo = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: HALO.opacite,
        toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
      e.mats.haloFond = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: HALO.fond,
        toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
    }
    if (!e.geoHalo) {
      e.geoHalo = { anneau: new THREE.RingGeometry(HALO.r0, HALO.r1, 40), fond: new THREE.CircleGeometry(HALO.r0, 40) };
      e.geoHalo.anneau.rotateX(-Math.PI / 2);
      e.geoHalo.fond.rotateX(-Math.PI / 2);
    }
    const halo = new THREE.Group();
    [[e.geoHalo.anneau, e.mats.halo], [e.geoHalo.fond, e.mats.haloFond]].forEach(function (g) {
      const me = new THREE.Mesh(g[0], g[1]);
      me.userData.partage = true;   // géométrie et matériau de la vue : jamais libérés avec la tuile
      me.renderOrder = 3;
      halo.add(me);
    });
    halo.position.set(sp.userData.poi.x, HALO.y, sp.userData.poi.z);
    halo.userData.famille = "halo";
    groupe.add(halo);
    sp.userData.halo = halo;
    e.halos++;
    return sp;
  }

  // Grille des volumes fermés du niveau (anneaux en mètres), faite à chaque _reindexer : un POI y trouve son pilier.
  function _grilleVolumes(structures) {
    const g = new Map(), c = 8;
    for (let i = 0; i < structures.length; i++) {
      const s = structures[i];
      if (_estLigne(s.type)) continue;
      const a = _anneau(s.points, _e.sc);
      if (a.length < 3) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      a.forEach(function (q) {
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]);
      });
      for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
        for (let gz = Math.floor(z0 / c); gz <= Math.floor(z1 / c); gz++) {
          const k = gx + "," + gz;
          if (!g.has(k)) g.set(k, []);
          g.get(k).push(a);
        }
      }
    }
    _e.volumes = { cases: g, c: c };
  }

  function _volumeContenant(x, z) {
    const v = _e.volumes;
    if (!v) return null;
    const l = v.cases.get(Math.floor(x / v.c) + "," + Math.floor(z / v.c));
    if (!l) return null;
    for (let i = 0; i < l.length; i++) {
      const a = l[i];
      let dedans = false;
      for (let j = 0, k = a.length - 1; j < a.length; k = j++) {
        const p = a[j], q = a[k];
        if ((p[1] > z) !== (q[1] > z) && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) dedans = !dedans;
      }
      if (dedans) return a;
    }
    return null;
  }

  // Point du contour le plus proche de (cx, cz), avancé de 8 cm vers lui (devant la face, pas dedans).
  function _bordProche(a, cx, cz) {
    let best = null, d = Infinity;
    for (let i = 0; i < a.length; i++) {
      const p = a[i], q = a[(i + 1) % a.length], vx = q[0] - p[0], vz = q[1] - p[1], l2 = vx * vx + vz * vz;
      const t = l2 ? Math.max(0, Math.min(1, ((cx - p[0]) * vx + (cz - p[1]) * vz) / l2)) : 0;
      const x = p[0] + t * vx, z = p[1] + t * vz, dd = Math.hypot(cx - x, cz - z);
      if (dd < d) { d = dd; best = [x, z]; }
    }
    if (d > 1e-6) { best[0] += (cx - best[0]) / d * 0.08; best[1] += (cz - best[1]) / d * 0.08; }
    return best;
  }

  // Panneaux : dans la distance de vue (comptée depuis soi), échelle 1 → 0,5 et opacité 1 → 0,4 vers la limite.
  // De près (distance à la caméra) : rien sous PRES.min, fondu jusqu'à PRES.net, et jamais plus large que PRES.ecran
  // de l'écran (champ horizontal de la caméra à cette distance).
  function _majPanneaux() {
    const e = _e, cam = e.camera.position, px = e.pos.x / e.sc, pz = e.pos.y / e.sc;
    const demiChamp = Math.tan(e.camera.fov * Math.PI / 360) * (e.camera.aspect || 1);
    const v = e.v3 || (e.v3 = new THREE.Vector3());
    e.camera.updateMatrixWorld();
    e.panneaux.forEach(function (sp) {
      const u = sp.userData.poi;
      let x = u.x, z = u.z;
      if (u.anneau) { const b = _bordProche(u.anneau, cam.x, cam.z); x = b[0]; z = b[1]; }
      const k = Math.hypot(x - px, z - pz) / e.distance;
      const dc = Math.hypot(x - cam.x, sp.position.y - cam.y, z - cam.z);
      const halo = sp.userData.halo;
      if (halo) { halo.visible = k <= 1; halo.position.x = x; halo.position.z = z; }
      const pr = u.jonction ? PRES_PASSAGE : PRES;
      sp.visible = k <= 1 && dc >= pr.min;
      if (!sp.visible) return;
      sp.position.x = x; sp.position.z = z;
      // Profondeur devant la caméra (la largeur à l'écran en dépend) ; derrière elle, la distance suffit.
      const prof = -v.copy(sp.position).applyMatrix4(e.camera.matrixWorldInverse).z;
      const ratio = sp.userData.ratio || PANNEAU.h / PANNEAU.l;
      const l = Math.min(PANNEAU.l * (1 - 0.5 * k), PRES.ecran * 2 * (prof > 0 ? prof : dc) * demiChamp);
      const f = sp.userData.part || 1;
      sp.scale.set(l * f, l * f * ratio, 1);
      const pres = Math.min(1, (dc - pr.min) / (pr.net - pr.min));
      sp.material.opacity = (1 - 0.6 * k) * pres;
    });
  }

  // ── Scène ──────────────────────────────────────────────────────────────────────────────────────────

  // Motif calcaire répétable : teinte COULEUR_CALCAIRE, taches douces (bruit de valeur 8 × 8 interpolé, bouclé sur
  // les bords pour que la répétition ne se voie pas) et grain fin par pixel. ~1 ms, 64 Ko de texture.
  function _grainCalcaire() {
    const n = GRAIN_TAILLE, g = 8, cv = document.createElement("canvas");
    cv.width = n; cv.height = n;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(n, n), base = new THREE.Color(COULEUR_CALCAIRE);
    let graine = 7;
    const alea = function () { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
    const grille = [];
    for (let i = 0; i < g * g; i++) grille.push(alea());
    const v = function (x, y) { return grille[((y + g) % g) * g + ((x + g) % g)]; };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const fx = x / n * g, fy = y / n * g, x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const haut = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
        const bas = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
        const k = 0.86 + (haut + (bas - haut) * sy) * 0.2 + (alea() - 0.5) * 0.1;
        const o = (y * n + x) * 4;
        img.data[o] = Math.min(255, base.r * 255 * k);
        img.data[o + 1] = Math.min(255, base.g * 255 * k);
        img.data[o + 2] = Math.min(255, base.b * 255 * k);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(_e.distance * 2.4 / GRAIN_METRES, _e.distance * 2.4 / GRAIN_METRES);
    tex.anisotropy = 4;
    return tex;
  }

  // Appareil de moellons des parois du mode galerie (galeries consolidées des carrières) : MOELLONS_MOTIF.h assises
  // de blocs MOELLON.l × MOELLON.h, joints décalés (chaque assise part d'un décalage tiré, les blocs bouclent sur la
  // largeur : motif sans couture), longueur de bloc ± 25 %, teinte par bloc autour de MOELLON.couleur, arêtes un peu
  // éclairées en haut et ombrées en bas, joints de mortier plus sombres ou plus clairs, grain fin. ~3 ms, 160 Ko de
  // texture ; aucune image téléchargée. `repeat` = un motif par MOELLON × MOELLONS_MOTIF mètres (uv en m, _paroiY).
  function _moellons() {
    const k = MOELLON_PX_M, bl = Math.round(MOELLON.l * k), bh = Math.round(MOELLON.h * k);
    const L = bl * MOELLONS_MOTIF.l, H = bh * MOELLONS_MOTIF.h, jt = Math.max(1, Math.round(MOELLON.joint * k));
    const cv = document.createElement("canvas");
    cv.width = L; cv.height = H;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(L, H), base = new THREE.Color(MOELLON.couleur);
    let graine = 13;
    const alea = function () { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
    for (let a = 0; a < MOELLONS_MOTIF.h; a++) {
      // Blocs de l'assise : longueurs tirées, la dernière ajuste la somme à L.
      const bords = [0];
      for (let x = 0; ;) {
        const w = Math.round(bl * (0.75 + alea() * 0.5));
        if (L - (x + w) < bl * 0.6) break;
        x += w; bords.push(x);
      }
      bords.push(L);
      const dec = Math.floor(alea() * L), y0 = a * bh;
      for (let b = 0; b + 1 < bords.length; b++) {
        const t = 0.88 + alea() * 0.17, chaud = alea();
        const fj = alea() < 0.25 ? 1.05 : 0.6 + alea() * 0.1;   // mortier du joint : sombre le plus souvent, ou clair
        const r0 = base.r * t, g0 = base.g * t * (0.98 + 0.03 * chaud), b0 = base.b * t * (0.93 + 0.1 * chaud);
        const w = bords[b + 1] - bords[b];
        for (let dy = 0; dy < bh; dy++) {
          for (let dx = 0; dx < w; dx++) {
            const x = (bords[b] + dx + dec) % L, y = y0 + dy, o = (y * L + x) * 4;
            let f = 1 + (alea() - 0.5) * 0.1;
            const joint = dy < jt || dx < jt;
            if (joint) f = fj * (1 + (alea() - 0.5) * 0.06);
            else if (dy < jt + 2) f *= 1.06;              // arête haute éclairée
            else if (dy >= bh - 2) f *= 0.86;             // arête basse ombrée
            else if (dx >= w - 2) f *= 0.92;
            img.data[o] = Math.min(255, r0 * f * 255);
            img.data[o + 1] = Math.min(255, g0 * f * 255);
            img.data[o + 2] = Math.min(255, b0 * f * 255);
            img.data[o + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / (MOELLON.l * MOELLONS_MOTIF.l), 1 / (MOELLON.h * MOELLONS_MOTIF.h));
    tex.anisotropy = 4;
    return tex;
  }

  // ── Textures des structures (🧱) ──────────────────────────────────────────────────────────────────────

  // Type de structure → "roche" | "parpaing" | null (couleur unie), en cache pour la vue. Un type perso `cust-…`
  // n'a pas de type de base, seulement la géométrie de son entrée de légende (styleResolver.js > _styleCustom) :
  // en ligne, un front de taille ; en polygone, un pilier (il monte à toute la hauteur comme un pilier, la règle
  // du mur ne vaut que pour les clés `mur` et `mur-ligne`) : roche brute dans les deux cas, s'il est résolu
  // par le canon. Un type inconnu du canon garde sa couleur.
  function _textureDe(type) {
    const e = _e, cache = e.texType || (e.texType = new Map());
    if (cache.has(type)) return cache.get(type);
    let t = Object.prototype.hasOwnProperty.call(TEXTURE_TYPE, type) ? TEXTURE_TYPE[type] : null;
    if (!t && /^cust-/.test(type) && typeof window.ktaResolveStyle === "function" &&
        window.ktaResolveStyle("structures", type)) t = "roche";
    cache.set(type, t);
    return t;
  }

  function _texturesVoulues() {
    return typeof window.getVue3DTextures !== "function" || window.getVue3DTextures() === true;
  }

  // Champ de bruit de valeur répétable n × n (Float32Array, [0, 1]) : grille gx × gy bouclée, interpolation douce,
  // indices et poids précalculés par colonne et par ligne (aucune division ni arrondi par pixel).
  function _champBoucle(alea, gx, gy, n) {
    const grille = new Float32Array(gx * gy), out = new Float32Array(n * n);
    for (let i = 0; i < gx * gy; i++) grille[i] = alea();
    const axe = function (g) {
      const i0 = new Int32Array(n), i1 = new Int32Array(n), w = new Float32Array(n);
      for (let p = 0; p < n; p++) {
        const f = p * g / n, k = Math.floor(f), t = f - k;
        i0[p] = k % g; i1[p] = (k + 1) % g; w[p] = t * t * (3 - 2 * t);
      }
      return { i0: i0, i1: i1, w: w };
    };
    const ax = axe(gx), ay = axe(gy);
    for (let y = 0; y < n; y++) {
      const l0 = ay.i0[y] * gx, l1 = ay.i1[y] * gx, sy = ay.w[y];
      for (let x = 0; x < n; x++) {
        const c0 = ax.i0[x], c1 = ax.i1[x], sx = ax.w[x];
        const a = grille[l0 + c0] + (grille[l0 + c1] - grille[l0 + c0]) * sx;
        const b = grille[l1 + c0] + (grille[l1 + c1] - grille[l1 + c0]) * sx;
        out[y * n + x] = a + (b - a) * sy;
      }
    }
    return out;
  }

  // Appareil répétable de `o.px` px → { couleur, normale } (canvas). `o.assises` : du bas du motif vers
  // le haut, { bas (px), demiLit (px : demi-joint du lit au-dessus), onde ([amplitude px, périodes, phase] | null),
  // blocs: [{ x (px : joint à gauche du bloc), pente (px par px de hauteur), demi (px), teinte [r, g, b] }] } ;
  // le lit d'en haut du motif est celui d'en bas (motif sans couture dans les deux sens).
  // Hauteur : 1 sur la face, descend en `biseau` px vers le joint (arête émoussée), mortier en creux ; normal map
  // tirée de cette hauteur (_carteNormale, force `relief`). 🩸 Le canvas a y vers le bas et la texture v vers le
  // haut (flipY) : la ligne y est écrite à la rangée n − 1 − y, et la pente selon v suit y.
  // ⚠️ Coût proportionnel au nombre de pixels (PARPAING.px, ROCHE.px) : tout ce qui ne dépend pas du pixel est
  // précalculé (lits ondulés par colonne, champs de bruit), aléa du grain par un générateur entier.
  function _appareil(o, alea) {
    const n = o.px, A = o.assises, na = A.length, haut = new Float32Array(n * n);
    const img = new Uint8ClampedArray(n * n * 4), base = new THREE.Color(o.couleur), mo = new THREE.Color(o.mortier);
    const tache = _champBoucle(alea, 8, 8, n), face = _champBoucle(alea, 32, 32, n), lits = _champBoucle(alea, 3, 28, n);
    // Lits (bas de chaque assise, plus le haut du motif = le premier lit + n) par colonne.
    const lit = new Float32Array((na + 1) * n);
    for (let i = 0; i <= na; i++) {
      const a = A[i % na], w = a.onde;
      for (let x = 0; x < n; x++) {
        lit[i * n + x] = a.bas + (i === na ? n : 0) + (w ? w[0] * Math.sin(2 * Math.PI * w[1] * x / n + w[2]) : 0);
      }
    }
    let graine = Math.floor(alea() * 2147483647) | 1;
    const grain = function () { graine = (Math.imul(graine, 1664525) + 1013904223) | 0; return (graine >>> 0) / 4294967296; };
    const bR = base.r * 255, bG = base.g * 255, bB = base.b * 255, mR = mo.r * 255, mG = mo.g * 255, mB = mo.b * 255;
    const biseau = o.biseau, bosse = o.bosse, grR = o.grainRelief, grC = o.grain, ta = o.taches, li = o.lits;
    for (let y = 0; y < n; y++) {
      const ligne = (n - 1 - y) * n;
      for (let x = 0; x < n; x++) {
        let yy = y, i = 0;
        if (yy < lit[x]) yy += n;
        while (i < na - 1 && yy >= lit[(i + 1) * n + x]) i++;
        const a = A[i], bas = lit[i * n + x], yc = yy - bas;
        const eLit = Math.min(yc - A[(i + na - 1) % na].demiLit, lit[(i + 1) * n + x] - yy - a.demiLit);
        const blocs = a.blocs;
        let dx = n, demi = 0, k = 0, gauche = n;
        for (let j = 0; j < blocs.length; j++) {
          const b = blocs[j];
          let d = x - b.x - b.pente * yc;
          while (d < 0) d += n;
          while (d >= n) d -= n;
          if (d < gauche) { gauche = d; k = j; }
          const dd = d < n - d ? d : n - d;
          if (dd < dx) { dx = dd; demi = b.demi; }
        }
        const bord = Math.min(dx - demi, eLit), p = y * n + x, o4 = (ligne + x) * 4;
        if (bord < 0) {
          const f = 0.92 + grain() * 0.14;
          haut[p] = 0.05 + grain() * 0.08;
          img[o4] = mR * f; img[o4 + 1] = mG * f; img[o4 + 2] = mB * f;
        } else {
          const t = bord < biseau ? bord / biseau : 1, s = t * t * (3 - 2 * t), te = blocs[k].teinte;
          haut[p] = 0.3 + 0.7 * s + (face[p] - 0.5) * bosse + (grain() - 0.5) * grR;
          const f = (1 - ta / 2 + ta * tache[p]) * (1 + (grain() - 0.5) * grC) * (0.86 + 0.14 * s) *
            (1 + li * (lits[p] - 0.5) * 2);
          img[o4] = bR * te[0] * f; img[o4 + 1] = bG * te[1] * f; img[o4 + 2] = bB * te[2] * f;
        }
        img[o4 + 3] = 255;
      }
    }
    // Pores et éclats : creux ronds, un peu plus sombres.
    for (let p = 0; p < o.pores; p++) {
      const cx = alea() * n, cy = alea() * n, rr = o.pore[0] + alea() * (o.pore[1] - o.pore[0]), pr = alea() * 0.35 + 0.2;
      for (let y = Math.floor(cy - rr); y <= cy + rr; y++) {
        for (let x = Math.floor(cx - rr); x <= cx + rr; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d > rr) continue;
          const xx = ((x % n) + n) % n, yy = ((y % n) + n) % n, k = 1 - d / rr, o4 = ((n - 1 - yy) * n + xx) * 4;
          haut[yy * n + xx] -= pr * k;
          for (let c = 0; c < 3; c++) img[o4 + c] *= 1 - 0.25 * k;
        }
      }
    }
    return { couleur: _canvasDe(img, n), normale: _carteNormale(haut, n, o.relief) };
  }

  // Pixels RVBA (n × n) → canvas.
  function _canvasDe(img, n) {
    const cv = document.createElement("canvas");
    cv.width = n; cv.height = n;
    const ctx = cv.getContext("2d"), id = ctx.createImageData(n, n);
    id.data.set(img);
    ctx.putImageData(id, 0, 0);
    return cv;
  }

  // Normal map d'un champ de hauteur n × n (rangée 0 = bas de la texture, v vers le haut) : différences centrées
  // bouclées (motif sans couture), force `s` ; écrite à l'endroit du canvas de couleur (flipY). Partagée par
  // l'appareil (parpaing) et la roche brute.
  function _carteNormale(haut, n, s) {
    const cv = document.createElement("canvas");
    cv.width = n; cv.height = n;
    const ctx = cv.getContext("2d"), id = ctx.createImageData(n, n), dn = id.data;
    for (let y = 0; y < n; y++) {
      const yb = ((y + n - 1) % n) * n, yh = ((y + 1) % n) * n;
      for (let x = 0; x < n; x++) {
        const nx = (haut[y * n + (x + n - 1) % n] - haut[y * n + (x + 1) % n]) * s;
        const ny = (haut[yb + x] - haut[yh + x]) * s, l = Math.sqrt(nx * nx + ny * ny + 1);
        const o4 = ((n - 1 - y) * n + x) * 4;
        dn[o4] = (nx / l * 0.5 + 0.5) * 255; dn[o4 + 1] = (ny / l * 0.5 + 0.5) * 255;
        dn[o4 + 2] = (1 / l * 0.5 + 0.5) * 255; dn[o4 + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0);
    return cv;
  }

  // Roche brute (piliers et fronts : la masse calcaire laissée en place, jamais appareillée) : relief en bosses à
  // trois échelles (champs bouclés), nuances de calcaire en taches larges, strates horizontales discrètes et
  // ondulées, fissures en creux (marches aléatoires bouclées) et traces d'outil (pic, broche : courts sillons
  // parallèles en grappes, obliques). Aucun joint, aucun bloc. Motif de ROCHE.m mètres (décalé par structure) : sans
  // joints la répétition se voit plus, d'où un motif plus grand que celui du parpaing et deux échelles de taches.
  // → { couleur, normale } (canvas n × n). 🩸 Hauteur en v vers le haut (comme _appareil) : ligne y écrite à n − 1 − y.
  function _rocheBrute(alea) {
    const R = ROCHE, n = R.px, k = n / R.m, haut = new Float32Array(n * n), sombre = new Float32Array(n * n);
    const creux = new Float32Array(n * n);
    const gros = _champBoucle(alea, 5, 5, n), moyen = _champBoucle(alea, 14, 14, n);
    const fin = _champBoucle(alea, 40, 40, n);
    const tache = _champBoucle(alea, 4, 4, n), tache2 = _champBoucle(alea, 11, 11, n);
    const onde = _champBoucle(alea, 3, 9, n), voile = _champBoucle(alea, 7, 3, n);
    // Bosses : trois échelles ; la grosse en valeur absolue recentrée (crêtes et cuvettes de la masse taillée).
    for (let p = 0; p < n * n; p++) {
      const g = 1 - Math.abs(gros[p] * 2 - 1);
      haut[p] = 0.5 * g + 0.32 * moyen[p] + 0.18 * fin[p];
    }
    // Strates : lits horizontaux tous les R.strate m, ondulés, visibles par endroits seulement (voile).
    const ns = Math.max(1, Math.round(R.m / R.strate)), lit = R.lit * k;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const p = y * n + x, f = (((y + (onde[p] - 0.5) * R.onde * k) * ns / n) % 1 + 1) % 1;
        const d = Math.min(f, 1 - f) * n / ns, v = Math.max(0, voile[p] * 2 - 0.7);
        if (d >= lit * 2) continue;
        const s = (1 - d / (lit * 2)) * v;
        creux[p] = Math.max(creux[p], 0.05 * s);
        sombre[p] += 0.05 * s;
      }
    }
    // Creux (fissure, trace d'outil) : on garde le plus profond par pixel, jamais la somme des passages.
    const creuser = function (x, y, r, prof, assomb) {
      for (let yy = Math.floor(y - r); yy <= y + r; yy++) {
        for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
          const d = Math.hypot(xx - x, yy - y);
          if (d > r) continue;
          const p = (((yy % n) + n) % n) * n + (((xx % n) + n) % n), s = 1 - d / r;
          creux[p] = Math.max(creux[p], prof * s);
          sombre[p] = Math.max(sombre[p], assomb * s);
        }
      }
    };
    // Fissures : fines, presque droites, surtout verticales, qui s'amincissent ; une branche parfois.
    const fissure = function (x, y, a, l, w0) {
      for (let s = 0; s < l; s += 0.5) {
        a += (alea() - 0.5) * 0.18;
        x += Math.cos(a) * 0.5; y += Math.sin(a) * 0.5;
        creuser(x, y, w0 * (1 - s / l) + 0.5, 0.25, 0.22);
        if (alea() < 0.004) fissure(x, y, a + (alea() < 0.5 ? -1 : 1) * (0.5 + alea() * 0.5), (l - s) * 0.4, w0 * 0.6);
      }
    };
    for (let f = 0; f < R.fissures; f++) {
      fissure(alea() * n, alea() * n, Math.PI / 2 + (alea() - 0.5) * 0.9, (0.3 + alea() * 0.9) * k, 0.4 + alea() * 0.6);
    }
    // Traces d'outil (pic, broche) : sillons isolés ou par deux ou trois, de longueur, d'angle et d'écart tirés.
    for (let g = 0; g < R.grappes; g++) {
      const cx = alea() * n, cy = alea() * n, a0 = (alea() < 0.5 ? -1 : 1) * (0.4 + alea() * 0.8);
      const nb = 1 + Math.floor(alea() * 3);
      for (let i = 0; i < nb; i++) {
        const a = a0 + (alea() - 0.5) * 0.3, l = (0.06 + alea() * 0.14) * k, e = (0.02 + alea() * 0.04) * k * i;
        const ox = cx - Math.sin(a0) * e, oy = cy + Math.cos(a0) * e;
        for (let s = 0; s < l; s += 0.5) creuser(ox + Math.cos(a) * s, oy + Math.sin(a) * s, 0.9, 0.07, 0.035);
      }
    }
    for (let p = 0; p < n * n; p++) haut[p] -= creux[p];
    const img = new Uint8ClampedArray(n * n * 4), base = new THREE.Color(R.couleur);
    let graine = Math.floor(alea() * 2147483647) | 1;
    const grain = function () { graine = (Math.imul(graine, 1664525) + 1013904223) | 0; return (graine >>> 0) / 4294967296; };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const p = y * n + x, o4 = ((n - 1 - y) * n + x) * 4;
        const t = (0.86 + 0.2 * tache[p]) * (0.94 + 0.12 * tache2[p]), chaud = tache2[p];
        const f = t * (0.9 + 0.2 * haut[p]) * (1 - sombre[p]) * (1 + (grain() - 0.5) * R.grain);
        img[o4] = base.r * 255 * f * (0.99 + 0.03 * chaud);
        img[o4 + 1] = base.g * 255 * f;
        img[o4 + 2] = base.b * 255 * f * (1.01 - 0.05 * chaud);
        img[o4 + 3] = 255;
      }
    }
    for (let p = 0; p < n * n; p++) haut[p] += (grain() - 0.5) * 0.02;
    return { couleur: _canvasDe(img, n), normale: _carteNormale(haut, n, R.relief) };
  }

  // Pierraille (REMBLAIS, EBOULIS) : sol de terre et de sable (bruit à trois échelles, grains clairs), cailloux et
  // blocs anguleux. Un bloc = intersection de demi-plans (o.facettes) autour d'un centre, allongé selon un axe tiré :
  // toujours convexe, arêtes droites. Hauteur en facettes (pente propre à chaque face, plateau au sommet) : les
  // arêtes accrochent la lampe par la normal map. Saillie selon la taille de la classe : un bloc dépasse plus qu'un
  // gravier, le pied de chacun reste sous la terre (à moitié enfoui) ; liseré de terre plus sombre autour. On garde
  // la plus haute surface par pixel : les blocs se recouvrent comme un tas. `o.fissures` : fissures par gros bloc.
  // → { couleur, normale } (canvas n × n). 🩸 Hauteur en v vers le haut (comme _appareil) : ligne y écrite à n − 1 − y.
  // ⚠️ Coût proportionnel à la surface des blocs × facettes : borné par `tailles` (~10 ms au PC par texture).
  function _pierraille(o, alea) {
    const n = o.px, k = n / o.m, img = new Uint8ClampedArray(n * n * 4);
    const S = { n: n, haut: new Float32Array(n * n), bloc: new Int32Array(n * n).fill(-1),
      ombre: new Float32Array(n * n), eclat: new Float32Array(n * n) };
    const haut = S.haut, bloc = S.bloc, ombre = S.ombre, eclat = S.eclat;
    const t1 = _champBoucle(alea, 6, 6, n), t2 = _champBoucle(alea, 22, 22, n), t3 = _champBoucle(alea, 64, 64, n);
    const terre = new THREE.Color(o.terre), pierre = new THREE.Color(o.pierre);
    let graine = Math.floor(alea() * 2147483647) | 1;
    const grain = function () { graine = (Math.imul(graine, 1664525) + 1013904223) | 0; return (graine >>> 0) / 4294967296; };
    for (let p = 0; p < n * n; p++) haut[p] = 0.1 * t1[p] + 0.06 * t2[p] + 0.05 * t3[p];
    const teintes = [], hmax = o.tailles[o.tailles.length - 1][1], nfMax = o.facettes[1];
    // Un bloc : facettes en tableaux typés réutilisés (le tracé, _poserBloc, est appelé des centaines de fois).
    const B = { nf: 0, nx: new Float64Array(nfMax), ny: new Float64Array(nfMax), d: new Float64Array(nfMax),
      pente: new Float64Array(nfMax), ton: new Float64Array(nfMax), fis: new Float64Array(5 * o.fissures), nfis: 0,
      cx: 0, cy: 0, r: 0, sail: 0, gx: 0, gy: 0, id: 0 };
    // Des plus gros aux plus petits : un gravier tiré sur un bloc ne le recouvre que s'il le dépasse.
    for (let c = o.tailles.length - 1; c >= 0; c--) {
      const T = o.tailles[c], nb = Math.round(T[2] * (0.75 + alea() * 0.5));
      for (let b = 0; b < nb; b++, B.id++) {
        const r = (T[0] + alea() * (T[1] - T[0])) * k;
        B.r = r; B.cx = alea() * n; B.cy = alea() * n;
        B.nf = o.facettes[0] + Math.floor(alea() * (nfMax - o.facettes[0] + 1));
        const axe = alea() * Math.PI, al = 1 + alea() * o.allonge, a0 = alea() * 2 * Math.PI;
        for (let f = 0; f < B.nf; f++) {
          const a = a0 + (f + (alea() - 0.5) * 0.7) * 2 * Math.PI / B.nf;
          B.nx[f] = Math.cos(a); B.ny[f] = Math.sin(a);
          B.d[f] = r * (0.75 + alea() * 0.35) * (1 + (al - 1) * Math.abs(Math.cos(a - axe)));
          B.pente[f] = (0.6 + alea() * 1.1) / Math.max(1.5, r * 0.45);
          B.ton[f] = 0.8 + alea() * 0.3;
        }
        // Saillie : part de la classe, plus la taille dans la classe ; plateau un peu incliné.
        B.sail = T[3] * (0.25 + 0.75 * r / (hmax * k)) * (0.8 + alea() * 0.4);
        B.gx = (alea() - 0.5) * 0.3 / r; B.gy = (alea() - 0.5) * 0.3 / r;
        const t = 0.86 + alea() * 0.18, chaud = alea(), gris = alea() < 0.3;
        teintes.push(gris ? [t * 0.96, t * 0.97, t] : [t * (1 + 0.04 * chaud), t, t * (0.95 - 0.06 * chaud)]);
        // Fissures des plus gros : droites, à un écart tiré du centre, sur une longueur tirée (cassure partielle).
        B.nfis = c === o.tailles.length - 1 ? o.fissures : 0;
        for (let f = 0; f < B.nfis; f++) {
          const a = alea() * Math.PI;
          B.fis[5 * f] = Math.cos(a); B.fis[5 * f + 1] = Math.sin(a);
          B.fis[5 * f + 2] = (alea() - 0.5) * r * 0.9; B.fis[5 * f + 3] = 0.6 + alea() * 0.6;
          B.fis[5 * f + 4] = r * (0.3 + alea() * 0.7);
        }
        _poserBloc(B, S);
      }
    }
    // Grains de sable clairs dans la terre.
    const sable = new Uint8Array(n * n);
    for (let s = 0; s < o.sable; s++) sable[Math.floor(grain() * n * n)] = 1;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const p = y * n + x, o4 = ((n - 1 - y) * n + x) * 4, b = bloc[p];
        let r0, g0, b0;
        if (b >= 0) {
          const te = teintes[b], f = eclat[p] * (1 + (grain() - 0.5) * 0.08) * (0.94 + 0.12 * t3[p]);
          r0 = pierre.r * te[0] * f; g0 = pierre.g * te[1] * f; b0 = pierre.b * te[2] * f;
        } else {
          let f = (0.8 + 0.3 * t1[p]) * (0.9 + 0.2 * t2[p]) * (1 + (grain() - 0.5) * 0.16) * (1 - 0.3 * ombre[p]);
          if (sable[p]) f *= 1.35;
          r0 = terre.r * f; g0 = terre.g * f; b0 = terre.b * f;
          haut[p] += 0.04 * ombre[p] + (sable[p] ? 0.03 : 0);
        }
        img[o4] = r0 * 255; img[o4 + 1] = g0 * 255; img[o4 + 2] = b0 * 255; img[o4 + 3] = 255;
      }
    }
    return { couleur: _canvasDe(img, n), normale: _carteNormale(haut, n, o.relief) };
  }

  // Trace un bloc B (_pierraille) dans S : hauteur en facettes, plus haute surface gardée par pixel (bloc, éclat de
  // la facette), liseré de terre sombre (ombre) jusqu'à `lis` px autour. Motif bouclé (indices modulo n).
  function _poserBloc(B, S) {
    const n = S.n, haut = S.haut, nf = B.nf, nx = B.nx, ny = B.ny, d = B.d, pente = B.pente, fis = B.fis;
    let dmax = 0;
    for (let f = 0; f < nf; f++) dmax = Math.max(dmax, d[f]);
    const lis = Math.max(1, B.r * 0.18), R = Math.ceil(dmax + lis) + 1, cx = B.cx, cy = B.cy;
    for (let yy = Math.floor(cy - R); yy <= cy + R; yy++) {
      const qy = yy - cy, ligne = (((yy % n) + n) % n) * n;
      for (let xx = Math.floor(cx - R); xx <= cx + R; xx++) {
        const qx = xx - cx;
        let dm = Infinity, fm = 0, h = Infinity;
        for (let f = 0; f < nf && dm > -lis; f++) {
          const e = d[f] - (qx * nx[f] + qy * ny[f]);
          if (e < dm) dm = e;
          const hf = e * pente[f];
          if (hf < h) { h = hf; fm = f; }
        }
        if (dm <= -lis) continue;
        const p = ligne + (((xx % n) + n) % n);
        if (dm < 0) {
          const o = 1 + dm / lis;
          if (o > S.ombre[p]) S.ombre[p] = o;
          continue;
        }
        const hc = h < 1 ? h : 1;
        let v = 0.2 + B.sail * (hc + qx * B.gx + qy * B.gy), fond = B.ton[fm] * (0.9 + 0.1 * hc);
        for (let f = 0; f < B.nfis; f++) {
          const w = fis[5 * f + 3], df = Math.abs(qx * fis[5 * f] + qy * fis[5 * f + 1] - fis[5 * f + 2]);
          if (df < w && Math.abs(qy * fis[5 * f] - qx * fis[5 * f + 1]) < fis[5 * f + 4]) { v -= 0.2 * (1 - df / w); fond *= 0.55 + 0.45 * df / w; }
        }
        if (v <= haut[p]) continue;
        haut[p] = v;
        S.bloc[p] = B.id;
        S.eclat[p] = fond;
      }
    }
  }

  // Assises d'une pierre de taille de carrière (PIERRE) : hauteurs tirées dont la somme fait le motif, blocs de
  // longueur tirée partant d'un décalage tiré (joints jamais alignés d'une assise à l'autre), joints irréguliers.
  function _assisesPierre(alea) {
    const P = PIERRE, k = P.px / P.m, A = [], tire = function (b) { return b[0] + alea() * (b[1] - b[0]); };
    for (let y = 0; y < P.m - 1e-6;) {
      let h = tire(P.assise);
      const reste = P.m - y;
      if (reste - h < P.assise[0]) h = reste > P.assise[1] ? reste / 2 : reste;
      const blocs = [], dec = alea() * P.m;
      for (let x = 0; ;) {
        const t = 0.86 + alea() * 0.16, chaud = alea(), gris = alea() < 0.2;
        blocs.push({ x: ((dec + x) % P.m) * k, pente: (alea() - 0.5) * 2 * P.pente, demi: tire(P.joint) * k / 2,
          teinte: gris ? [t * 0.95, t * 0.97, t * 1.0] : [t * (1 + 0.03 * chaud), t, t * (0.97 - 0.05 * chaud)] });
        x += tire(P.bloc);
        if (P.m - x < P.bloc[0] * 0.8) break;
      }
      A.push({ bas: y * k, demiLit: tire(P.joint) * k / 2,
        onde: [(0.4 + alea() * 0.6) * P.onde * k, 1 + Math.floor(alea() * 3), alea() * 2 * Math.PI], blocs: blocs });
      y += h;
    }
    return { assises: A, couleur: P.couleur, mortier: P.mortier, biseau: P.biseau * k, relief: P.relief,
      bosse: 0.12, grainRelief: 0.06, taches: 0.16, grain: 0.08, lits: 0.05, pores: 120, pore: [0.6, 1.8], px: P.px };
  }

  // Assises de parpaings (PARPAING) : blocs réguliers posés à joints croisés (demi-bloc de décalage).
  function _assisesParpaing(alea) {
    const P = PARPAING, k = P.px / P.m, A = [], nl = Math.round(P.m / P.l);
    for (let i = 0; i < Math.round(P.m / P.h); i++) {
      const blocs = [];
      for (let j = 0; j < nl; j++) {
        const t = 0.92 + alea() * 0.13;
        blocs.push({ x: (j * P.l + (i % 2) * P.l / 2) * k, pente: 0, demi: P.joint * k / 2, teinte: [t, t, t * 1.01] });
      }
      A.push({ bas: i * P.h * k, demiLit: P.joint * k / 2, onde: null, blocs: blocs });
    }
    return { assises: A, couleur: P.couleur, mortier: P.mortier, biseau: P.biseau * k, relief: P.relief,
      bosse: 0.08, grainRelief: 0.14, taches: 0.1, grain: 0.2, lits: 0, pores: 550, pore: [0.6, 1.8], px: P.px };
  }

  // Matériaux roche et parpaing, faits à la première structure texturée (aucun coût si l'interrupteur est coupé) :
  // couleur + normal map. Normal map plutôt que bump map : une seule lecture par pixel, et la pente est calculée une
  // fois ici (une bump map relit la hauteur trois fois par pixel et scintille au loin avec les mipmaps). Parpaing
  // reculé en profondeur comme les murs (contrat de _estMur). Textures libérées à la fermeture (_demonter) ; les
  // canvas dessinés restent pour la page (_appareils, 1 Mo) : seule la première ouverture paie le dessin.
  function _matsTextures() {
    const e = _e;
    if (e.mats.roche) return;
    const t0 = performance.now();
    const fab = function (nom, dessin, graine, recule) {
      const t = _texturesPeintes(nom, dessin, graine);
      const o = { map: t.couleur, normalMap: t.normale };
      if (recule) Object.assign(o, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      return new THREE.MeshLambertMaterial(o);
    };
    e.mats.roche = fab("roche", _rocheBrute, ROCHE.graine, false);
    e.mats.parpaing = fab("parpaing", function (alea) { return _appareil(_assisesParpaing(alea), alea); },
      PARPAING.graine, true);
    e.msTextures = performance.now() - t0;
  }

  // Matériau d'une zone texturée (🧱) : `remblais` (REMBLAIS) ou `eboulis` (effondrement, EBOULIS), un seul par type
  // pour toutes les tuiles et les trois rendus, fait à la première zone de ce type (aucun coût sans elle ni 🧱
  // coupé). Couleur + normal map comme la roche, jamais teinté par la légende ; libéré avec la vue (_demonter).
  function _matZone(cle) {
    const e = _e;
    if (e.mats[cle]) return e.mats[cle];
    const t0 = performance.now(), P = cle === "remblais" ? REMBLAIS : EBOULIS;
    const t = _texturesPeintes(cle, function (alea) { return _pierraille(P, alea); }, P.graine);
    e.mats[cle] = new THREE.MeshLambertMaterial({ map: t.couleur, normalMap: t.normale });
    e.msZones = (e.msZones || 0) + performance.now() - t0;
    return e.mats[cle];
  }

  // Couleur + normal map (CanvasTexture répétées, anisotropie ≤ 4, libérées avec la vue) d'une texture dessinée par
  // `dessin(alea)` → { couleur, normale } (canvas), une fois par page (_appareils ; durée de ce premier dessin dans
  // _appareilsMs, lue par le checkup).
  function _texturesPeintes(nom, dessin, graine) {
    const e = _e, aniso = Math.min(4, e.renderer.capabilities.getMaxAnisotropy());
    if (!_appareils[nom]) {
      const t0 = performance.now();
      let g = graine;
      const alea = function () { g = (g * 16807) % 2147483647; return g / 2147483647; };
      _appareils[nom] = dessin(alea);
      _appareilsMs[nom] = Math.round(performance.now() - t0);
    }
    const t = { couleur: new THREE.CanvasTexture(_appareils[nom].couleur),
      normale: new THREE.CanvasTexture(_appareils[nom].normale) };
    [t.couleur, t.normale].forEach(function (x) {
      x.wrapS = x.wrapT = THREE.RepeatWrapping;
      x.anisotropy = aniso;
      e.texStructures.push(x);
    });
    t.couleur.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Parois (matériau `paroi`, un seul pour les galeries, les tubes et les puits) : pierre de taille avec relief si
  // 🧱 est activé, moellons d'origine sinon. On remplace la carte du matériau, jamais la géométrie (uv en mètres,
  // _paroiY) : aucun matériau de plus par image, et une paroi déjà construite suit la bascule. Pierre dessinée à la
  // première paroi texturée (aucun coût en rendu structures, ni 🧱 coupé). ⚠️ `repeat` = un motif par PIERRE.m
  // mètres, sur la couleur ET le relief (three.js transforme chaque carte avec la sienne).
  function _paroiTexturee() {
    const e = _e, pierre = e.textures === true, mat = e.mats.paroi;
    if (e.paroiPierre === pierre) return;
    if (pierre) {
      if (!e.texPierre) {
        const t0 = performance.now();
        e.texPierre = _texturesPeintes("pierre", function (alea) { return _appareil(_assisesPierre(alea), alea); },
          PIERRE.graine);
        e.texPierre.couleur.repeat.set(1 / PIERRE.m, 1 / PIERRE.m);
        e.texPierre.normale.repeat.set(1 / PIERRE.m, 1 / PIERRE.m);
        e.msParoi = performance.now() - t0;
      }
      mat.map = e.texPierre.couleur;
      mat.normalMap = e.texPierre.normale;
    } else {
      mat.map = e.moellons;
      mat.normalMap = null;
    }
    mat.needsUpdate = true;
    e.paroiPierre = pierre;
  }

  // Hachures à 45° en coordonnées monde (une bande sombre tous les HACHURE_PAS m) sur un matériau Lambert :
  // la couleur de la zone reste celle du canon, l'éclairage et le brouillard de la lampe restent ceux de three.js.
  function _hachurer(mat) {
    const vary = "#include <common>\nvarying vec3 vKtaMonde;";
    const bande = "if (fract((vKtaMonde.x + vKtaMonde.y + vKtaMonde.z) / " + HACHURE_PAS.toFixed(2) +
      ") < 0.4) diffuseColor.rgb *= 0.3;";
    mat.onBeforeCompile = function (sh) {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", vary)
        .replace("#include <begin_vertex>",
          "#include <begin_vertex>\nvKtaMonde = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", vary)
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + bande);
    };
    return mat;
  }

  function _materiaux() {
    const grain = _e.grain = _grainCalcaire();
    // Sol et plafond des galeries : même motif, posé en coordonnées monde (pièces superposées sans couture).
    const monde = _e.grainMonde = grain.clone();
    monde.repeat.set(1, 1);
    monde.offset.set(0, 0);
    monde.needsUpdate = true;
    _e.moellons = _moellons();
    // Roche, parpaing et pierre des parois (🧱) : faits à la demande (_matsTextures, _paroiTexturee) ; refaits avec
    // la scène (reprise du contexte). La paroi naît en moellons.
    _e.textures = _texturesVoulues();
    _e.texStructures = [];
    _e.texPierre = null;
    _e.paroiPierre = false;
    const m = {
      opaque: new THREE.MeshLambertMaterial({ vertexColors: true }),
      murs: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1,
        polygonOffsetUnits: 1 }),
      lumineux: new THREE.MeshBasicMaterial({ vertexColors: true }),
      // Rubans des tracés et liserés au sol : troués par la bouche d'un passage comme le sol (gabarit ci-dessous),
      // jamais suspendus au-dessus du vide. L'itinéraire n'y est pas : il mène au passage, ses marqueurs ont un mât.
      rubans: new THREE.MeshLambertMaterial({ vertexColors: true }),
      // Itinéraire et ronds d'intersection : couleurs exactes du jeton et de la légende (sans compression de tons).
      iti: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      transp: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45,
        depthWrite: false, side: THREE.DoubleSide }),
      hachSol: _hachurer(new THREE.MeshLambertMaterial({ vertexColors: true })),
      hachRideau: _hachurer(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55,
        depthWrite: false, side: THREE.DoubleSide })),
      sol: new THREE.MeshLambertMaterial({ map: grain }),
      plafond: new THREE.MeshLambertMaterial({ map: grain, side: THREE.BackSide }),
      avatar: new THREE.MeshBasicMaterial({ color: 0xf4c542 }),
      solGalerie: new THREE.MeshLambertMaterial({ map: monde }),
      plafondGalerie: new THREE.MeshLambertMaterial({ map: monde }),
      paroi: new THREE.MeshLambertMaterial({ map: _e.moellons, side: THREE.DoubleSide }),
      // 🩸 Eau découpée en plusieurs pièces qui se recouvrent : sans écriture de profondeur stricte, chaque
      // recouvrement serait mélangé deux fois (taches plus sombres).
      eauGalerie: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45,
        depthWrite: true, depthFunc: THREE.LessDepth, side: THREE.DoubleSide })
    };
    // Bouches des passages (_construireVolume) : dessinées avant tout (renderOrder −1), sans couleur ni profondeur,
    // elles marquent le gabarit (1 = sol, 2 = plafond) ; sol et plafond ne se dessinent pas là : on voit dans le puits.
    // ⚠️ Le contexte est créé avec `stencil: true` (ouvrir) ; le gabarit est effacé à chaque image (three.js).
    const bouche = function (ref) {
      return new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide,
        stencilWrite: true, stencilRef: ref, stencilFunc: THREE.AlwaysStencilFunc,
        stencilZPass: THREE.ReplaceStencilOp });
    };
    m.boucheSol = bouche(1);
    m.bouchePlafond = bouche(2);
    [[m.sol, 1], [m.solGalerie, 1], [m.rubans, 1], [m.plafond, 2], [m.plafondGalerie, 2]].forEach(function (x) {
      x[0].stencilWrite = true;   // test du gabarit (opérations « garder » : rien n'y est écrit)
      x[0].stencilRef = x[1];
      x[0].stencilFunc = THREE.NotEqualStencilFunc;
    });
    return m;
  }

  function _monterScene() {
    const e = _e;
    e.panneaux = new Set();
    e.scene = new THREE.Scene();
    e.scene.background = new THREE.Color(0x000000);
    e.scene.fog = new THREE.Fog(0x000000, e.distance * 0.45, e.distance);
    e.camera = new THREE.PerspectiveCamera(70, 1, 0.05, e.distance + 5);
    e.camera.rotation.order = "YXZ";
    e.scene.add(e.camera);
    e.mats = _materiaux();
    e.texCiel = null;   // 🩸 refaite avec la scène (reprise du contexte) : jamais celle de l'ancien contexte
    // Sol et plafond : un carré qui suit la position, plus grand que la distance de vue.
    const plan = new THREE.PlaneGeometry(e.distance * 2.4, e.distance * 2.4, 8, 8);
    plan.rotateX(-Math.PI / 2);
    e.sol = new THREE.Mesh(plan, e.mats.sol);
    e.plafond = new THREE.Mesh(plan, e.mats.plafond);
    e.plafond.position.y = e.hauteur;
    e.scene.add(e.sol, e.plafond);
    // Tête (porte la lampe) et silhouette visible en vue plongeante.
    e.tete = new THREE.Object3D();
    e.tete.rotation.order = "YXZ";
    e.scene.add(e.tete);
    // Lampe frontale : portée = distance de vue (au-delà, le brouillard est noir de toute façon), décroissance douce.
    e.lampe = new THREE.SpotLight(0xfff1d6, 24, e.distance, 0.62, 0.55, 1.2);
    e.lampe.position.set(0, 0.05, 0);
    e.lampe.target.position.set(0, -0.3, -1);
    e.tete.add(e.lampe, e.lampe.target);
    e.halo = new THREE.PointLight(0xfff1d6, 1.6, 4.5, 2);
    e.tete.add(e.halo);
    e.ambiance = new THREE.AmbientLight(0xffffff, 0.04);
    e.scene.add(e.ambiance);
    // Membres, repères et itinéraires d'une extension (_majEquipe) ; géométries partagées refaites avec la scène.
    e.equipe = new THREE.Group();
    e.scene.add(e.equipe);
    e.equipeSig = null;
    e.matsEquipe = new Map();
    e.geoMembre = e.geoHalo = null;
    const cone = new THREE.ConeGeometry(0.35, 0.9, 12);
    cone.rotateX(-Math.PI / 2);
    e.avatar = new THREE.Mesh(cone, e.mats.avatar);
    e.avatar.visible = false;
    e.scene.add(e.avatar);
    // Reprise du contexte : la greffe retrouve un groupe neuf dans la nouvelle scène (_reindexer l'appelle ensuite).
    if (e.greffe) { e.greffe.groupe = new THREE.Group(); e.scene.add(e.greffe.groupe); e.greffe.raison = "reprise"; }
  }

  // ── Membres, repères et itinéraires d'une extension (KtaPresences, lecture seule) ─────────────────────
  // ⚠️ contrat (frontière) : la vue LIT ce que la prise neutre a posé sur la carte (afficherPresences,
  // afficherReperes, afficherItineraires → js/ktaPresences.js) ; elle ne demande rien et n'envoie rien. Sans
  // extension, ces listes sont vides : rien n'est dessiné. Masquages de la carte respectés (personne, itinéraire).
  // Au niveau affiché seulement (un niveau inconnu se montre partout). Refait quand KtaPresences.version(), le
  // niveau ou la hauteur changent ; sprites dans _e.panneaux (même fondu et même échelle que les POI).
  function _hauteurSilhouette() { return Math.min(MEMBRE.haut, _e.hauteur * 0.85); }

  function _matCouleur(hex) {
    const e = _e, k = String(hex);
    let m = e.matsEquipe.get(k);
    if (m) return m;
    const c = new THREE.Color();
    try { c.setStyle(k); } catch (err) { c.set(0x8cb4ff); }
    m = new THREE.MeshBasicMaterial({ color: c });
    e.matsEquipe.set(k, m);
    return m;
  }

  // Silhouette d'un membre : corps (cylindre) et tête (sphère) à sa couleur, non éclairés (visibles hors faisceau).
  function _silhouette(x, z, couleur) {
    const e = _e, h = _hauteurSilhouette();
    if (!e.geoMembre) {
      e.geoMembre = { corps: new THREE.CylinderGeometry(MEMBRE.rayon * 0.8, MEMBRE.rayon, 1, 12),
        tete: new THREE.SphereGeometry(MEMBRE.tete, 12, 8) };
    }
    const g = new THREE.Group(), mat = _matCouleur(couleur);
    const corps = new THREE.Mesh(e.geoMembre.corps, mat), tete = new THREE.Mesh(e.geoMembre.tete, mat);
    const hc = h - 2 * MEMBRE.tete - 0.04;
    corps.scale.y = hc;
    corps.position.y = hc / 2;
    tete.position.y = h - MEMBRE.tete;
    corps.userData.partage = tete.userData.partage = true;
    g.add(corps, tete);
    g.position.set(x, 0, z);
    g.userData.famille = "membre";
    return g;
  }

  function _viderEquipe() {
    const e = _e;
    if (!e.equipe) return;
    e.equipe.children.slice().forEach(function (o) {
      o.traverse(function (q) {
        if (q.geometry && !q.isSprite && !q.userData.partage) q.geometry.dispose();
        if (q.isSprite && q.material) { if (q.material.map) q.material.map.dispose(); q.material.dispose(); }
        if (q.isSprite) e.panneaux.delete(q);
      });
      e.equipe.remove(o);
    });
  }

  function _majEquipe() {
    const e = _e, P = window.KtaPresences;
    if (!e.equipe || !P || typeof P.version !== "function") return;
    const sig = P.version() + "|" + e.niveau + "|" + e.hauteur;
    if (sig === e.equipeSig) return;
    e.equipeSig = sig;
    _viderEquipe();
    const g = e.equipe, sc = e.sc, j = _jetonsSombres(), nb = { membres: 0, membres3d: 0, reperes: 0, itineraires: 0 };
    const auNiveau = function (n) { return e.niveau === null || !Number.isInteger(n) || n === e.niveau; };
    const liste = function (f) { try { return typeof f === "function" ? f() || [] : []; } catch (err) { return []; } };
    liste(P.liste).forEach(function (p) {
      if (typeof P.personneMasquee === "function" && P.personneMasquee(p.id)) return;
      if (!auNiveau(p.niveau) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const couleur = p.couleur || (typeof P.couleurDe === "function" ? P.couleurDe(p.id) : j.interaction);
      const x = p.x / sc, z = p.y / sc;
      // Place d'un membre qui se déplace dans SA vue 3D : marquée « 3D » (jamais confondue avec son tracker).
      const en3d = p.source === "vue3d";
      const s = _silhouette(x, z, couleur);
      s.userData.vue3d = en3d;
      g.add(s);
      g.add(_panneau({ nom: p.pseudo + (en3d ? " · " + _t("presence.vue3d.marque") : "") }, [x, z],
        { bord: couleur, sansIcone: true, genre: "membre", y: Math.min(_hauteurSilhouette() + 0.35, e.hauteur - 0.15) }));
      nb.membres++;
      if (en3d) nb.membres3d++;
    });
    // Repères : pastille du calque (symbole et titre), liseré à la teinte de la charte qu'il porte.
    liste(P.calques).forEach(function (nom) {
      liste(function () { return P.reperes(nom); }).forEach(function (r) {
        if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) return;
        if (e.niveau !== null && r.niveaux && r.niveaux.length && r.niveaux.indexOf(e.niveau) < 0) return;
        const texte = ((r.symbole || "•") + " " + (r.titre || "")).trim() + (r.nombre ? " ×" + r.nombre : "");
        g.add(_panneau({ nom: texte }, [r.x / sc, r.y / sc], { bord: j[r.teinte] || j.neutre, sansIcone: true,
          genre: "repere" }));
        nb.reperes++;
      });
    });
    // Itinéraires publiés : tirets jaunes (accent) au sol, comme les pointillés de la carte, sur le niveau affiché.
    const lot = new Lot(), jaune = new THREE.Color();
    try { jaune.setStyle(j.accent); } catch (err) { jaune.set(0xf4c542); }
    liste(P.itineraires).forEach(function (it) {
      if (typeof P.itineraireMasque === "function" && P.itineraireMasque(it.id)) return;
      let n = 0;
      for (let i = 0; i + 1 < it.points.length; i++) {
        const a = it.points[i], b = it.points[i + 1];
        if (!auNiveau(a[2]) || !auNiveau(b[2])) continue;
        n += _tirets(lot, a[0], a[1], b[0], b[1], jaune);
      }
      if (n) nb.itineraires++;
    });
    const geo = lot.geometrie();
    if (geo) {
      const me = new THREE.Mesh(geo, e.mats.lumineux);
      me.renderOrder = 1;
      me.userData.famille = "itineraireEquipe";
      g.add(me);
    }
    e.nbEquipe = nb;
    e.sale = true;
  }

  // Tirets de 1 m tous les 1,6 m d'un segment (px), 0,35 m de large, à 6 cm du sol → nombre de tirets.
  function _tirets(lot, ax, ay, bx, by, col) {
    const sc = _e.sc, l = Math.hypot(bx - ax, by - ay) / sc;
    let n = 0;
    for (let d = 0; d < l; d += 1.6) {
      const f = Math.min(l, d + 1), t0 = d / l, t1 = f / l;
      if (f - d < 0.05) break;
      const a = { x: ax + (bx - ax) * t0, y: ay + (by - ay) * t0 }, b = { x: ax + (bx - ax) * t1, y: ay + (by - ay) * t1 };
      _ruban(lot, a, b, sc, 0.35, 0.06, col);
      n++;
    }
    return n;
  }

  // Compteurs tenus par la construction des tuiles (checkup), remis à zéro avec elles.
  function _razCompteurs() {
    const e = _e;
    e.poiMasques = 0; e.zonesDecoupees = {}; e.rideaux = []; e.facesRemblais = 0; e.facesEboulis = 0; e.rubans = {};
    e.liseres = {}; e.zonesTube = 0; e.poiTube = 0; e.halos = 0; e.itiTirets = 0;
  }

  // Tuiles refaites sur place (hauteur, affichage) : même index, position, cap, niveau et rendu gardés.
  function _refaireTuiles() {
    const e = _e;
    e.tuiles.forEach(_libererTuile);
    _razCompteurs();
    _gererTuiles(true);
    (e.volPassages || []).forEach(_libererVolume);
    _gererVolumes();
    e.sale = true;
  }

  function _reindexer() {
    const e = _e;
    e.tuiles.forEach(_libererTuile);
    const t0 = performance.now();
    e.niveau = _niveauCourant();
    const d = _collecter(e.niveau);
    e.rendu = _renduVoulu();
    e.galerie = e.mixte = null;
    if (e.rendu === "galerie") e.galerie = d.galerie = window.KtaGalerie.modele(e.niveau);
    if (e.rendu === "mixte") e.mixte = d.mixte = window.KtaGalerie.modele(e.niveau, true);
    const m = e.galerie || e.mixte;
    e.compte = { structures: d.structures.length, zones: d.zones.length, roads: d.roads.length,
      points: d.points.length, pieces: m ? m.pieces.length : 0, aretes: m ? m.aretes.length : 0,
      dalles: m ? m.dalles : 0, coudes: m ? m.coudes : 0, bouts: m ? m.bouts : 0,
      chambres: m ? m.chambres : 0, ouverts: m ? m.ouverts : 0,
      msGalerie: m ? Math.round(m.msConstruction) : 0 };
    _razCompteurs();
    if (e.galerie) e.volumes = null; else _grilleVolumes(d.structures);
    e.passages = _passages(e.niveau, d.jonctions);
    e.passageSig = null;
    (e.volPassages || []).forEach(_libererVolume);
    e.volPassages = _volumesDuNiveau(d);
    e.tuiles = _indexer(d, e.sc, e.tuilesActives ? TUILE : 0);
    e.msIndex = performance.now() - t0;
    _appliquerRendu();
    _gererTuiles(true);
    _majMarqueursIti();
    _majRonds();
    _gererVolumes();
    _sceneGreffe();
  }

  // ── Volumes des passages entre niveaux (POI jonction, puits de surface, tracé jonction) ─────────────────
  // ⚠️ contrat (décision produit) : un POI jonction ou un puits de surface montre son volume là où est son panneau
  // (raccord validé du niveau, sinon le point), selon son moyen (KtaPoiJonction.moyen) : escalier (jes, eso) = cage
  // de 2,5 × 1,5 m à marches ; échelons (jpe, peo) = puits carré de 1,2 m (paroi des galeries), échelons tous les 0,3 m ;
  // corde (jps) = puits nu. Ouvert dans le SOL vers un niveau lié au-dessous, dans le PLAFOND vers un niveau lié
  // au-dessus (le volume dépasse la hauteur et se perd dans le noir), les deux entre trois niveaux. Puits de surface
  // (peo, eso au plus haut de leurs niveaux ; pa partout) : plafond seulement, disque de ciel au sommet (peo, eso) ou
  // tube de 0,8 m à grille (pa, sans moyen : ni 🪜 ni passage). Cadre doré au sol d'un passage, panneau au-dessus.
  // Un tracé `jonction` devient une rampe à la couleur du canon : du sol au plafond vers un niveau au-dessus, du sol
  // vers le bas, dans une tranchée ouverte, vers un niveau au-dessous.
  // Construits à portée seulement (_gererVolumes, la règle des tuiles) : rien hors de la distance de vue. Aucune
  // collision : le pas reste la règle du tracker. Les bouches trouent sol et plafond par le gabarit (_materiaux).

  function _volumesDuNiveau(d) {
    const e = _e, J = window.KtaPoiJonction, N = e.niveau, out = [];
    if (!J) return out;
    d.points.forEach(function (p) {
      const src = p._v3dJonction || p, tag = _premierTag(src);
      if (!J.porteNiveaux(tag)) return;
      const moyen = J.moyen(tag);
      const autres = N === null || !J.estJonction(src) ? []
        : J.niveaux(src).filter(function (n) { return n !== N; });
      const dessus = autres.some(function (n) { return _auDessus(n, N); });
      const dessous = autres.some(function (n) { return !_auDessus(n, N); });
      const surface = J.TAGS_SURFACE_NIVEAUX.indexOf(tag) >= 0 && !dessus;
      const v = { genre: "poi", tag: tag, moyen: moyen, x: p.x, y: p.y,
        forme: !moyen ? "aeration" : moyen === "escalier" ? "escalier" : "puits",
        sol: !!moyen && dessous, plafond: !moyen || dessus || surface, ciel: !!moyen && surface, grille: !moyen,
        echelons: moyen === "echelons", passage: !!moyen && autres.length > 0 };
      if (!v.sol && !v.plafond) return;   // passage sans autre niveau (plan à un niveau) : rien à ouvrir
      const dim = v.forme === "escalier" ? VOLUME.escalier
        : v.forme === "puits" ? [VOLUME.puits, VOLUME.puits] : [VOLUME.aeration, VOLUME.aeration];
      v.a = dim[0] / 2; v.b = dim[1] / 2;
      v.dir = _dirGalerie(p.x, p.y);
      v.cx = p.x / e.sc; v.cz = p.y / e.sc;
      v.r = Math.hypot(v.a, v.b) + VOLUME.marge + VOLUME.cadre;
      out.push(v);
    });
    if (N === null || !_typeTraceMontre("jonction")) return out;
    d.jonctions.forEach(function (r) {
      if (!Number.isInteger(r.fromLevel) || !Number.isInteger(r.toLevel) || r.fromLevel === r.toLevel) return;
      if (r.fromLevel !== N && r.toLevel !== N) return;
      let pts = r.points.filter(function (q) { return q && Number.isFinite(q.x) && Number.isFinite(q.y); });
      if (pts.length < 2) return;
      if (r.fromLevel !== N) pts = pts.slice().reverse();   // la rampe part toujours de notre bout
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      pts.forEach(function (q) {
        x0 = Math.min(x0, q.x / e.sc); x1 = Math.max(x1, q.x / e.sc);
        z0 = Math.min(z0, q.y / e.sc); z1 = Math.max(z1, q.y / e.sc);
      });
      const monte = _auDessus(r.fromLevel === N ? r.toLevel : r.fromLevel, N);
      out.push({ genre: "rampe", pts: pts, monte: monte, sol: !monte, plafond: false, x: pts[0].x, y: pts[0].y,
        cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 + VOLUME.rampe });
    });
    return out;
  }

  // Angle (rad, plan x / z) de l'axe de galerie le plus proche (10 m), 0 sans galerie : la cage d'escalier s'aligne.
  function _dirGalerie(x, y) {
    const e = _e, niv = e.niveau === null ? undefined : e.niveau;
    const m = e.galerie || e.mixte || (window.KtaGalerie ? window.KtaGalerie.modele(niv) : null);
    const pp = m ? m.plusProche(x, y, 10 * e.sc) : null;
    if (!pp) return 0;
    const r = m.aretes[pp.arete];
    return Math.atan2(r.by - r.ay, r.bx - r.ax);
  }

  // Volumes à portée construits, lointains libérés : la règle des tuiles (_gererTuiles).
  function _gererVolumes() {
    const e = _e;
    if (!e.volPassages || !e.volPassages.length) return;
    const px = e.pos.x / e.sc, pz = e.pos.y / e.sc;
    const rVue = e.vue === "plongee" ? e.distance * 1.4 : e.distance, rGarde = rVue + 2 * TUILE;
    for (let i = 0; i < e.volPassages.length; i++) {
      const v = e.volPassages[i], d = Math.max(0, Math.hypot(v.cx - px, v.cz - pz) - v.r);
      if (d <= rVue) { if (!v.obj) _construireVolume(v); }
      else if (d > rGarde && v.obj) _libererVolume(v);
    }
  }

  function _libererVolume(v) {
    const e = _e;
    if (!v.obj) return;
    // 🩸 Après une perte du contexte, la scène a été remontée : un objet de l'ancienne n'est jamais libéré
    // (dispose() effacerait sur le nouveau contexte des objets qui n'en sont pas).
    if (v.obj.parent === e.scene) {
      v.obj.traverse(function (o) {
        if (o.geometry && !o.isSprite) o.geometry.dispose();
        if (o.isSprite && o.material) o.material.dispose();   // texture du ciel : celle de la vue (_e.texCiel)
      });
      e.scene.remove(v.obj);
      e.sale = true;
    }
    v.obj = null;
  }

  function _couleurFixe(hex) {
    const k = "fixe|" + hex;
    let c = _e.couleurs.get(k);
    if (!c) { c = new THREE.Color(hex); _e.couleurs.set(k, c); }
    return c;
  }

  // Repère du volume (m) : s le long de la galerie (v.dir), t en travers, centre (v.cx, v.cz).
  function _repere(v) {
    const ux = Math.cos(v.dir || 0), uz = Math.sin(v.dir || 0);
    return function (s, t) { return [v.cx + ux * s - uz * t, v.cz + uz * s + ux * t]; };
  }

  function _sensPositif(ring) {
    let aire = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) aire += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    return aire < 0 ? ring.slice().reverse() : ring;
  }

  // Pavé (repère du volume) de s0..s1 × t0..t1, de y0 à y1, dessus et dessous compris (échelons vus d'en bas).
  function _pave(lot, Q, s0, s1, t0, t1, y0, y1, col) {
    const ring = _sensPositif([Q(s0, t0), Q(s1, t0), Q(s1, t1), Q(s0, t1)]);
    _prisme(lot, ring, y0, y1, col, true);
    lot.quad([ring[0][0], y0, ring[0][1]], [ring[1][0], y0, ring[1][1]], [ring[2][0], y0, ring[2][1]],
      [ring[3][0], y0, ring[3][1]], [0, -1, 0], col);
  }

  // Paroi de y0 à y1 (m), matériau `paroi` (pierre de taille ou moellons, _paroiTexturee). ⚠️ contrat :
  // coordonnées de texture en MÈTRES, u le long de la paroi (projection sur sa direction : deux tronçons alignés se
  // suivent sans saut), v = hauteur depuis le sol (une assise part toujours de y = 0) ; la taille du motif est la
  // `repeat` de la texture, jamais la géométrie : aucun étirement quand la hauteur change, et la bascule 🧱 ne
  // refait rien ici.
  function _paroiY(lot, p, q, y0, y1) {
    const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
    if (l < 1e-6 || y1 <= y0) return;
    const u0 = (p[0] * dx + p[1] * dz) / l, u1 = u0 + l;
    lot.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], [-dz / l, 0, dx / l], BLANC,
      [u0, y0, u1, y0, u1, y1, u0, y1]);
  }

  function _quadPlat(lot, ring, y, col) {
    lot.quad([ring[0][0], y, ring[0][1]], [ring[1][0], y, ring[1][1]], [ring[2][0], y, ring[2][1]],
      [ring[3][0], y, ring[3][1]], [0, 1, 0], col || BLANC);
  }

  // Disque de ciel (sommet d'un puits de surface ouvert) : dégradé clair, non éclairé, une texture pour la vue.
  const COULEURS_CIEL = ["#fdfbf3", "#d5e2ee"];   // couleurs de la scène (jour au bout du puits), pas de l'UI
  function _texCiel() {
    const n = 64, cv = document.createElement("canvas");
    cv.width = n; cv.height = n;
    const ctx = cv.getContext("2d"), g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, COULEURS_CIEL[0]);
    g.addColorStop(0.75, COULEURS_CIEL[1]);
    g.addColorStop(1, "rgba(213, 226, 238, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function _construireVolume(v) {
    const e = _e, lots = { parois: new Lot(), opaque: new Lot(), lumineux: new Lot(), sol: new Lot(),
      plafond: new Lot() };
    const g = new THREE.Group();
    g.userData.famille = "passage";
    if (v.genre === "rampe") _rampe(v, lots); else _puits(v, lots, g);
    const ajouter = function (lot, mat, ordre, famille) {
      const geo = lot.geometrie();
      if (!geo) return;
      const me = new THREE.Mesh(geo, mat);
      me.renderOrder = ordre;
      me.matrixAutoUpdate = false;
      me.userData.famille = famille;
      g.add(me);
    };
    ajouter(lots.sol, e.mats.boucheSol, -1, "boucheSol");
    ajouter(lots.plafond, e.mats.bouchePlafond, -1, "bouchePlafond");
    if (lots.parois.p.length) _paroiTexturee();
    ajouter(lots.parois, e.mats.paroi, 0, "paroiPassage");
    ajouter(lots.opaque, e.mats.opaque, 0, "passage");
    ajouter(lots.lumineux, e.mats.lumineux, 1, "cadre");
    let y0 = Infinity, y1 = -Infinity;
    [lots.parois, lots.opaque].forEach(function (l) {
      for (let i = 1; i < l.p.length; i += 3) { y0 = Math.min(y0, l.p[i]); y1 = Math.max(y1, l.p[i]); }
    });
    const n = function (l) { return l.p.length / 9; };
    v.stats = { triangles: n(lots.parois) + n(lots.opaque) + n(lots.lumineux), bouchesSol: n(lots.sol),
      bouchesPlafond: n(lots.plafond), cadre: n(lots.lumineux) > 0, yMin: Number.isFinite(y0) ? +y0.toFixed(2) : null,
      yMax: Number.isFinite(y1) ? +y1.toFixed(2) : null,
      cielVu: g.children.some(function (o) { return o.userData.famille === "ciel"; }) };
    e.scene.add(g);
    v.obj = g;
    e.sale = true;
  }

  function _puits(v, lots, g) {
    const e = _e, h = e.hauteur, L = VOLUME.long, Q = _repere(v), a = v.a, b = v.b;
    const ring = _sensPositif([Q(-a, -b), Q(a, -b), Q(a, b), Q(-a, b)]);
    const murs = function (y0, y1) {
      for (let k = 0; k < 4; k++) _paroiY(lots.parois, ring[k], ring[(k + 1) % 4], y0, y1);
    };
    if (v.sol) { murs(-L, 0); _quadPlat(lots.sol, ring, 0); }
    if (v.plafond) { murs(h, h + L); _quadPlat(lots.plafond, ring, h); }
    if (v.forme === "escalier") _marches(v, lots.opaque, Q, _couleurFixe(COULEUR_CALCAIRE));
    if (v.echelons) _echellePuits(v, lots.opaque, Q, _couleurFixe(COULEUR_FER));
    if (v.grille) {
      // Grille au-dessus du plafond : barreaux croisés tous les 15 cm.
      const fer = _couleurFixe(COULEUR_FER), y = h + 0.25;
      for (let k = -2; k <= 2; k++) {
        const c = k * 0.15;
        _pave(lots.opaque, Q, -a, a, c - 0.015, c + 0.015, y, y + 0.03, fer);
        _pave(lots.opaque, Q, c - 0.015, c + 0.015, -b, b, y + 0.03, y + 0.06, fer);
      }
    }
    if (v.ciel) {
      if (!e.texCiel) e.texCiel = _texCiel();
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: e.texCiel, fog: false, depthWrite: false,
        toneMapped: false, transparent: true }));
      const c = Q(0, 0), r = 2 * Math.min(a, b) * 0.95;
      sp.position.set(c[0], h + L - 0.05, c[1]);
      sp.scale.set(r, r, 1);
      sp.renderOrder = 2;
      sp.userData.famille = "ciel";
      g.add(sp);
    }
    if (v.passage) {
      // Cadre doré au sol autour de la bouche (accent sombre, non éclairé : lisible hors du faisceau).
      const or = _couleurFixe(_jetonsSombres().accent), y = 0.025;
      const a1 = a + VOLUME.marge, b1 = b + VOLUME.marge, a2 = a1 + VOLUME.cadre, b2 = b1 + VOLUME.cadre;
      [[-a2, a2, -b2, -b1], [-a2, a2, b1, b2], [-a2, -a1, -b1, b1], [a1, a2, -b1, b1]].forEach(function (r) {
        _quadPlat(lots.lumineux, _sensPositif([Q(r[0], r[2]), Q(r[1], r[2]), Q(r[1], r[3]), Q(r[0], r[3])]), y, or);
      });
    }
  }

  // Marches d'une cage d'escalier, le long de la galerie : vers le haut (du sol, à travers le plafond) et / ou vers le
  // bas (du sol dans le puits) ; entre trois niveaux, une volée par moitié de largeur.
  function _marches(v, lot, Q, col) {
    const h = _e.hauteur, n = VOLUME.marches, a = v.a, b = v.b, pas = 2 * a / n, haut = (h + 0.4) / n;
    const monte = v.plafond && !v.grille, deux = monte && v.sol;
    for (let k = 0; k < n; k++) {
      const s0 = -a + k * pas, s1 = s0 + pas;
      if (monte) _pave(lot, Q, s0, s1, deux ? 0 : -b, b, 0, (k + 1) * haut, col);
      if (v.sol) _pave(lot, Q, s0, s1, -b, deux ? 0 : b, -VOLUME.long, -(k + 1) * haut, col);
    }
  }

  // Échelle scellée contre une paroi : échelons tous les VOLUME.echelon m et deux montants ; vers le bas, les montants
  // dépassent du sol d'un mètre (la sortie).
  function _echellePuits(v, lot, Q, col) {
    const h = _e.hauteur, L = VOLUME.long, tw = -v.b + 0.12;
    const yA = v.sol ? -L : 0, yB = v.plafond ? h + L : 1, yR = v.plafond ? h + L : 0;
    for (let y = yA + VOLUME.echelon / 2; y <= yR; y += VOLUME.echelon) {
      _pave(lot, Q, -0.2, 0.2, tw - 0.02, tw + 0.02, y - 0.02, y + 0.02, col);
    }
    _pave(lot, Q, -0.25, -0.2, tw - 0.03, tw + 0.03, yA, yB, col);
    _pave(lot, Q, 0.2, 0.25, tw - 0.03, tw + 0.03, yA, yB, col);
  }

  // Rampe d'un tracé jonction : ruban incliné, couleur du canon. Vers un niveau au-dessus, du sol (notre bout) au
  // plafond (l'autre bout) ; au-dessous, du sol à −hauteur dans une tranchée (bouche au sol, parois des galeries).
  function _rampe(v, lots) {
    const e = _e, sc = e.sc, h = e.hauteur, w = VOLUME.rampe / 2, col = _couleur("traces", "jonction", "color");
    const pts = v.pts.map(function (q) { return [q.x / sc, q.y / sc]; }), cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const tot = cum[cum.length - 1] || 1, H = v.monte ? h - 0.05 : -h, wt = w + VOLUME.tranchee;
    let der = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const A = pts[i], B = pts[i + 1], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const nx = -dz / l, nz = dx / l, ya = 0.03 + H * cum[i] / tot, yb = 0.03 + H * cum[i + 1] / tot;
      lots.opaque.quad([A[0] - nx * w, ya, A[1] - nz * w], [B[0] - nx * w, yb, B[1] - nz * w],
        [B[0] + nx * w, yb, B[1] + nz * w], [A[0] + nx * w, ya, A[1] + nz * w], [0, 1, 0], col);
      if (!v.monte) {
        const g0 = [A[0] - nx * wt, A[1] - nz * wt], g1 = [B[0] - nx * wt, B[1] - nz * wt];
        const d0 = [A[0] + nx * wt, A[1] + nz * wt], d1 = [B[0] + nx * wt, B[1] + nz * wt];
        _quadPlat(lots.sol, [g0, g1, d1, d0], 0);
        _paroiY(lots.parois, g0, g1, -h - 0.1, 0);
        _paroiY(lots.parois, d0, d1, -h - 0.1, 0);
        der = [g1, d1];
      }
    }
    if (der) _paroiY(lots.parois, der[0], der[1], -h - 0.1, 0);   // fond de la tranchée
  }

  // ── Geste d'un passage : fondu noir, descente / montée, bandeau du niveau ────────────────────────────────
  // ⚠️ contrat (décision produit) : un changement de niveau se fait derrière un fondu noir (GESTE.fondu ms, voile
  // aux jetons sombres, _majFondu) ; la scène du niveau d'arrivée est construite pendant le noir (`bascule`).
  // Passage 🪜 ou fiche : la caméra s'enfonce (ou monte) dans le volume pendant la première moitié de GESTE.ms, puis
  // arrive du plafond (ou du sol) du niveau d'arrivée ; mouvement vertical lent, sans rotation, tenu par `dt` dans la
  // boucle d'image (rendu continu pendant le geste seulement). Niveau du tracker changé en suivi : le fondu seul.
  // Puis le bandeau « Niveau n » GESTE.bandeau ms. L'appareil demande moins de mouvement : fondu seul.
  function _mouvementReduit() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (err) { return false; }
  }

  function _lisse(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

  // sens : 1 monte, −1 descend, 0 fondu seul ; bascule() : appelée au noir.
  function _lancerGeste(sens, bascule) {
    const e = _e, s = _mouvementReduit() ? 0 : sens;
    const bas = e.oeil + GESTE.auDela, haut = e.hauteur - e.oeil + GESTE.auDela;
    e.geste = { t: 0, sens: s, d1: s > 0 ? haut : bas, d2: s > 0 ? bas : haut, bascule: bascule, fait: false };
    e.sale = true;
  }

  function _majGeste(dt) {
    const e = _e, g = e.geste, F = GESTE.fondu, T = g.sens ? GESTE.ms : 2 * F, M = T / 2;
    g.t += dt * 1000;
    const t = Math.min(g.t, T);
    let op;
    if (t < M) {
      e.dy = g.sens * g.d1 * _lisse(t / M);
      op = (t - (M - F)) / F;
    } else {
      if (!g.fait) {
        g.fait = true;
        try { g.bascule(); } catch (err) { console.warn("[Vue3D] bascule de niveau :", err && err.message); }
        if (!_e) return;
      }
      e.dy = -g.sens * g.d2 * (1 - _lisse((t - M) / M));
      op = 1 - (t - M) / F;
    }
    _majFondu(Math.max(0, Math.min(1, op)));
    e.sale = true;
    if (g.t >= T) { e.geste = null; e.dy = 0; _majFondu(0); }
  }

  // Voile noir (fond des jetons sombres, quel que soit le thème) au-dessus de la scène, sous les boutons.
  function _majFondu(op) {
    const e = _e;
    e.fonduOp = op;
    if (!e.fondu) {
      if (op <= 0) return;
      const f = document.createElement("div");
      f.className = "kta-v3d-fondu";
      f.setAttribute("aria-hidden", "true");
      f.style.setProperty("--kta-v3d-fondu-fond", _jetonsSombres().fond);
      e.ov.insertBefore(f, e.cv.nextSibling);
      e.fondu = f;
    }
    e.fondu.hidden = op <= 0;
    e.fondu.style.opacity = String(op);
  }

  function _annoncerNiveau() {
    const e = _e;
    if (!e || e.niveau === null || !e.ov) return;
    if (!e.bandeauNiveau) {
      const b = document.createElement("div");
      b.className = "kta-v3d-bandeau-niveau";
      b.setAttribute("role", "status");
      b.setAttribute("aria-live", "polite");
      e.ov.appendChild(b);
      e.bandeauNiveau = b;
    }
    e.bandeauNiveau.textContent = _t("vue3d.niveauBandeau", { n: _fmtNiveau(e.niveau) });
    e.bandeauNiveau.hidden = false;
    e.bandeauNiveauFin = performance.now() + GESTE.bandeau;
  }

  function _majBandeauNiveau(ts) {
    const e = _e, b = e.bandeauNiveau;
    if (b && !b.hidden && ts >= e.bandeauNiveauFin) b.hidden = true;
  }

  // ── Rendu mixte / structures / galerie (interrupteur à trois états, retenu par plan) ─────────────────────
  // ⚠️ contrat (décision produit) : MIXTE par défaut, sans regarder ce que le niveau contient (un niveau sans
  // structure y est tout en tubes, un niveau sans tracé tout en structures) ; choix retenu du plan
  // (config.js > getPlanRenduVue3D). Sans KtaGalerie : structures seules.
  const RENDUS = ["mixte", "structures", "galerie"];
  // Icônes de la carte : 🏛️ = les structures, 🛣️ = les tracés (outil de la barre) ; le mixte montre les deux.
  const RENDU_UI = {
    mixte: { icone: "🏛️🛣️", nom: "vue3d.modeMixte", passer: "vue3d.passerMixte" },
    structures: { icone: "🏛️", nom: "vue3d.modeStructures", passer: "vue3d.passerStructures" },
    galerie: { icone: "🛣️", nom: "vue3d.modeGalerie", passer: "vue3d.passerGalerie" }
  };

  function _renduVoulu() {
    if (!window.KtaGalerie) return "structures";
    const pref = typeof window.getPlanRenduVue3D === "function" ? window.getPlanRenduVue3D() : null;
    return RENDUS.indexOf(pref) >= 0 ? pref : "mixte";
  }

  function _renduSuivant(r) { return RENDUS[(RENDUS.indexOf(r) + 1) % RENDUS.length]; }

  // Sol et plafond d'un seul tenant en mixte et en structures ; en galerie, ceux des pièces (_construireTuileGalerie).
  function _appliquerRendu() {
    const e = _e, gal = !!e.galerie, b = e.boutonRendu;
    e.sol.visible = !gal;
    e.plafond.visible = !gal && e.vue !== "plongee";
    if (b) {
      const ici = RENDU_UI[e.rendu] || RENDU_UI.structures, apres = RENDU_UI[_renduSuivant(e.rendu)];
      b.textContent = ici.icone + " " + _t(ici.nom);
      b.title = _t(apres.passer);
      b.setAttribute("aria-label", _t("vue3d.renduActuel", { mode: _t(ici.nom) }) + " · " + b.title);
      b.dataset.rendu = e.rendu;
    }
    _majRepere();
    e.sale = true;
  }

  // Rendu suivant (mixte → structures → galerie → mixte), ou `vers` s'il est donné ; retenu pour ce plan, scène
  // refaite. Rend le nouveau rendu.
  function basculerRendu(vers) {
    const e = _e;
    if (!e || !window.KtaGalerie) return null;
    const cible = RENDUS.indexOf(vers) >= 0 ? vers : _renduSuivant(e.rendu);
    if (typeof window.setPlanRenduVue3D === "function") window.setPlanRenduVue3D(null, cible);
    _reindexer();
    return e.rendu;
  }

  // Tuiles proches construites (toutes à l'ouverture, puis quelques-unes par image), lointaines jetées.
  function _gererTuiles(tout) {
    const e = _e, px = e.pos.x / e.sc, pz = e.pos.y / e.sc;
    const rVue = e.vue === "plongee" ? e.distance * 1.4 : e.distance;
    const rGarde = rVue + 2 * TUILE;
    let construites = 0;
    const t0 = performance.now();
    e.tuiles.forEach(function (t) {
      const dx = Math.max(t.x0 - px, 0, px - t.x1), dz = Math.max(t.z0 - pz, 0, pz - t.z1);
      const d = Math.hypot(dx, dz);
      if (d <= rVue) {
        if (!t.obj && (tout || construites < TUILES_PAR_IMAGE)) { _construireTuile(t); construites++; }
        if (t.obj && !t.obj.visible) { t.obj.visible = true; e.sale = true; }
      } else if (d > rGarde) {
        if (t.obj) { _libererTuile(t); e.sale = true; }
      } else if (t.obj && t.obj.visible) {
        t.obj.visible = false; e.sale = true;
      }
    });
    if (construites) e.msTuiles += performance.now() - t0;
  }

  function _placerCamera() {
    const e = _e, x = e.pos.x / e.sc, z = e.pos.y / e.sc, cap = e.cap * Math.PI / 180;
    const dy = e.dy || 0;   // geste d'un passage (_majGeste) : la caméra descend ou monte dans le volume
    e.tete.position.set(x, e.oeil + dy, z);
    e.tete.rotation.set(e.tangage, -cap, 0);
    e.sol.position.set(x, 0, z);
    // Le carré de sol suit la position : le motif est décalé d'autant pour rester fixe sous les pieds.
    e.grain.offset.set(x / GRAIN_METRES, -z / GRAIN_METRES);
    e.plafond.position.set(x, e.hauteur, z);
    e.avatar.position.set(x, 0.45, z);
    e.avatar.rotation.set(0, -cap, 0);
    if (e.vue === "plongee") {
      const fx = Math.sin(cap), fz = -Math.cos(cap), i = e.inclinaison * Math.PI / 180;
      const vx = x + fx * 2, vz = z + fz * 2, h = RECUL_PLONGEE * Math.cos(i);
      e.camera.position.set(vx - fx * h, RECUL_PLONGEE * Math.sin(i), vz - fz * h);
      e.camera.lookAt(vx, 0, vz);
    } else {
      e.camera.position.set(x, e.oeil + dy, z);
      e.camera.rotation.set(e.tangage, -cap, 0);
    }
    _majPanneaux();
    _majBoussole();
  }

  // Rose des vents : même convention que la boussole 2D (compass.js, rotate(-cap)), sur le cap RÉEL de la vue :
  // cap plan − calibration Nord du plan (tracking.js > _getPlanRelHeading fait l'inverse). Sans calibration, la
  // rose montre le haut du plan ; seul son libellé accessible le dit (aucun texte à l'écran, décision produit).
  function _majBoussole() {
    const e = _e;
    if (!e.rose) return;
    const reel = ((e.cap - e.nord) % 360 + 360) % 360;
    if (Math.abs(reel - e.roseAngle) < 0.5) return;
    e.roseAngle = reel;
    e.rose.style.transform = "rotate(" + (-reel).toFixed(1) + "deg)";
  }

  function _lireNord() {
    const e = _e;
    e.nordCalibre = typeof window.getPlanNorthCalibre === "function" && window.getPlanNorthCalibre() === true;
    const lire = typeof window.getPlanNorthOffset === "function" ? window.getPlanNorthOffset : null;
    e.nord = e.nordCalibre && lire ? Number(lire()) || 0 : 0;
    e.roseAngle = NaN;
    if (e.boussole) {
      const non = e.nordCalibre ? "" : " · " + _t("vue3d.nordNonCalibre");
      e.boussole.setAttribute("aria-label", _t("vue3d.boussole") + non);
    }
    e.sale = true;
  }

  // Inclinaison de la vue plongeante, bornée, retenue tant que la vue est ouverte.
  function incliner(deg) {
    if (!_e) return;
    _e.inclinaison = Math.max(INCLINAISON.min, Math.min(INCLINAISON.max, _e.inclinaison + deg));
    _e.sale = true;
  }

  function _appliquerVue() {
    const e = _e, haut = e.vue === "plongee";
    e.plafond.visible = !haut && !e.galerie;
    e.tuiles.forEach(function (t) {
      if (t.obj) t.obj.children.forEach(function (o) { if (o.userData.famille === "plafond") o.visible = !haut; });
    });
    e.avatar.visible = haut && _permisGreffe("avatar");
    e.ambiance.intensity = haut ? 0.9 : 0.04;
    e.scene.fog.near = haut ? e.distance : e.distance * 0.45;
    e.scene.fog.far = haut ? e.distance * 1.4 + 20 : e.distance;
    e.camera.far = haut ? e.distance * 1.4 + 30 : e.distance + 5;
    e.camera.updateProjectionMatrix();
    if (e.boutonVue) e.boutonVue.setAttribute("aria-pressed", haut ? "true" : "false");
    _majRepere();
    if (e.boutonsIncl) e.boutonsIncl.hidden = !haut;
    e.sale = true;
  }

  // ── Déplacement ────────────────────────────────────────────────────────────────────────────────────

  // Pas de `m` mètres dans la direction `angle` (° plan, 0 = haut de l'image), glisse le long d'un mur si un seul
  // axe passe. ⚠️ Le corps a une largeur : le pas est BALAYÉ par trois segments parallèles (axe et ± RAYON_CORPS),
  // prolongés de RAYON_CORPS devant, puis l'arrivée doit laisser libres RAYONS segments de RAYON_CORPS en étoile
  // (un disque autour de soi) ; tous jugés par la règle du tracker, en un lot (ktaSegmentsBloquesParStructure,
  // types perso compris). Déjà à moins de RAYON_CORPS d'une face (ouvert sur la position du tracker) : l'arrivée
  // peut garder des rayons bloqués, pas plus qu'au départ, sinon on resterait figé contre le mur.
  // 🩸 Avec le seul axe, on frôlait une face à quelques centimètres en biais ou en glissant : la caméra passait
  // alors dans le pilier (plan proche à 5 cm) et l'on voyait au travers ; et les types perso, dessinés en volume,
  // n'arrêtaient rien.
  function _pas(m, angle) {
    const e = _e, a = angle * Math.PI / 180;
    const dx = Math.sin(a) * m * e.sc, dy = -Math.cos(a) * m * e.sc;
    const essais = [[dx, dy], [dx, 0], [0, dy]];
    let auDepart = -1;   // rayons bloqués au départ, lus seulement si une arrivée en a
    const depart = function () { if (auDepart < 0) auDepart = _rayonsBloques(e.pos.x, e.pos.y); return auDepart; };
    for (let i = 0; i < essais.length; i++) {
      const sx = essais[i][0], sy = essais[i][1], l = Math.hypot(sx, sy);
      if (l < 1e-9) continue;
      const x1 = e.pos.x + sx, y1 = e.pos.y + sy;
      const n = _balayage(e.pos.x, e.pos.y, x1, y1, sx / l, sy / l);
      if (n < 0 || (n > 0 && n > depart())) continue;
      _poser(x1, y1);
      return true;
    }
    // Jamais coincé : parti d'une place d'où aucun pas n'est possible (dans un pilier, dans la roche de l'image de
    // collision), tout pas qui rapproche du point libre le plus proche passe (_sortie).
    const s = _sortie();
    if (s) {
      const x1 = e.pos.x + dx, y1 = e.pos.y + dy, d0 = Math.hypot(s.x - e.pos.x, s.y - e.pos.y);
      if (s.x === undefined || Math.hypot(s.x - x1, s.y - y1) < d0) { _poser(x1, y1); return true; }
    }
    e.butees++;
    return false;
  }

  function _poser(x, y) {
    const e = _e;
    e.pos.x = x; e.pos.y = y;
    e.aBouge = true; e.libreBouge = true;
    e.sale = true;
  }

  // ── Jamais coincé (ouverture, arrivée d'un passage 🪜) ─────────────────────────────────────────────────
  // 🩸 Une accroche de POI jonction posée à côté de la galerie, un POI dans un pilier ou un point que l'image de
  // collision dit dans la roche : la règle du pas refusait tout pas, la vue restait figée. ⚠️ contrat : une place
  // hors de l'emprise (galerie) ou d'où aucun pas n'est possible est ramenée au point libre le plus proche :
  // l'axe du tracé le plus proche (modèle KtaGalerie du rendu, plusProche) à moins de smartNavRadiusM (6 m par
  // défaut, le rayon du verrou sur tracé ; pas celui du recalage du tracker, KtaGalerie.PROCHE_M), sinon un point
  // libre cherché en couronnes de 0,25 m dans
  // ce rayon. Rien trouvé : _pas laisse passer tout pas qui rapproche de l'axe le plus proche (30 m), ou tout pas.

  // Un pas de 0,3 m est-il possible dans l'une des 8 directions, depuis (x, y) (px) ?
  function _pasPossible(x, y) {
    const e = _e, l = 0.3 * e.sc, bloques = _rayonsBloques(x, y);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, ux = Math.cos(a), uy = Math.sin(a);
      const n = _balayage(x, y, x + ux * l, y + uy * l, ux, uy);
      if (n === 0 || (n > 0 && n <= bloques)) return true;
    }
    return false;
  }

  // 🩸 Mixte : une arrivée hors du tube mais près de son axe (accroche posée à côté) restait dans la roche, d'où
  // un pas était possible sans jamais pouvoir franchir la paroi pour entrer. ⚠️ contrat : comme en galerie, hors
  // des tubes et à moins de smartNavRadiusM d'un axe qui est en tube à cet endroit (pas dans une chambre) = coincé.
  function _coince(x, y) {
    const e = _e;
    if (e.galerie) return !window.KtaGalerie.dedans(x, y, _niveauPas());
    const m = e.mixte;
    if (m && m.pieces.length && !m.dedans(x, y) && !m.enChambre(x, y)) {
      const pp = m.plusProche(x, y, _rayonLibre());
      if (pp && m.tubeAu(pp.arete, pp.t)) return true;
    }
    return !_pasPossible(x, y);
  }

  function _rayonLibre() {
    const r = Number(window.APP_CONFIG && window.APP_CONFIG.smartNavRadiusM);
    return (Number.isFinite(r) && r > 0 ? r : 6) * _e.sc;
  }

  // Point libre le plus proche de (x, y) (px), ou null.
  function _pointLibre(x, y) {
    const e = _e, m = e.galerie || e.mixte, R = _rayonLibre();
    const pp = m ? m.plusProche(x, y, R) : null;
    if (pp && !_coince(pp.x, pp.y)) return { x: pp.x, y: pp.y };
    const pas = 0.25 * e.sc;
    for (let r = pas; r <= R; r += pas) {
      const n = Math.max(8, Math.ceil(2 * Math.PI * r / pas));
      for (let k = 0; k < n; k++) {
        const qx = x + r * Math.cos(2 * Math.PI * k / n), qy = y + r * Math.sin(2 * Math.PI * k / n);
        if (!e.galerie && typeof window.ktaEstAccessible === "function" && !window.ktaEstAccessible(qx, qy)) continue;
        if (!_coince(qx, qy)) return { x: qx, y: qy };
      }
    }
    return null;
  }

  // Ramène la place au point libre le plus proche si elle est coincée. → true si elle a bougé.
  function _degager() {
    const e = _e;
    if (!_coince(e.pos.x, e.pos.y)) return false;
    const p = _pointLibre(e.pos.x, e.pos.y);
    if (!p) {
      console.warn("[Vue3D] place coincée, aucun point libre à portée : tout pas qui en rapproche passera");
      return false;
    }
    e.pos.x = p.x; e.pos.y = p.y;
    e.degagements++;
    e.sale = true;
    console.log("[Vue3D] place ramenée dans la galerie (point libre le plus proche)");
    return true;
  }

  // Cible de sortie d'une place d'où aucun pas n'est possible (mise en cache par place) : l'axe le plus proche à
  // 30 m, sinon {} (tout pas passe). null si la place n'est pas coincée.
  function _sortie() {
    const e = _e, cle = Math.round(e.pos.x) + "," + Math.round(e.pos.y);
    if (e.sortie && e.sortie.cle === cle) return e.sortie.cible;
    let cible = null;
    if (!_pasPossible(e.pos.x, e.pos.y)) {
      const m = e.galerie || e.mixte, pp = m ? m.plusProche(e.pos.x, e.pos.y, 30 * e.sc) : null;
      cible = pp ? { x: pp.x, y: pp.y } : {};
    }
    e.sortie = { cle: cle, cible: cible };
    return cible;
  }

  // → -1 si un couloir est coupé (ou l'arrivée hors plan / hors image de collision), sinon le nombre de rayons
  // bloqués autour de l'arrivée. Un seul lot de segments par essai (_juger : structures ou galerie).
  // Mode galerie : on bute contre les parois, les remblais et les effondrements (KtaGalerie.segmentsBloques),
  // l'image de collision du plan n'est pas lue ; parti d'en dehors des galeries (tracker hors tracé), on se déplace
  // librement pour y entrer.
  // Mode mixte : règle des structures (image de collision comprise) et parois dessinées des tubes (_juger).
  function _balayage(x0, y0, x1, y1, ux, uy) {
    const r = RAYON_CORPS * _e.sc, fx = x1 + ux * r, fy = y1 + uy * r, gal = !!_e.galerie;
    const pc = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
    if (pc && (fx < 0 || fy < 0 || fx > pc.imageWidth || fy > pc.imageHeight)) return -1;
    if (gal && !window.KtaGalerie.dedans(x0, y0, _niveauPas())) return 0;
    if (!gal && typeof window.ktaEstAccessible === "function" && !window.ktaEstAccessible(fx, fy)) return -1;
    if (!gal && !_e.mixte && typeof window.ktaSegmentsBloquesParStructure !== "function") return 0;
    const segs = [];
    for (let i = 0; i < RAILS.length; i++) {
      const ox = -uy * r * RAILS[i], oy = ux * r * RAILS[i];
      segs.push([x0 + ox, y0 + oy, fx + ox, fy + oy]);
    }
    _rayons(segs, x1, y1, r);
    const res = _juger(segs);
    for (let i = 0; i < RAILS.length; i++) { if (res[i]) return -1; }
    let n = 0;
    for (let i = RAILS.length; i < res.length; i++) { if (res[i]) n++; }
    return n;
  }

  function _rayons(segs, x, y, r) {
    for (let i = 0; i < RAYONS; i++) {
      const a = i * 2 * Math.PI / RAYONS;
      segs.push([x, y, x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    return segs;
  }

  function _niveauPas() { return _e.niveau === null ? undefined : _e.niveau; }

  // Règle du rendu affiché : structures (tracking.js, types perso compris), emprise des galeries, ou en mixte les
  // deux à la fois : structures partout, parois des tubes là où elles sont dessinées (dans une chambre, aucune).
  function _juger(segs) {
    if (_e.galerie) return window.KtaGalerie.segmentsBloques(segs, _niveauPas());
    const s = typeof window.ktaSegmentsBloquesParStructure === "function"
      ? window.ktaSegmentsBloquesParStructure(segs, _niveauPas(), true) : segs.map(function () { return false; });
    if (!_e.mixte) return s;
    const p = window.KtaGalerie.paroisBloquent(segs, _niveauPas());
    return s.map(function (b, i) { return b || p[i]; });
  }

  function _rayonsBloques(x, y) {
    return _juger(_rayons([], x, y, RAYON_CORPS * _e.sc)).filter(Boolean).length;
  }

  function _passerEnLibre() { if (_e.mode !== "libre") { _e.mode = "libre"; _majBoutonSuivre(); } }

  // ── Changer de niveau par un passage (🪜, mode libre) ─────────────────────────────────────────────────
  // ⚠️ contrat (décision produit) : la 3D change seulement SON niveau ; ni le tracker ni le niveau actif de la
  // carte ne bougent (« Je suis ici ? » recale aussi le niveau à la fermeture). En suivi, le niveau est celui du
  // tracker : 🪜 n'apparaît qu'en libre. Arrivée au raccord validé du niveau choisi, sinon au bout opposé d'un
  // tracé jonction, sinon à la même position (au passage touché s'il est à plus de PASSAGE m). Cap conservé.

  // Niveau a au-dessus de b : d'après les profondeurs saisies si les deux en ont, sinon le plus grand numéro.
  function _auDessus(a, b) {
    const z = typeof window.getProfondeurNiveau === "function" ? window.getProfondeurNiveau : null;
    const za = z ? z(a) : null, zb = z ? z(b) : null;
    return Number.isFinite(za) && Number.isFinite(zb) && za !== zb ? za > zb : a > b;
  }

  // Niveaux proposés : ceux des passages à moins de PASSAGE m, le plus proche d'abord.
  function _ciblesProches() {
    const e = _e;
    if (e.mode !== "libre" || !e.passages || !e.passages.length) return [];
    const loin = function (p) { return Math.hypot(p.x - e.pos.x, p.y - e.pos.y) / e.sc; };
    const liste = e.passages.map(function (p) { return { p: p, d: loin(p) }; })
      .filter(function (q) { return q.d <= PASSAGE; }).sort(function (a, b) { return a.d - b.d; });
    const vus = {}, out = [];
    liste.forEach(function (q) {
      q.p.cibles.forEach(function (c) {
        if (vus[c.niveau] || c.niveau === e.niveau) return;
        vus[c.niveau] = true;
        out.push({ niveau: c.niveau, x: c.x, y: c.y, depuis: q.p, proche: q.d <= PASSAGE });
      });
    });
    return out;
  }

  // Le plus proche au-dessus (haut) ou au-dessous du niveau affiché, parmi `cibles`.
  function _voisin(cibles, haut) {
    let best = null;
    cibles.forEach(function (c) {
      if (_auDessus(c.niveau, _e.niveau) !== haut) return;
      if (!best || (haut ? _auDessus(best.niveau, c.niveau) : _auDessus(c.niveau, best.niveau))) best = c;
    });
    return best;
  }

  // Boîte 🪜 : ▲ / ▼ (un niveau au plus de chaque côté), sinon la liste des niveaux liés. Refaite au changement.
  function _majPassage() {
    const e = _e, boite = e.boiteNiveaux;
    if (!boite) return;
    const cibles = _ciblesProches();
    const nHaut = cibles.filter(function (c) { return _auDessus(c.niveau, e.niveau); }).length;
    const liste = nHaut > 1 || cibles.length - nHaut > 1;
    // 🩸 Le nom du passage est dans la signature : deux passages vers le même niveau gardaient le libellé du premier.
    const sig = cibles.map(function (c) { return c.niveau + ":" + _textePassage(c).long; }).join(",") +
      (liste ? "|liste" : "") + "|" + e.niveau;
    if (sig === e.passageSig) return;
    e.passageSig = sig;
    e.passageCibles = { haut: null, bas: null, liste: [] };
    boite.textContent = "";
    boite.hidden = !cibles.length;
    if (!cibles.length) return;
    const marque = document.createElement("span");
    marque.className = "kta-v3d-niveaux-marque";
    marque.textContent = "🪜";
    marque.setAttribute("aria-hidden", "true");
    boite.appendChild(marque);
    if (liste) {
      cibles.slice().sort(function (a, b) { return _auDessus(a.niveau, b.niveau) ? -1 : 1; }).forEach(function (c) {
        const t = _textePassage(c);
        e.passageCibles.liste.push(c);
        _bouton(boite, "kta-v3d-btn-mode kta-v3d-btn-passage", t.court,
          _t("vue3d.niveauAller", { n: _fmtNiveau(c.niveau) }) + " · " + t.long, "niveau")
          .dataset.indice = String(e.passageCibles.liste.length - 1);
      });
      return;
    }
    const h = e.passageCibles.haut = _voisin(cibles, true), b = e.passageCibles.bas = _voisin(cibles, false);
    if (h) {
      const t = _textePassage(h);
      _bouton(boite, "kta-v3d-btn-mode kta-v3d-btn-passage", t.court,
        _t("vue3d.niveauMonter", { n: _fmtNiveau(h.niveau) }) + " · " + t.long, "niveauHaut");
    }
    if (b) {
      const t = _textePassage(b);
      _bouton(boite, "kta-v3d-btn-mode kta-v3d-btn-passage", t.court,
        _t("vue3d.niveauDescendre", { n: _fmtNiveau(b.niveau) }) + " · " + t.long, "niveauBas");
    }
  }

  // Bouton d'un passage, nommé (« ▼ -1 · Nom du puits (échelle) ») : `court` à l'écran (nom coupé à 22 signes),
  // `long` au titre et au libellé accessible. Tracé jonction : sans nom.
  function _textePassage(c) {
    const poi = c.depuis && c.depuis.poi, J = window.KtaPoiJonction;
    const moyen = _t("vue3d.moyen." + ((poi && J && J.moyen(_premierTag(poi))) || "trace"));
    const nom = poi ? String(poi.nom || poi.name || poi.id || "") : "";
    const p = { fleche: _auDessus(c.niveau, _e.niveau) ? "▲" : "▼", n: _fmtNiveau(c.niveau), moyen: moyen };
    const cle = nom ? "vue3d.passageNomme" : "vue3d.passageSansNom";
    return { court: _t(cle, Object.assign({}, p, { nom: nom.length > 22 ? nom.slice(0, 21) + "…" : nom })),
      long: _t(cle, Object.assign({}, p, { nom: nom })) };
  }

  // Passage vers le niveau de `c` derrière le geste (_lancerGeste : fondu, descente ou montée), bascule au noir. Un
  // geste déjà en cours : refusé (double toucher). → true si le passage est lancé (ou fait, sans geste).
  function _allerNiveau(c) {
    const e = _e;
    if (!e || !c || !Number.isInteger(c.niveau) || e.geste) return false;
    _passerEnLibre();
    if (!_gesteAnime) return _basculerNiveau(c);
    _lancerGeste(_auDessus(c.niveau, e.niveau) ? 1 : -1, function () { _basculerNiveau(c); });
    return true;
  }

  // ⚠️ contrat (décision produit) : arrivée au raccord validé du niveau, sinon au bout opposé du tracé jonction, sinon
  // au point ; ramenée dans le tube si elle tombe à côté (_degager) ; cap vers la prochaine consigne si un itinéraire
  // passe là, sinon vers la galerie d'arrivée (_capArrivee).
  function _basculerNiveau(c) {
    const e = _e;
    if (!e) return false;
    const cfg = window.APP_CONFIG || {};
    e.niveauLibre = c.niveau;
    e.actifVu = Number.isInteger(cfg.activeLevel) ? cfg.activeLevel : 0;
    if (Number.isFinite(c.x) && Number.isFinite(c.y)) { e.pos.x = c.x; e.pos.y = c.y; }
    else if (c.depuis && !c.proche) { e.pos.x = c.depuis.x; e.pos.y = c.depuis.y; }
    e.aBouge = true; e.libreBouge = true;
    e.changementsNiveau++;
    console.log("[Vue3D] passage vers le niveau " + c.niveau);
    _reindexer();
    _degager();
    e.cap = _capArrivee();
    _majPassage();
    _annoncerNiveau();
    e.sale = true;
    return true;
  }

  // Cap à l'arrivée d'un passage : le long de l'itinéraire s'il passe à moins de PASSAGE_ITI m (vers sa prochaine
  // consigne, ItiGuidage.apercu > capTrajet), sinon le long de l'axe de galerie le plus proche, du côté où il est le
  // plus long ; rien de tout cela : cap gardé.
  function _capArrivee() {
    const e = _e, G = window.ItiGuidage, niv = e.niveau === null ? undefined : e.niveau;
    if (G && typeof G.apercu === "function" && _itineraire()) {
      const ap = G.apercu(e.pos, { niveau: niv });
      if (ap && ap.visible && ap.distM <= PASSAGE_ITI && Number.isFinite(ap.capTrajet)) return ap.capTrajet;
    }
    const m = e.galerie || e.mixte || (window.KtaGalerie ? window.KtaGalerie.modele(niv) : null);
    const pp = m ? m.plusProche(e.pos.x, e.pos.y, _rayonLibre()) : null;
    if (!pp) return e.cap;
    const r = m.aretes[pp.arete], sens = 1 - pp.t >= pp.t ? 1 : -1;
    const dx = (r.bx - r.ax) * sens, dy = (r.by - r.ay) * sens;
    if (Math.abs(dx) + Math.abs(dy) < 1e-9) return e.cap;
    return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  }

  // sens : "haut", "bas" ou un numéro de niveau, parmi les passages proches. → true si la scène a changé de niveau.
  function changerNiveau(sens) {
    if (!_e) return false;
    const cibles = _ciblesProches();
    const c = sens === "haut" ? _voisin(cibles, true) : sens === "bas" ? _voisin(cibles, false)
      : cibles.filter(function (q) { return q.niveau === sens; })[0];
    return _allerNiveau(c || null);
  }

  // Toucher un panneau de POI : sa fiche, la même que sur la carte (_ouvrirFiche), POI jonction compris (décision
  // produit) : sa fiche porte alors les boutons de passage (_passagesFiche).
  // 🩸 Les panneaux de membres et de repères d'une extension sont aussi dans _e.panneaux (même fondu) : ils ne sont
  // pas des POI, `point` n'y est qu'un { nom } — pas de fiche, un toast court avec leur nom (le 🏁 de l'arrivée
  // aussi). Ils arrêtent quand même le toucher : sinon la
  // fiche d'un POI caché derrière s'ouvrirait à la place.
  function _toucher(cx, cy) {
    const e = _e, r = e.cv.getBoundingClientRect(), sprites = [];
    if (!r.width || !r.height) return false;
    e.panneaux.forEach(function (sp) {
      if (sp.visible && sp.parent && sp.parent.visible) sprites.push(sp);
    });
    if (!sprites.length) return false;
    e.rayon = e.rayon || new THREE.Raycaster();
    e.rayon.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1),
      e.camera);
    const hit = e.rayon.intersectObjects(sprites, false)[0];
    if (!hit) return false;
    if (hit.object.userData.poi.genre !== "poi") {
      e.toucheNom = hit.object.userData.poi.nom;
      _toast(e.toucheNom, "success");
      return true;
    }
    return _ouvrirFiche(hit.object.userData.poi.point);
  }

  // ── Guidage de l'itinéraire : bandeau et chevrons (js/itiGuidage.js, aucun calcul de chemin ici) ──────────

  function _itineraire() {
    if (!_permisGreffe("itineraire")) return null;
    const r = _tab(window.getRoads).filter(function (x) { return x && x.type === "itinerary" && !x._preview; })[0];
    return r && Array.isArray(r.points) && r.points.length >= 2 ? r : null;
  }

  // ⚠️ contrat (décision produit) : en suivi, la consigne RÉELLE du guidage (ItiGuidage.etat(), comme l'écran XL),
  // rien si le bandeau 2D ne parle pas ; en libre, un APERÇU depuis la position 3D (ItiGuidage.apercu, qui ne
  // touche pas l'état du guidage). → { bandeau, chevrons } : consigne à montrer (null = rien) et abscisses
  // { s, sCible } (px le long du trajet) des chevrons, montrés même réglé sur « Jamais ». Guidage coupé dans ⚙️
  // (_guidageMontre) : ni bandeau ni chevrons, sauf un guidage d'urgence (comme en 2D : `masque: !urgence && …`).
  function _lireGuidage() {
    const e = _e, G = window.ItiGuidage;
    if (!G || !_itineraire() || !_permisGreffe("guidage")) {
      e.apS = undefined;
      return { bandeau: null, chevrons: null };
    }
    let reel = null;
    if (e.mode === "suivi" && typeof G.etat === "function") {
      reel = G.etat();
      if (!reel || !reel.visible) reel = null;
    }
    let ap = null;
    if (!reel && typeof G.apercu === "function") {
      ap = G.apercu(e.pos, { cap: e.cap, sPrec: e.apS, niveau: e.niveau === null ? undefined : e.niveau });
      if (!ap || !ap.visible) ap = null;
    }
    e.apS = ap ? ap.s : undefined;
    const bandeau = reel || (e.mode !== "suivi" && ap && !ap.masque ? ap : null);
    const src = reel || ap;
    if (!_guidageMontre() && !(src && src.urgence)) return { bandeau: null, chevrons: null };
    return { bandeau: bandeau, chevrons: src && Number.isFinite(src.s) && Number.isFinite(src.sCible) ? src : null };
  }

  function _majGuidage(ts) {
    const e = _e;
    if (!e.guidageForce && ts - (e.guidageT || 0) < GUIDAGE_MS) return;
    e.guidageT = ts;
    e.guidageForce = false;
    const g = _lireGuidage();
    _majBandeau(g.bandeau);
    _majChevrons(g.chevrons);
  }

  // Bandeau compact dans _e.bandeau : icône (ou schéma du carrefour), consigne, ligne « puis… ».
  // Mêmes textes que le bandeau 2D. Le DOM n'est touché que si la consigne change.
  function _majBandeau(g) {
    const e = _e, b = e.bandeau;
    if (!b) return;
    const cle = g ? [g.apercu ? "a" : "r", g.mode, g.icone, g.picto, g.principal, g.sous, g.fleche, g.urgence].join("|")
      : "";
    if (cle === e.bandeauCle) return;
    e.bandeauCle = cle;
    e.bandeauEtat = g ? { visible: true, apercu: !!g.apercu, mode: g.mode, principal: g.principal || "",
      sous: g.sous || "" } : { visible: false };
    if (!g) { b.hidden = true; b.textContent = ""; _majSousHaut(); return; }
    b.textContent = "";
    b.classList.toggle("kta-v3d-guid-alerte", g.mode === "ecart" || g.mode === "demi");
    b.classList.toggle("kta-v3d-guid-urgence", !!g.urgence);
    const ic = document.createElement("span");
    ic.className = "kta-v3d-guid-icone";
    ic.setAttribute("aria-hidden", "true");
    if (g.picto) ic.innerHTML = g.picto;   // schéma du carrefour : SVG de nombres seuls (itiGuidage.js > _pictoSvg)
    else ic.textContent = g.icone || "";
    if (typeof g.fleche === "number") ic.style.transform = "rotate(" + g.fleche + "deg)";
    const txt = document.createElement("span");
    txt.className = "kta-v3d-guid-textes";
    const pr = document.createElement("span");
    pr.className = "kta-v3d-guid-principal";
    pr.textContent = g.principal || "";
    txt.appendChild(pr);
    if (g.sous) {
      const so = document.createElement("span");
      so.className = "kta-v3d-guid-sous";
      so.textContent = g.sous;
      txt.appendChild(so);
    }
    b.appendChild(ic);
    b.appendChild(txt);
    b.hidden = false;
    _majSousHaut();
  }

  function _libererChevrons() {
    const e = _e;
    if (!e.chevrons) return;
    if (e.chevrons.parent) e.chevrons.parent.remove(e.chevrons);
    e.chevrons.geometry.dispose();
    e.chevrons = null;
    e.sale = true;
  }

  // Chevrons « ^ » au sol sur le ruban de l'itinéraire, de la position vers la prochaine consigne, sur le niveau de
  // la scène seulement. Refaits quand l'itinéraire, le niveau ou la plage de chevrons change.
  function _majChevrons(g) {
    const e = _e, road = _itineraire(), sc = e.sc, pas = CHEVRON.pas * sc;
    const k0 = g ? Math.ceil(g.s / pas) : 0;
    const k1 = g ? Math.floor(Math.min(g.sCible, g.s + CHEVRON.long * sc) / pas) : -1;
    const sig = g && road && k1 >= k0 ? [k0, k1, e.niveau].join("|") : "";
    if (sig === e.chevSig && road === e.chevRoad && (!road || road.points === e.chevPts)) return;
    e.chevSig = sig; e.chevRoad = road; e.chevPts = road ? road.points : null;
    _libererChevrons();
    e.nChevrons = 0;
    if (!sig) return;
    const pts = road.points, lot = new Lot(), col = new THREE.Color(_jetonsSombres().accent);
    const l = CHEVRON.l, ep = CHEVRON.ep, y = CHEVRON.y, haut = [0, 1, 0];
    let i = 1, cum = 0;
    for (let k = k0; k <= k1; k++) {
      const s = k * pas;
      // Segment qui porte l'abscisse s (le trajet est parcouru une seule fois, dans l'ordre).
      while (i < pts.length) {
        const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (cum + d >= s) break;
        cum += d; i++;
      }
      if (i >= pts.length) break;
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 1e-6 || !_segmentDuNiveau(road, a, b, e.niveau)) continue;
      const t = (s - cum) / d, ux = (b.x - a.x) / d, uz = (b.y - a.y) / d, nx = -uz, nz = ux;
      const cx = (a.x + t * (b.x - a.x)) / sc, cz = (a.y + t * (b.y - a.y)) / sc;
      // Pointe devant, deux branches vers l'arrière de part et d'autre.
      const px = cx + ux * l / 2, pz = cz + uz * l / 2;
      [-1, 1].forEach(function (cote) {
        const qx = cx - ux * l / 2 + cote * nx * l / 2, qz = cz - uz * l / 2 + cote * nz * l / 2;
        const bx = qx - px, bz = qz - pz, bl = Math.hypot(bx, bz), ox = -bz / bl * ep / 2, oz = bx / bl * ep / 2;
        lot.quad([px + ox, y, pz + oz], [qx + ox, y, qz + oz], [qx - ox, y, qz - oz], [px - ox, y, pz - oz], haut,
          col);
      });
      e.nChevrons++;
    }
    const geo = lot.geometrie();
    if (!geo) return;
    e.chevrons = new THREE.Mesh(geo, e.mats.lumineux);
    e.chevrons.renderOrder = 1;
    e.chevrons.matrixAutoUpdate = false;
    e.scene.add(e.chevrons);
    e.sale = true;
  }

  // ── Marqueurs de l'itinéraire : étapes (disque et mât) et arrivée (🏁) ──────────────────────────────────
  // ⚠️ contrat : étapes = `road.raccords` de rôle « etape » (pathfinder.js > computeRoute), posées à leur point SUR
  // le trajet (`vers`), au niveau du point du trajet le plus proche ; arrivée = dernier point du trajet, panneau
  // « 🏁 » (et le nom de l'arrivée s'il en a un), sans icône. Refaits à chaque _reindexer (itinéraire, niveau).

  function _viderGroupe(g) {
    const e = _e;
    if (!g) return;
    g.traverse(function (q) {
      if (q.geometry && !q.isSprite && !q.userData.partage) q.geometry.dispose();
      if (q.isSprite && q.material) { if (q.material.map) q.material.map.dispose(); q.material.dispose(); }
      if (q.isSprite) e.panneaux.delete(q);
    });
    if (g.parent) g.parent.remove(g);
    e.sale = true;
  }

  function _niveauPointIti(road, x, y) {
    const defaut = Number.isInteger(road.level) ? road.level : 0;
    let best = null, d = Infinity;
    road.points.forEach(function (q) {
      if (!q || !Number.isFinite(q.x)) return;
      const dd = Math.hypot(q.x - x, q.y - y);
      if (dd < d) { d = dd; best = q; }
    });
    return best && Number.isInteger(best.level) ? best.level : defaut;
  }

  function _majMarqueursIti() {
    const e = _e, road = _itineraire(), sc = e.sc;
    _viderGroupe(e.marqueursIti);
    e.marqueursIti = null;
    e.nbMarqueurs = { etapes: 0, arrivee: false };
    if (!road) return;
    const g = new THREE.Group(), cols = _couleursIti();
    if (!e.geoMarqueur) {
      const disque = new THREE.CircleGeometry(MARQUEUR.rayon, 24);
      disque.rotateX(-Math.PI / 2);
      const mat = new THREE.CylinderGeometry(MARQUEUR.epMat, MARQUEUR.epMat, MARQUEUR.mat, 8);
      mat.translate(0, MARQUEUR.mat / 2, 0);
      e.geoMarqueur = { disque: disque, mat: mat };
    }
    if (!e.mats.marqueur) {
      e.mats.marqueur = new THREE.MeshBasicMaterial({ color: cols.ruban, toneMapped: false });
    }
    const auNiveau = function (n) { return e.niveau === null || n === e.niveau; };
    (Array.isArray(road.raccords) ? road.raccords : []).forEach(function (r) {
      if (!r || r.role !== "etape" || !r.vers || !Number.isFinite(r.vers.x)) return;
      if (!auNiveau(_niveauPointIti(road, r.vers.x, r.vers.y))) return;
      const m = new THREE.Group();
      [e.geoMarqueur.disque, e.geoMarqueur.mat].forEach(function (geo) {
        const me = new THREE.Mesh(geo, e.mats.marqueur);
        me.userData.partage = true;   // géométrie et matériau de la vue : libérés à la fermeture
        m.add(me);
      });
      m.children[0].position.y = MARQUEUR.y;
      m.position.set(r.vers.x / sc, 0, r.vers.y / sc);
      m.userData.famille = "etape";
      g.add(m);
      e.nbMarqueurs.etapes++;
    });
    const pts = road.points.filter(function (q) { return q && Number.isFinite(q.x) && Number.isFinite(q.y); });
    const fin = pts[pts.length - 1];
    const defaut = Number.isInteger(road.level) ? road.level : 0;
    if (fin && auNiveau(Number.isInteger(fin.level) ? fin.level : defaut)) {
      const rArr = (Array.isArray(road.raccords) ? road.raccords : []).filter(function (r) {
        return r && r.role === "arrivee";
      })[0];
      const nom = "🏁" + (rArr && rArr.label ? " " + rArr.label : "");
      g.add(_panneau({ nom: nom }, [fin.x / sc, fin.y / sc], { bord: _jetonsSombres().interaction, sansIcone: true,
        genre: "arrivee", y: Math.min(MARQUEUR.mat + 0.5, e.hauteur - 0.15) }));
      e.nbMarqueurs.arrivee = true;
    }
    e.scene.add(g);
    e.marqueursIti = g;
    e.sale = true;
  }

  // ── Ronds d'intersection (option ⚙️ de la carte, getPlanShowsIntersections) ───────────────────────────
  // ⚠️ contrat : la 3D ne calcule rien ; elle lit les ronds DESSINÉS par la carte (road.js > getRoadIntersections :
  // mêmes filtres, liste vide option coupée), garde ceux du niveau affiché et pose un disque de ROND.rayon à la
  // couleur du rond, au-dessus des rubans (et du liseré en galerie). Refaits à _reindexer et à
  // `kta:intersectionsChange`.
  function _majRonds() {
    const e = _e, sc = e.sc;
    if (e.ronds) {
      if (e.ronds.parent) e.ronds.parent.remove(e.ronds);
      e.ronds.geometry.dispose();
      e.ronds = null;
      e.sale = true;
    }
    e.listeRonds = [];
    const montre = typeof window.getPlanShowsIntersections === "function" && window.getPlanShowsIntersections();
    if (!montre || typeof window.getRoadIntersections !== "function") return;
    let liste = [];
    try { liste = window.getRoadIntersections() || []; } catch (err) { liste = []; }
    const lot = new Lot(), haut = [0, 1, 0], n = ROND.cotes;
    liste.forEach(function (it) {
      if (!it || !it.point || !Number.isFinite(it.point.x)) return;
      if (e.niveau !== null && Number.isInteger(it.level) && it.level !== e.niveau) return;
      const col = new THREE.Color();
      try { col.setStyle(it.color); } catch (err) { col.set(0xffffff); }
      const cx = it.point.x / sc, cz = it.point.y / sc;
      for (let k = 0; k < n; k++) {
        const a0 = 2 * Math.PI * k / n, a1 = 2 * Math.PI * (k + 1) / n;
        lot.tri([cx, ROND.y, cz], [cx + Math.cos(a0) * ROND.rayon, ROND.y, cz + Math.sin(a0) * ROND.rayon],
          [cx + Math.cos(a1) * ROND.rayon, ROND.y, cz + Math.sin(a1) * ROND.rayon], haut, col);
      }
      e.listeRonds.push({ x: cx, z: cz, couleur: it.color, niveau: Number.isInteger(it.level) ? it.level : null });
    });
    const geo = lot.geometrie();
    if (!geo) return;
    e.ronds = new THREE.Mesh(geo, e.mats.iti);
    e.ronds.renderOrder = 1;
    e.ronds.matrixAutoUpdate = false;
    e.scene.add(e.ronds);
    e.sale = true;
  }

  // ── Fiche d'un POI (la fiche de la carte, utils.js > buildPointPopupHtml) ───────────────────────────────
  // Ouverte par-dessus la scène, dans la vue : ses boutons agissent par l'écouteur unique de la carte
  // (utils.js > _ktaPopupAction, en capture sur document). ⚠️ Sans ✏️ / Repositionner / 🗑️ : ils se jouent sur la
  // carte 2D, cachée dessous (décision produit). Photos : utils.js > attachPopupPhotos, branché sur un marqueur
  // de substitution qui n'offre que on / isPopupOpen (les deux seules méthodes qu'il appelle).

  // Calque d'un POI de calque de données : id et libellé (favoris), comme utils.js > ajouterPointsDepuisJSON.
  function _infoCalque(id) {
    if (!id) return { layerId: "data", layerLabel: "" };
    const cfg = window.PLAN_CONFIG && window.PLAN_CONFIG.dataLayers;
    const lc = Array.isArray(cfg) ? cfg.filter(function (d) { return d && d.id === id; })[0] : null;
    return { layerId: id, layerLabel: lc && lc.label ? lc.label : id };
  }

  function _ouvrirFiche(p) {
    const e = _e;
    if (!p || typeof window.buildPointPopupHtml !== "function") return false;
    _fermerFiche();
    const session = _tab(window.getEditorPoints).indexOf(p) >= 0;
    const info = session ? { layerId: "editor", layerLabel: _t("editor.popup.myAdds") } : _infoCalque(p.layerId);
    const boite = document.createElement("div");
    boite.className = "kta-v3d-fiche";
    boite.setAttribute("role", "group");
    boite.setAttribute("aria-label", String(p.nom || p.id || ""));
    _bouton(boite, "kta-v3d-btn-petit kta-v3d-fiche-fermer", "✕", _t("vue3d.ficheFermer"), "ficheFermer");
    const corps = document.createElement("div");
    corps.className = "kta-v3d-fiche-corps";
    corps.innerHTML = window.buildPointPopupHtml(p, false, info);   // HTML échappé par la fiche elle-même
    _passagesFiche(boite, p);
    boite.appendChild(corps);
    e.ov.appendChild(boite);
    const marqueur = {
      h: {}, ouvert: true,
      on: function (type, f) { (this.h[type] = this.h[type] || []).push(f); return this; },
      isPopupOpen: function () { return this.ouvert; },
      emettre: function (type, ev) { (this.h[type] || []).forEach(function (f) { f(ev); }); }
    };
    e.fiche = { boite: boite, point: p, marqueur: marqueur };
    if (typeof window.attachPopupPhotos === "function") {
      try {
        window.attachPopupPhotos(marqueur, String(p.id || ""), p.uid);
        marqueur.emettre("popupopen", { popup: { getElement: function () { return corps; } } });
      } catch (err) { console.warn("[Vue3D] photos de la fiche :", err && err.message); }
    }
    return true;
  }

  // Fiche d'un POI jonction : un bouton par niveau lié (« ▼ Descendre au niveau -1 (échelle) », le plus haut
  // d'abord), d'où que l'on soit ; même arrivée que 🪜 (_allerNiveau). Ses boutons n'ont pas de data-v3d : les
  // écouteurs de la vue (_brancher) les ignorent, celui de la fiche les joue.
  function _passagesFiche(boite, p) {
    const e = _e, J = window.KtaPoiJonction;
    const pas = (e.passages || []).filter(function (q) { return q.poi === p; })[0];
    if (!pas || !J) return;
    const cibles = pas.cibles.filter(function (c) { return c.niveau !== e.niveau; })
      .sort(function (a, b) { return _auDessus(a.niveau, b.niveau) ? -1 : 1; });
    if (!cibles.length) return;
    const zone = document.createElement("div");
    zone.className = "kta-v3d-fiche-passages";
    zone.setAttribute("role", "group");
    zone.setAttribute("aria-label", _t("vue3d.passage"));
    const moyen = _t("vue3d.moyen." + (J.moyen(_premierTag(p)) || "trace"));
    cibles.forEach(function (c, i) {
      const cle = _auDessus(c.niveau, e.niveau) ? "vue3d.ficheMonter" : "vue3d.ficheDescendre";
      const txt = _t(cle, { n: _fmtNiveau(c.niveau), moyen: moyen });
      _bouton(zone, "kta-v3d-btn-mode kta-v3d-fiche-passage", txt, txt, null).dataset.v3dPassage = String(i);
    });
    zone.addEventListener("click", function (ev) {
      const b = ev.target.closest && ev.target.closest("[data-v3d-passage]");
      if (!b || !_e) return;
      const c = cibles[Number(b.dataset.v3dPassage)];
      const proche = Math.hypot(pas.x - _e.pos.x, pas.y - _e.pos.y) / _e.sc <= PASSAGE;
      _fermerFiche();
      _allerNiveau(Object.assign({ depuis: pas, proche: proche }, c));
    });
    boite.appendChild(zone);
  }

  function _fermerFiche() {
    const e = _e, f = e && e.fiche;
    if (!f) return false;
    e.fiche = null;
    f.marqueur.ouvert = false;
    try { f.marqueur.emettre("popupclose", {}); } catch (err) { /* photos déjà libérées */ }
    if (f.boite.parentNode) f.boite.parentNode.removeChild(f.boite);
    return true;
  }

  // Origine de « Y aller » pendant la vue (interfaceItineraire.js > itineraireYAller) : mode, position, niveau et
  // cap de la 3D, ou null vue fermée. En libre, l'itinéraire part d'ici sans recaler le tracker (décision produit).
  function origineItineraire() {
    if (!_e) return null;
    return { mode: _e.mode, x: _e.pos.x, y: _e.pos.y, niveau: _e.niveau, cap: _e.cap };
  }

  // Le tracker vient d'être recalé pendant la vue (tracking.js > _notifierRecalage : « 📍 Je suis ici » d'une fiche,
  // « Ici » de « D'où pars-tu ? », Secours). ⚠️ contrat (décision produit) : la place NE bouge PAS — on dit où est le
  // tracker, pas où regarder ; seule la question « Je suis ici ? » de la fermeture est retirée tant qu'on n'avance
  // pas (on vient de dire où l'on est). En suivi, un « Je suis ici » (`opts.dansGalerie`) passe en libre à cet
  // instant, avant toute image (la vue ne lit pas le tracker recalé), toast à l'appui ; on revient au suivi par le
  // bouton habituel. Un autre recalage en suivi (Secours) se laisse suivre. Fermée : rien. → true si la place reste.
  function trackerRecale(opts) {
    const e = _e;
    if (!e) return false;
    if (e.mode === "suivi") {
      if (!(opts && opts.dansGalerie)) return false;
      // Niveau tenu comme après un passage 🪜 : en libre, la vue garderait sinon le niveau actif de la carte.
      const cfg = window.APP_CONFIG || {};
      if (Number.isInteger(e.niveau)) {
        e.niveauLibre = e.niveau;
        e.actifVu = Number.isInteger(cfg.activeLevel) ? cfg.activeLevel : 0;
      }
      e.libreBouge = false;
      _passerEnLibre();
      _toast(_t("vue3d.libreApresRecalage"), "success");
    }
    e.aBouge = false;
    return true;
  }

  // Le tracker est choisi comme départ DEPUIS la vue (« D'où pars-tu ? » → « Ma dernière position ») : en mode libre,
  // la place vient à la position RÉELLE du tracker et à son niveau, cap gardé. Appelant :
  // interfaceItineraire.js > _demanderDepart. Vue fermée ou en suivi (elle suit déjà) : rien.
  // ⚠️ contrat : rien n'est recalé ici (lecture seule du tracker) ; la place est celle du tracker au centimètre et la
  // vue n'a plus « bougé » : la fermeture ne pose pas « Je suis ici ? » tant qu'on n'avance pas. → true si posée.
  function placerSurTracker() {
    const e = _e;
    if (!e || e.mode !== "libre" || typeof window.getTrackingPosition !== "function") return false;
    const p = window.getTrackingPosition();
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    e.pos.x = p.x; e.pos.y = p.y;
    e.aBouge = false; e.libreBouge = false;   // la place est celle du tracker : pas de pseudo « 3D » pour l'équipe
    e.sortie = null;
    const cfg = window.APP_CONFIG || {};
    if (cfg.multiLevel === true && typeof window.getTrackerLevel === "function") {
      const n = window.getTrackerLevel();
      // Comme un passage 🪜 : niveau tenu tant que le niveau actif de la carte ne change pas (_niveauCourant).
      if (Number.isInteger(n)) { e.niveauLibre = n; e.actifVu = Number.isInteger(cfg.activeLevel) ? cfg.activeLevel : 0; }
    }
    e.sale = true;
    console.log("[Vue3D] place posée sur le tracker");
    return true;
  }

  function _trackerActif() {
    return typeof window.getTrackingActif === "function" && window.getTrackingActif() === true;
  }

  // Bouton 🧭 = interrupteur « suivi » / « libre ». Grisé (mais touchable : il explique) tracker éteint.
  function _majBoutonSuivre() {
    const e = _e, b = e.boutonSuivre;
    if (!b) return;
    const dispo = _trackerActif();
    e.suiviDispo = dispo;
    b.setAttribute("aria-pressed", e.mode === "suivi" ? "true" : "false");
    b.classList.toggle("kta-v3d-inactif", !dispo);
    const t = !dispo ? _t("vue3d.suiviIndispo") : _t(e.mode === "suivi" ? "vue3d.passerLibre" : "vue3d.suivre");
    b.title = t;
    b.setAttribute("aria-label", t);
    // Mode écrit en clair : sans lui, rien ne disait qu'on était passé en libre ni comment revenir au suivi.
    // 🧭 = le tracker, comme son menu sur la carte (📍 y est le recalage).
    b.textContent = e.mode === "suivi" ? "🧭 " + _t("vue3d.etatSuivi") : "🕹️ " + _t("vue3d.etatLibre");
    _majRepere();
  }

  // Mode « suivi » : position du tracker et cap de l'appareil, la même source que le mode « plan orienté »
  // (tracking.js > getPlanRelHeading, offset Nord du plan compris ; mapBearing.js la lit aussi). Tracker
  // arrêté en route : retour au mode libre, là où l'on est.
  function basculerSuivi() {
    const e = _e;
    if (!e) return false;
    if (e.mode === "suivi") { _passerEnLibre(); return true; }
    if (!_trackerActif()) {
      _majBoutonSuivre();
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast(_t("vue3d.suiviIndispo"), "warn");
      }
      return false;
    }
    suivre();
    return true;
  }

  // ── Place libre montrée à l'équipe (prise de présence) ─────────────────────────────────────────────────
  // ⚠️ contrat (décision produit) : en libre, après un déplacement à la main, la place d'où l'on regarde part à
  // l'extension de présence (KtaExtensions.positionVue3D), qui ne la remet que si l'utilisateur partage déjà sa
  // position (sinon rien ne sort) ; null en repassant en suivi et à la fermeture (_demonter) : l'équipe revoit
  // la position du tracker, qui n'est jamais recalé ici. Cadence : place arrondie, remise seulement si elle a
  // bougé de PUB_DISTANCE m, tourné de PUB_CAP° ou changé de niveau (pas un appel par image). Sans extension : rien.
  const PUB_DISTANCE = 0.5, PUB_CAP = 10;
  function _prisePresence(p) {
    const X = window.KtaExtensions;
    if (!X || typeof X.positionVue3D !== "function") return false;
    try { return X.positionVue3D(p) === true; } catch (err) { return false; }
  }
  function _publierPosition() {
    const e = _e;
    if (e.mode !== "libre" || !e.libreBouge) {
      if (e.publiee) { e.publiee = null; _prisePresence(null); }
      return;
    }
    const p = { x: Math.round(e.pos.x * 10) / 10, y: Math.round(e.pos.y * 10) / 10,
      niveau: Number.isInteger(e.niveau) ? e.niveau : null, cap: Math.round(e.cap) % 360 };
    const d = e.publiee;
    if (d && d.niveau === p.niveau && Math.hypot(p.x - d.x, p.y - d.y) / e.sc < PUB_DISTANCE &&
        Math.abs(((p.cap - d.cap + 540) % 360) - 180) < PUB_CAP) return;
    if (!_prisePresence(p)) return;
    e.publiee = p;
    e.publications++;
    // Dit une fois par ouverture : la place libre est vue de l'équipe (vie privée), marquée « en vue 3D ».
    // « success » (décision produit) : jamais une alerte, et toujours vu (« info » est tu par défaut, oomGuard.js).
    if (!e.publicationDite) { e.publicationDite = true; _toast(_t("vue3d.presencePartagee"), "success"); }
  }

  function _lireTracker() {
    const e = _e;
    if (typeof window.getTrackingPosition !== "function") return;
    const p = window.getTrackingPosition();
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    // Lissage : un pas du tracker (~0,7 m d'un coup) glisse sur quelques images au lieu de sauter.
    // Sous 1 cm, la position est posée d'un coup : la scène ne se redessine plus pour rien.
    const kx = p.x - e.pos.x, ky = p.y - e.pos.y;
    if (Math.abs(kx) + Math.abs(ky) > 0.01) {
      const saut = Math.hypot(kx, ky) > 10 * e.sc, fin = Math.hypot(kx, ky) < 0.01 * e.sc;
      e.pos.x = saut || fin ? p.x : e.pos.x + kx * 0.25;
      e.pos.y = saut || fin ? p.y : e.pos.y + ky * 0.25;
      e.sale = true;
    }
    // Cap : le bruit de la boussole (écart < BRUIT_CAP) ne relance pas le rendu ; un vrai virage se suit jusqu'au
    // bout (à 0,2° près), puis la vue se repose. Sans ce seuil, on redessinait à chaque image en restant immobile.
    if (typeof window.getPlanRelHeading === "function") {
      const c = Number(window.getPlanRelHeading());
      if (Number.isFinite(c)) {
        const dc = ((c - e.cap + 540) % 360) - 180, adc = Math.abs(dc);
        if (adc > BRUIT_CAP) e.virage = true;
        if (e.virage && adc > 0.2) { e.cap = (e.cap + dc * 0.3 + 360) % 360; e.sale = true; }
        else e.virage = false;
      }
    }
  }

  // ── Boucle ─────────────────────────────────────────────────────────────────────────────────────────

  function _image(ts) {
    const e = _e;
    if (!e) return;
    e.raf = requestAnimationFrame(_image);
    const dt = e.tsPrec ? Math.min(0.1, (ts - e.tsPrec) / 1000) : 0;
    e.tsPrec = ts;
    const k = e.touches;
    const rapide = _permisGreffe("course") && (k.Shift || (k.av && e.avDepuis > 0 && ts - e.avDepuis > APPUI_LONG));
    const vit = VITESSE * (rapide ? FACTEUR_RAPIDE : 1);
    const av = (k.av ? 1 : 0) - (k.ar ? 1 : 0), lat = (k.dr ? 1 : 0) - (k.ga ? 1 : 0);
    const rot = (k.td ? 1 : 0) - (k.tg ? 1 : 0);
    e.rapide = !!rapide && !!(av || lat);
    if (av || lat || rot) _passerEnLibre();
    if (rot) { e.cap = (e.cap + rot * ROTATION * dt + 360) % 360; e.sale = true; }
    if (av) _pas(vit * dt * av, e.cap);
    if (lat) _pas(vit * dt, e.cap + 90 * lat);
    // Joystick : un seul pas dans la direction du bouton, à sa vitesse ; course = pleine vitesse × FACTEUR_RAPIDE.
    const st = e.stick;
    if (st && st.m > 0) {
      const course = _permisGreffe("course") && st.fortDepuis > 0 && ts - st.fortDepuis > APPUI_LONG;
      _passerEnLibre();
      _pas(VITESSE * (course ? FACTEUR_RAPIDE : st.m) * dt, e.cap + st.ang);
      e.rapide = e.rapide || course;
    }
    if (_trackerActif() !== e.suiviDispo) {
      if (e.mode === "suivi" && !_trackerActif()) e.mode = "libre";
      _majBoutonSuivre();
    }
    if (e.mode === "suivi") _lireTracker();
    if (e.geste) _majGeste(dt);
    _majPassage();
    const niv = _niveauCourant();
    // Pendant un geste, la scène attend sa bascule (au noir). Niveau changé hors passage (tracker en suivi, niveau
    // de la carte) : même fondu, sans descente.
    if (!e.geste) {
      if (niv !== e.niveau && e.niveau !== null && niv !== null && _gesteAnime) {
        _lancerGeste(0, function () { _reindexer(); _annoncerNiveau(); });
      } else if (niv !== e.niveau || e.filtresChanges || e.itiChange) {
        e.filtresChanges = false; e.itiChange = false; e.rondsChange = false;
        _reindexer();
      }
    }
    if (e.rondsChange) { e.rondsChange = false; _majRonds(); }
    _gererTuiles(false);
    _gererVolumes();
    _majBandeauNiveau(ts);
    _majEquipe();
    _publierPosition();
    _majGuidage(ts);
    if (e.perdu) return;
    _redimensionner();
    if (e.greffe) { e.greffe.appels.image++; _appelGreffe("surImage", dt); }
    if (!e.sale) return;
    e.sale = false;
    _placerCamera();
    e.renderer.render(e.scene, e.camera);
    e.images++;
    if (e.compteur) {
      e.compteurN++;
      if (ts - e.compteurT0 > 1000) {
        e.compteur.textContent = _t("vue3d.stats", { ips: Math.round(e.compteurN * 1000 / (ts - e.compteurT0)),
          tri: e.renderer.info.render.triangles, appels: e.renderer.info.render.calls });
        e.compteurN = 0; e.compteurT0 = ts;
      }
    }
  }

  function _redimensionner() {
    const e = _e, w = e.cv.clientWidth, h = e.cv.clientHeight;
    if (!w || !h || (w === e.w && h === e.h)) return;
    e.w = w; e.h = h;
    e.renderer.setSize(w, h, false);
    e.camera.aspect = w / h;
    e.camera.updateProjectionMatrix();
    e.sale = true;
  }

  // ── Interface (aucun script en ligne : écouteurs posés ici) ──────────────────────────────────────────

  const TOUCHES = {
    ArrowUp: "av", KeyW: "av", KeyZ: "av", ArrowDown: "ar", KeyS: "ar",
    ArrowLeft: "tg", ArrowRight: "td", KeyA: "ga", KeyQ: "ga", KeyD: "dr", KeyE: "dr"
  };

  function _bouton(parent, cls, txt, titre, action) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kta-v3d-btn " + cls;
    b.textContent = txt;
    b.title = titre;
    b.setAttribute("aria-label", titre);
    if (action) b.dataset.v3d = action;
    parent.appendChild(b);
    return b;
  }

  // Commandes de déplacement (décision produit) : joystick au téléphone, pavé ▲ ▼ ◀ ▶ ↶ ↷ au PC (pointeur fin) ou
  // quand l'option « Pavé classique » est cochée sur cet appareil (config.js > getVue3DPave). `force` (ouvrir) :
  // "pave" | "joystick" (checkup).
  function _commandesVoulues(force) {
    if (force === "pave" || force === "joystick") return force;
    const fin = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
    const pave = typeof window.getVue3DPave === "function" && window.getVue3DPave() === true;
    return fin || pave ? "pave" : "joystick";
  }

  // Rangée du haut, à droite (row-reverse : l'ordre CSS de chaque élément dit sa place, de droite à gauche) : ✕
  // toujours au coin haut droit, même quand la rangée passe sur deux lignes au téléphone, ≡ collé à sa gauche
  // (décision produit), puis 🚨, ❓ (posé par interfaceDocs.js > _aidePoserBouton dans l'en-tête marqué
  // kta-aide-ctx-entete) et ⚙️ : une seule ligne, même au téléphone (décision produit). Suivi / libre, vue, hauteur
  // (et son − / +), rendu et boussole sont dans la tuile ⚙️ (_basculerReglages) ; le mode reste montré par une
  // pastille hors de la tuile. Ordre de tabulation = ordre du DOM. Joystick (zone gauche) posé juste après la scène,
  // tuile en dernier : tout le reste passe au-dessus du joystick, la tuile au-dessus de tout.
  function _monterDom(stats) {
    const e = _e;
    const ov = document.createElement("div");
    ov.id = "kta-vue3d";
    ov.className = "kta-vue3d";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", _t("vue3d.titre"));
    ov.tabIndex = -1;
    const cv = document.createElement("canvas");
    cv.className = "kta-v3d-canvas";
    ov.appendChild(cv);
    if (e.commandes === "joystick") {
      // Zone du pouce gauche, sous la rangée du haut et au-dessus de la boussole (css/vue3d.css) ; l'anneau attend
      // en bas de la zone et vient sous le doigt où il se pose (_brancherStick).
      const zone = document.createElement("div");
      zone.className = "kta-v3d-stick-zone";
      zone.setAttribute("role", "group");
      zone.setAttribute("aria-label", _t("vue3d.joystick"));
      const anneau = document.createElement("div");
      anneau.className = "kta-v3d-stick kta-v3d-stick-repos";
      const bouton = document.createElement("div");
      bouton.className = "kta-v3d-stick-bouton";
      anneau.appendChild(bouton);
      zone.appendChild(anneau);
      ov.appendChild(zone);
      e.stickZone = zone; e.stickAnneau = anneau; e.stickBouton = bouton;
    }
    const haut = document.createElement("div");
    haut.className = "kta-v3d-haut kta-aide-ctx-entete";
    const fermer = _bouton(haut, "kta-v3d-fermer", "✕", _t("vue3d.fermer"), "fermer");
    fermer.setAttribute("data-aide-croix", "");
    // ≡ = le panneau ≡ Filtres de la carte ; titre et pastille posés par FilterPanel.majBadge
    // (data-kta-pastille-filtres).
    e.boutonFiltres = _bouton(haut, "kta-v3d-filtres", "≡", _t("ui.filter.title"), "filtres");
    e.boutonFiltres.setAttribute("aria-label", _t("ui.filter.aria"));
    e.boutonFiltres.setAttribute("data-kta-pastille-filtres", "");
    const urgence = _bouton(haut, "kta-v3d-urgence", "🚨", _t("ui.refonte.counter_sortie_title"), "urgence");
    urgence.setAttribute("aria-label", _t("ui.refonte.counter_sortie_title"));
    // ⚙️ ouvre la tuile des réglages de la vue (_basculerReglages) ; point doré si l'un n'est pas celui par défaut.
    e.boutonReglages = _bouton(haut, "kta-v3d-btn-reglages", "⚙️", _t("vue3d.reglages"), "reglages");
    e.boutonReglages.setAttribute("aria-expanded", "false");
    e.boutonReglages.setAttribute("aria-controls", "kta-v3d-reglages");
    // Tuile des réglages (décision produit : la rangée du haut tient sur une ligne au téléphone) : suivi / libre, vue,
    // hauteur et son − / +, rendu, chacun écrit en clair avec son état. Petit panneau ancré sous ⚙️.
    const tuile = document.createElement("div");
    tuile.id = "kta-v3d-reglages";
    tuile.className = "kta-v3d-reglages";
    tuile.setAttribute("role", "group");
    tuile.setAttribute("aria-label", _t("vue3d.reglages"));
    tuile.hidden = true;
    e.tuileReglages = tuile;
    e.boutonSuivre = _bouton(tuile, "kta-v3d-btn-mode kta-v3d-btn-suivre", "🧭", _t("vue3d.suivre"), "suivre");
    e.boutonVue = _bouton(tuile, "kta-v3d-btn-mode kta-v3d-vue", "🦅 " + _t("vue3d.plongee"), _t("vue3d.plongee"), "vue");
    e.boutonHauteur = _bouton(tuile, "kta-v3d-btn-mode kta-v3d-btn-hauteur", "", _t("vue3d.hauteur"), "hauteur");
    e.boutonHauteur.setAttribute("aria-expanded", "false");
    // Réglage de la hauteur : − valeur +, dans la tuile sous ⛏️, ouvert par lui.
    const regl = document.createElement("div");
    regl.className = "kta-v3d-hauteur";
    regl.setAttribute("role", "group");
    regl.setAttribute("aria-label", _t("vue3d.hauteurReglage"));
    regl.hidden = true;
    e.hauteurMoins = _bouton(regl, "", "−", _t("vue3d.hauteurMoins"), "hauteurMoins");
    e.hauteurValeur = document.createElement("span");
    e.hauteurValeur.className = "kta-v3d-hauteur-valeur";
    e.hauteurValeur.setAttribute("aria-live", "polite");
    regl.appendChild(e.hauteurValeur);
    e.hauteurPlus = _bouton(regl, "", "+", _t("vue3d.hauteurPlus"), "hauteurPlus");
    tuile.appendChild(regl);
    e.reglageHauteur = regl;
    // Rendu et textures des structures (🧱, réglage de cet appareil, actif par défaut) côte à côte : une ligne de
    // plus recouvrirait ▼ de l'inclinaison en vue plongeante, tuile ouverte.
    const ligneRendu = document.createElement("div");
    ligneRendu.className = "kta-v3d-reglages-ligne";
    tuile.appendChild(ligneRendu);
    e.boutonRendu = _bouton(ligneRendu, "kta-v3d-btn-mode kta-v3d-btn-rendu", "", "", "rendu");
    e.boutonTextures = _bouton(ligneRendu, "kta-v3d-btn-mode kta-v3d-btn-textures", "", _t("vue3d.texturesMontrer"),
      "textures");
    const icT = document.createElement("span");
    icT.className = "kta-v3d-btn-icone kta-v3d-btn-emoji";
    icT.setAttribute("aria-hidden", "true");
    icT.textContent = "🧱";
    e.boutonTextures.appendChild(icT);
    e.boutonTextures.appendChild(document.createTextNode(_t("vue3d.texturesNom")));
    // Boussole et guidage montrés ou non (réglages de cet appareil, montrés par défaut), côte à côte : une ligne de
    // plus aurait recouvert les boutons d'inclinaison (▼) en vue plongeante, tuile ouverte.
    const ligne = document.createElement("div");
    ligne.className = "kta-v3d-reglages-ligne";
    tuile.appendChild(ligne);
    // Boussole : la rose de la boussole 2D en icône.
    e.boutonBoussole = _bouton(ligne, "kta-v3d-btn-mode kta-v3d-btn-boussole", "", _t("vue3d.boussoleMontrer"),
      "boussole");
    const ic = document.createElement("img");
    ic.src = "icon/compass.svg"; ic.alt = ""; ic.className = "kta-v3d-btn-icone"; ic.draggable = false;
    e.boutonBoussole.appendChild(ic);
    e.boutonBoussole.appendChild(document.createTextNode(_t("vue3d.boussoleNom")));
    // Guidage : bandeau et chevrons, pas l'itinéraire.
    e.boutonGuidage = _bouton(ligne, "kta-v3d-btn-mode kta-v3d-btn-guidage", "", _t("vue3d.guidageMontrer"),
      "guidage");
    const icG = document.createElement("span");
    icG.className = "kta-v3d-btn-icone kta-v3d-btn-emoji";
    icG.setAttribute("aria-hidden", "true");
    icG.textContent = "🪧";
    e.boutonGuidage.appendChild(icG);
    e.boutonGuidage.appendChild(document.createTextNode(_t("vue3d.guidageNom")));
    ov.appendChild(haut);
    e.haut = haut;
    // Mode suivi / libre toujours visible hors de la tuile (c'est ce qui compte en marchant) : pastille discrète en
    // haut à gauche, non touchable (la bascule est dans la tuile, et la scène reste touchable autour).
    const indic = document.createElement("div");
    indic.className = "kta-v3d-mode-indic";
    indic.setAttribute("role", "status");
    ov.appendChild(indic);
    e.indicMode = indic;
    // Bandeau sous la rangée du haut : guidage de l'itinéraire (_majBandeau) ; les toasts de l'app et la fiche d'un
    // POI passent dessous (_majSousHaut).
    const bandeau = document.createElement("div");
    bandeau.className = "kta-v3d-bandeau";
    bandeau.setAttribute("aria-live", "polite");
    bandeau.hidden = true;
    ov.appendChild(bandeau);
    e.bandeau = bandeau;
    if (e.commandes === "pave") {
      const pad = document.createElement("div");
      pad.className = "kta-v3d-pad";
      _bouton(pad, "kta-v3d-tg", "↶", _t("vue3d.tournerGauche"), "tg");
      _bouton(pad, "kta-v3d-av", "▲", _t("vue3d.avancer"), "av");
      _bouton(pad, "kta-v3d-td", "↷", _t("vue3d.tournerDroite"), "td");
      _bouton(pad, "kta-v3d-ga", "◀", _t("vue3d.pasGauche"), "ga");
      _bouton(pad, "kta-v3d-ar", "▼", _t("vue3d.reculer"), "ar");
      _bouton(pad, "kta-v3d-dr", "▶", _t("vue3d.pasDroite"), "dr");
      ov.appendChild(pad);
      e.pave = pad;
    }
    // Inclinaison (vue plongeante seulement) : deux petits boutons à droite.
    const incl = document.createElement("div");
    incl.className = "kta-v3d-incl";
    incl.hidden = true;
    _bouton(incl, "kta-v3d-btn-petit", "▲", _t("vue3d.inclinaisonPlus"), "inclPlus");
    _bouton(incl, "kta-v3d-btn-petit", "▼", _t("vue3d.inclinaisonMoins"), "inclMoins");
    ov.appendChild(incl);
    e.boutonsIncl = incl;
    // Rose des vents (image de la boussole 2D, précachée).
    const bous = document.createElement("div");
    bous.className = "kta-v3d-boussole";
    bous.setAttribute("role", "img");
    bous.setAttribute("aria-label", _t("vue3d.boussole"));
    const rose = document.createElement("img");
    rose.className = "kta-v3d-rose";
    rose.src = "icon/compass.svg";
    rose.alt = "";
    rose.draggable = false;
    bous.appendChild(rose);
    ov.appendChild(bous);
    e.rose = rose; e.boussole = bous;
    _appliquerBoussole();
    _appliquerGuidage();
    _appliquerTextures();
    if (stats) {
      e.compteur = document.createElement("div");
      e.compteur.className = "kta-v3d-stats";
      ov.appendChild(e.compteur);
    }
    // Passage vers un autre niveau (🪜), à gauche, montré près d'un passage en mode libre (_majPassage).
    const niv = document.createElement("div");
    niv.className = "kta-v3d-niveaux";
    niv.setAttribute("role", "group");
    niv.setAttribute("aria-label", _t("vue3d.passage"));
    niv.hidden = true;
    ov.appendChild(niv);
    e.boiteNiveaux = niv;
    ov.appendChild(e.tuileReglages);
    document.body.appendChild(ov);
    e.ov = ov; e.cv = cv;
    document.documentElement.classList.add("kta-vue3d-ouverte");
    _majBoutonSuivre();
    _majHauteur();
    if (window.FilterPanel && typeof window.FilterPanel.majBadge === "function") window.FilterPanel.majBadge();
    _majSousHaut();
  }

  // ── Tuile des réglages (⚙️) ─────────────────────────────────────────────────────────────────────────
  // Ouverte sous ⚙️, alignée à droite ; fermée par ⚙️, Échap ou un toucher ailleurs dans la vue (_brancher).
  function _basculerReglages(ouvrir) {
    const e = _e, t = e && e.tuileReglages;
    if (!t) return false;
    const voulu = typeof ouvrir === "boolean" ? ouvrir : t.hidden;
    if (voulu === !t.hidden) return voulu;
    if (voulu) {
      const b = e.boutonReglages.getBoundingClientRect(), o = e.ov.getBoundingClientRect();
      t.style.top = Math.round(b.bottom - o.top + 6) + "px";
    } else if (e.reglageHauteur && !e.reglageHauteur.hidden) {
      _basculerReglageHauteur();
    }
    t.hidden = !voulu;
    e.boutonReglages.setAttribute("aria-expanded", voulu ? "true" : "false");
    return voulu;
  }

  // Boussole montrée ou masquée (config.js > getVue3DBoussole) ; masquée, rien ne bouge autour (joystick, 🪜).
  function _appliquerBoussole() {
    const e = _e, oui = typeof window.getVue3DBoussole !== "function" || window.getVue3DBoussole() === true;
    if (e.boussole) e.boussole.hidden = !oui;
    if (e.boutonBoussole) e.boutonBoussole.setAttribute("aria-pressed", oui ? "true" : "false");
    _majRepere();
    return oui;
  }

  function _basculerBoussole() {
    const e = _e;
    if (!e) return null;
    const oui = !(e.boussole && !e.boussole.hidden);
    if (typeof window.setVue3DBoussole === "function") window.setVue3DBoussole(oui);
    else if (e.boussole) e.boussole.hidden = !oui;
    return _appliquerBoussole();
  }

  // Guidage montré ou coupé en 3D (config.js > getVue3DGuidage) : relu au prochain passage de _majGuidage.
  function _guidageMontre() {
    return typeof window.getVue3DGuidage !== "function" || window.getVue3DGuidage() === true;
  }

  function _appliquerGuidage() {
    const e = _e, oui = _guidageMontre();
    if (e.boutonGuidage) e.boutonGuidage.setAttribute("aria-pressed", oui ? "true" : "false");
    e.guidageForce = true;
    e.sale = true;
    _majRepere();
    return oui;
  }

  function _basculerGuidage() {
    if (!_e) return null;
    const oui = !_guidageMontre();
    if (typeof window.setVue3DGuidage === "function") window.setVue3DGuidage(oui);
    return _appliquerGuidage();
  }

  // Structures texturées (🧱) ou aux couleurs de la légende (config.js > getVue3DTextures). Avant la scène,
  // l'état est la préférence ; ensuite celui de la vue (_materiaux).
  function _texturesActives() {
    return _e && typeof _e.textures === "boolean" ? _e.textures : _texturesVoulues();
  }

  function _appliquerTextures() {
    const e = _e;
    if (e.boutonTextures) e.boutonTextures.setAttribute("aria-pressed", _texturesActives() ? "true" : "false");
    _majRepere();
  }

  // Bascule : retenue sur l'appareil, tuiles refaites sur place (la scène, la greffe et la position ne bougent pas).
  function _basculerTextures() {
    const e = _e;
    if (!e) return null;
    const oui = !_texturesActives();
    if (typeof window.setVue3DTextures === "function") window.setVue3DTextures(oui);
    e.textures = oui;
    if (e.tuiles) _refaireTuiles();
    _appliquerTextures();
    return oui;
  }

  // Repère sur ⚙️ (un réglage n'est pas celui par défaut : mode libre, vue plongeante, rendu autre que mixte,
  // boussole masquée, guidage coupé, textures coupées) et
  // pastille du mode, hors de la tuile.
  function _majRepere() {
    const e = _e;
    if (!e || !e.boutonReglages) return;
    const modifie = e.mode === "libre" || e.vue === "plongee" || e.rendu !== "mixte" ||
      (!!e.boussole && e.boussole.hidden) || !_guidageMontre() || !_texturesActives();
    e.boutonReglages.classList.toggle("kta-v3d-modifie", modifie);
    const titre = _t("vue3d.reglages") + (modifie ? " · " + _t("vue3d.reglagesModifies") : "");
    e.boutonReglages.title = titre;
    e.boutonReglages.setAttribute("aria-label", titre);
    if (e.indicMode) {
      const suivi = e.mode === "suivi", txt = _t(suivi ? "vue3d.etatSuivi" : "vue3d.etatLibre");
      e.indicMode.textContent = suivi ? "🧭" : "🕹️";
      e.indicMode.title = txt;
      e.indicMode.setAttribute("aria-label", txt);
      e.indicMode.classList.toggle("kta-v3d-mode-libre", !suivi);
    }
  }

  // Bas de la rangée du haut (et du bandeau s'il est montré), en px, posé sur <html> : css/vue3d.css y descend la
  // pile des toasts de l'app pendant la vue. Refait au redimensionnement et à chaque ouverture / fermeture d'un
  // réglage ou du bandeau.
  function _majSousHaut() {
    const e = _e;
    if (!e || !e.haut) return;
    let bas = e.haut.getBoundingClientRect().bottom;
    // 🩸 Le bandeau se place sous la rangée seule : posé sous --kta-v3d-sous-haut, qui le compte, il descendrait
    // d'autant à chaque appel.
    if (e.bandeau) e.bandeau.style.top = Math.round(bas - e.ov.getBoundingClientRect().top + 8) + "px";
    if (e.bandeau && !e.bandeau.hidden) bas = Math.max(bas, e.bandeau.getBoundingClientRect().bottom);
    const v = Math.round(bas + 8) + "px";
    if (v === e.sousHaut) return;
    e.sousHaut = v;
    document.documentElement.style.setProperty("--kta-v3d-sous-haut", v);
  }

  // ── Hauteur des galeries (même chiffre que ⛏️ Volume exploité) ──────────────────────────────────────

  function _oeil(h) { return Math.min(OEIL, Math.max(0.4, h * 0.8)); }

  function _majHauteur() {
    const e = _e, txt = typeof window.formatDistance === "function" ? window.formatDistance(e.hauteur, 1)
      : e.hauteur.toFixed(1) + " m";
    // ⛏️ comme l'outil Volume exploité, dont c'est le même chiffre (↕ dit déjà « passage entre niveaux » en 2D).
    if (e.boutonHauteur) e.boutonHauteur.textContent = "⛏️ " + txt;
    if (e.hauteurValeur) e.hauteurValeur.textContent = txt;
    if (e.hauteurMoins) e.hauteurMoins.disabled = e.hauteur <= HAUTEUR_REGLAGE.min;
    if (e.hauteurPlus) e.hauteurPlus.disabled = e.hauteur >= HAUTEUR_REGLAGE.max;
  }

  function _basculerReglageHauteur() {
    const e = _e, r = e.reglageHauteur;
    if (!r) return;
    r.hidden = !r.hidden;
    e.boutonHauteur.setAttribute("aria-expanded", r.hidden ? "false" : "true");
    _majSousHaut();
  }

  // Hauteur bornée à HAUTEUR_REGLAGE et arrondie à 0,1 m, écrite pour le plan (⛏️ Volume exploité la relit), puis
  // tuiles refaites à cette hauteur (structures, tubes, remblais, murs, rideaux, plafond, œil) ; position, cap, niveau
  // et rendu gardés. Une hauteur saisie hors bornes dans ⛏️ est montrée telle quelle jusqu'au premier − / +.
  // Rend la hauteur retenue (null : vue fermée).
  function reglerHauteur(m) {
    const e = _e;
    if (!e) return null;
    const v = Math.round(Math.max(HAUTEUR_REGLAGE.min, Math.min(HAUTEUR_REGLAGE.max, Number(m))) * 10) / 10;
    if (!Number.isFinite(v)) return e.hauteur;
    if (typeof window.setPlanHauteurGalerie === "function") window.setPlanHauteurGalerie(null, v);
    if (v !== e.hauteur) {
      e.hauteur = v;
      e.oeil = _oeil(v);
      _refaireTuiles();
    }
    _majHauteur();
    return v;
  }

  function _compter(o, cle) { o[cle] = (o[cle] || 0) + 1; }

  // ── Fenêtres de l'app au-dessus de la vue, clavier ──────────────────────────────────────────────────

  // Une fenêtre de l'app couvre la vue (au centre de l'écran, un élément qui n'est pas de la vue) ? Les toasts ne
  // comptent pas : ils laissent passer les touchers (pointer-events: none), elementFromPoint les ignore aussi.
  function _recouverte() {
    const e = _e, r = e.ov.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el && !e.ov.contains(el);
  }

  // Tab reste dans la vue (fenêtre modale) : du dernier bouton on revient au premier, et inversement.
  function _tabulation(ev) {
    const e = _e, liste = Array.prototype.filter.call(e.ov.querySelectorAll("button"), function (b) {
      return !b.disabled && b.offsetParent !== null;
    });
    if (!liste.length) return;
    const i = liste.indexOf(document.activeElement), der = liste.length - 1;
    const cible = ev.shiftKey ? (i <= 0 ? liste[der] : null) : (i < 0 || i === der ? liste[0] : null);
    if (!cible) return;
    ev.preventDefault();
    ev.stopPropagation();
    cible.focus();
  }

  // ≡ = le panneau ≡ Filtres de la carte (filterPanel.js), posé par-dessus la vue : un seul état, partagé.
  function _ouvrirFiltres() {
    if (window.FilterPanel && typeof window.FilterPanel.ouvrir === "function") window.FilterPanel.ouvrir();
  }

  // 🚨 = le bouton de l'en-tête (SortieUrgence.declencher). Sans position connue du tracker, elle se demande sur la
  // carte 2D : la vue se ferme d'abord, sinon le pointeur « Où es-tu ? » resterait sous elle.
  function _urgence() {
    const S = window.SortieUrgence;
    if (!S || typeof S.declencher !== "function") {
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast(_t("ui.refonte.sortie_indispo"), "error");
      }
      return;
    }
    if (typeof S.demandeLaCarte === "function" && S.demandeLaCarte()) {
      fermer().then(function () { S.declencher(); });
      return;
    }
    S.declencher();
  }

  function _brancher() {
    const e = _e, l = e.ecouteurs;
    const on = function (cible, type, f, opt) { cible.addEventListener(type, f, opt); l.push([cible, type, f, opt]); };
    // Boutons maintenus (déplacement) : pointerdown → actif jusqu'au relâchement ou à la sortie du bouton.
    const relacher = function () {
      ["av", "ar", "tg", "td", "ga", "dr"].forEach(function (k) { e.touches[k] = false; });
      e.avDepuis = 0;
    };
    // 🩸 ✕, ≡ et 🚨 agissent au `click`, jamais au pointerdown : ce qui s'ouvre ou disparaît sous le doigt recevait
    // le clic du même toucher (vue retirée : 🚨 de l'en-tête dessous ; panneau ouvert : son fond, qui le referme).
    on(e.ov, "click", function (ev) {
      const b = ev.target.closest && ev.target.closest('[data-v3d]');
      const a = b && b.dataset.v3d;
      if (a === "fermer") fermer();
      else if (a === "filtres") _ouvrirFiltres();
      else if (a === "reglages") _basculerReglages();
      else if (a === "urgence") _urgence();
      else if (a === "ficheFermer") _fermerFiche();
      // Action de la fiche qui mène ailleurs (déjà jouée par utils.js > _ktaPopupAction, en capture) : la fiche se
      // ferme, comme la bulle de la carte.
      const act = !a && ev.target.closest && ev.target.closest(".kta-v3d-fiche [data-kta-act]");
      if (act && ["ici", "aller", "etape"].indexOf(act.dataset.ktaAct) >= 0) _fermerFiche();
    });
    on(e.ov, "pointerdown", function (ev) {
      const b = ev.target.closest && ev.target.closest("[data-v3d]");
      if (!b) return;
      const a = b.dataset.v3d;
      if (a === "fermer" || a === "filtres" || a === "urgence" || a === "ficheFermer" || a === "reglages") return;
      if (a === "vue") { basculerVue(); return; }
      if (a === "boussole") { _basculerBoussole(); return; }
      if (a === "guidage") { _basculerGuidage(); return; }
      if (a === "textures") { _basculerTextures(); return; }
      if (a === "rendu") { basculerRendu(); return; }
      if (a === "hauteur") { _basculerReglageHauteur(); return; }
      if (a === "hauteurMoins" || a === "hauteurPlus") {
        ev.preventDefault();
        const pas = (a === "hauteurPlus" ? e.hauteur : e.hauteur - 0.1) >= HAUTEUR_PAS_FIN ? 0.5 : 0.1;
        reglerHauteur(e.hauteur + (a === "hauteurPlus" ? pas : -pas));
        return;
      }
      if (a === "niveauHaut" || a === "niveauBas") { changerNiveau(a === "niveauHaut" ? "haut" : "bas"); return; }
      if (a === "niveau") {
        _allerNiveau(e.passageCibles && e.passageCibles.liste[Number(b.dataset.indice)]);
        return;
      }
      if (a === "suivre") { basculerSuivi(); return; }
      if (a === "inclPlus" || a === "inclMoins") {
        ev.preventDefault();
        incliner(a === "inclPlus" ? INCLINAISON.pas * 2 : -INCLINAISON.pas * 2);
        return;
      }
      ev.preventDefault();
      _codeBas(a === "ar");
      e.touches[a] = true;
      // Appui long sur ▲ = pas rapide (pendant de Maj au clavier). Même base de temps que requestAnimationFrame.
      if (a === "av") e.avDepuis = performance.now();
    });
    on(window, "pointerup", relacher);
    on(window, "pointercancel", relacher);
    // Toucher ailleurs que dans la tuile ou sur ⚙️ : la tuile se ferme (le toucher garde son effet).
    on(e.ov, "pointerdown", function (ev) {
      const t = e.tuileReglages;
      if (!t || t.hidden || t.contains(ev.target) || e.boutonReglages.contains(ev.target)) return;
      _basculerReglages(false);
    }, true);
    if (e.stickZone) _brancherStick(on);
    on(e.ov, "pointerout", function (ev) { if (ev.target.dataset && ev.target.dataset.v3d) relacher(); });
    // Glisser sur la scène : un doigt tourne (horizontal) et lève / baisse les yeux (vertical) ; deux doigts,
    // glissés à la verticale, inclinent la vue plongeante (vers le haut = plus rasante).
    let glisse = null;
    const doigts = new Map();
    // Toucher bref et immobile (< 8 px, < 0,5 s) : un panneau de POI jonction ? (_toucher).
    let tape = null;
    on(e.cv, "pointerdown", function (ev) {
      tape = doigts.size === 0 ? { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: performance.now() } : null;
      doigts.set(ev.pointerId, ev.clientY);
      glisse = doigts.size === 1 ? { x: ev.clientX, y: ev.clientY } : null;
      try { e.cv.setPointerCapture(ev.pointerId); } catch (err) { /* pointeur déjà relâché */ }
    });
    on(e.cv, "pointermove", function (ev) {
      if (doigts.size >= 2 && doigts.has(ev.pointerId)) {
        const dy = ev.clientY - doigts.get(ev.pointerId);
        doigts.set(ev.pointerId, ev.clientY);
        if (e.vue === "plongee" && dy) incliner(dy * 0.15 / doigts.size);
        return;
      }
      if (!glisse) return;
      const dx = ev.clientX - glisse.x, dy = ev.clientY - glisse.y;
      glisse = { x: ev.clientX, y: ev.clientY };
      // 🩸 En suivi, le cap est celui de l'appareil : glisser ne règle que le regard haut/bas. Tourner au doigt
      // quittait le suivi au moindre toucher (un tap bouge toujours d'un pixel ou deux).
      if (dx && e.mode !== "suivi") e.cap = (e.cap + dx * 0.25 + 360) % 360;
      e.tangage = Math.max(-1, Math.min(1, e.tangage - dy * 0.004));
      e.sale = true;
    });
    const lever = function (ev) {
      doigts.delete(ev.pointerId);
      glisse = null;
      if (ev.type === "pointerup" && tape && tape.id === ev.pointerId && doigts.size === 0 &&
          Math.hypot(ev.clientX - tape.x, ev.clientY - tape.y) < 8 && performance.now() - tape.t < 500) {
        _toucher(ev.clientX, ev.clientY);
      }
      tape = null;
    };
    on(e.cv, "pointerup", lever);
    on(e.cv, "pointercancel", lever);
    // Molette (PC) : incline la vue plongeante (vers soi = plus verticale).
    on(e.cv, "wheel", function (ev) {
      if (e.vue !== "plongee") return;
      ev.preventDefault();
      incliner(ev.deltaY < 0 ? INCLINAISON.pas : -INCLINAISON.pas);
    }, { passive: false });
    on(window, "kta:northOffsetChange", function () { _lireNord(); });
    // Itinéraire tracé, remplacé ou effacé pendant la vue (🚨, fiche, guidage) : scène refaite à l'image suivante,
    // bandeau et chevrons relus aussitôt.
    on(window, "kta:itineraireChange", function () { e.itiChange = true; e.guidageForce = true; e.apS = undefined; });
    // Ronds d'intersection redessinés par la carte (option, filtres, tracés) : refaits à l'image suivante.
    on(window, "kta:intersectionsChange", function () { e.rondsChange = true; });
    on(e.cv, "contextmenu", function (ev) { ev.preventDefault(); });
    // Clavier : capturé pendant que la vue est ouverte (les raccourcis de la carte ne partent pas dessous).
    // Une fenêtre de l'app par-dessus la vue (≡ Filtres, Aide, Sortie d'urgence, confirmation) garde ses touches :
    // Échap la ferme, elle, et les flèches ne déplacent pas la scène dessous.
    on(document, "keydown", function (ev) {
      if (_recouverte()) return;
      if (ev.key === "Escape") {
        ev.stopPropagation(); ev.preventDefault();
        // Échap ferme d'abord la tuile des réglages (et la hauteur qu'elle montre), une fiche, puis la vue.
        if (e.tuileReglages && !e.tuileReglages.hidden) { _basculerReglages(false); return; }
        if (e.reglageHauteur && !e.reglageHauteur.hidden) { _basculerReglageHauteur(); return; }
        if (_fermerFiche()) return;
        fermer();
        return;
      }
      if (ev.key === "Tab") { _tabulation(ev); return; }
      if (ev.code === "KeyV") { ev.stopPropagation(); basculerVue(); return; }
      if (ev.key === "PageUp" || ev.key === "PageDown") {
        ev.stopPropagation(); ev.preventDefault();
        incliner(ev.key === "PageUp" ? INCLINAISON.pas : -INCLINAISON.pas);
        return;
      }
      if (ev.key === "Shift") e.touches.Shift = true;
      const a = TOUCHES[ev.code];
      if (!a) return;
      ev.stopPropagation(); ev.preventDefault();
      if (!ev.repeat) _codeBas(a === "ar");
      e.touches[a] = true;
    }, true);
    on(document, "keyup", function (ev) {
      if (ev.key === "Shift") e.touches.Shift = false;
      const a = TOUCHES[ev.code];
      if (a) { e.touches[a] = false; ev.stopPropagation(); }
    }, true);
    on(window, "blur", function () { relacher(); _lacherStick(); });
    on(window, "resize", function () { _majSousHaut(); });
    // Filtres de la carte changés (ici ou en 2D) : la scène est refaite à l'image suivante, une fois même si
    // plusieurs cases changent d'un coup (« Tout masquer »).
    if (window.FilterPanel && typeof window.FilterPanel.onChange === "function") {
      e.desabonner = window.FilterPanel.onChange(function () { if (_e) _e.filtresChanges = true; });
    }
    // 🩸 Contexte perdu (mémoire graphique iOS, onglet longtemps en fond) : preventDefault demande au navigateur de
    // le rendre. On attend ATTENTE_REPRISE d'écran visible (un onglet caché n'est pas rendu avant d'être revu),
    // puis on ferme avec un message plutôt qu'un écran noir figé.
    on(e.cv, "webglcontextlost", function (ev) {
      ev.preventDefault();
      console.warn("[Vue3D] contexte WebGL perdu : attente de la reprise");
      e.perdu = true;
      e.msPerdu = 0;
      relacher();
      let t0 = performance.now();
      clearInterval(e.minuterie);
      e.minuterie = setInterval(function () {
        const t = performance.now();
        if (document.visibilityState !== "hidden") e.msPerdu += t - t0;
        t0 = t;
        if (e.perdu && e.msPerdu >= e.attenteReprise) _fermerSansContexte();
      }, Math.min(500, e.attenteReprise));
    });
    // Reprise : three.js a déjà refait son état (son écouteur passe avant celui-ci). La scène est remontée à neuf.
    // 🩸 Jamais dispose() sur les objets d'avant la perte : leurs écouteurs appartiennent à l'ancien état de
    // three.js et effaceraient sur le nouveau contexte des objets qui n'en sont pas (« object does not belong to
    // this context »). Leur mémoire GPU est morte avec l'ancien contexte ; le ramasse-miettes prend le reste.
    on(e.cv, "webglcontextrestored", function () {
      clearInterval(e.minuterie);
      e.perdu = false;
      e.reprises++;
      e.tuiles.forEach(function (t) { t.obj = null; });
      e.chevrons = null; e.chevSig = null; e.guidageForce = true;   // même règle : jamais dispose() d'avant la perte
      e.marqueursIti = null; e.ronds = null; e.geoMarqueur = null;
      _monterScene();
      _reindexer();
      _appliquerVue();
      e.w = 0;          // taille et projection reposées à la prochaine image
      e.sale = true;
      console.log("[Vue3D] contexte WebGL repris, scène remontée");
    });
  }

  // ── Joystick (téléphone) ─────────────────────────────────────────────────────────────────────────────
  // ⚠️ contrat (décision produit) : un doigt posé dans la zone gauche fait apparaître l'anneau sous lui ; le bouton
  // suit le doigt jusqu'à JOYSTICK.debattement px. Au-delà de la zone morte, vitesse proportionnelle (0 → VITESSE),
  // axe vertical = avancer / reculer, horizontal = pas de côté, dans une seule direction (_image) ; débattement au-delà
  // de JOYSTICK.course tenu APPUI_LONG = course (× FACTEUR_RAPIDE). Sortir de la zone morte passe en libre (un
  // toucher bref sans bouger ne quitte pas le suivi : c'est peut-être un panneau, ouvert par _toucher). Un doigt à la
  // fois ; le doigt du joystick n'est pas sur la scène, il ne compte ni pour le regard ni pour l'inclinaison à deux
  // doigts. 🩸 `touch-action: none` sur la zone (css), sinon le navigateur fait défiler ou zoomer.
  function _brancherStick(on) {
    const e = _e, zone = e.stickZone;
    on(zone, "pointerdown", function (ev) {
      if (e.stick) return;
      ev.preventDefault();
      const r = zone.getBoundingClientRect();
      e.stick = { id: ev.pointerId, cx: ev.clientX, cy: ev.clientY, x0: ev.clientX - r.left, y0: ev.clientY - r.top,
        m: 0, ang: 0, d: 0, fortDepuis: 0, t: performance.now(), bouge: false, bas: false, ailleurs: false,
        horsMorte: 0 };
      try { zone.setPointerCapture(ev.pointerId); } catch (err) { /* pointeur synthétique ou déjà relâché */ }
      e.stickAnneau.classList.remove("kta-v3d-stick-repos");
      e.stickAnneau.classList.add("kta-v3d-stick-actif");
      e.stickAnneau.style.left = Math.round(e.stick.x0) + "px";
      e.stickAnneau.style.top = Math.round(e.stick.y0) + "px";
      e.stickBouton.style.transform = "";
    });
    on(zone, "pointermove", function (ev) {
      const st = e.stick;
      if (!st || ev.pointerId !== st.id) return;
      const dx = ev.clientX - st.cx, dy = ev.clientY - st.cy, d = Math.hypot(dx, dy), D = JOYSTICK.debattement;
      const k = d > D ? D / d : 1;
      e.stickBouton.style.transform = "translate(" + Math.round(dx * k) + "px, " + Math.round(dy * k) + "px)";
      st.d = d;
      st.m = d <= JOYSTICK.morte ? 0 : Math.min(1, (d - JOYSTICK.morte) / (D - JOYSTICK.morte));
      st.ang = Math.atan2(dx, -dy) * 180 / Math.PI;   // 0 = devant, 90 = pas à droite
      if (d > JOYSTICK.course * D) { if (!st.fortDepuis) st.fortDepuis = performance.now(); } else st.fortDepuis = 0;
      if (st.m > 0 && !st.bouge) { st.bouge = true; e.stickLibres++; _passerEnLibre(); }
      if (st.m > 0) {
        if (!st.horsMorte) st.horsMorte = performance.now();
        if (Math.abs(st.ang) > CODE_BAS.angle) st.bas = true; else st.ailleurs = true;
      }
      e.sale = true;
    });
    const lacher = function (ev) {
      const st = e.stick;
      if (!st || ev.pointerId !== st.id) return;
      const tape = ev.type === "pointerup" && !st.bouge && st.d < 8 && performance.now() - st.t < 500;
      if (ev.type === "pointerup" && st.bouge) {
        _codeBas(st.bas && !st.ailleurs && performance.now() - st.horsMorte < CODE_BAS.coup);
      }
      _lacherStick();
      if (tape) _toucher(ev.clientX, ev.clientY);
    };
    on(zone, "pointerup", lacher);
    on(zone, "pointercancel", lacher);
  }

  function _lacherStick() {
    const e = _e;
    if (!e || !e.stickAnneau) return;
    e.stick = null;
    e.stickAnneau.classList.add("kta-v3d-stick-repos");
    e.stickAnneau.classList.remove("kta-v3d-stick-actif");
    e.stickAnneau.style.left = e.stickAnneau.style.top = "";
    e.stickBouton.style.transform = "";
  }

  // « Six pieds sous terre » (CODE_BAS) : un appui vers le bas compte, toute autre commande de déplacement remet à 0.
  function _codeBas(bas) {
    const e = _e, c = e.codeBas, t = performance.now();
    if (!bas) { c.n = 0; return; }
    if (!c.n || t - c.t0 > CODE_BAS.ms) { c.n = 0; c.t0 = t; }
    if (++c.n < CODE_BAS.n) return;
    c.n = 0;
    e.codesBas++;
    window.dispatchEvent(new CustomEvent("kta:vue3dCode", { detail: { code: "bas6" } }));
    _lancerAddon("bas6");
  }

  // ⚠️ contrat : un code lance l'add-on qui lui est lié (addons/<nom>/), chargé à la première fois (script classique,
  // même origine, précaché par sw.js). L'add-on s'inscrit dans window.KtaAddons[<nom>] = { lancer() } ; c'est lui
  // qui décide s'il démarre (refus, confirmation) puis se greffe (greffer). Rien d'autre ne le charge.
  const ADDONS_CODE = { bas6: { nom: "mkmg", src: "addons/mkmg/js/coeur.js" } };
  const _addonsEnCours = {};
  function _lancerAddon(code) {
    const a = ADDONS_CODE[code];
    if (!a) return;
    const lancer = function () {
      const x = window.KtaAddons && window.KtaAddons[a.nom];
      if (x && typeof x.lancer === "function" && _e) x.lancer();
    };
    if (window.KtaAddons && window.KtaAddons[a.nom]) { lancer(); return; }
    if (_addonsEnCours[a.nom]) return;
    _addonsEnCours[a.nom] = true;
    const s = document.createElement("script");
    s.src = a.src;
    s.addEventListener("load", function () { _addonsEnCours[a.nom] = false; lancer(); });
    s.addEventListener("error", function () {
      _addonsEnCours[a.nom] = false;
      if (s.parentNode) s.parentNode.removeChild(s);
      console.warn("[Vue3D] add-on « " + a.nom + " » introuvable");
    });
    document.head.appendChild(s);
  }

  // ── Greffe : prise NEUTRE pour un add-on (addons/<nom>/), rien sans greffon ──────────────────────────────
  // ⚠️ contrat : KtaVue3D.greffer(g) → fonction qui retire la greffe, ou null (vue fermée, greffe déjà posée).
  // Une greffe à la fois, qui vit avec la vue ouverte. g = { nom, scene(ctx, raison), surImage(ctx, dt),
  // demonter(ctx, raison) }, tous facultatifs :
  //   scene : appelé à la greffe ("greffe"), après chaque scène refaite ("refaite" : niveau, rendu, hauteur, filtres,
  //     itinéraire) et après une perte du contexte WebGL ("reprise" : ctx.groupe est NEUF, les objets d'avant sont
  //     morts avec l'ancien contexte, jamais dispose()) ;
  //   surImage : à chaque image tant que la vue rend (pas pendant une perte de contexte) ; la vue ne dessine que si
  //     quelque chose a bougé : un greffon animé appelle ctx.sale() ;
  //   demonter : retrait ("degreffe"), fermeture de la vue ("fermeture"), contexte non repris ("contexte"),
  //     erreur du greffon ("erreur") ; le greffon y libère ce qu'il a créé, la vue retire ctx.groupe et ctx.hud.
  // ctx (lu à l'appel) : THREE, groupe (THREE.Group dans la scène, mètres), hud (calque sous le bandeau, au-dessus
  // de la scène, sous les commandes ; pointer-events à poser par le greffon sur ses enfants), camera, niveau, hauteur,
  // sc (px/m), pos {x, y} (px plan), cap, rendu, mode, vue, commandes, sale() ; règle du pas de la vue, jamais une
  // copie (px plan) : bloque(x0, y0, x1, y1) = un corps ne passe pas, ligneBloquee(x0, y0, x1, y1) = ligne de vue
  // coupée, libre(x, y) = place où un corps tient (hors des structures DESSINÉES : un calque masqué n'y compte pas).
  // court = pas rapide en cours. regler({ traces, itineraire, guidage, course, avatar, commandes }) : false masque,
  // pour la greffe seulement, les tracés au sol (les tubes des galeries restent), l'itinéraire de l'app (ruban,
  // étapes, 🏁), son guidage (bandeau, chevrons), la silhouette dorée de la vue plongeante, le joystick et le pavé,
  // ou interdit le pas rapide ; levé au retrait. Les filtres de la carte n'en savent rien.
  // 🔒 Une exception dans un appel retire la greffe (la vue continue). La greffe ne touche ni tracker, ni session, ni
  // filtres : elle n'a que ce ctx.
  function greffer(g) {
    const e = _e;
    if (!e || e.greffe || !g || typeof g !== "object") return null;
    const hud = document.createElement("div");
    hud.className = "kta-v3d-greffe";
    e.cv.insertAdjacentElement("afterend", hud);
    const gr = { g: g, nom: String(g.nom || "greffe"), hud: hud, groupe: new THREE.Group(), raison: "greffe",
      appels: { scene: 0, image: 0 }, reglage: {} };
    e.scene.add(gr.groupe);
    gr.ctx = _ctxGreffe(gr);
    e.greffe = gr;
    console.log("[Vue3D] greffe « " + gr.nom + " » posée");
    _sceneGreffe();
    if (_e) _e.sale = true;
    return function () { if (_e && _e.greffe === gr) _degreffer("degreffe"); };
  }

  function _ctxGreffe(gr) {
    return {
      THREE: THREE, hud: gr.hud,
      get groupe() { return gr.groupe; },
      get camera() { return _e.camera; },
      get niveau() { return _e.niveau; },
      get hauteur() { return _e.hauteur; },
      get sc() { return _e.sc; },
      get pos() { return { x: _e.pos.x, y: _e.pos.y }; },
      get cap() { return _e.cap; },
      get rendu() { return _e.rendu; },
      get mode() { return _e.mode; },
      get vue() { return _e.vue; },
      get commandes() { return _e.commandes; },
      get court() { return !!_e.rapide; },
      sale: function () { if (_e) _e.sale = true; },
      regler: function (r) {
        if (!_e || _e.greffe !== gr || !r) return;
        const change = {};
        ["traces", "itineraire", "guidage", "course", "avatar", "commandes"].forEach(function (k) {
          if ((r[k] === true || r[k] === false) && _permisGreffe(k) !== r[k]) { gr.reglage[k] = r[k]; change[k] = true; }
        });
        // Scène refaite seulement si ce qu'elle dessine change (la course ne coûte rien).
        if (change.traces || change.itineraire) _e.filtresChanges = true;
        if (change.guidage || change.itineraire) { _e.guidageForce = true; _e.apS = undefined; }
        if (change.avatar) _e.avatar.visible = _e.vue === "plongee" && _permisGreffe("avatar");
        if (change.commandes) _montrerCommandes(_permisGreffe("commandes"));
        _e.sale = true;
      },
      bloque: function (x0, y0, x1, y1) {
        const l = Math.hypot(x1 - x0, y1 - y0);
        if (!_e || l < 1e-9) return false;
        const n = _balayage(x0, y0, x1, y1, (x1 - x0) / l, (y1 - y0) / l);
        return n < 0 || (n > 0 && n > _rayonsBloques(x0, y0));
      },
      ligneBloquee: function (x0, y0, x1, y1) { return !!_e && !!_juger([[x0, y0, x1, y1]])[0]; },
      // 🩸 La règle du pas ignore la structure où l'on se trouve déjà (on en sort) : la place est donc aussi
      // testée hors des volumes dessinés et corps dégagé (aucun rayon bloqué).
      libre: function (x, y) {
        return !!_e && !_coince(x, y) && !_volumeContenant(x / _e.sc, y / _e.sc) && _rayonsBloques(x, y) === 0;
      }
    };
  }

  // Joystick et pavé montrés ou retirés (greffe : regler({ commandes: false }), ex. une carte à toucher là où est le
  // pouce). 🩸 display en style, pas `hidden` : le pavé est en display: grid (css/vue3d.css), qui l'emporte.
  function _montrerCommandes(oui) {
    const e = _e;
    if (!e) return;
    if (!oui) { _lacherStick(); e.touches = {}; }
    [e.stickZone, e.pave].forEach(function (el) { if (el) el.style.display = oui ? "" : "none"; });
  }

  // Réglage de la greffe (ctx.regler) : false = masqué / interdit ; sans greffe ou sans réglage, tout est permis.
  function _permisGreffe(k) {
    const gr = _e && _e.greffe;
    return !gr || gr.reglage[k] !== false;
  }

  function _sceneGreffe() {
    const gr = _e && _e.greffe;
    if (!gr) return;
    const raison = gr.raison || "refaite";
    gr.raison = null;
    gr.appels.scene++;
    _appelGreffe("scene", raison);
  }

  function _appelGreffe(nom, arg) {
    const gr = _e && _e.greffe;
    if (!gr || typeof gr.g[nom] !== "function") return;
    try { gr.g[nom](gr.ctx, arg); } catch (err) {
      console.warn("[Vue3D] greffe « " + gr.nom + " » retirée (" + nom + ") :", err && err.message);
      _degreffer("erreur");
    }
  }

  function _degreffer(raison) {
    const e = _e, gr = e && e.greffe;
    if (!gr) return;
    e.greffe = null;
    if (typeof gr.g.demonter === "function") {
      try { gr.g.demonter(gr.ctx, raison); } catch (err) {
        console.warn("[Vue3D] greffe « " + gr.nom + " » : démontage en erreur :", err && err.message);
      }
    }
    if (gr.groupe.parent) gr.groupe.parent.remove(gr.groupe);
    if (gr.hud.parentNode) gr.hud.parentNode.removeChild(gr.hud);
    if (Object.keys(gr.reglage).length) { e.filtresChanges = true; e.guidageForce = true; e.apS = undefined; }
    if (gr.reglage.avatar === false && e.avatar) e.avatar.visible = e.vue === "plongee";
    if (gr.reglage.commandes === false) _montrerCommandes(true);
    e.sale = true;
    console.log("[Vue3D] greffe « " + gr.nom + " » retirée (" + raison + ")");
  }

  function _fermerSansContexte() {
    console.warn("[Vue3D] contexte WebGL non repris : vue fermée");
    _demonter("contexte");
    _toast(_t("vue3d.contextePerdu"));
  }

  // ── API ────────────────────────────────────────────────────────────────────────────────────────────

  // Refus avec un message (le bouton de la barre fait le même test avant de charger quoi que ce soit) : sans
  // échelle, 1 px vaudrait 1 m et la scène serait fausse sans le dire.
  function ouvrir(opts) {
    const o = opts || {};
    if (_e) return Promise.resolve(true);
    if (!window.map || !window.PLAN_CONFIG || !window.APP_CONFIG) {
      _alerte("vue3d.sansPlan");
      return Promise.resolve(false);
    }
    if (!_echelle()) { _alerte("vue3d.sansEchelle"); return Promise.resolve(false); }
    return Promise.all([_chargerThree(), _chargerCss()]).catch(function (err) {
      console.warn("[Vue3D] three.js introuvable :", err && err.message);
      _alerte("vue3d.chargementImpossible");
      return null;
    }).then(function (charges) {
      if (!charges) return false;
      if (_e) return true;
      const sc = _echelle();
      const hauteur = (typeof window.getPlanHauteurGalerie === "function" && window.getPlanHauteurGalerie()) ||
        HAUTEUR_DEFAUT;
      const pos = o.depart ||
        (typeof window.getTrackingPosition === "function" ? window.getTrackingPosition() : null) ||
        { x: window.PLAN_CONFIG.plan.imageWidth / 2, y: window.PLAN_CONFIG.plan.imageHeight / 2 };
      const cap = o.depart && Number.isFinite(o.depart.cap) ? o.depart.cap
        : (typeof window.getPlanRelHeading === "function" ? Number(window.getPlanRelHeading()) || 0 : 0);
      _e = {
        sc: sc, hauteur: hauteur, oeil: _oeil(hauteur),
        distance: o.distanceVue > 0 ? o.distanceVue : DISTANCE_VUE, tuilesActives: o.tuiles !== false,
        pos: { x: pos.x, y: pos.y }, cap: cap, tangage: 0, vue: "yeux",
        mode: o.depart || !_trackerActif() ? "libre" : "suivi",
        touches: {}, ecouteurs: [], tuiles: new Map(), couleurs: new Map(), sale: true, images: 0, butees: 0,
        msIndex: 0, msTuiles: 0, compteurN: 0, compteurT0: 0, w: 0, h: 0, aBouge: false, perdu: false,
        msPerdu: 0, reprises: 0, minuterie: null, inclinaison: INCLINAISON.defaut, nord: 0, nordCalibre: false,
        roseAngle: NaN, rendu: "structures", galerie: null, passages: [], passageSig: null, passageCibles: null,
        volPassages: [], geste: null, dy: 0, fondu: null, fonduOp: 0, bandeauNiveau: null, bandeauNiveauFin: 0,
        niveauLibre: null, actifVu: null, changementsNiveau: 0, poiMasques: 0,
        zonesDecoupees: {}, rideaux: [], facesRemblais: 0, facesEboulis: 0, rubans: {}, liseres: {},
        filtresChanges: false,
        virage: false, desabonner: null, sousHaut: null, degagements: 0, sortie: null,
        itiChange: false, guidageT: 0, guidageForce: true,
        apS: undefined, bandeauCle: null, bandeauEtat: { visible: false }, chevrons: null, chevSig: null,
        chevRoad: null, chevPts: null, nChevrons: 0, fiche: null, publiee: null, publications: 0,
        publicationDite: false, libreBouge: false, commandes: _commandesVoulues(o.commandes), stick: null,
        stickLibres: 0, toucheNom: null, itiTirets: 0, nbMarqueurs: { etapes: 0, arrivee: false }, listeRonds: [],
        rondsChange: false, greffe: null, codeBas: { n: 0, t0: 0 }, codesBas: 0,
        retourFocus: o.retourFocus || document.activeElement || null,
        attenteReprise: o.attenteReprise > 0 ? o.attenteReprise : ATTENTE_REPRISE
      };
      const t0 = performance.now();
      _monterDom(!!o.stats);
      try {
        _e.renderer = new THREE.WebGLRenderer({ canvas: _e.cv, stencil: true, antialias: (window.devicePixelRatio || 1) < 2,
          powerPreference: "high-performance" });
      } catch (err) {
        console.warn("[Vue3D] WebGL indisponible :", err && err.message);
        _demonter("indisponible");
        _alerte("vue3d.indisponible");
        return false;
      }
      // Densité plafonnée : au-delà de 2, le coût de remplissage (x 2,25 de 2 à 3) ne se voit pas à l'œil.
      _e.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.densiteMax > 0 ? o.densiteMax : 2));
      // Tons compressés : une face claire (pilier doré) éclairée de près ne sature pas en aplat.
      _e.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      _monterScene();
      _lireNord();
      _brancher();
      _redimensionner();
      _reindexer();
      if (_e.mode === "libre") _degager();   // en suivi, la place est celle du tracker
      _appliquerVue();
      _placerCamera();
      _e.msOuverture = performance.now() - t0;
      _e.raf = requestAnimationFrame(_image);
      // Focus dans la fenêtre (Tab y reste, _tabulation) ; rendu à l'appelant à la fermeture.
      try { _e.ov.focus({ preventScroll: true }); } catch (err) { /* focus refusé : sans effet sur la vue */ }
      console.log("[Vue3D] ouverte en " + Math.round(_e.msOuverture) + " ms (" + _e.tuiles.size + " tuiles)");
      return true;
    });
  }

  function _demonter(raison) {
    const e = _e;
    if (!e) return;
    _derniereFermeture = raison || "utilisateur";
    if (e.greffe) _degreffer(_derniereFermeture === "utilisateur" ? "fermeture" : _derniereFermeture);
    if (e.raf) cancelAnimationFrame(e.raf);
    clearInterval(e.minuterie);
    e.ecouteurs.forEach(function (x) { x[0].removeEventListener(x[1], x[2], x[3]); });
    if (e.desabonner) e.desabonner();
    // Place libre retirée : l'équipe revoit la position du tracker (ou le partage tel qu'avant la 3D).
    if (e.publiee) { e.publiee = null; _prisePresence(null); }
    _fermerFiche();
    document.documentElement.classList.remove("kta-vue3d-ouverte");
    document.documentElement.style.removeProperty("--kta-v3d-sous-haut");
    if (e.renderer) {
      e.tuiles.forEach(_libererTuile);
      (e.volPassages || []).forEach(_libererVolume);
      if (e.texCiel) e.texCiel.dispose();
      _libererChevrons();
      _viderGroupe(e.marqueursIti);
      if (e.ronds) e.ronds.geometry.dispose();
      if (e.sol) e.sol.geometry.dispose();
      if (e.avatar) e.avatar.geometry.dispose();
      if (e.mats) Object.keys(e.mats).forEach(function (k) { e.mats[k].dispose(); });
      if (e.grain) e.grain.dispose();
      if (e.grainMonde) e.grainMonde.dispose();
      if (e.moellons) e.moellons.dispose();
      (e.texStructures || []).forEach(function (t) { t.dispose(); });
      if (e.equipe) _viderEquipe();
      if (e.matsEquipe) e.matsEquipe.forEach(function (m) { m.dispose(); });
      [e.geoMembre, e.geoHalo, e.geoMarqueur].forEach(function (g) {
        if (g) Object.keys(g).forEach(function (k) { g[k].dispose(); });
      });
      if (e.lampe) e.lampe.dispose();
      e.renderer.dispose();
      const gl = e.renderer.getContext();
      if (!gl.isContextLost()) e.renderer.forceContextLoss();
      _dernierGl = gl;
    }
    if (e.ov && e.ov.parentNode) e.ov.parentNode.removeChild(e.ov);
    _e = null;
    _rendreFocus(e.retourFocus);
  }

  // Focus rendu à ce qui l'avait (le bouton cube), sinon au bouton de la barre.
  function _rendreFocus(el) {
    const r = el && el.isConnected ? el : document.querySelector(".kta-vue3d-ctrl a");
    if (r && typeof r.focus === "function") { try { r.focus({ preventScroll: true }); } catch (err) { /* rien */ } }
  }

  // Fermeture par l'utilisateur (✕, Échap, API). Suivi actif et position 3D écartée du tracker par un
  // déplacement : « Je suis ici ? » (Oui = recalage du tracker, Non = rien ne change). Rend true si recalé.
  function fermer() {
    const e = _e;
    if (!e) return Promise.resolve(false);
    const pos = { x: e.pos.x, y: e.pos.y }, niveau = e.niveau, sc = e.sc, bouge = e.aBouge;
    const suivi = e.mode === "suivi", retour = e.retourFocus;
    _demonter("utilisateur");
    console.log("[Vue3D] fermée");
    const actif = typeof window.getTrackingActif === "function" && window.getTrackingActif() === true;
    const tr = typeof window.getTrackingPosition === "function" ? window.getTrackingPosition() : null;
    // En suivi sans déplacement libre, la place est celle du tracker (la vue n'en garde qu'une version lissée).
    const ici = suivi && !bouge && tr && Number.isFinite(tr.x) && Number.isFinite(tr.y) ? { x: tr.x, y: tr.y } : pos;
    _placerCarte(ici, niveau);
    if (!bouge || !actif || !tr || typeof window.recalerTrackerSurPoint !== "function" ||
        typeof window.ktaConfirm !== "function") return Promise.resolve(false);
    // Passé à un autre niveau que celui du tracker (🪜) : la question se pose aussi, et recale le niveau.
    const nivTr = typeof window.getTrackerLevel === "function" ? window.getTrackerLevel() : null;
    const autreNiveau = niveau !== null && Number.isInteger(nivTr) && niveau !== nivTr;
    if (Math.hypot(pos.x - tr.x, pos.y - tr.y) / sc < SEUIL_RECALAGE && !autreNiveau) return Promise.resolve(false);
    const texte = autreNiveau ? _t("vue3d.jeSuisIci.texteNiveau", { n: _fmtNiveau(niveau) })
      : _t("vue3d.jeSuisIci.texte");
    return window.ktaConfirm(window.ktaEsc(texte), {
      titre: window.ktaEsc(_t("vue3d.jeSuisIci.titre")),
      okLabel: window.ktaEsc(_t("vue3d.jeSuisIci.oui")),
      cancelLabel: window.ktaEsc(_t("vue3d.jeSuisIci.non"))
    }).then(function (oui) {
      // 🩸 La fenêtre de la question prend le focus et le rend à <html> en se fermant : il revient au bouton cube.
      _rendreFocus(retour);
      if (!oui) return false;
      window.recalerTrackerSurPoint(pos.x, pos.y, niveau === null ? undefined : niveau);
      return true;
    });
  }

  // ⚠️ contrat (décision produit) : à la sortie, la carte 2D se place là où l'on était en 3D, quelle que soit la
  // réponse à « Je suis ici ? » : niveau de la 3D (s'il diffère, après un passage 🪜), centre sur la position, sans
  // animation, zoom gardé (au moins 0). Pendant la 3D, la carte ne bouge pas. Plan orienté actif : setView ne
  // touche pas à la rotation (portée par le pane intercalaire de mapBearing.js, réappliquée au déplacement).
  function _placerCarte(p, niveau) {
    const map = window.map, cfg = window.APP_CONFIG || {};
    if (!map || typeof window.convertCoord !== "function" || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    if (cfg.multiLevel === true && Number.isInteger(niveau) && cfg.activeLevel !== niveau &&
        typeof window.ktaSetActiveLevel === "function") {
      try { window.ktaSetActiveLevel(niveau, { source: "vue3d" }); } catch (err) { /* niveau absent */ }
    }
    try {
      map.setView(window.convertCoord(p.x, p.y), Math.max(map.getZoom(), 0), { animate: false });
    } catch (err) { console.warn("[Vue3D] carte non recentrée :", err && err.message); }
  }

  function basculerVue() {
    if (!_e) return;
    _e.vue = _e.vue === "plongee" ? "yeux" : "plongee";
    _appliquerVue();
  }

  function suivre() {
    if (!_e || !_trackerActif()) return;
    _e.mode = "suivi";
    _e.libreBouge = false;   // repasser en libre sans bouger ne remontre pas la place du tracker comme « en 3D »
    _e.niveauLibre = null;
    _e.tangage = 0;
    _majBoutonSuivre();
    _e.sale = true;
  }

  // Pose la position (coordonnées plan) sans test de collision : mesures, et plus tard « aller à » un point.
  function placer(x, y, cap) {
    if (!_e || !Number.isFinite(x) || !Number.isFinite(y)) return;
    _passerEnLibre();
    _e.pos.x = x; _e.pos.y = y;
    _e.aBouge = true; _e.libreBouge = true;
    if (Number.isFinite(cap)) _e.cap = (cap % 360 + 360) % 360;
    _e.sale = true;
  }

  function avancer(m) { if (!_e) return false; _passerEnLibre(); return _pas(m, _e.cap); }

  function tourner(deg) { if (!_e) return; _passerEnLibre(); _e.cap = (_e.cap + deg + 360) % 360; _e.sale = true; }

  function etat() {
    if (!_e) {
      return { ouvert: false, contexteLibere: _dernierGl ? _dernierGl.isContextLost() : null,
        fermeture: _derniereFermeture };
    }
    const e = _e, info = e.renderer.info;
    let construites = 0, visibles = 0;
    const yMax = { opaque: 0, murs: 0 }, boites = {};
    e.tuiles.forEach(function (t) {
      if (!t.obj) return;
      construites++;
      if (t.obj.visible) visibles++;
      t.obj.children.forEach(function (m) {
        const f = m.userData && m.userData.famille;
        if (f && m.geometry) {
          // Emprise de chaque famille (m), toutes tuiles construites : zones découpées au tube (checkup).
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          const bb = m.geometry.boundingBox, b = boites[f] || (boites[f] = { x0: Infinity, x1: -Infinity,
            y1: -Infinity, z0: Infinity, z1: -Infinity });
          b.x0 = Math.min(b.x0, bb.min.x); b.x1 = Math.max(b.x1, bb.max.x); b.y1 = Math.max(b.y1, bb.max.y);
          b.z0 = Math.min(b.z0, bb.min.z); b.z1 = Math.max(b.z1, bb.max.z);
        }
        if (f !== "opaque" && f !== "murs") return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        yMax[f] = Math.max(yMax[f], m.geometry.boundingBox.max.y);
      });
    });
    return {
      ouvert: true, contexteVivant: !e.renderer.getContext().isContextLost(), perdu: e.perdu, reprises: e.reprises,
      aBouge: e.aBouge, rapide: !!e.rapide, suiviDispo: !!e.suiviDispo, vue: e.vue, mode: e.mode,
      inclinaison: e.inclinaison,
      boussole: { angle: e.roseAngle, nord: e.nord, calibre: e.nordCalibre,
        libelle: e.boussole ? e.boussole.getAttribute("aria-label") : "",
        inclinaisonVisible: !!e.boutonsIncl && !e.boutonsIncl.hidden },
      niveau: e.niveau, niveauLibre: Number.isInteger(e.niveauLibre) ? e.niveauLibre : null,
      changementsNiveau: e.changementsNiveau, hauteur: e.hauteur, oeil: e.oeil, distance: e.distance,
      degagements: e.degagements,
      reglageHauteur: { visible: !!e.reglageHauteur && !e.reglageHauteur.hidden,
        bouton: e.boutonHauteur ? e.boutonHauteur.textContent : "",
        valeur: e.hauteurValeur ? e.hauteurValeur.textContent : "" },
      rendu: e.rendu, poiMasques: e.poiMasques, zonesDecoupees: e.zonesDecoupees, rideaux: e.rideaux.slice(),
      facesRemblais: e.facesRemblais, facesEboulis: e.facesEboulis, rubans: Object.assign({}, e.rubans),
      liseres: Object.assign({}, e.liseres),
      zonesTube: e.zonesTube, poiTube: e.poiTube, halos: e.halos,
      equipe: Object.assign({ membres: 0, membres3d: 0, reperes: 0, itineraires: 0 }, e.nbEquipe || {}),
      membres: e.equipe ? e.equipe.children.filter(function (o) { return o.userData.famille === "membre"; })
        .map(function (o) { return { x: o.position.x, z: o.position.z, vue3d: !!o.userData.vue3d }; }) : [],
      presence: { publiee: e.publiee ? Object.assign({}, e.publiee) : null, publications: e.publications },
      filtres: { panneauOuvert: !!(window.FilterPanel && window.FilterPanel.isVisible()),
        pastille: !!e.boutonFiltres && e.boutonFiltres.classList.contains("kta-filter-ctrl-actif") },
      recouverte: _recouverte(),
      passage: { visible: !!e.boiteNiveaux && !e.boiteNiveaux.hidden,
        haut: e.passageCibles && e.passageCibles.haut ? e.passageCibles.haut.niveau : null,
        bas: e.passageCibles && e.passageCibles.bas ? e.passageCibles.bas.niveau : null,
        liste: e.passageCibles ? e.passageCibles.liste.map(function (c) { return c.niveau; }) : [] },
      boutonRendu: e.boutonRendu ? e.boutonRendu.textContent : "",
      bandeau: Object.assign({ affiche: !!e.bandeau && !e.bandeau.hidden }, e.bandeauEtat),
      chevrons: e.nChevrons, chevronsVisibles: !!e.chevrons && !!e.chevrons.parent,
      fiche: e.fiche ? { nom: String(e.fiche.point.nom || ""), x: e.fiche.point.x, y: e.fiche.point.y,
        passages: Array.prototype.map.call(e.fiche.boite.querySelectorAll("[data-v3d-passage]"), function (b) {
          return b.textContent;
        }) } : null,
      volumes: (e.volPassages || []).map(function (v) {
        return Object.assign({ genre: v.genre, tag: v.tag || null, forme: v.forme || null, moyen: v.moyen || null,
          sol: !!v.sol, plafond: !!v.plafond, ciel: !!v.ciel, grille: !!v.grille, echelons: !!v.echelons,
          passage: !!v.passage, monte: v.monte === undefined ? null : v.monte, construit: !!v.obj, x: v.x, y: v.y,
          bouche: v.genre === "poi" ? [[-v.a, -v.b], [v.a, -v.b], [v.a, v.b], [-v.a, v.b]].map(function (q) {
            return _repere(v)(q[0], q[1]);
          }) : null },
          v.stats || {});
      }),
      geste: e.geste ? { sens: e.geste.sens, t: Math.round(e.geste.t), bascule: e.geste.fait } : null,
      cameraY: +e.camera.position.y.toFixed(3), fondu: +(e.fonduOp || 0).toFixed(2),
      fonduPresent: !!e.fondu && !!e.fondu.parentNode && !e.fondu.hidden,
      bandeauNiveau: e.bandeauNiveau && !e.bandeauNiveau.hidden ? e.bandeauNiveau.textContent : null,
      pos: { x: e.pos.x, y: e.pos.y }, cap: e.cap, butees: e.butees, images: e.images,
      tuiles: e.tuiles.size, construites: construites, visibles: visibles, compte: e.compte, yMax: yMax,
      boites: boites,
      panneaux: Array.from(e.panneaux).map(function (sp) {
        return { visible: sp.visible && !!sp.parent && sp.parent.visible, x: sp.position.x, z: sp.position.z,
          nom: sp.userData.poi.nom, jonction: !!sp.userData.poi.jonction, ecran: _ecran(sp.position),
          dansVolume: !!sp.userData.poi.anneau, depthTest: sp.material.depthTest, ordre: sp.renderOrder,
          genre: sp.userData.poi.genre, danger: !!sp.userData.poi.danger, favori: !!sp.userData.poi.favori,
          bord: sp.userData.poi.bord, halo: !!sp.userData.halo && sp.userData.halo.visible,
          haloXZ: sp.userData.halo ? [sp.userData.halo.position.x, sp.userData.halo.position.z] : null,
          opacite: +sp.material.opacity.toFixed(2), echelle: +sp.scale.x.toFixed(2), fond: sp.userData.fond,
          largeurEcran: +_largeurEcran(sp).toFixed(3) };
      }),
      murDecale: e.mats.murs.polygonOffset === true,
      commandes: e.commandes, pave: !!e.pave && e.pave.isConnected,
      stick: e.stickZone ? _etatStick() : null, toucheNom: e.toucheNom, codesBas: e.codesBas,
      greffe: e.greffe ? { nom: e.greffe.nom, appels: Object.assign({}, e.greffe.appels),
        objets: e.greffe.groupe.children.length, dansScene: e.greffe.groupe.parent === e.scene,
        hud: e.greffe.hud.isConnected, reglage: Object.assign({}, e.greffe.reglage) } : null,
      reglages: { ouvert: !!e.tuileReglages && !e.tuileReglages.hidden,
        repere: !!e.boutonReglages && e.boutonReglages.classList.contains("kta-v3d-modifie"),
        indic: e.indicMode ? e.indicMode.textContent : "", boussole: !!e.boussole && !e.boussole.hidden,
        guidage: _guidageMontre() },
      itineraire: Object.assign({ largeurVoulue: LARGEUR_ITI, lisereVoulu: ITI.lisere, couleur: _couleursIti().hexRuban,
        couleurLisere: _couleursIti().hexLisere, tirets: e.itiTirets }, e.nbMarqueurs, _mesureIti()),
      ronds: e.listeRonds.map(function (r) { return Object.assign({}, r); }),
      triangles: info.render.triangles, appels: info.render.calls,
      geometries: info.memory.geometries, textures: info.memory.textures,
      msOuverture: Math.round(e.msOuverture || 0), msIndex: Math.round(e.msIndex), msTuiles: Math.round(e.msTuiles)
    };
  }

  // Joystick (checkup) : zone et anneau en px de la page, débattement, vitesse relative, direction, course.
  function _etatStick() {
    const e = _e, z = e.stickZone.getBoundingClientRect(), a = e.stickAnneau.getBoundingClientRect();
    const st = e.stick;
    return { zone: { x: z.left, y: z.top, w: z.width, h: z.height },
      anneau: { x: a.left + a.width / 2, y: a.top + a.height / 2, w: a.width },
      bouton: e.stickBouton.getBoundingClientRect().width, actif: !!st, m: st ? +st.m.toFixed(3) : 0,
      ang: st ? Math.round(st.ang) : 0, course: !!(st && st.fortDepuis && performance.now() - st.fortDepuis > APPUI_LONG),
      libres: e.stickLibres };
  }

  // Ruban de l'itinéraire tel que construit (checkup) : largeur médiane des tirets (bande claire) et du liseré
  // (bande sombre), longueur médiane d'un tiret, en m, lues dans la géométrie des tuiles construites.
  function _mesureIti() {
    const ruban = [], lisere = [], longueurs = [];
    _e.tuiles.forEach(function (t) {
      if (!t.obj) return;
      t.obj.children.forEach(function (m) {
        if (m.userData.famille !== "itineraire" || !m.geometry) return;
        const p = m.geometry.attributes.position.array;
        for (let q = 0; q + 17 < p.length; q += 18) {
          const d = function (i, j) { return Math.hypot(p[q + 3 * i] - p[q + 3 * j], p[q + 3 * i + 2] - p[q + 3 * j + 2]); };
          const l = [d(0, 1), d(1, 2), d(0, 2)].sort(function (a, b) { return a - b; });
          (Math.abs(p[q + 1] - ITI.y) < 1e-4 ? ruban : lisere).push(l[0]);
          if (Math.abs(p[q + 1] - ITI.y) < 1e-4) longueurs.push(l[1]);
        }
      });
    });
    const med = function (t) {
      if (!t.length) return null;
      t.sort(function (a, b) { return a - b; });
      return +t[t.length >> 1].toFixed(3);
    };
    return { ruban: med(ruban), lisere: med(lisere), longueurTiret: med(longueurs) };
  }

  // Part de la largeur de l'écran couverte par un panneau visible (checkup : pas plus que PRES.ecran de près).
  function _largeurEcran(sp) {
    if (!sp.visible) return 0;
    const c = _e.camera, d = sp.position.clone().applyMatrix4(c.matrixWorldInverse).z;
    if (d >= 0) return 0;
    return sp.scale.x / (2 * -d * Math.tan(c.fov * Math.PI / 360) * (c.aspect || 1));
  }

  // Point de la scène → position à l'écran (px de la page), pour viser un panneau (checkup).
  function _ecran(v) {
    const r = _e.cv.getBoundingClientRect(), q = new THREE.Vector3(v.x, v.y, v.z).project(_e.camera);
    return { x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height, devant: q.z < 1 };
  }

  // Parois des tuiles construites du mode galerie, en mètres [[x0, z0, x1, z1]] (checkup : aucune ne se croise).
  function parois() {
    if (!_e) return [];
    const out = [];
    _e.tuiles.forEach(function (t) { if (t.obj && t.parois) Array.prototype.push.apply(out, t.parois); });
    return out;
  }

  // Textures des structures et des parois (checkup) : interrupteur, maillages des tuiles construites par matériau,
  // couleurs des sommets des maillages à couleur unie, matériaux texturés (tailles, mipmaps, anisotropie, `lits` :
  // écart relatif de la rangée la plus éloignée de la médiane, haut pour un appareil à lits de mortier, faible pour la
  // roche brute ; paroi : `pierre` ou moellons) et échelle mesurée sur les arêtes horizontales et verticales des
  // faces texturées : { x, z (milieu, m), sens "h" | "v", uvParM } (paroi : uv de la géométrie × `repeat` de sa
  // carte, l'échelle vue). Remblais et effondrement : matériaux `remblais` et `eboulis` (aretes au plus 4 000 par
  // matériau). ms : dessin des matériaux des structures, de la pierre des parois et des zones à cette ouverture ;
  // dessins : durée du premier dessin de chaque texture dans la page.
  function textures() {
    if (!_e) return null;
    const e = _e, mats = { roche: e.mats.roche, parpaing: e.mats.parpaing, opaque: e.mats.opaque, murs: e.mats.murs,
      paroi: e.mats.paroi, remblais: e.mats.remblais, eboulis: e.mats.eboulis };
    const r = { actives: _texturesActives(), bouton: !!e.boutonTextures && e.boutonTextures.getAttribute("aria-pressed"),
      uvParMetre: { roche: 1 / ROCHE.m, parpaing: 1 / PARPAING.m, pierre: 1 / PIERRE.m, remblais: 1 / REMBLAIS.m,
        eboulis: 1 / EBOULIS.m,
        moellons: { h: 1 / (MOELLON.l * MOELLONS_MOTIF.l), v: 1 / (MOELLON.h * MOELLONS_MOTIF.h) } },
      maillages: {}, couleurs: {}, aretes: [], ms: Math.round(e.msTextures || 0), msParoi: Math.round(e.msParoi || 0),
      msZones: Math.round(e.msZones || 0),
      dessins: Object.assign({}, _appareilsMs), materiaux: {} };
    const lits = function (cv) {
      const w = cv.width, h = cv.height, d = cv.getContext("2d").getImageData(0, 0, w, h).data, l = [];
      for (let y = 0; y < h; y++) {
        let t = 0;
        for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; t += d[o] + d[o + 1] + d[o + 2]; }
        l.push(t / w);
      }
      const med = l.slice().sort(function (a, b) { return a - b; })[h >> 1];
      return +(l.reduce(function (m, v) { return Math.max(m, Math.abs(v - med)); }, 0) / med).toFixed(3);
    };
    // Pente moyenne de la normal map (0 = plat) : force du relief que la lampe fait ressortir.
    const pente = function (cv) {
      const w = cv.width, h = cv.height, d = cv.getContext("2d").getImageData(0, 0, w, h).data;
      let t = 0;
      for (let i = 0; i < d.length; i += 4) t += Math.hypot(d[i] / 127.5 - 1, d[i + 1] / 127.5 - 1);
      return +(t / (w * h)).toFixed(3);
    };
    ["roche", "parpaing", "paroi", "remblais", "eboulis"].forEach(function (k) {
      const m = mats[k];
      if (!m) return;
      r.materiaux[k] = { pente: m.normalMap ? pente(m.normalMap.image) : 0, carte: m.map.image.width + "x" + m.map.image.height, normale: !!m.normalMap,
        relief: m.normalMap ? m.normalMap.image.width : 0,
        mipmaps: m.map.generateMipmaps && (!m.normalMap || m.normalMap.generateMipmaps),
        anisotropie: m.map.anisotropy, couleursSommets: m.vertexColors, recule: m.polygonOffset,
        lits: lits(m.map.image) };
    });
    r.materiaux.paroi.pierre = !!e.texPierre && e.mats.paroi.map === e.texPierre.couleur;
    r.materiaux.paroi.repetition = [e.mats.paroi.map.repeat.x, e.mats.paroi.map.repeat.y];
    if (e.mats.paroi.normalMap) {
      r.materiaux.paroi.repetitionRelief = [e.mats.paroi.normalMap.repeat.x, e.mats.paroi.normalMap.repeat.y];
    }
    const parMat = {};
    e.tuiles.forEach(function (t) {
      if (!t.obj) return;
      t.obj.children.forEach(function (me) {
        const nom = Object.keys(mats).filter(function (k) { return mats[k] && me.material === mats[k]; })[0];
        if (!nom || !me.geometry) return;
        r.maillages[nom] = (r.maillages[nom] || 0) + 1;
        const g = me.geometry, p = g.attributes.position.array, uv = g.attributes.uv && g.attributes.uv.array;
        if (!uv) {
          const c = g.attributes.color.array, vus = r.couleurs[nom] || (r.couleurs[nom] = []);
          for (let i = 0; i < c.length; i += 3) {
            const hex = "#" + [c[i], c[i + 1], c[i + 2]].map(function (v) { return v.toString(16).padStart(2, "0"); }).join("");
            if (vus.indexOf(hex) < 0) vus.push(hex);
          }
          return;
        }
        for (let tr = 0; tr < p.length / 9 && (parMat[nom] || 0) < 4000; tr++) {
          for (let k = 0; k < 3; k++) {
            const a = tr * 3 + k, b = tr * 3 + (k + 1) % 3;
            const dx = p[b * 3] - p[a * 3], dy = p[b * 3 + 1] - p[a * 3 + 1], dz = p[b * 3 + 2] - p[a * 3 + 2];
            const lh = Math.hypot(dx, dz), sens = Math.abs(dy) < 1e-6 ? "h" : lh < 1e-6 ? "v" : null;
            const l = Math.hypot(lh, dy);
            if (!sens || l < 0.05) continue;
            const rep = nom === "paroi" ? me.material.map.repeat : null;
            const du = (uv[b * 2] - uv[a * 2]) * (rep ? rep.x : 1), dv = (uv[b * 2 + 1] - uv[a * 2 + 1]) * (rep ? rep.y : 1);
            parMat[nom] = (parMat[nom] || 0) + 1;
            r.aretes.push({ x: (p[a * 3] + p[b * 3]) / 2, z: (p[a * 3 + 2] + p[b * 3 + 2]) / 2, y: p[a * 3 + 1],
              y1: p[b * 3 + 1], v0: uv[a * 2 + 1], sens: sens, mat: nom, uvParM: Math.hypot(du, dv) / l });
          }
        }
      });
    });
    return r;
  }

  // Mesure : `images` rendus en tournant sur place (un tour complet), chacun suivi d'une lecture d'un pixel qui
  // attend la fin du travail du GPU. Temps par image = CPU + GPU, sans la synchronisation à l'écran. Un premier
  // tour non compté compile les shaders et envoie géométries et textures au GPU.
  function mesurer(opts) {
    if (!_e) return null;
    const e = _e, n = (opts && opts.images) || 120, gl = e.renderer.getContext();
    const px = new Uint8Array(4), temps = [];
    const cap0 = e.cap;
    _gererTuiles(true);
    let tri = 0, appels = 0;
    const t00 = performance.now();
    for (let i = 0; i < 12; i++) {
      e.cap = (cap0 + i * 30) % 360;
      _placerCamera();
      e.renderer.render(e.scene, e.camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    const msPremierTour = performance.now() - t00;
    for (let i = 0; i < n; i++) {
      e.cap = (cap0 + i * 360 / n) % 360;
      _placerCamera();
      const t0 = performance.now();
      e.renderer.render(e.scene, e.camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      temps.push(performance.now() - t0);
      tri = Math.max(tri, e.renderer.info.render.triangles);
      appels = Math.max(appels, e.renderer.info.render.calls);
    }
    e.cap = cap0;
    e.sale = true;
    temps.sort(function (a, b) { return a - b; });
    const moy = temps.reduce(function (s, v) { return s + v; }, 0) / n;
    return {
      images: n, msPremierTour: Math.round(msPremierTour), msMoy: +moy.toFixed(2),
      msMed: +temps[Math.floor(n / 2)].toFixed(2), msP95: +temps[Math.floor(n * 0.95)].toFixed(2),
      msMax: +temps[n - 1].toFixed(2), trianglesMax: tri, appelsMax: appels,
      memoire: { geometries: e.renderer.info.memory.geometries, textures: e.renderer.info.memory.textures }
    };
  }

  window.KtaVue3D = {
    ouvrir: ouvrir, fermer: fermer, etat: etat, mesurer: mesurer, basculerVue: basculerVue, incliner: incliner,
    basculerSuivi: basculerSuivi, basculerRendu: basculerRendu, changerNiveau: changerNiveau, parois: parois,
    textures: textures, basculerTextures: function () { return _basculerTextures(); },
    avancer: avancer, tourner: tourner, suivre: suivre, placer: placer, reglerHauteur: reglerHauteur,
    origineItineraire: origineItineraire, placerSurTracker: placerSurTracker, trackerRecale: trackerRecale,
    charge: function () { return !!THREE; },
    greffer: greffer,
    // Passages avec ou sans geste (fondu, descente) : false = bascule immédiate (mesures, checkup).
    gesteAnime: function (oui) { if (oui !== undefined) _gesteAnime = oui !== false; return _gesteAnime; }
  };
})();
