/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// vue3d.js — vue 3D à la première personne autour de la position du tracker, ouverte par le bouton cube de
// la barre de droite (interface.js > _ouvrirVue3D, qui la charge à la demande avec css/vue3d.css) ; three.js
// (lib/three/) n'est importé qu'à la première ouverture. Tout est précaché par sw.js (la 3D sert sous terre).
// Expose : window.KtaVue3D = { ouvrir(opts) → Promise<bool>, fermer() → Promise<bool recalé>, etat(o), parois(),
//   textures(), mesurer(opts), basculerVue(), basculerSuivi(), basculerRendu(), basculerTextures(), incliner(deg),
//   zoomer(facteur), panner(dx, dz), surPlace(), niveauEdition(sens), reglerPortee(m), reglerLampe(%),
//   reglerFaisceau(°), reglerPleinJour(bool), reglerNiveauxVus("voisins" | "tous" | "mien"), reglerEstomper(bool),
//   changerNiveau(sens), avancer(m), tourner(deg), suivre(), placer(x, y, cap), reglerHauteur(m), origineItineraire(),
//   placerSurTracker(), trackerRecale(), charge(), gesteAnime(bool), greffer(g) (prise neutre d'un add-on,
//   _ctxGreffe), viser(cx, cy) (colonne d'outils de la vue d'édition : outils de la carte, _poserSommet),
//   allerA(choix) (« Y aller en 3D » : résultat de la recherche, pris par SearchPoints.prendreChoix),
//   raccourcis() (touches et gestes, lus par shortcutsCheatsheet.js), altitude(x, y) / entremeles() (relevés du
//   checkup : sol en pente, niveaux entremêlés) } ;
//   code « six vers le bas » : kta:vue3dCode ;
//   opts : { distanceVue (m), tuiles (bool), depart {x, y, cap, niveau}, densiteMax, stats, attenteReprise (ms),
//   retourFocus,
//   commandes ("joystick" | "pave" : sinon joystick au téléphone, pavé au PC ou option ⚙️, _commandesVoulues) }.
// Scène (m : x = x image / scale, z = y image / scale, y = hauteur), trois rendus retenus par plan : MIXTE (défaut :
// structures dressées partout, tracés en tubes seulement loin d'elles, ouverts en entrant dans une chambre),
// STRUCTURES seules (tracés au sol) ou GALERIE seule (tracés en tubes, js/galerieEmprise.js) ; zones, itinéraire
// (ruban plein, chevrons de sens, étapes, 🏁), ronds d'intersection et surlignage 📏 de la carte (_majDistTot), POI
// en panneaux (danger : halo rouge au sol ; favori : ⭐) ; membres, repères et itinéraires d'une extension
// (KtaPresences ; ma place libre leur est montrée, _publierPosition ; rien sans extension) ; un niveau actif et ses
// voisins à leur altitude (réglage ⚙️ Niveaux, _voisinsPreparer, sans pas ni panneaux), passages en
// volume (_construireVolume) comme les accès de surface sans passage (puits fermés, comblés, bouché, d'extraction,
// bassin, cavage) et les formes de POI (chatière, plaque, épure, portail, véhicule) : _volumeAcces ; changement de
// niveau derrière un fondu (_lancerGeste). Tuiles autour de soi, lampe frontale, rendu au mouvement seul.
// ⚠️ contrat : filtres = ceux de la carte (window._ktaRuntimeFilters, calques de données, niveaux visibles), lus à
// chaque construction et suivis par FilterPanel.onChange ; ≡ ouvre le même panneau (filterPanel.js) par-dessus.
// Masquer ne retire que le dessin : collisions, parois des tubes et passages 🪜 restent ; l'itinéraire, comme en 2D,
// ne suit aucun filtre et se redessine à `kta:itineraireChange` (road.js). Données du plan changées pendant la vue
// (session, calque rapatrié ou restitué, annulation, légende) : `kta:donneesPlanChange` (utils.js >
// ktaSignalerDonneesPlan), empreinte relue après la rafale, scène refaite sur place (_majDonnees). Guidage : bandeau,
// chevrons (_lireGuidage), recalcul auto en libre (_recalerLibre) ; toucher un POI ouvre sa fiche de la carte
// (_ouvrirFiche, « Y aller » : origineItineraire). En
// libre, un tracker choisi comme départ depuis la vue y amène la place (placerSurTracker) ; un tracker recalé (« 📍 Je
// suis ici ») ne la bouge pas (trackerRecale).
// ⚠️ contrat : hauteur = celle DU NIVEAU affiché (config.js > getNiveauVertical / setHauteurNiveau), la même que
// ⛏️ Volume exploité, réglée aussi en 3D ; un changement de niveau (passage 🪜, suivi) reprend la sienne (_reindexer).
// ⚠️ contrat : déplacement à hauteur d'yeux = règle du pas, jamais une copie (tracking.js > ktaEstAccessible,
// ktaSegmentsBloquesParStructure ; galerie : KtaGalerie.segmentsBloques ; mixte : les deux, et paroisBloquent ;
// partout, KtaGalerie.zonesBloquent : zones et obstacles des accès), sur la largeur d'un corps ; vue d'édition :
// survol (_pas). Le tracker n'est pas déplacé (décision produit) : à la fermeture, « Je suis ici ? » propose de le
// recaler (position, niveau), en saut : ni validation ni distance estimée, rien de « terrain » au Carnet.
// 🩸 three.js est un module ES : import() dynamique, URL absolue (pas d'import map, la CSP refuse tout script en
// ligne). Fermer libère le contexte WebGL (forceContextLoss) : un navigateur en garde peu (iOS ~ 8, Chrome 16).
// Doc : docs/ETUDE_VUE_3D.md, tracking.md § Vue 3D, ui.md § Vue 3D · Garde-fou : scripts/smoke/checkup-vue-3d.js

(function () {
  "use strict";

  const URL_THREE = "lib/three/three.module.js";
  // Portée (m) : au-delà, brouillard noir complet et tuiles masquées. Réglage ⚙️ de l'appareil (config.js >
  // getVue3DPortee, curseur : reglerPortee) ; ces bornes ne servent que sans config.js.
  const PORTEE = window.V3D_PORTEE || { min: 15, max: 100, defaut: 30 };
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
  // Lampe frontale : force, halo autour de soi, portée minimale (part de la distance de vue) d'une lampe baissée.
  const LAMPE = { force: 24, halo: 1.6, porteeMin: 0.06 };
  // Réglages ⚙️ de la lampe (config.js > V3D_LAMPE ; ces bornes ne servent que sans config.js) : intensité en % (100 =
  // la lampe d'origine), faisceau en ° de cône total (71° ≈ demi-angle de 0,62 rad), Plein jour à part.
  const REGLAGE_LAMPE = window.V3D_LAMPE ||
    { intensite: { min: 25, max: 300, defaut: 100 }, faisceau: { min: 40, max: 160, defaut: 71 } };
  // Éclairage d'ambiance : nuit (la lampe seule), Plein jour (fond baissé : c'est le soleil qui éclaire). Plein jour
  // commence le brouillard clair à 40 % de la portée à hauteur d'yeux (il pâlit le lointain et cache le bord de la
  // scène construite, fond de la même couleur), la portée restant le seul réglage de « jusqu'où l'on voit ».
  const AMBIANCE = { nuit: 0.04, jour: 0.25, brumeJour: 0.4 };
  // ☀️ Soleil du Plein jour (décision produit) : une lumière directionnelle rasante, sans ombre portée ni occlusion
  // (coût iPhone), qui vient de `azimut`° du nord RÉEL du plan (315 = nord-ouest, la convention des cartes en relief :
  // un relief éclairé du haut à gauche se lit en bosse) et `hauteur`° au-dessus de l'horizon : faces tournées vers
  // lui claires, les autres dans l'ambiance, relief et joints lisibles partout ; l'ombre tombe toujours du même côté
  // (repère d'orientation). Plan sans nord calibré : le haut du plan, comme la boussole. `couleur` = blanc chaud,
  // constante physique (pas une couleur de la charte).
  const SOLEIL = { force: 1.8, azimut: 315, hauteur: 30, couleur: 0xfff4e0 };
  // Pénombre du faisceau (part du cône fondue) aux bornes et au défaut : un faisceau large se fond dans le noir au
  // lieu de dessiner un rond net sur les parois ; 0,55 au défaut (la lampe d'origine).
  const PENOMBRE = { min: 0.4, defaut: 0.55, max: 1 };
  const AMBIANCE_PLONGEE = 0.9;
  const APPUI_LONG = 600;           // ms
  const APPUI_CLIC = 1000;          // ms : click d'un toucher (pointerdown juste avant), pas du clavier (_brancher)
  const INCLINAISON = { defaut: 60, min: 15, max: 85, pas: 5 };   // ° de la vue plongeante (90 = verticale)
  // Recul (m) entre la caméra plongeante et le point visé (2 m devant soi, ou celui où le doigt l'a mené : _panner) :
  // zoom de la vue plongeante, borné, retenu tant que la vue est ouverte ; `pas` = facteur d'un cran (molette, + / −,
  // clavier). 🛡️ Portée non limitée (_limitee), `max` cède à la diagonale du plan (_reculMax) : tout le plan à l'écran.
  const RECUL = { defaut: 18.4, min: 6, max: 150, pas: 1.15 };
  // Gestes de la caméra libre (vue plongeante) : un doigt ne déplace la vue qu'au-delà de TAPE.bouge px (un toucher
  // qui pose un sommet bouge toujours d'un ou deux px). Deux doigts : la rotation du cap s'engage à `rot`° de la pose
  // (arc d'au moins `arc` px, sinon deux doigts serrés tourneraient au moindre tremblement), à `rotPince`° une fois le
  // pincement engagé (le seuil de la carte, mapBearing.js > SEUIL_ROTATION : un pincement dérive de quelques degrés).
  // `pasZoom` / `pasCap` : pas le plus grand d'un seul mouvement (filet contre un doigt qui saute).
  const CAMERA_LIBRE = { rot: 10, rotPince: 15, arc: 12, pasZoom: 1.5, pasCap: 30 };
  // Hauteur minimale à l'écran (px CSS) des lettres d'un panneau en vue plongeante : dézoomé, un panneau à l'échelle de
  // la scène n'avait plus que 3 px de texte.
  const PANNEAU_LETTRE_MIN = 13;
  // Rayon vu en plongée : 2,3 m de sol par mètre de recul (au recul par défaut, 1,4 × la portée de 30 m).
  const SOL_PAR_RECUL = 2.3;
  // Plan proche de la caméra plongeante par mètre de recul (_appliquerPortee) : 1/32 = un huitième de la hauteur de
  // la caméra à l'inclinaison la plus faible (recul · sin 15°), au-dessus de tout volume dès quelques mètres de recul.
  const PROCHE_PAR_RECUL = 1 / 32;
  // Rayon construit (tuiles, volumes, panneaux) que le recul peut atteindre (m). Au-delà, sol, plan au sol et
  // brouillard suivent la vue (_rayonVue), la scène non. 🩸 Vue de haut, tout le disque construit est à l'écran : le
  // coût suit ce rayon, pas le recul. Sans plafond, 150 m de recul = 345 m de tuiles, 50 ms par image et 29 s de
  // constructions saccadées en iPhone émulé ; à 100 m, ~22 ms et 1,5 s (ETUDE_VUE_3D.md).
  // ⚠️ contrat (décision produit) : ce plafond, PORTEE.max et RECUL.max sont la case 🛡️ « Limiter la portée » de la
  // tuile ⚙️ (_limitee), cochée par défaut ; décochée, portée jusqu'au plan entier (cran « Tout le plan »), recul
  // jusqu'à sa diagonale et scène construite sans plafond, au risque de la mémoire (message à la décoche).
  const RAYON_RECUL_MAX = 100;
  const ROTATION = 90;              // °/s
  const EPAISSEUR_MUR_LIGNE = 0.4;  // m
  const EPAISSEUR_FRONT = 0.3;      // m
  const LARGEUR_TRACE = 0.25;       // m
  // Itinéraire au sol (décision produit) : le dessin du trajet du jeu (addons/mkmg), à la couleur de l'itinéraire de
  // la carte (--kta-interaction ; le doré reste aux itinéraires publiés par l'équipe). Ruban PLEIN continu de
  // LARGEUR_ITI, liseré sombre (--kta-fond) de ITI.lisere sur chaque bord (le sol peut être clair : grain calcaire,
  // plan au sol, liseré vert d'un tracé dessous), chevrons « ^ » de sens --kta-fond (9,3:1 sur le ruban) tous les
  // ITI.pas m à partir de ITI.pas / 2, pointe vers l'arrivée, branches de ITI.chevron sur ITI.ep, ITI.dy au-dessus du
  // ruban. Posés à des abscisses fixes du trajet (ils ne glissent pas). Non éclairé : lisible hors du faisceau.
  const LARGEUR_ITI = 0.3;          // m
  const ITI = { lisere: 0.04, y: 0.05, pas: 2, chevron: 0.26, ep: 0.06, dy: 0.008 };
  // Marqueurs de l'itinéraire : disque et mât à chaque étape, 🏁 en panneau à l'arrivée (m).
  const MARQUEUR = { rayon: 0.25, mat: 0.6, epMat: 0.03, y: 0.055 };
  // Ronds d'intersection (option de la carte) : disque à la couleur du rond 2D, au-dessus des rubans des tracés.
  const ROND = { rayon: 0.35, cotes: 16, y: 0.04 };
  // Surlignage 📏 Distance totale (_majDistTot) : ruban plus large que le tracé (LARGEUR_TRACE), juste au-dessus de
  // son ruban au sol, sous les ronds et l'itinéraire, à la couleur du surlignage de la carte.
  const SURLIGNE = { larg: 0.5, y: 0.035 };
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
  // `ecranEdition` : plafond en vue plongeante, plus large, pour qu'un panneau à icône garde ses lettres de
  // PANNEAU_LETTRE_MIN px sur un téléphone (393 px : 222 px de large).
  const PRES = { min: 1, net: 2.2, ecran: 0.45, ecranEdition: 0.6 };
  // Vue plongeante : un panneau de POI à lettres minimales fait toujours ~222 px de large ; dès qu'il couvre plus de
  // `sol` m de sol (un carrefour : il ne désigne plus un point, et l'écran d'un téléphone n'en tient plus qu'une
  // poignée — vers 30 m de profondeur), il se réduit à son icône de `px` px CSS (celle de la carte 2D), sans nom ;
  // le nom revient sous `solNom` m (hystérésis : pas de clignotement au bord). `toucher` : rayon (px) autour d'une
  // icône réduite qui la prend au doigt (_panneauVise). `opacite` : part perdue au bord de la scène (le panneau : 0,6).
  const PANNEAU_REDUIT = { sol: 12, solNom: 9, px: 28, toucher: 22, opacite: 0.3 };
  // Dé-chevauchement des panneaux à l'écran (_desencombrer) : grille de `cellule` px, `marge` px entre deux panneaux.
  // À hauteur d'yeux, seuls les panneaux à plus de `loinYeux` m peuvent être masqués (ceux de près ne bougent pas).
  const DESENCOMBRE = { cellule: 64, marge: 4, loinYeux: 12 };
  const BRUIT_CAP = 2;              // ° : en suivi, un écart de cap plus petit (boussole) ne redessine pas
  const HAUTEUR_MUR = 0.98;         // part de la hauteur du plan : un mur passe toujours sous pilier et front
  // Sol et ciel de carrière (plafond, à la hauteur du plan) : même teinte sable calcaire, grain procédural répété
  // (bruit dessiné dans un canvas, aucune image téléchargée). Couleur de la scène, pas de la charte de l'UI.
  const COULEUR_CALCAIRE = "#c9b48c";
  const HACHURE_PAS = 0.6;   // m : période des hachures d'une zone inaccessible (sol et rideau)
  const GRAIN_TAILLE = 128;         // px du motif
  const GRAIN_METRES = 2;           // m couverts par un motif
  // Ordre de rendu du sol (carré qui suit et sol des galeries) : avant tout le reste, pour que le plan au sol
  // (PLAN_SOL.ordre) se pose dessus sans dépendre de la profondeur.
  const ORDRE_SOL = -0.6;
  // 🩸 Sol (carré qui suit, pièces des galeries, sols des voisins : copies) reculé de quelques unités de profondeur :
  // eau (4 cm, profondeur stricte en tube), hachures, rubans et liserés posés dessus gagnent toujours, même quand la
  // profondeur ne sépare plus quelques centimètres (vue d'édition dézoomée : bandes et triangles du sol dans l'eau).
  // ⚠️ Facteur de pente NUL : il vaut un pixel de profondeur, des mètres au loin à angle rasant, et laissait passer
  // les volumes du niveau du dessous à travers le sol.
  const SOL_RECULE = { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 4 };
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
  // 2e masse (pilier-2, front-2) : la même roche, plus chaude (teinte par sommet multipliée par la texture, même
  // matériau et même maillage que la 1re, blanche). 🩸 Sans elle, 🧱 activé, 1re et 2e masse étaient la même roche :
  // un pilier passé de l'une à l'autre ne changeait rien dans la scène. Pas de second matériau : préparé au premier
  // pilier de 2e masse, il retardait d'une image le changement de niveau sous le fondu (WebKit).
  const MASSE_2 = { "pilier-2": true, "front-2": true }, TEINTE_MASSE_2 = "#f0b98a";
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
  // Lampe frontale d'un membre (extension, _lampeMembre) : halo additif sur la tête, au blanc chaud de notre lampe
  // (`couleur`, celle du SpotLight de _monterScene) teinté de `teinte` de la couleur du membre. fog: false (vu au bout
  // d'une galerie, là où le brouillard a éteint la roche), profondeur testée (jamais à travers un pilier). `taille`
  // m, bornée à l'écran entre `pxMin` et `pxMax` px ; `jour` = force en Plein jour et en vue d'édition (scène
  // éclairée : discret). Une vraie lumière (SpotLight sans ombre, `distance` m) pour les `lumieres` membres les plus
  // proches de notre place, à moins de `portee` m : faisceau de `faisceau` rad devant lui si la présence donne un
  // cap (plus le cône visible `cone`, incliné de `inclinaison` rad vers le sol), sinon cône de `ouvert` rad vers le
  // bas (halo rond). 🩸 Sans ombre, cette lumière traverse la roche : sa portée reste courte exprès.
  const LAMPE_MEMBRE = { couleur: 0xfff1d6, teinte: 0.2, taille: 0.6, pxMin: 7, pxMax: 40, jour: 0.35, devant: 0.2,
    lumieres: 2, portee: 20, force: 4, distance: 7, decay: 1.5, faisceau: 0.6, ouvert: 1.45, penombre: 0.6,
    inclinaison: 0.25, cone: { long: 3, rayon: 0.6, opacite: 0.045 } };
  const PASSAGE = 2;                // m : distance d'un passage (POI jonction) qui montre 🪜
  // Panneau d'un passage (POI jonction) : lisible jusqu'à 1 m (là où 🪜 apparaît), effacé seulement sous 0,8 m.
  const PRES_PASSAGE = { min: 0.8, net: 1 };
  // Volumes des passages (_construireVolume) : `long` m sous le sol ou au-dessus du plafond (le reste se perd dans le
  // noir), escalier à `marches` marches, échelons tous les 0,3 m. Dimensions (escalier, puits, aération, largeur de la
  // galerie inclinée, cadre doré) : KtaGalerie.PASSAGE, d'où le tube s'ouvre sur la même emprise (galerieEmprise.js).
  const VOLUME = Object.assign({ long: 6, echelon: 0.3, marches: 10 }, window.KtaGalerie.PASSAGE);
  const COULEUR_FER = "#5e5a52";    // échelons, montants, grille : couleur de la scène, pas de la charte de l'UI
  // Accès de surface sans passage (_volumeAcces) : formes et dimensions dans KtaGalerie (ACCES, ACCES_DIM), d'où
  // leurs obstacles (cône, porte fermée) sont la règle du pas. Ici, ce que seule la 3D dessine (m) :
  // dalle sombre d'un accès fermé (esf, pef) à `fermeY` au-dessus du plafond, de `fermeEp` ; puits comblé (pc, psf) :
  // remblais à `comble` au-dessus du plafond ; puits bouché (pb) : dalle maçonnée de `boucheEp`, débordant de
  // `boucheDeborde` autour de la bouche, au ras du plafond.
  const DIM_ACCES = Object.assign({ fermeY: 2.5, fermeEp: 0.15, comble: 0.5, boucheEp: 0.06, boucheDeborde: 0.1 },
    window.KtaGalerie.ACCES_DIM);
  const COULEUR_DALLE = "#3b3731";  // dalle d'un accès fermé : couleur de la scène, sombre
  const COULEUR_FOND = "#2a2622";   // fond d'un bassin, sous l'eau
  // Porte d'un cavage (cao, caf) : battants de `ep` dans un cadre de fer de `cadre` (montants et linteau), hauteur
  // `haut` bornée par celle du plan ; au-dessus du linteau, la paroi jusqu'au plafond. Ouvert (cao) : battants
  // rabattus à 90° contre les parois. Bois dessiné (_bois) avec 🧱, couleur unie COULEUR_BOIS sinon.
  const PORTE = { haut: 2.1, cadre: 0.12, ep: 0.08, jeu: 0.02 };
  const COMBLE_ENFONCE = 0.05;      // m : comblement d'un cavage enfoncé dans la structure qu'il rejoint (_porte)
  const COULEUR_BOIS = "#4b3626";
  // Bois des battants (🧱) : un battant par motif (u en travers, v vers le haut), `planches` planches verticales,
  // `pentures` bandes de fer horizontales (centres en part de la hauteur) cloutées tous les `clou` px.
  const BOIS = { px: 256, couleur: "#5c412b", fer: "#3f3c38", planches: 5, pentures: [0.14, 0.5, 0.86], bande: 0.07,
    clou: 22, relief: 3, graine: 71 };
  // Chatière (chatiere, décision produit) : roche brute en travers de la galerie sur `long` m, percée au ras du sol
  // d'un passage BAS de `trou` m de haut sur `large` m de large (centré ; au plus la galerie moins `jeu` m), roche
  // au-dessus jusqu'au plafond et sur les côtés ; elle n'arrête rien, la caméra s'y abaisse à `oeil` m (on rampe), en
  // descendant sur `approche` m avant l'entrée (et remontant d'autant après la sortie). La roche déborde de
  // `deborde` m dans les parois (aucun jour au bord). Longueur : 1,8 m par défaut, une chatière courte (un corps
  // allongé, à peine plus), assez pour qu'on la sente passer à hauteur d'yeux ; point précis en deux points
  // (poiPrecis.js : début et fin) : leur distance, `court` m au moins, et leur axe (_segmentChatiere).
  const CHATIERE = { long: 1.8, court: 0.4, trou: 0.6, large: 0.9, jeu: 0.2, oeil: 0.35, approche: 1, deborde: 0.3 };
  // Profil du trou (t en part de `large`, y en part de `trou`, vers le haut) : sol droit, flancs bas, voûte surbaissée
  // (plus large que haut : on y passe en rampant, pas debout).
  const PROFIL_CHATIERE = [[-0.5, 0], [0.5, 0], [0.5, 0.7], [0.4, 0.9], [0.18, 1], [-0.18, 1], [-0.4, 0.9],
    [-0.5, 0.7]];
  // Plaque indicatrice (plaque) : inscription gravée en creux dans un bloc de pierre de taille (décision produit :
  // le style des inscriptions de carrière, capitales Didone noires), de `l` × `h` m au moins, élargie au nom jusqu'à
  // `lMax` m puis sur deux lignes (_mesurePlaque), `ep` d'épaisseur, centrée à `y` m (et au moins `plafond` m sous le
  // plafond), à `recul` m de la paroi ; dessinée au canvas à `pxm` px par mètre, police de `police` × `h`
  // (resserrée jusqu'à `serre` avant de passer sur deux lignes), 2ᵉ ligne (_secondePlaque) à `corps2` du corps et
  // `secondeMax` caractères au plus, jamais sous `min2` px (la plaque grandit en hauteur) ; usure en `variantes` tirées du point (_variantePlaque). Une texture par contenu,
  // au plus `max` vivantes : au-delà, la plaque unie (`pierre`, liseré `joint`). Couleurs de la scène, pas de la
  // charte de l'UI. Le nom reste avec 🧱 coupé (décision produit : un repère).
  const PLAQUE = { l: 0.6, lMax: 1, h: 0.3, police: 0.36, serre: 0.8, ep: 0.015, y: 1.45, plafond: 0.3, recul: 0.01,
    pxm: 400, max: 32, pierre: "#c4b08c", joint: "#5e5140", bord: 0.03, corps2: 0.55, min2: 14, secondeMax: 40,
    variantes: 4 };
  // Police des plaques (lib/bodoni-moda, SIL OFL) : chargée à l'ouverture de la 3D (_chargerPolicePlaques), jamais
  // au démarrage ; tant qu'elle manque, le serif du système, puis les plaques sont redessinées (_redessinerPlaques).
  const URL_POLICES_PLAQUE = { 600: "lib/bodoni-moda/bodoni-moda-latin-600-normal.woff2",
    700: "lib/bodoni-moda/bodoni-moda-latin-700-normal.woff2" };
  const FAMILLE_PLAQUE = "'Bodoni Moda', 'Bodoni 72', Didot, 'Times New Roman', Georgia, serif";
  // Épure (epure) : trait gravé clair sur la paroi, `larg` m de trait, à `recul` m d'elle, centré à `y` m ; dessin
  // de `l` m (ligne, deux talons, une croix, une flèche). Géométrie seule : rien à couper avec 🧱. Couleur de la
  // scène (trait clair sur la pierre).
  const EPURE = { l: 1.2, y: 1.5, larg: 0.022, recul: 0.012, talon: 0.12, croix: 0.09, fleche: 0.1,
    couleur: "#d8cfb8" };
  // Portail (portail, liaison inter-plan) : cadre de porte de `l` × `h` m (au moins `plafond` m sous le plafond),
  // montants et linteau de `bord` m, `ep` m devant la paroi ; lumineux à --kta-interaction (jetons sombres) si le
  // point a une liaison, éteint (COULEUR_PORTAIL_ETEINT) sinon.
  const PORTAIL = { l: 1, h: 2, plafond: 0.1, bord: 0.09, ep: 0.08, recul: 0.005 };
  const COULEUR_PORTAIL_ETEINT = "#3d4048";   // couleur de la scène : un cadre de fer sombre
  // Véhicule (vehicule) : voiture simplifiée, dimensions et obstacle dans KtaGalerie (ACCES_DIM.vehicule*) ; caisse
  // de `garde` m au-dessus du sol jusqu'à `caisse` m, habitacle jusqu'au toit (vehiculeH, borné sous le plafond),
  // de `hab` de la longueur, en retrait de `retrait` m sur les côtés ; quatre roues de `roue` m de rayon et
  // `roueL` m de large, à 0,2 m des bouts. Couleurs de la scène, sobres (pas de la charte de l'UI).
  const VEHICULE = { garde: 0.2, caisse: 0.8, hab: 0.6, retrait: 0.1, roue: 0.28, roueL: 0.18,
    cotes: 12, carrosserie: "#59616b", vitre: "#1d2228", pneu: "#1b1b1b" };
  // Geste d'un passage : fondu noir de `fondu` ms de part et d'autre de la bascule ; descente / montée de `ms` en tout
  // (la moitié dans chaque niveau), la caméra passant `auDela` m sous le sol ou au-dessus du plafond ; bandeau
  // « Niveau n » `bandeau` ms.
  const GESTE = { ms: 1000, fondu: 250, auDela: 0.8, bandeau: 2000 };
  // Galerie inclinée d'un tracé jonction (_pentesDuNiveau, KtaGalerie.pente) : la scène passe au niveau d'en face à
  // mi-longueur, `hyst` m au-delà (au plus le quart du tracé : pas d'aller-retour en restant sur place) ; on n'en sort
  // par le côté que là où son sol est à moins de `sortie` m de celui du niveau ; en suivi, une bascule du tracker à
  // moins de `suivi` m de la galerie se fait sans fondu ; talus (sous la rampe qui monte) en retrait de `talus` m des
  // bords (jamais confondu avec la paroi du modèle galerie).
  const PENTE = { hyst: 0.3, sortie: 0.3, suivi: 1, talus: 0.03 };
  const PASSAGE_ITI = 3;           // m : itinéraire à moins de cette distance de l'arrivée → cap vers sa consigne
  const ATTENTE_REPRISE = 8000;     // ms d'écran visible sans contexte avant de renoncer à la reprise
  const SEUIL_RECALAGE = 0.5;       // m d'écart avec le tracker sous lequel « Je suis ici ? » ne se pose pas
  // Chevrons au sol sur l'itinéraire, de sa position vers la prochaine consigne : un tous les `pas` m (posés à des
  // abscisses fixes du trajet : ils ne glissent pas quand on avance), sur `long` m au plus ; taille en m.
  const CHEVRON = { pas: 2, long: 30, l: 0.4, ep: 0.09, y: 0.07 };
  const GUIDAGE_MS = 250;           // ms entre deux lectures du guidage (bandeau, chevrons)
  // ⚠️ contrat (décision produit) : en libre, place 3D à plus de `ecartM` du trajet (tronçons de son niveau ; aucun =
  // écart) pendant `tenirMs`, au plus un recalcul toutes les `entreMs`, et pas deux du même endroit (`repriseM` à
  // parcourir depuis le dernier, réussi ou non : un départ hors des galeries garde son raccord à vol d'oiseau). 8 m =
  // la tolérance « sur le trajet » de la 2D sans navigation intelligente et de la coupe derrière (une salle large ou
  // un regard dans une galerie voisine ne recalcule rien) ; 2 s ≈ 5 m de marche au pas de la vue (on s'est engagé
  // ailleurs, ce n'est pas un écart d'un instant) ; 5 s bornent le coût d'un calcul sur un grand plan.
  const RECALCUL_LIBRE = { ecartM: 8, tenirMs: 2000, entreMs: 5000, repriseM: 8 };
  // ⚠️ contrat (décision produit) : `n` appuis vers le bas (▼ du pavé, ↓ / S, coup bref du joystick vers le bas) en
  // moins de `ms`, sans autre commande de déplacement entre deux → `kta:vue3dCode` (detail.code = "bas6"). Coup de
  // joystick : relâché moins de `coup` ms après la sortie de la zone morte, toujours à plus de `angle`° de l'avant.
  const CODE_BAS = { n: 6, ms: 2000, coup: 500, angle: 135 };
  // Rafale de `kta:donneesPlanChange` (annulations répétées, import, « Tout afficher ») : données relues une fois,
  // `calme` ms après le dernier signal, au plus tard `max` ms après le premier (une rafale continue ne retarde pas
  // la scène sans fin). _majDonnees.
  const RAFALE = { calme: 120, max: 600 };

  let THREE = null;
  let _import = null;
  let _e = null;                    // état de la vue ouverte (null = fermée)
  // Police des plaques : etat "absente" | "charge" | "prete" | "echec" | "indisponible" (pas de FontFace).
  const _police = { etat: "absente", promesse: null };
  let _appareils = {};               // canvas des textures déjà dessinés (_texturesPeintes : structures, parois)
  const _appareilsMs = {};          // ms du premier dessin de chacun (checkup)
  let _dernierGl = null;            // contexte de la dernière vue fermée (checkup : libéré ou non)
  let _derniereFermeture = null;    // "utilisateur" | "contexte" (checkup)
  // « Voir sur la carte » : surbrillance du contour sur la carte (ms) ; dernier objet montré (checkup).
  const SURBRILLANCE_MS = 5000;
  let _derniereMontre = null;
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

  // 🔒 Police servie par le site (CSP font-src 'self'), par FontFace : aucune feuille, aucun script en ligne.
  // Jamais attendue par l'ouverture : les plaques se dessinent au serif du système et se redessinent à l'arrivée.
  // Un échec (hors ligne sans précache) se retente à l'ouverture suivante.
  function _chargerPolicePlaques() {
    if (_police.promesse) return _police.promesse;
    if (typeof FontFace !== "function" || !document.fonts) {
      _police.etat = "indisponible";
      return Promise.resolve(false);
    }
    _police.etat = "charge";
    const faces = [600, 700].map(function (g) {
      const url = new URL(URL_POLICES_PLAQUE[g], document.baseURI).href;
      return new FontFace("Bodoni Moda", "url(" + url + ") format('woff2')", { weight: String(g), style: "normal" });
    });
    _police.promesse = Promise.all(faces.map(function (f) { return f.load(); })).then(function (ok) {
      ok.forEach(function (f) { document.fonts.add(f); });
      _police.etat = "prete";
      _redessinerPlaques();
      return true;
    }).catch(function (err) {
      console.warn("[Vue3D] police des plaques indisponible, serif du système :", err && err.message);
      _police.etat = "echec";
      _police.promesse = null;
      return false;
    });
    return _police.promesse;
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

  // Zone : sur CHACUN de ses niveaux (`niveaux`, règle commune poiJonction.js > ktaNiveauxObjet) ; même contour,
  // dessinée et bloquante sur chacun (galerieEmprise.js > _zoneSurNiveau pour la règle du pas).
  function _zoneSurNiveau(z, niveau) {
    if (niveau === null || typeof window.ktaNiveauxObjet !== "function") return _surNiveau(z, niveau);
    return window.ktaNiveauxObjet(z).indexOf(niveau) >= 0;
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
  // tracés jonction tous (galeries inclinées : _pentesDuNiveau, la règle du pas les suit même masqués).
  function _collecter(niveau) {
    const ok = function (o) { return o && Array.isArray(o.points) && _surNiveau(o, niveau); };
    const type = function (o) { return o.type; };
    const sessionRoads = _tab(window.getRoads).filter(function (r) { return r && !r._preview; });
    const embRoads = _tab(window.getAllEmbeddedRoads);
    const roads = _itiDuNiveau(sessionRoads, niveau)
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
    // Objet en cours de dessin depuis la vue : montré par l'aperçu seulement, jusqu'à sa fin (_horsTrace).
    return {
      structures: _filtrer(_tab(window.getStructures), _tab(window.getAllEmbeddedStructures), "structTypes", type)
        .filter(ok).filter(_horsTrace),
      zones: _filtrer(_tab(window.getZones), _tab(window.getAllEmbeddedZones), "zoneTypes", type).filter(function (z) {
        return z && Array.isArray(z.points) && _zoneSurNiveau(z, niveau);
      }).filter(_horsTrace),
      roads: roads.filter(ok).filter(_horsTrace),
      jonctions: sessionRoads.concat(embRoads).filter(function (r) {
        return r && r.type === "jonction" && Array.isArray(r.points);
      }),
      points: points
    };
  }

  // Morceaux de l'itinéraire au niveau affiché (_collecter ; _refaireIti quand il change seul), [] si une greffe le
  // coupe. `sessionRoads` : tracés de la session sans les aperçus.
  // 🩸 L'itinéraire est UN tracé dont chaque point porte son niveau (pathfinder.js) : il est découpé en morceaux
  // du niveau affiché, sinon un itinéraire au −1 (tracé sans `level` = 0) disparaissait tout entier.
  // Chaque morceau garde l'abscisse (px, depuis le début du trajet, tronçons des autres niveaux compris) de ses
  // points : chevrons de sens réguliers d'un morceau et d'une tuile à l'autre.
  function _itiDuNiveau(sessionRoads, niveau) {
    const itiDuNiveau = [];
    if (!_permisGreffe("itineraire")) return itiDuNiveau;
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
        // Milieu d'un tracé jonction (niveau null sans moyen, pathfinder.js) : d'aucun niveau ; la galerie inclinée
        // porte ce tronçon (_majItiPentes).
        const transit = !!q && q.level === null && !q.via;
        const n = q && Number.isInteger(q.level) ? q.level : transit ? null : defaut;
        if (niveau === null || n === niveau) { cur.push(q); abs.push(s); return; }
        fin(niveau);
      });
      fin(niveau === null ? defaut : niveau);
    });
    return itiDuNiveau;
  }

  // Type de tracé montré par les filtres de la carte : liseré du mode galerie (le tube, lui, reste : collision).
  // Empreinte de ce que la scène lit des données : session et calques (filtres ignorés : ils ont leur signal,
  // FilterPanel.onChange), chaque sommet, chaque champ simple d'un objet (type, niveau, nom, tags, updatedAt…),
  // niveaux et raccords des POI jonction, légende personnalisée de la session (couleurs, types `cust-…`). Relue sur
  // signal seulement (_majDonnees), jamais à l'image ; coût au checkup (etat().donnees.msEmpreinte).
  // ⚠️ contrat : ni l'itinéraire (`type: "itinerary"`) ni les aperçus (`_preview`) n'y entrent : rien de la scène
  // n'en dépend hors de ce que _refaireIti refait (ruban, étapes ; chevrons par le guidage). Un itinéraire changé
  // passe par `kta:itineraireChange`, sans reconstruction (un recalcul en libre figeait l'image sur un plan dense).
  // 🩸 Pas la signature de KtaGalerie : bon marché à dessein (premier et dernier sommets), elle ne voit ni un sommet
  // du milieu déplacé, ni un renommage, ni une couleur. Champs « _… » sautés : état d'exécution (marqueur Leaflet,
  // copie de prévisualisation), pas de la donnée, et parfois des cycles.
  function _empreinteDonnees() {
    let h = 2166136261;
    const mel = function (v) { h = Math.imul(h ^ v, 16777619); };
    const num = function (v) { mel(Number.isFinite(v) ? Math.round(v * 1000) : -7); };
    const txt = function (s) { mel(s.length); for (let i = 0; i < s.length; i++) mel(s.codePointAt(i)); };
    const val = function (v, prof) {
      const t = typeof v;
      if (v === null || v === undefined) mel(-1);
      else if (t === "number") num(v);
      else if (t === "string") txt(v);
      else if (t === "boolean") mel(v ? -2 : -3);
      else if (prof > 0 && Array.isArray(v)) { mel(v.length); for (let i = 0; i < v.length; i++) val(v[i], prof - 1); }
      else if (prof > 0 && t === "object" && Object.getPrototypeOf(v) === Object.prototype) objet(v, prof - 1);
    };
    const objet = function (o, prof) {
      for (const k in o) {
        if (k.codePointAt(0) === 95 || !Object.prototype.hasOwnProperty.call(o, k)) continue;
        txt(k);
        const v = o[k];
        if (k !== "points" || !Array.isArray(v)) { val(v, prof); continue; }
        mel(v.length);
        for (let i = 0; i < v.length; i++) {
          const q = v[i];
          if (q) { num(q.x); num(q.y); if (q.level !== undefined) num(q.level); }
        }
      }
    };
    const liste = function (l) {
      mel(-9);
      let n = 0;
      for (let i = 0; i < l.length; i++) {
        const o = l[i];
        if (!o) { mel(-4); continue; }
        if (o._preview || o.type === "itinerary") continue;
        objet(o, 2);
        n++;
      }
      mel(n);
    };
    [window.getRoads, window.getAllEmbeddedRoads, window.getZones, window.getAllEmbeddedZones, window.getStructures,
      window.getAllEmbeddedStructures, window.getEditorPoints, window.getAllEmbeddedPoints].forEach(function (f) {
      liste(_tab(f));
    });
    const L = window.LegendCustomization;
    if (L && typeof L.getSessionState === "function") {
      try { txt(JSON.stringify(L.getSessionState()) || ""); } catch (err) { mel(-5); }
    }
    return h;
  }

  function _typeTraceMontre(type) {
    const f = window._ktaRuntimeFilters || {};
    return type === "itinerary" || !(f.roadTypes instanceof Set) || f.roadTypes.has(type);
  }

  // Passages 🪜 du niveau vers un autre : POI jonction (niveaux liés, raccords validés). Un tracé `jonction` n'en est
  // pas un : c'est une galerie inclinée qu'on parcourt (_pentesDuNiveau).
  // → [{ x, y (px), poi, cibles: [{ niveau, x, y (NaN = même position) }] }].
  function _passages(niveau) {
    const out = [], J = window.KtaPoiJonction;
    if (niveau === null) return out;
    if (J && typeof J.pointsJonction === "function") {
      J.pointsJonction().forEach(function (p) {
        if (!J.moyen(_premierTag(p))) return;   // puits d'aération (pa) : ni 🪜 ni passage
        const nv = J.niveaux(p), acc = J.accroches(p);
        if (nv.indexOf(niveau) < 0) return;
        const raccord = function (n) { return acc.filter(function (a) { return a.level === n; })[0] || null; };
        // 🪜 là où est le volume (KtaGalerie.placePassage) : un POI posé à côté de l'axe est atteint depuis le tube.
        // Escalier en niche : au pied de la volée, contre la paroi (le centre est à 2,5 m de l'axe, hors de portée
        // de qui passe dans la galerie).
        const pl = window.KtaGalerie.placePassage(p, niveau, _e.rendu);
        const pied = pl && pl.niche ? window.KtaGalerie.PASSAGE.escalier[0] / 2 * _e.sc : 0;
        const ici = pl ? { x: pl.x - Math.cos(pl.ang) * pied, y: pl.y - Math.sin(pl.ang) * pied } : p;
        const cibles = nv.filter(function (n) { return n !== niveau; }).map(function (n) {
          const a = raccord(n);
          return { niveau: n, x: a ? a.x : Number.NaN, y: a ? a.y : Number.NaN };
        });
        out.push({ x: ici.x, y: ici.y, poi: p, cibles: cibles });
      });
    }
    return out;
  }

  // ── Galeries inclinées des tracés jonction (KtaGalerie.pente : dénivelé, hauteurs, part ouverte) ──────────
  // ⚠️ contrat (décision produit) : un tracé `jonction` qui part du niveau affiché ou y arrive se MARCHE. Le sol suit
  // la pente d'un bout à l'autre du tracé (caméra, avatar, ruban de l'itinéraire, chevrons) ; au milieu de sa longueur
  // (plus PENTE.hyst), la scène passe au niveau d'en face SANS fondu (_suivrePente) : les deux scènes dessinent la
  // même galerie à la même place autour de la caméra, décalée du dénivelé, rien ne saute. Dans la galerie, la règle du
  // pas est sa largeur (ni structures ni parois du niveau : on n'est plus à son sol) ; on n'en sort par le côté que
  // près du bout du niveau (_pas). Masquer le type « jonction » ne retire que le dessin. En suivi, le tracker change
  // de niveau au bout du tracé (tracking.js > _basculerNiveauSiTraversee) : la scène suit sans fondu là aussi.
  // → [{ ...KtaGalerie.pente, r, ptsM ([[x, z] m]), x0, z0, x1, z1 (m, boîte élargie de la demi-largeur) }].
  function _pentesDuNiveau(niveau, jonctions) {
    const e = _e, G = window.KtaGalerie, out = [];
    if (niveau === null || !G || typeof G.pente !== "function") return out;
    jonctions.forEach(function (r) {
      const p = G.pente(r, niveau);
      if (!p) return;
      p.r = r;
      p.ptsM = p.pts.map(function (q) { return [q[0] / e.sc, q[1] / e.sc]; });
      p.x0 = Infinity; p.z0 = Infinity; p.x1 = -Infinity; p.z1 = -Infinity;
      p.ptsM.forEach(function (q) {
        p.x0 = Math.min(p.x0, q[0] - p.demi); p.x1 = Math.max(p.x1, q[0] + p.demi);
        p.z0 = Math.min(p.z0, q[1] - p.demi); p.z1 = Math.max(p.z1, q[1] + p.demi);
      });
      // Zones jonction qu'il traverse (KtaGalerie.zonesDePente ; contrat : _entreDe plus bas), en mixte et structures.
      p.zones = e.rendu === "galerie" || typeof G.zonesDePente !== "function" ? [] : G.zonesDePente(r).map(function (z) {
        const en = { z: z, ring: _anneau(z.points, e.sc), x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
        en.ring.forEach(function (q) {
          en.x0 = Math.min(en.x0, q[0]); en.x1 = Math.max(en.x1, q[0]);
          en.z0 = Math.min(en.z0, q[1]); en.z1 = Math.max(en.z1, q[1]);
        });
        p.x0 = Math.min(p.x0, en.x0); p.x1 = Math.max(p.x1, en.x1);
        p.z0 = Math.min(p.z0, en.z0); p.z1 = Math.max(p.z1, en.z1);
        return en;
      }).filter(function (en) { return en.ring.length >= 3; });
      out.push(p);
    });
    return out;
  }

  // Place (x, z m) projetée sur la galerie inclinée p → { p, s (m depuis notre bout), t, lat (m de l'axe, bouts
  // compris), demi (m : demi-largeur de la galerie inclinée à cet endroit, KtaGalerie.demiPente), dy (sol), plafond
  // (m, au-dessus du sol du niveau) }.
  function _surPenteDe(p, x, z) {
    let best = null;
    for (let i = 0; i + 1 < p.ptsM.length; i++) {
      const A = p.ptsM[i], B = p.ptsM[i + 1], dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz;
      const k = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - A[0]) * dx + (z - A[1]) * dz) / l2)) : 0;
      const lat = Math.hypot(x - A[0] - dx * k, z - A[1] - dz * k);
      if (!best || lat < best.lat) best = { lat: lat, s: p.cum[i] + (p.cum[i + 1] - p.cum[i]) * k };
    }
    const t = best.s / p.tot, dy = p.dY * t;
    return { p: p, s: best.s, t: t, lat: best.lat, demi: window.KtaGalerie.demiPente(p, t), dy: dy,
      plafond: dy + p.hA + (p.hB - p.hA) * t };
  }

  // Galerie inclinée sous la place (x, z m) : la plus proche dont l'axe est à moins de sa demi-largeur + `marge` m, ou
  // celle dont une zone jonction contient la place (`zone` posée sur le résultat), ou null.
  function _surPente(x, z, marge) {
    const l = (_e && _e.pentes) || [], m = marge || 0;
    let best = null;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      if (x < p.x0 - m || x > p.x1 + m || z < p.z0 - m || z > p.z1 + m) continue;
      const q = _surPenteDe(p, x, z), en = _zoneDePente(p, x, z);
      if (en) q.zone = en;
      // Zone jonction : toute la chambre porte la pente ; la galerie inclinée la plus proche passe d'abord.
      if ((q.lat <= q.demi + m || en) && (!best || (q.lat <= q.demi + m && q.lat < best.lat))) best = q;
    }
    return best;
  }

  // Sol sous la place : dénivelé de la galerie inclinée qui la porte (m), 0 ailleurs.
  function _solPlace() {
    const e = _e, q = _surPente(e.pos.x / e.sc, e.pos.y / e.sc, 0);
    return q ? q.dy : 0;
  }

  // Au-delà du milieu d'une galerie inclinée (libre, hauteur d'yeux) : la scène passe au niveau d'en face, à la même
  // place, sans fondu ni geste (contrat ci-dessus). Le niveau est tenu comme après 🪜 (niveauLibre). → true si basculé.
  function _suivrePente() {
    const e = _e;
    if (e.mode !== "libre" || e.geste || e.vue === "plongee" || !Number.isInteger(e.niveau)) return false;
    const q = _surPente(e.pos.x / e.sc, e.pos.y / e.sc, 0);
    if (!q || q.s <= q.p.tot / 2 + Math.min(PENTE.hyst, q.p.tot / 4)) return false;
    const cfg = window.APP_CONFIG || {};
    e.niveauLibre = q.p.autre;
    e.actifVu = Number.isInteger(cfg.activeLevel) ? cfg.activeLevel : 0;
    e.changementsNiveau++;
    e.pentesFranchies++;
    console.log("[Vue3D] galerie inclinée : passage au niveau " + q.p.autre);
    _reindexer();
    _majPassage();
    _annoncerNiveau();
    e.sale = true;
    return true;
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

  // Lot coupé à la tranche y0 ≤ y ≤ y1 (m ; ±Infinity : pas de coupe de ce côté) : chaque triangle rogné aux deux
  // plans (coordonnées de texture interpolées), sa normale et sa couleur gardées, le sens des sommets aussi.
  // Volumes de passage d'un niveau voisin tronqués à ce qui est montré (_volumesVoisin).
  Lot.prototype.couper = function (y0, y1) {
    const out = new Lot(), p = this.p, uv = this.uv, avecUv = uv.length > 0;
    const rogner = function (poly, y, sens) {
      if (!Number.isFinite(y)) return poly;
      const r = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], da = sens * (a[1] - y), db = sens * (b[1] - y);
        if (da >= 0) r.push(a);
        if ((da >= 0) !== (db >= 0)) {
          const k = da / (da - db);
          r.push(a.map(function (v, j) { return v + (b[j] - v) * k; }));
        }
      }
      return r;
    };
    for (let t = 0; t < p.length / 9; t++) {
      let poly = [];
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k;
        poly.push([p[i * 3], p[i * 3 + 1], p[i * 3 + 2], avecUv ? uv[i * 2] : 0, avecUv ? uv[i * 2 + 1] : 0]);
      }
      poly = rogner(rogner(poly, y0, 1), y1, -1);
      for (let k = 1; k + 1 < poly.length; k++) {
        [poly[0], poly[k], poly[k + 1]].forEach(function (q) {
          out.p.push(q[0], q[1], q[2]);
          if (avecUv) out.uv.push(q[3], q[4]);
          out.n.push(this.n[t * 9], this.n[t * 9 + 1], this.n[t * 9 + 2]);
          out.c.push(this.c[t * 9], this.c[t * 9 + 1], this.c[t * 9 + 2]);
        }, this);
      }
    }
    return out;
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
    _pavesLigne(points, sc, ep).forEach(function (q) {
      _prisme(lot, q.ring, 0, h, col, true, m, m ? parcouru : undefined);
      parcouru += q.l;
    });
  }

  // Pavés d'une structure en ligne (_murLigne) → [{ ring (contour de sens positif, m), l (longueur du segment, m) }].
  // ⚠️ contrat : les faces que la 3D dessine, relues par _facesStructures (formes posées sur une structure).
  function _pavesLigne(points, sc, ep) {
    const out = [];
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
      out.push({ ring: ring, l: l });
    }
    return out;
  }

  // Épaisseur (m) d'une structure en ligne : mur en ligne, sinon celle d'un front (fronts, types perso en ligne).
  function _epaisseurLigne(type) { return type === "mur-ligne" ? EPAISSEUR_MUR_LIGNE : EPAISSEUR_FRONT; }

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

  // Segment d'itinéraire { a, b (px), s0 (abscisse de a, px) } : bande claire pleine posée sur une bande sombre plus
  // large de 2 × ITI.lisere (le liseré), prolongées d'une demi-largeur aux bouts du segment (coude fermé), puis les
  // chevrons de sens dont l'abscisse tombe dans [s0, s0 + longueur[ (un raccord n'en porte qu'un).
  // Par-dessus un remblais ou un effondrement (_morceauxIti), chaque morceau est posé sur le dessus du volume (sans
  // prolongement contre une face), et une contremarche monte (descend) le long de la face franchie.
  function _rubanIti(lot, r) {
    const e = _e, sc = e.sc, ax = r.a.x / sc, az = r.a.y / sc, bx = r.b.x / sc, bz = r.b.y / sc;
    const L = Math.hypot(bx - ax, bz - az), s0 = (r.s0 || 0) / sc, P = ITI.pas;
    if (L < 1e-6) return;
    const ux = (bx - ax) / L, uz = (bz - az) / L, cols = _couleursIti(), m = ITI.lisere, w = LARGEUR_ITI / 2;
    const mc = _morceauxIti(ax, az, ux, uz, L);
    for (let i = 0; i < mc.length; i++) {
      const h = mc[i].h, e0 = i === 0 ? w : 0, e1 = i === mc.length - 1 ? w : 0;
      const q0 = mc[i].d0 - e0, q1 = mc[i].d1 + e1, m0 = e0 ? m : 0, m1 = e1 ? m : 0;
      _bande(lot, ax + ux * (q0 - m0), az + uz * (q0 - m0), ax + ux * (q1 + m1), az + uz * (q1 + m1),
        LARGEUR_ITI + 2 * m, h + ITI.y - 0.005, cols.lisere);
      _bande(lot, ax + ux * q0, az + uz * q0, ax + ux * q1, az + uz * q1, LARGEUR_ITI, h + ITI.y, cols.ruban);
      if (i > 0 && mc[i].h !== mc[i - 1].h) {
        _contremarche(lot, ax + ux * mc[i].d0, az + uz * mc[i].d0, ux, uz, mc[i].face, mc[i - 1].h, mc[i].h, cols);
      }
    }
    for (let k = Math.ceil((s0 - P / 2) / P); P / 2 + k * P < s0 + L; k++) {
      const d = Math.max(0, P / 2 + k * P - s0), cx = ax + ux * d, cz = az + uz * d;
      _chevronIti(lot, cx, cz, ux, uz, _dessusIti(cx, cz) + ITI.y + ITI.dy, cols.lisere);
      e.itiChevrons++;
    }
  }

  // Chevron « ^ » de sens au sol en (cx, cz) m, pointe dans le sens (ux, uz) : deux branches, un quadrilatère chacune.
  // ⚠️ contrat : ses deux quadrilatères se suivent dans le lot (_mesureIti les lit par paire).
  function _chevronIti(lot, cx, cz, ux, uz, y, col) {
    const l = ITI.chevron, ep = ITI.ep, nx = -uz, nz = ux, px = cx + ux * l / 2, pz = cz + uz * l / 2;
    [-1, 1].forEach(function (cote) {
      const qx = cx - ux * l / 2 + cote * nx * l / 2, qz = cz - uz * l / 2 + cote * nz * l / 2;
      const bx = qx - px, bz = qz - pz, bl = Math.hypot(bx, bz), ox = -bz / bl * ep / 2, oz = bx / bl * ep / 2;
      lot.quad([px + ox, y, pz + oz], [qx + ox, y, qz + oz], [qx - ox, y, qz - oz], [px - ox, y, pz - oz], [0, 1, 0],
        col);
    });
  }

  // ── Itinéraire par-dessus les volumes (remblais, effondrement) ────────────────────────────────────────
  // ⚠️ contrat : ruban, chevrons (de sens et de guidage) et marqueurs de l'itinéraire passent PAR-DESSUS un remblais ou un
  // effondrement dessiné (zones montrées du niveau, _collecter) : posés sur son dessus (HAUTEUR_REMBLAIS de la
  // hauteur) à leur hauteur propre, une contremarche verticale à ITI_FACE devant la face là où le trajet y entre et en
  // sort (ni ruban dans le volume, ni rampe en l'air). Le tracé 2D ne change pas ; les rubans des tracés restent au sol.
  const ITI_SUR = { remblais: true, effondrement: true };
  const ITI_FACE = 0.03;   // m : contremarche décollée de la face (pas de scintillement)

  // Volumes que l'itinéraire enjambe → [{ ring (m), x0, z0, x1, z1 }]. Refaits à _reindexer.
  function _volumesIti(zones) {
    const sc = _e.sc, out = [];
    zones.forEach(function (z) {
      if (!z || !ITI_SUR[z.type] || !Array.isArray(z.points)) return;
      const ring = _anneau(z.points, sc);
      if (ring.length < 3) return;
      const v = { ring: ring, x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
      ring.forEach(function (q) {
        v.x0 = Math.min(v.x0, q[0]); v.x1 = Math.max(v.x1, q[0]); v.z0 = Math.min(v.z0, q[1]); v.z1 = Math.max(v.z1, q[1]);
      });
      out.push(v);
    });
    return out;
  }

  // Hauteur (m) du dessus du volume sous (x, z), 0 hors volume.
  function _dessusIti(x, z) {
    const l = _e.volumesIti;
    if (!l || !l.length) return 0;
    for (let i = 0; i < l.length; i++) {
      const v = l[i], a = v.ring;
      if (x < v.x0 || x > v.x1 || z < v.z0 || z > v.z1) continue;
      let r = false;
      for (let j = 0, k = a.length - 1; j < a.length; k = j++) {
        const p = a[j], q = a[k];
        if ((p[1] > z) !== (q[1] > z) && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) r = !r;
      }
      if (r) return v.h !== undefined ? v.h : _e.hauteur * HAUTEUR_REMBLAIS;
    }
    return 0;
  }

  // Segment de (ax, az), direction (ux, uz), longueur L (m) coupé aux bords des volumes → [{ d0, d1, h, face }] (d en
  // m depuis le début) ; face = direction normée du bord franchi à d0 (morceaux suivants).
  function _morceauxIti(ax, az, ux, uz, L) {
    const vols = _e.volumesIti || [], coupes = [], bx = ax + ux * L, bz = az + uz * L;
    const mx0 = Math.min(ax, bx), mx1 = Math.max(ax, bx), mz0 = Math.min(az, bz), mz1 = Math.max(az, bz);
    vols.forEach(function (v) {
      if (v.x1 < mx0 || v.x0 > mx1 || v.z1 < mz0 || v.z0 > mz1) return;
      for (let j = 0, k = v.ring.length - 1; j < v.ring.length; k = j++) {
        const p = v.ring[k], q = v.ring[j], ex = q[0] - p[0], ez = q[1] - p[1], d = ux * ez - uz * ex;
        if (Math.abs(d) < 1e-12) continue;
        const rx = p[0] - ax, rz = p[1] - az, t = (rx * ez - rz * ex) / d, u = (rx * uz - rz * ux) / d;
        if (t <= 0 || t >= L || u < 0 || u > 1) continue;
        const el = Math.hypot(ex, ez);
        coupes.push({ d: t, face: { ex: ex / el, ez: ez / el } });
      }
    });
    coupes.sort(function (a, b) { return a.d - b.d; });
    coupes.push({ d: L, face: null });
    const out = [];
    let d0 = 0, face = null;
    coupes.forEach(function (c) {
      if (c.d - d0 > 1e-6) {
        const dm = (d0 + c.d) / 2;
        out.push({ d0: d0, d1: c.d, h: _dessusIti(ax + ux * dm, az + uz * dm), face: face });
        d0 = c.d;
      }
      face = c.face || face;
    });
    return out;
  }

  // Contremarche du ruban en (cx, cz) (m) sur la face de direction `face`, de la hauteur hA à hB : bande verticale
  // dans le plan de la face, côté bas, à ITI_FACE devant elle, aussi large que le ruban vu sous l'angle d'entrée.
  function _contremarche(lot, cx, cz, ux, uz, face, hA, hB, cols) {
    if (!face) return;
    const ex = face.ex, ez = face.ez, haut = hB > hA ? -1 : 1;
    let nx = -ez, nz = ex;
    if ((nx * ux + nz * uz) * haut < 0) { nx = -nx; nz = -nz; }
    const sin = Math.max(0.35, Math.abs(ux * ez - uz * ex));
    const y0 = Math.min(hA, hB) + ITI.y, y1 = Math.max(hA, hB) + ITI.y;
    const bande = function (larg, off, col) {
      const w = larg / 2 / sin, px = cx + nx * off, pz = cz + nz * off;
      lot.quad([px - ex * w, y0, pz - ez * w], [px + ex * w, y0, pz + ez * w], [px + ex * w, y1, pz + ez * w],
        [px - ex * w, y1, pz - ez * w], [nx, 0, nz], col);
    };
    bande(LARGEUR_ITI + 2 * ITI.lisere, ITI_FACE, cols.lisere);
    bande(LARGEUR_ITI, ITI_FACE + 0.005, cols.ruban);
  }

  // Couleurs de l'itinéraire, jetons du thème sombre (la scène est noire dans les deux thèmes) : ruban
  // --kta-interaction, liseré et chevrons de sens --kta-fond.
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
    if (t.iti) { _construireTuileIti(t); return; }
    if (_e.galerie) { _construireTuileGalerie(t); return; }
    const sc = _e.sc, h = _e.hauteur, mx = _e.mixte;
    const opaque = new Lot(), murs = new Lot(), transp = new Lot(), lumineux = new Lot(), rubans = new Lot();
    const hachSol = new Lot(), hachRideau = new Lot();
    // Mixte : parois des tubes (pièces de la tuile, bouts ouverts exclus), zones des tubes découpées comme en galerie.
    const parois = new Lot(), paroisUnies = new Lot(), eauTube = new Lot(), remblaisTube = new Lot();
    // Niveaux entremêlés et zones jonction (_paroiEntre, _trousEntre, _zoneJonction) : coupes, trous du gabarit et
    // chambres en pente.
    const trous = {}, solPente = new Lot(), plafondPente = new Lot();
    if (mx) {
      t.parois = []; t.paroisY = [];
      for (let i = 0; i < t.g.length; i++) {
        const ps = mx.paroisDe(t.g[i]), col = _couleurParoi(mx.pieces[t.g[i]]);
        for (let k = 0; k < ps.length; k++) {
          const s = ps[k], x0 = s[0] / sc, z0 = s[1] / sc, x1 = s[2] / sc, z1 = s[3] / sc;
          _paroiEntre(col ? paroisUnies : parois, x0, z0, x1, z1, h, col, t.paroisY);
          t.parois.push([x0, z0, x1, z1]);
        }
      }
      _trousEntre(trous, mx, t.g, h);
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
      const col = !tex ? _couleur("structures", s.type) : tex === "roche" && MASSE_2[s.type]
        ? (_e.teinte2 || (_e.teinte2 = new THREE.Color(TEINTE_MASSE_2))) : BLANC;
      const m = tex ? (tex === "roche" ? ROCHE : PARPAING).m : undefined;
      const lot = tex === "roche" ? roche : tex === "parpaing" ? parpaing : _estMur(s.type) ? murs : opaque;
      const hs = _estMur(s.type) ? h * HAUTEUR_MUR : h;
      const pente = _structurePente(s);
      if (pente) {
        _structureSurPente(lot, s, pente, hs, col, m);
      } else if (_estLigne(s.type)) {
        _murLigne(lot, s.points, sc, _epaisseurLigne(s.type), hs, col, m);
      } else {
        _prisme(lot, _anneau(s.points, sc), 0, hs, col, true, m);
      }
      if (!pente) _structureSurTremie(lot, s, hs, col, m);
    }
    for (let i = 0; i < t.z.length; i++) {
      const z = t.z[i], ring = _anneau(z.points, sc);
      if (ring.length < 3) continue;
      const pz = _penteDeLaZone(z);
      if (pz) {
        _zoneJonction(z, pz, { solPente: solPente, plafondPente: plafondPente, parois: parois, trous: trous });
        continue;
      }
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
      if (r.type !== "itinerary" && !_lignesSol()) continue;
      _compter(_e.rubans, r.type);
      if (r.type === "itinerary") _rubanIti(lumineux, r);
      else if (!_zoneSous((r.a.x + r.b.x) / 2 / sc, (r.a.y + r.b.y) / 2 / sc)) {
        _ruban(rubans, r.a, r.b, sc, LARGEUR_TRACE, 0.03, col);   // dans une zone jonction : sous son sol en pente
      }
    }
    const groupe = new THREE.Group();
    const ajouter = function (lot, mat, ordre, famille) {
      const g = lot.geometrie();
      if (!g) return;
      const m = new THREE.Mesh(g, mat);
      if (famille === "plafond") m.visible = _e.vue !== "plongee";
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
    ajouter(paroisUnies, _e.mats.paroiUnie, 0, "parois");
    ajouter(remblaisTube, _e.mats.opaque, 0, "remblais");
    if (remblaisTex.p.length) _matZone("remblais");
    ajouter(remblaisTex, _e.mats.remblais, 0, "remblais");
    if (eboulis.p.length) _matZone("eboulis");
    ajouter(eboulis, _e.mats.eboulis, 0, "effondrement");
    ajouter(eauTube, _e.mats.eauGalerie, 2, "eau");
    if (solPente.p.length || plafondPente.p.length) {
      const mp = _matsPente();
      ajouter(solPente, mp.sol, ORDRE_SOL, "sol");
      ajouter(plafondPente, mp.plafond, 0, "plafond");
    }
    _ajouterTrous(groupe, trous);
    for (let i = 0; i < t.p.length; i++) {
      const p = t.p[i];
      // Mixte : POI dont l'axe le plus proche (10 m au plus) passe en tube → règle de la galerie (contre la paroi) ;
      // en chambre, près d'une structure ou loin de tout tracé → règle des structures (contre la face d'un pilier).
      const pp = mx && !mx.enChambre(p.x, p.y) ? mx.plusProche(p.x, p.y, POI_GALERIE * sc) : null;
      if (pp && mx.tubeAu(pp.arete, pp.t)) {
        _e.poiTube++;
        _ajouterPanneau(groupe, p, _placePanneau(p) || _contreParoi(p, pp));
      }
      else _ajouterPanneau(groupe, p, _placePanneau(p));
    }
    _e.scene.add(groupe);
    t.obj = groupe;
    _e.sale = true;
  }

  // Tuile de l'itinéraire seul (_poserTuilesIti) : son ruban et ses chevrons, même matériau et même ordre que dans une tuile du plan.
  function _construireTuileIti(t) {
    const lumineux = new Lot(), groupe = new THREE.Group();
    for (let i = 0; i < t.r.length; i++) { _compter(_e.rubans, t.r[i].type); _rubanIti(lumineux, t.r[i]); }
    const g = lumineux.geometrie();
    if (g) {
      const m = new THREE.Mesh(g, _e.mats.iti);
      m.renderOrder = 1;
      m.matrixAutoUpdate = false;
      m.userData.famille = "itineraire";
      groupe.add(m);
    }
    _e.scene.add(groupe);
    t.obj = groupe;
    _e.sale = true;
  }

  // ⚠️ contrat : l'itinéraire a ses propres tuiles dans e.tuiles (clé « i:… », t.iti), à part de celles du plan :
  // construites, montrées et jetées comme elles (_gererTuiles), seules refaites quand seul l'itinéraire change
  // (_refaireIti). Posées après _reprendreTuiles, elles ne sont jamais reprises : un trajet neuf peut garder le
  // compte de segments et l'emprise d'une tuile.
  function _poserTuilesIti(iti) {
    const e = _e, taille = e.tuilesActives ? TUILE : 0;
    _indexer({ structures: [], zones: [], roads: iti, points: [] }, e.sc, taille).forEach(function (t, k) {
      t.iti = true; t.cle = "i:" + k;
      e.tuiles.set(t.cle, t);
    });
    e.compteIti = iti.length;
  }

  // Itinéraire changé seul (`kta:itineraireChange`, données du plan inchangées) : ses tuiles et ses étapes refaites,
  // le reste de la scène gardé (tuiles du plan, volumes, passages, ronds). Chevrons et bandeau : relus par le
  // guidage (guidageForce). Les volumes que le ruban enjambe (_volumesIti) ne dépendent que des zones.
  function _refaireIti() {
    const e = _e, t0 = performance.now();
    e.tuiles.forEach(function (t, k) { if (t.iti) { _libererTuile(t); e.tuiles.delete(k); } });
    const sessionRoads = _tab(window.getRoads).filter(function (r) { return r && !r._preview; });
    const iti = _itiDuNiveau(sessionRoads, e.niveau);
    if (e.compte) e.compte.roads += iti.length - e.compteIti;
    delete e.rubans.itinerary;
    e.itiChevrons = 0;
    _poserTuilesIti(iti);
    _itiMiniCarte(iti);
    _gererTuiles(true);
    _majMarqueursIti();
    _majItiPentes();
    // ⚠️ contrat de la greffe : scene(ctx, "refaite") après un itinéraire changé aussi (son groupe reste le même).
    _sceneGreffe();
    e.itiRefaits++;
    e.msIti = performance.now() - t0;
    e.sale = true;
  }

  function _libererTuile(t) {
    if (!t.obj) return;
    t.obj.traverse(function (o) {
      // 🩸 Un Sprite partage la géométrie de three.js : ne jamais la libérer, seulement sa texture. Un halo de danger
      // partage celle de la vue (userData.partage), libérée à la fermeture.
      if (o.geometry && !o.isSprite && !o.userData.partage) o.geometry.dispose();
      // Icône réduite (_iconeReduite) : la texture montrée est partagée, celle du panneau reste la sienne.
      if (o.isSprite && o.material) {
        const t = o.userData.texPanneau || o.material.map;
        if (t) t.dispose();
        o.material.dispose();
      }
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

  // ⚠️ contrat (décision produit) : 🧱 coupé, une paroi de galerie ou de tube prend la couleur de légende du type de
  // tracé de sa pièce (le canon, types `cust-…` et couleurs choisies compris) ; carrefour et coude : le type de
  // l'arête la plus large (galerieEmprise.js > modèle, `type` de la pièce). 🧱 allumé : null, la pierre de taille.
  function _couleurParoi(piece) {
    return _e.textures === true || !piece ? null : _couleur("traces", piece.type, "color");
  }

  // Paroi verticale (m) du sol au plafond, face vers l'intérieur de la galerie (à gauche du bord) : _paroiY.
  function _paroi(lot, x0, z0, x1, z1, h) {
    _paroiY(lot, [x0, z0], [x1, z1], 0, h);
  }

  function _construireTuileGalerie(t) {
    const e = _e, m = e.galerie, sc = e.sc, h = e.hauteur;
    const sol = new Lot(), plafond = new Lot(), parois = new Lot(), opaque = new Lot(), lumineux = new Lot();
    const rubans = new Lot(), paroisUnies = new Lot();
    const eau = new Lot(), hachSol = new Lot(), hachRideau = new Lot(), remblais = new Lot(), eboulis = new Lot();
    t.parois = []; t.paroisY = [];
    const trous = {};
    for (let i = 0; i < t.g.length; i++) {
      const ring = _metres(m.pieces[t.g[i]].pts, sc);
      _dalleTexturee(sol, ring, 0, true);
      _dalleTexturee(plafond, ring, h, false);
      const ps = m.paroisDe(t.g[i]), col = _couleurParoi(m.pieces[t.g[i]]);
      for (let k = 0; k < ps.length; k++) {
        const s = ps[k], x0 = s[0] / sc, z0 = s[1] / sc, x1 = s[2] / sc, z1 = s[3] / sc;
        _paroiEntre(col ? paroisUnies : parois, x0, z0, x1, z1, h, col, t.paroisY);
        t.parois.push([x0, z0, x1, z1]);
      }
    }
    _trousEntre(trous, m, t.g, h);
    // Liseré au sol : la couleur du type de tracé dans la légende.
    for (let i = 0; i < t.a.length; i++) {
      const r = m.aretes[t.a[i]];
      if (!_lignesSol() || !_typeTraceMontre(r.type)) continue;
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
      if (r.type !== "itinerary" && !_lignesSol()) continue;
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
    ajouter(sol, e.mats.solGalerie, ORDRE_SOL, "sol");
    ajouter(plafond, e.mats.plafondGalerie, 0, "plafond");
    if (parois.p.length) _paroiTexturee();
    ajouter(parois, e.mats.paroi, 0, "parois");
    ajouter(paroisUnies, e.mats.paroiUnie, 0, "parois");
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
    _ajouterTrous(groupe, trous);
    for (let i = 0; i < t.p.length; i++) {
      const p = t.p[i];
      const pp = m.plusProche(p.x, p.y, POI_GALERIE * sc);
      if (!pp) { e.poiMasques++; continue; }
      _ajouterPanneau(groupe, p, _placePanneau(p) || _contreParoi(p, pp));
    }
    e.scene.add(groupe);
    t.obj = groupe;
    e.sale = true;
  }

  // Place [x, z] (m) du panneau d'un POI dont le volume de passage est posé ailleurs que lui (_volumesDuNiveau) :
  // au-dessus du volume, jamais à un endroit et le puits à un autre. null sinon.
  function _placePanneau(p) { return (_e.placesPassage && _e.placesPassage.get(p)) || null; }

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
    sp.userData.lettre = 30 / H;   // part de la hauteur du panneau prise par une ligne de texte (POLICE)
    sp.userData.fond = coul.surface;
    sp.scale.set(PANNEAU.l * sp.userData.part, PANNEAU.l * sp.userData.part * sp.userData.ratio, 1);
    const x = ou ? ou[0] : p.x / _e.sc, z = ou ? ou[1] : p.y / _e.sc;
    sp.position.set(x, Number.isFinite(o.y) ? o.y : Math.min(_e.oeil + 0.4, _e.hauteur - 0.3), z);
    sp.renderOrder = 10;
    const jonction = passage ? (p._v3dJonction || p) : null;
    // `point` : le POI d'origine (celui de la carte), dont la fiche s'ouvre au toucher (_toucher).
    sp.userData.texPanneau = tex;
    // `url`, `passage`, `lie` : l'icône réduite et le rang du dé-chevauchement (_majPanneaux, _desencombrer).
    sp.userData.poi = { x: x, z: z, anneau: ou ? null : _volumeContenant(x, z), nom: nom, jonction: jonction,
      danger: danger, favori: favori, bord: bord, genre: o.genre || "poi", point: p._v3dJonction || p,
      url: url, passage: passage, lie: !o.bord && _liaisonsPortail(p._v3dJonction || p).length > 0,
      icone: false, masque: false };
    _e.panneaux.add(sp);
    _e.panneauxGen++;
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
  // ⚠️ contrat (décision produit) : un POI dont la plaque est posée sur une paroi n'a pas de panneau (la plaque porte
  // son nom, _plaque) ; `force` : le panneau de la plaque unie, au-delà de PLAQUE.max noms.
  function _ajouterPanneau(groupe, p, ou, force) {
    if (!force && _e.plaquesParoi && _e.plaquesParoi.has(p._v3dJonction || p)) return null;
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
    for (let i = 0; i < l.length; i++) { if (_dansRing(l[i], x, z)) return l[i]; }
    return null;
  }

  // (x, z) (m) dans le contour `a` ([[x, z]], m) ?
  function _dansRing(a, x, z) {
    let dedans = false;
    for (let j = 0, k = a.length - 1; j < a.length; k = j++) {
      const p = a[j], q = a[k];
      if ((p[1] > z) !== (q[1] > z) && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) dedans = !dedans;
    }
    return dedans;
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

  // Panneaux : dans le rayon de scène (_rayonScene, depuis son centre : _centreScene), échelle 1 → 0,5 et opacité
  // 1 → 0,4 vers la limite. De près (distance à la caméra) : rien sous PRES.min, fondu jusqu'à PRES.net, et jamais plus
  // large que PRES.ecran de l'écran (champ horizontal de la caméra à cette distance). En vue plongeante, jamais de
  // lettres sous PANNEAU_LETTRE_MIN px (décision produit : un panneau lu de loin reste lisible, la scène non).
  // ⚠️ contrat (décision produit, comme la carte 2D) : en vue plongeante, un panneau de POI qui couvrirait plus de
  // PANNEAU_REDUIT.sol m de sol devient son icône seule (PANNEAU_REDUIT.px px, _iconeReduite), le nom revient sous
  // PANNEAU_REDUIT.solNom m ; puis les panneaux qui se recouvrent à l'écran n'en gardent qu'un (_desencombrer). Membres,
  // repères, mesures et 🏁 ne se réduisent jamais ; membres et repères ne se masquent qu'entre eux (sécurité).
  function _majPanneaux() {
    const e = _e, cam = e.camera.position, c = _centreScene(), px = c.x, pz = c.z;
    const demiV = Math.tan(e.camera.fov * Math.PI / 360), demiChamp = demiV * (e.camera.aspect || 1);
    const hEcran = e.vue === "plongee" && e.cv ? e.cv.clientHeight : 0;
    const W = e.cv ? e.cv.clientWidth : 0, H = e.cv ? e.cv.clientHeight : 0;
    const v = e.v3 || (e.v3 = new THREE.Vector3());
    const R = PANNEAU_REDUIT, candidats = [];
    e.camera.updateMatrixWorld();
    e.panneaux.forEach(function (sp) {
      const u = sp.userData.poi;
      let x = u.x, z = u.z;
      if (u.anneau) { const b = _bordProche(u.anneau, cam.x, cam.z); x = b[0]; z = b[1]; }
      const k = Math.hypot(x - px, z - pz) / _rayonScene();
      const dc = Math.hypot(x - cam.x, sp.position.y - cam.y, z - cam.z);
      const halo = sp.userData.halo;
      if (halo) { halo.visible = k <= 1; halo.position.x = x; halo.position.z = z; }
      const pr = u.jonction ? PRES_PASSAGE : PRES;
      const avant = u.masque;
      u.ecran = null;
      u.masque = false;
      sp.visible = k <= 1 && dc >= pr.min;
      if (!sp.visible) return;
      sp.position.x = x; sp.position.z = z;
      // Profondeur devant la caméra (la largeur à l'écran en dépend) ; derrière elle, la distance suffit.
      v.copy(sp.position).applyMatrix4(e.camera.matrixWorldInverse);
      const prof = -v.z, vx = v.x, vy = v.y;
      const ratioNom = sp.userData.ratio || PANNEAU.h / PANNEAU.l;
      const f = sp.userData.part || 1;
      const pres = Math.min(1, (dc - pr.min) / (pr.net - pr.min));
      let l0 = PANNEAU.l * (1 - 0.5 * k), mpp = 0;
      if (hEcran > 0 && prof > 0 && sp.userData.lettre) {
        // Largeur (avant `f`) dont une ligne fait PANNEAU_LETTRE_MIN px à cette profondeur.
        mpp = 2 * prof * demiV / hEcran;
        l0 = Math.max(l0, PANNEAU_LETTRE_MIN * mpp / (sp.userData.lettre * ratioNom * f));
      }
      // Réduit à l'icône : POI seuls, en plongée ; hystérésis sur la largeur de sol du panneau entier.
      const sol = l0 * f;
      const icone = u.genre === "poi" && mpp > 0 && (u.icone ? sol > R.solNom : sol > R.sol);
      if (icone !== u.icone) _iconeReduite(sp, icone);
      let l, ratio;
      if (icone) {
        l = R.px * mpp; ratio = 1;
        sp.scale.set(l, l, 1);
        sp.material.opacity = (1 - R.opacite * k) * pres;
      } else {
        // En plongée, le plafond porte sur la largeur montrée (l × f), celle d'un panneau sans icône comprise.
        const plafond = hEcran > 0 ? PRES.ecranEdition / f : PRES.ecran;
        l = Math.min(l0, plafond * 2 * (prof > 0 ? prof : dc) * demiChamp) * f; ratio = ratioNom;
        sp.scale.set(l, l * ratio, 1);
        sp.material.opacity = (1 - 0.6 * k) * pres;
      }
      // Place et taille à l'écran (px CSS) pour le dé-chevauchement ; derrière la caméra ou hors champ : rien à
      // départager.
      if (prof <= 0 || !W || !H || !_montreDansScene(sp.parent)) return;
      const w = l / (2 * prof * demiChamp) * W, q = { x: (vx / (prof * demiChamp) + 1) / 2 * W,
        y: (1 - vy / (prof * demiV)) / 2 * H, w: w, h: w * ratio };
      if (q.x + w / 2 < 0 || q.x - w / 2 > W || q.y + q.h / 2 < 0 || q.y - q.h / 2 > H) return;
      u.ecran = q;
      if (u.genre === "poi" || u.genre === "membre" || u.genre === "repere") {
        candidats.push({ sp: sp, u: u, dc: dc, avant: avant, fixe: !hEcran && dc <= DESENCOMBRE.loinYeux });
      }
    });
    _desencombrer(candidats, W, H);
  }

  // Dé-chevauchement : par groupe (POI ; membres et repères), du plus prioritaire au moins prioritaire — membre
  // (un repère ne cache jamais un membre), danger, favori, passage entre niveaux, point lié à un autre plan, puis
  // le plus proche de la caméra (un panneau déjà
  // montré garde un peu d'avance : il ne clignote pas quand deux distances se croisent) —, un panneau qui recouvre
  // un panneau déjà gardé est masqué (visible = false : ni dessiné ni visé). Grille d'écran de DESENCOMBRE.cellule px :
  // chaque panneau ne se compare qu'aux panneaux gardés de ses cellules (jamais n²). `fixe` (près, à hauteur
  // d'yeux) : jamais masqué, il prend sa place d'abord.
  // ⚠️ contrat : refait seulement si la caméra, la taille de la vue ou les panneaux candidats ont changé
  // (e.sigDesencombre) ; sinon les masques de la fois d'avant sont reposés tels quels.
  function _desencombrer(candidats, W, H) {
    const e = _e, m = e.camera.matrixWorld.elements;
    let sig = W + "x" + H + "|" + e.panneauxGen + "|" + candidats.length;
    for (let i = 0; i < 16; i++) sig += "|" + m[i].toFixed(3);
    if (sig === e.sigDesencombre) {
      candidats.forEach(function (c) { c.u.masque = c.avant; if (c.avant) c.sp.visible = false; });
      return;
    }
    e.sigDesencombre = sig;
    const t0 = performance.now();
    const rang = function (u) {
      return u.genre === "membre" ? -1 : u.danger ? 0 : u.favori ? 1 : u.passage ? 2 : u.lie ? 3 : 4;
    };
    candidats.forEach(function (c) { c.r = rang(c.u); c.d = c.avant ? c.dc : c.dc * 0.85; });
    candidats.sort(function (a, b) {
      return (b.fixe - a.fixe) || (a.r - b.r) || (a.d - b.d);
    });
    const C = DESENCOMBRE.cellule, M = DESENCOMBRE.marge / 2, grilles = [new Map(), new Map()];
    let masques = 0;
    candidats.forEach(function (c) {
      const q = c.u.ecran, g = grilles[c.u.genre === "poi" ? 0 : 1];
      const x0 = q.x - q.w / 2 - M, x1 = q.x + q.w / 2 + M, y0 = q.y - q.h / 2 - M, y1 = q.y + q.h / 2 + M;
      const gx0 = Math.floor(x0 / C), gx1 = Math.floor(x1 / C), gy0 = Math.floor(y0 / C), gy1 = Math.floor(y1 / C);
      let couvre = false;
      for (let gx = gx0; gx <= gx1 && !couvre; gx++) {
        for (let gy = gy0; gy <= gy1 && !couvre; gy++) {
          const l = g.get(gx * 100003 + gy);
          for (let i = 0; l && i < l.length; i++) {
            const o = l[i];
            if (x0 < o[2] && x1 > o[0] && y0 < o[3] && y1 > o[1]) { couvre = true; break; }
          }
        }
      }
      c.u.masque = couvre && !c.fixe;
      if (c.u.masque) { c.sp.visible = false; masques++; return; }
      const boite = [x0, y0, x1, y1];
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gy = gy0; gy <= gy1; gy++) {
          const k = gx * 100003 + gy, l = g.get(k);
          if (l) l.push(boite); else g.set(k, [boite]);
        }
      }
    });
    e.desencombre = { candidats: candidats.length, masques: masques, ms: performance.now() - t0,
      fois: ((e.desencombre && e.desencombre.fois) || 0) + 1 };
  }

  // Bascule d'un panneau de POI entre son panneau (texture propre, userData.texPanneau) et son icône réduite (texture
  // partagée par icône et par marque, e.icones) : icône de la carte dans une pastille sombre (lisible sur le calcaire
  // clair), cerclée de rouge (danger) ou de la couleur des passages, ⭐ d'un favori ; sans icône connue, la pastille
  // et un point à la couleur du liseré. 🩸 Une texture partagée n'est jamais libérée avec le panneau (_libererTuile :
  // texPanneau d'abord).
  function _iconeReduite(sp, reduite) {
    const e = _e, u = sp.userData.poi;
    u.icone = reduite;
    u.masque = false;
    if (!reduite) {
      sp.material.map = sp.userData.texPanneau;
      sp.material.needsUpdate = true;
      return;
    }
    const cle = (u.url || "") + "|" + (u.danger || u.passage ? u.bord : "") + "|" + (u.favori ? "f" : "") +
      (u.url ? "" : "|" + u.bord);
    let tex = e.icones.get(cle);
    if (!tex) {
      const N = 96, cv = document.createElement("canvas"), ctx = cv.getContext("2d"), coul = _jetonsSombres();
      cv.width = cv.height = N;
      const dessiner = function (img) {
        ctx.clearRect(0, 0, N, N);
        ctx.beginPath(); ctx.arc(N / 2, N / 2, N / 2 - 4, 0, Math.PI * 2);
        ctx.globalAlpha = 0.85; ctx.fillStyle = coul.fond; ctx.fill(); ctx.globalAlpha = 1;
        if (u.danger || u.passage) { ctx.lineWidth = 6; ctx.strokeStyle = u.bord; ctx.stroke(); }
        if (img) {
          try { ctx.drawImage(img, 18, 18, N - 36, N - 36); } catch (err) { /* illisible */ }
        } else if (!u.url) {
          ctx.beginPath(); ctx.arc(N / 2, N / 2, 12, 0, Math.PI * 2); ctx.fillStyle = u.bord; ctx.fill();
        }
        if (u.favori) {
          _etoile(ctx, N - 18, 18, 15);
          ctx.fillStyle = coul.accent; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = coul.fond; ctx.stroke();
        }
      };
      dessiner(null);
      tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      e.icones.set(cle, tex);
      if (u.url) {
        const img = new Image();
        img.addEventListener("load", function () {
          if (_e !== e) return;
          dessiner(img);
          tex.needsUpdate = true;
          e.sale = true;
        });
        img.src = u.url;
      }
    }
    sp.material.map = tex;
    sp.material.needsUpdate = true;
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
    // Répétition posée par _appliquerPortee (le carré de sol suit la portée et le recul).
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
    const grain = function () { graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0; return graine / 4294967296; };
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
    const grain = function () { graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0; return graine / 4294967296; };
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
    const grain = function () { graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0; return graine / 4294967296; };
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
    const fab = function (nom, dessin, graine, recule, teinte) {
      const t = _texturesPeintes(nom, dessin, graine);
      const o = { map: t.couleur, normalMap: t.normale, vertexColors: !!teinte };
      if (recule) Object.assign(o, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      return new THREE.MeshLambertMaterial(o);
    };
    e.mats.roche = fab("roche", _rocheBrute, ROCHE.graine, false, true);   // teinte par sommet : 2e masse
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
      sol: new THREE.MeshLambertMaterial(Object.assign({ map: grain }, SOL_RECULE)),
      plafond: new THREE.MeshLambertMaterial({ map: grain, side: THREE.BackSide }),
      avatar: new THREE.MeshBasicMaterial({ color: 0xf4c542 }),
      solGalerie: new THREE.MeshLambertMaterial(Object.assign({ map: monde }, SOL_RECULE)),
      plafondGalerie: new THREE.MeshLambertMaterial({ map: monde }),
      paroi: new THREE.MeshLambertMaterial({ map: _e.moellons, side: THREE.DoubleSide }),
      paroiUnie: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
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
        stencilWrite: true, stencilRef: ref, stencilWriteMask: ref, stencilFunc: THREE.AlwaysStencilFunc,
        stencilZPass: THREE.ReplaceStencilOp });
    };
    _grainSol(m, _e.textures);
    m.boucheSol = bouche(1);
    m.bouchePlafond = bouche(2);
    // Bouche d'un conduit qui traverse la roche du niveau du dessus (_sommetPlafond) : bit du plafond et bit
    // GABARIT.conduit, que les sols et plafonds des voisins du dessus respectent (_matsVoisins).
    m.bouchePlafondConduit = bouche(2 | 64);
    [[m.sol, 1], [m.solGalerie, 1], [m.rubans, 1], [m.plafond, 2], [m.plafondGalerie, 2]].forEach(function (x) {
      x[0].stencilWrite = true;   // test du gabarit (opérations « garder » : rien n'y est écrit)
      x[0].stencilRef = x[1];
      x[0].stencilFuncMask = x[1];   // son bit seul (GABARIT : les voisins et les trous ont les leurs)
      x[0].stencilFunc = THREE.NotEqualStencilFunc;
    });
    return m;
  }

  // ⚠️ contrat (décision produit) : 🧱 coupé, sol et plafond (carré qui suit et pièces des galeries) sont NOIRS dans
  // les trois rendus ; parois à la couleur de leur tracé, structures et zones à celle de la légende, panneaux,
  // itinéraire, liserés et plan au sol passent dessus. Allumé, le grain calcaire. Rien à reconstruire : le matériau
  // change.
  function _grainSol(m, oui) {
    [[m.sol, _e.grain], [m.plafond, _e.grain], [m.solGalerie, _e.grainMonde], [m.plafondGalerie, _e.grainMonde]]
      .forEach(function (q) {
        q[0].map = oui ? q[1] : null;
        q[0].color.set(oui ? 0xffffff : 0x000000);
        q[0].needsUpdate = true;
      });
  }

  function _monterScene() {
    const e = _e;
    // Reprise du contexte : les voisins de l'ancienne scène ne sont jamais libérés sur la nouvelle (_voisinsPreparer
    // les refait au _reindexer qui suit).
    e.voisins = []; e.matsV = null; e.matsEstompes = null; e.matsPente = null; e.matsTrous = null; e.entreSig = undefined;
    e.panneaux = new Set();
    e.panneauxGen = 0;
    e.icones = new Map();
    e.sigDesencombre = null;
    e.scene = new THREE.Scene();
    e.scene.background = new THREE.Color(0x000000);
    e.scene.fog = new THREE.Fog(0x000000, e.distance * 0.45, e.distance);   // suit la portée : _appliquerPortee
    e.camera = new THREE.PerspectiveCamera(70, 1, 0.05, e.distance + 5);
    e.camera.rotation.order = "YXZ";
    e.scene.add(e.camera);
    e.mats = _materiaux();
    e.texCiel = null;   // 🩸 refaite avec la scène (reprise du contexte) : jamais celle de l'ancien contexte
    e.plaques = new Map();   // contenu (nom, 2ᵉ ligne, variante) → texture d'une plaque (_texPlaque), de cette scène
    // Sol et plafond : un carré qui suit la position, plus grand que le rayon de scène ; carré unité mis à
    // l'échelle (_appliquerPortee), la répétition du grain suit.
    const plan = new THREE.PlaneGeometry(1, 1, 8, 8);
    plan.rotateX(-Math.PI / 2);
    e.sol = new THREE.Mesh(plan, e.mats.sol);
    e.sol.renderOrder = ORDRE_SOL;
    e.plafond = new THREE.Mesh(plan, e.mats.plafond);
    e.plafond.position.y = e.hauteur;
    e.scene.add(e.sol, e.plafond);
    // Tête (porte la lampe) et silhouette visible en vue plongeante.
    e.tete = new THREE.Object3D();
    e.tete.rotation.order = "YXZ";
    e.scene.add(e.tete);
    // Lampe frontale : portée = distance de vue (au-delà, le brouillard est noir de toute façon), décroissance douce ;
    // force, portée, décroissance et cône selon les réglages ⚙️ de la lampe et le facteur d'une greffe (_lampeGreffe).
    e.lampe = new THREE.SpotLight(0xfff1d6, LAMPE.force, e.distance, 0.62, PENOMBRE.defaut, 1.2);
    e.lampe.position.set(0, 0.05, 0);
    e.lampe.target.position.set(0, -0.3, -1);
    e.tete.add(e.lampe, e.lampe.target);
    e.halo = new THREE.PointLight(0xfff1d6, LAMPE.halo, 4.5, 2);
    e.tete.add(e.halo);
    _lampeGreffe();
    e.ambiance = new THREE.AmbientLight(0xffffff, AMBIANCE.nuit);
    e.scene.add(e.ambiance);
    // 🩸 Toujours dans la scène, à 0 hors Plein jour : le nombre de lumières entre dans les shaders de three.js, en
    // ajouter ou en retirer au gré de la case recompilerait tous les matériaux (à-coup). Cible laissée à l'origine
    // (hors scène) : la direction est sa seule position (_orienterSoleil).
    e.soleil = new THREE.DirectionalLight(SOLEIL.couleur, 0);
    e.scene.add(e.soleil);
    _orienterSoleil();
    // Membres, repères et itinéraires d'une extension (_majEquipe) ; géométries partagées refaites avec la scène.
    e.equipe = new THREE.Group();
    e.scene.add(e.equipe);
    e.equipeSig = null;
    e.matsEquipe = new Map();
    e.geoMembre = e.geoHalo = null;
    // Lampes des membres (_lampeMembre) : texture, cône et lumières refaits avec la scène (reprise du contexte).
    e.lampesMembres = []; e.lampesActives = []; e.lampesEquipe = null;
    e.texLampeMembre = e.geoFaisceau = e.matFaisceau = null;
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
  // niveau ou la hauteur changent ; sprites dans _e.panneaux (même fondu et même échelle que les POI). Chaque
  // silhouette porte une lampe frontale (_lampeMembre), visible jusqu'à la portée réglée, jamais au-delà.
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

  // Lampe frontale d'un membre (LAMPE_MEMBRE) : halo sur la tête et, si la présence donne un cap, faisceau visible
  // devant lui ; taille, force et lumière réelle suivies à chaque image (_majLampesMembres). Jamais sur notre place :
  // notre avatar (vue d'édition) n'est pas un membre, et notre lampe est celle de la vue.
  function _lampeMembre(s, couleur, cap) {
    const e = _e, L = LAMPE_MEMBRE;
    if (!e.texLampeMembre) e.texLampeMembre = _texLampeMembre();
    const c = new THREE.Color(L.couleur), m = new THREE.Color();
    try { m.setStyle(String(couleur)); c.lerp(m, L.teinte); } catch (err) { /* blanc chaud seul */ }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: e.texLampeMembre, color: c, fog: false,
      depthTest: true, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false }));
    sp.userData.partage = true;   // texture commune : libérée avec la vue (_demonter), pas avec le membre
    sp.userData.famille = "lampeMembre";
    s.add(sp);
    const y = _hauteurSilhouette() - MEMBRE.tete, aCap = Number.isFinite(cap);
    let faisceau = null;
    if (aCap) {
      if (!e.geoFaisceau) {
        // Sommet à l'origine (la tête), ouverture vers −z : tourné comme la tête de la vue (rotation.y = −cap).
        e.geoFaisceau = new THREE.ConeGeometry(L.cone.rayon, L.cone.long, 16, 1, true);
        e.geoFaisceau.translate(0, -L.cone.long / 2, 0);
        e.geoFaisceau.rotateX(Math.PI / 2);
        e.matFaisceau = new THREE.MeshBasicMaterial({ color: L.couleur, transparent: true, opacity: L.cone.opacite,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      }
      faisceau = new THREE.Mesh(e.geoFaisceau, e.matFaisceau);
      faisceau.rotation.order = "YXZ";
      faisceau.rotation.set(-L.inclinaison, -cap * Math.PI / 180, 0);
      faisceau.position.y = y;
      faisceau.userData.partage = true;
      s.add(faisceau);
    }
    e.lampesMembres.push({ g: s, sprite: sp, faisceau: faisceau, cap: aCap ? cap : null, y: y, px: 0, d: 0 });
  }

  // Masque du halo : dégradé radial en alpha seulement (blanc), la teinte vient du matériau (LAMPE_MEMBRE).
  function _texLampeMembre() {
    const cv = document.createElement("canvas"), n = 64;
    cv.width = cv.height = n;
    const g = cv.getContext("2d"), d = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    [[0, 1], [0.15, 0.85], [0.4, 0.22], [1, 0]].forEach(function (a) {
      d.addColorStop(a[0], "rgba(255,255,255," + a[1] + ")");
    });
    g.fillStyle = d;
    g.fillRect(0, 0, n, n);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Lumières réelles des membres : créées au premier membre affiché, retirées quand il n'y en a plus. 🩸 Leur nombre
  // entre dans les shaders de three.js (en ajouter ou en retirer les recompile) : jamais au gré des distances, une
  // lumière sans membre proche reste allumée à 0. Sans extension, aucune : rien ne coûte.
  function _lumieresEquipe(oui) {
    const e = _e, L = LAMPE_MEMBRE;
    if (oui && !e.lampesEquipe) {
      e.lampesEquipe = [];
      for (let i = 0; i < L.lumieres; i++) {
        const l = new THREE.SpotLight(L.couleur, 0, L.distance, L.ouvert, L.penombre, L.decay);
        e.scene.add(l, l.target);
        e.lampesEquipe.push(l);
      }
    } else if (!oui && e.lampesEquipe) {
      e.lampesEquipe.forEach(function (l) { e.scene.remove(l, l.target); l.dispose(); });
      e.lampesEquipe = null;
    }
  }

  // À chaque image dessinée (_placerCamera) : halo devant la tête du côté de qui regarde (la sphère de la tête ne le
  // cache pas), taille bornée à l'écran, plus fort de face quand le cap est connu ; les LAMPE_MEMBRE.lumieres membres
  // les plus proches de notre place portent les lumières réelles. Plein jour et vue d'édition : discret.
  // ⚠️ contrat : jamais au-delà de la portée réglée (_rayonScene autour de _centreScene) : plus loin, parois et
  // piliers ne sont pas construits et le halo se verrait à travers la roche (camera.far la dépasse de quelques m).
  function _majLampesMembres() {
    const e = _e, L = LAMPE_MEMBRE, liste = e.lampesMembres;
    e.lampesActives = [];
    if (!liste || !liste.length) return;
    const cam = e.camera.position, h = (e.cv && e.cv.clientHeight) || 800;
    const f = h / (2 * Math.tan(e.camera.fov * Math.PI / 360));
    const discret = _lampeEnVigueur().jour || e.vue === "plongee", k = discret ? L.jour : 1;
    const px = e.pos.x / e.sc, pz = e.pos.y / e.sc, c0 = _centreScene(), r0 = _rayonScene(), proches = [];
    liste.forEach(function (m) {
      const gx = m.g.position.x, gz = m.g.position.z;
      const dans = Math.hypot(gx - c0.x, gz - c0.z) <= r0;
      m.sprite.visible = dans;
      if (m.faisceau) m.faisceau.visible = dans && !discret;
      const dx = cam.x - gx, dy = cam.y - m.y, dz = cam.z - gz, d = Math.hypot(dx, dy, dz) || 1e-3;
      m.d = d;
      if (!dans) return;
      m.sprite.position.set(dx / d * L.devant, m.y + dy / d * L.devant, dz / d * L.devant);
      m.px = Math.max(L.pxMin, Math.min(L.pxMax, L.taille * f / d));
      const s = m.px * d / f;
      m.sprite.scale.set(s, s, 1);
      let face = 1;
      if (m.cap !== null) {
        const c = m.cap * Math.PI / 180, dh = Math.hypot(dx, dz) || 1e-3;
        face = 0.55 + 0.45 * Math.max(0, (Math.sin(c) * dx - Math.cos(c) * dz) / dh);
      }
      m.sprite.material.opacity = face * k;
      const dp = Math.hypot(gx - px, gz - pz);
      if (dp <= Math.min(L.portee, e.distance)) proches.push({ m: m, d: dp });
    });
    proches.sort(function (a, b) { return a.d - b.d; });
    e.lampesActives = proches.slice(0, L.lumieres).map(function (q) { return q.m; });
    (e.lampesEquipe || []).forEach(function (l, i) {
      const m = e.lampesActives[i];
      l.intensity = m ? L.force * k : 0;
      if (!m) return;
      const gx = m.g.position.x, gz = m.g.position.z;
      l.position.set(gx, m.y, gz);
      if (m.cap !== null) {
        const c = m.cap * Math.PI / 180;
        l.angle = L.faisceau;
        l.target.position.set(gx + Math.sin(c) * 3, m.y - 1, gz - Math.cos(c) * 3);
      } else {
        l.angle = L.ouvert;
        l.target.position.set(gx, 0, gz);
      }
      l.target.updateMatrixWorld();
    });
  }

  function _viderEquipe() {
    const e = _e;
    if (!e.equipe) return;
    e.lampesMembres = [];
    e.lampesActives = [];
    e.equipe.children.slice().forEach(function (o) {
      o.traverse(function (q) {
        if (q.geometry && !q.isSprite && !q.userData.partage) q.geometry.dispose();
        if (q.isSprite && q.material) {
          if (q.material.map && !q.userData.partage) q.material.map.dispose();
          q.material.dispose();
        }
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
      _lampeMembre(s, couleur, en3d ? p.cap : null);
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
    _lumieresEquipe(nb.membres > 0);
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
    e.liseres = {}; e.zonesTube = 0; e.poiTube = 0; e.halos = 0; e.itiChevrons = 0;
  }

  // Tuiles refaites sur place (hauteur, affichage) : même index, position, cap, niveau et rendu gardés.
  function _refaireTuiles() {
    const e = _e;
    e.tuiles.forEach(_libererTuile);
    _razCompteurs();
    _majEntreActif();
    e.structPente = new Map(); e.paroisCoupees = 0; e.zonesPente = 0;
    _gererTuiles(true);
    (e.volPassages || []).forEach(_libererVolume);
    _gererVolumes();
    _voisinsPreparer(true);
    e.sale = true;
  }

  // `reprise` (passé par _majDonnees seul) : emprise d'un objet fini depuis la vue (_noterFin) ; les tuiles loin
  // de lui sont reprises telles quelles (_reprendreTuiles). Tout autre appel refait tout.
  function _reindexer(reprise) {
    const e = _e;
    e.reindexations++;
    const anciennes = e.tuiles;
    e.reprise = null;
    if (!reprise) anciennes.forEach(_libererTuile);
    const t0 = performance.now();
    const niveauAvant = e.niveau, renduAvant = e.rendu, hauteurAvant = e.hauteur;
    e.niveau = _niveauCourant();
    _prendreHauteurDuNiveau();
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
    e.jonctions = d.jonctions;
    e.pentes = _pentesDuNiveau(e.niveau, d.jonctions);
    // Zones jonction du niveau : leurs structures des autres niveaux sont dessinées et bloquent avec lui.
    if (!e.galerie) d.structures = d.structures.concat(_structuresEmpruntees(e.niveau, e.pentes));
    e.structPente = new Map(); e.paroisCoupees = 0; e.zonesPente = 0;
    if (e.galerie) e.volumes = null; else _grilleVolumes(d.structures);
    e.volumesIti = _volumesIti(d.zones);
    e.passages = _passages(e.niveau);
    e.passageSig = null;
    (e.volPassages || []).forEach(_libererVolume);
    e.placesPassage = new Map();
    e.volPassages = _volumesDuNiveau(d);
    e.plaquesParoi = new Set(e.volPassages.filter(function (v) { return v.forme === "plaque" && v.point; })
      .map(function (v) { return v.point; }));
    e.volumesIti = e.volumesIti.concat(_volumesItiAcces(e.volPassages));
    const plan = d.roads.filter(function (r) { return r.type !== "itinerary"; });
    e.tuiles = _indexer(Object.assign({}, d, { roads: plan }), e.sc, e.tuilesActives ? TUILE : 0);
    if (reprise) {
      _reprendreTuiles(anciennes, reprise,
        niveauAvant === e.niveau && renduAvant === e.rendu && hauteurAvant === e.hauteur);
    }
    _poserTuilesIti(d.roads.filter(function (r) { return r.type === "itinerary"; }));
    // Objets dessinés que la visée cherche sous le doigt (_objetAuPoint) : ni structures en galerie (pas dessinées),
    // ni itinéraire (calculé), ni jonction (jamais dessinée).
    _donneesMiniCarte(d);
    _itiMiniCarte(d.roads.filter(function (r) { return r.type === "itinerary"; }));
    e.vus = { structures: e.galerie ? [] : d.structures, zones: d.zones,
      roads: d.roads.filter(function (r) { return r.type !== "itinerary" && r.type !== "jonction"; }) };
    e.msIndex = performance.now() - t0;
    // Emprise relue (un objet ajouté peut déborder) : le cran « Tout le plan » et le recul la suivent.
    e.diag = _diagPlan();
    if (e.scene && _distanceEnVigueur() !== e.distance) { e.distance = _distanceEnVigueur(); _appliquerPortee(); }
    _majEntreActif();
    _appliquerRendu();
    _gererTuiles(true);
    _majMarqueursIti();
    _majItiPentes();
    _majRonds();
    _majDistTot();
    // Niveau compté par 📏 = celui de la vue : la carte rejoue son surlignage et son panneau (ouvert) sur lui.
    if (niveauAvant !== e.niveau && typeof window.ktaDistanceTotaleRafraichir === "function") {
      window.ktaDistanceTotaleRafraichir();
    }
    _gererVolumes();
    _sceneGreffe();
    _majNiveauEdition();
    _voisinsPreparer(false);
    _gererVoisins(false);
  }

  // ── Niveaux voisins : les autres niveaux à leur altitude (tuile ⚙️ « Niveaux » : voisins, tous, le mien) ─────
  // ⚠️ contrat (décision produit) : la scène est celle du niveau ACTIF de la 3D ; les autres niveaux montrés (« voisins » :
  // celui juste au-dessus et celui juste au-dessous parmi ceux qui portent quelque chose, ordre de _niveauxEdition ;
  // « tous » ; « le mien » : aucun) sont construits par les MÊMES fonctions de tuile (même rendu, mêmes filtres de la
  // carte : un niveau masqué au ≡ n'est pas montré), décalés de leur altitude (KtaGalerie.denivele : sols et hauteurs
  // de config.js > getNiveauVertical, repli sans sols d'une hauteur de galerie et 2 m de roche par niveau, comme la galerie
  // inclinée). Ils se VOIENT et cachent ce qui est derrière eux, rien de plus : ni la règle du pas, ni la visée
  // (_pointVise), ni les passages, ni le suivi ne les lisent ; le niveau actif ne change que par un passage, une galerie
  // inclinée ou ▲▼. Sans panneaux de POI (décision produit : un panneau est dessiné par-dessus tout, sans profondeur,
  // pour rester lisible ; celui d'un autre niveau se lirait à travers la roche et se toucherait pour un objet qu'on ne
  // peut pas atteindre d'ici), sans volumes de passage (le puits du niveau actif descend jusqu'au niveau qu'il relie,
  // _etenduePassage). Vue d'édition : rien de ce qui est au-dessus du niveau actif (il couvrirait la scène, comme son
  // plafond qu'elle retire), ceux du dessous sans leur plafond.
  // Coût (décision produit, mesures : ETUDE_VUE_3D.md § Niveaux voisins) : seulement les tuiles à portée (même rayon et
  // même 🛡️ que le niveau actif), construites après les siennes, VOISINS_PAR_IMAGE par image au plus ; un voisin
  // inchangé (altitude, hauteur, rendu, textures, données, filtres) est gardé quand la scène change de niveau.
  // 🩸 Gabarit (stencil) : sol, plafond et rubans du niveau actif ne se dessinent pas dans la bouche d'un puits ; ceux
  // d'un voisin, vus par cette bouche, prennent des copies de ces matériaux SANS gabarit (_matsVoisins), sinon le
  // fond du puits serait troué lui aussi.
  const VOISINS_PAR_IMAGE = 2;
  const MATS_GABARIT = ["sol", "plafond", "solGalerie", "plafondGalerie", "rubans"];

  // Réglage à l'ouverture : au doigt, « voisins » à chaque fois (réécrit sur l'appareil) ; au pointeur fin, retenu.
  function _niveauxVusVoulu() {
    const tactile = typeof window.ktaAppareilTactile === "function" && window.ktaAppareilTactile();
    if (tactile) {
      if (typeof window.setVue3DNiveauxVus === "function") window.setVue3DNiveauxVus("voisins");
      return "voisins";
    }
    return typeof window.getVue3DNiveauxVus === "function" ? window.getVue3DNiveauxVus() : "voisins";
  }

  // Niveaux montrés en plus de celui de la scène (du plus haut au plus bas).
  function _niveauxMontres() {
    const e = _e, l = _niveauxEdition(), i = l.indexOf(e.niveau);
    if (e.niveauxVus === "mien" || i < 0) return [];
    if (e.niveauxVus === "tous") return l.filter(function (n) { return n !== e.niveau; });
    return [l[i - 1], l[i + 1]].filter(Number.isInteger);
  }

  // Altitude (m) du sol du niveau n au-dessus de celui de la scène, et son côté (_auDessus : l'ordre de ▲▼).
  // 🩸 Données incohérentes (deux sols égaux, sol du dessus plus bas que celui du dessous : signalées dans la table des
  // niveaux, profondeurNiveaux.js) : jamais du mauvais côté, au pire à la même altitude ; rien ne s'inverse.
  function _altitudeVoisin(n) {
    const G = window.KtaGalerie, N = _e.niveau, dessus = _auDessus(n, N);
    let dy = G && typeof G.denivele === "function" ? G.denivele(N, n) : 0;
    if (!Number.isFinite(dy) || (dessus && dy < 0) || (!dessus && dy > 0)) dy = 0;
    return { dy: dy, dessus: dessus };
  }

  // Ce qui, hors du niveau, fait refaire un voisin : rendu, textures, données, filtres de la carte, greffe.
  function _sigVoisins() {
    const e = _e, f = window._ktaRuntimeFilters || {}, g = window.dataLayerGroups || {}, map = window.map;
    let s = e.rendu + "|" + (e.textures === true) + "|" + (e.donnees ? e.donnees.empreinte : "") + "|" +
      e.tuilesActives + "|" + _permisGreffe("traces") + "|" + _lignesSol() + "|";
    const cmp = function (a, b) { return String(a).localeCompare(String(b)); };
    Object.keys(f).sort(cmp).forEach(function (k) {
      const v = f[k];
      s += k + ":" + (v instanceof Set ? Array.from(v).sort(cmp).join(",") : String(v)) + ";";
    });
    Object.keys(g).sort(cmp).forEach(function (k) {
      s += k + (map && typeof map.hasLayer === "function" && map.hasLayer(g[k]) ? "1" : "0");
    });
    return s + "|" + JSON.stringify((window.APP_CONFIG || {}).visibleLevels || []);
  }

  // Copies des matériaux qui testent le gabarit, relues sur l'original (carte, couleur : 🧱 les change), une par côté
  // ("haut" | "bas") : elles ne lisent que le bit de leur côté (GABARIT : trous d'un niveau entremêlé, _trousEntre),
  // jamais les bouches du niveau actif ; celles du dessus lisent en plus GABARIT.conduit (_sommetPlafond).
  function _matsVoisins(cote) {
    const e = _e, k2 = cote === "haut" ? "haut" : "bas", bits = _bitsVoisin(k2 === "haut");
    if (!e.matsV) e.matsV = {};
    if (!e.matsV[k2]) {
      e.matsV[k2] = {};
      MATS_GABARIT.forEach(function (k) {
        const m = e.mats[k].clone(), bit = /^plafond/.test(k) ? bits.plafond : bits.sol;
        m.stencilWrite = true;
        if (k2 === "haut") {
          // Dessus : caché aussi dans la bouche d'un conduit qui traverse sa roche (dessiné si aucun des deux bits).
          m.stencilRef = 0;
          m.stencilFuncMask = bit | GABARIT.conduit;
          m.stencilFunc = THREE.EqualStencilFunc;
        } else {
          m.stencilRef = bit;
          m.stencilFuncMask = bit;
          m.stencilFunc = THREE.NotEqualStencilFunc;
        }
        e.matsV[k2][k] = m;
      });
    }
    MATS_GABARIT.forEach(function (k) {
      const a = e.mats[k], b = e.matsV[k2][k];
      if (b.map !== a.map || !b.color.equals(a.color)) { b.map = a.map; b.color.copy(a.color); b.needsUpdate = true; }
    });
    return e.matsV[k2];
  }

  function _libererVoisin(v) {
    const e = _e;
    v.tuiles.forEach(function (t) { if (t.obj && t.obj.parent === e.scene) _libererTuile(t); t.obj = null; });
    if (v.plans) { e.scene.remove(v.plans.sol, v.plans.plafond); v.plans = null; }   // géométrie : celle de e.sol
    (v.volumes || []).forEach(_libererVolume);
    v.volumes = []; v.volSig = null;
    e.sale = true;
  }

  // ── Passages et galeries inclinées des niveaux voisins ──────────────────────────────────────────────────────────
  // ⚠️ contrat (décision produit) : un passage (POI jonction : puits, escalier, échelle) ou une galerie inclinée
  // (tracé jonction) qui relie des niveaux montrés SANS toucher le niveau actif (celui-là les construit lui-même) est
  // construit par le niveau montré le plus haut qu'il relie, à l'altitude de ce voisin, et COUPÉ à mi-roche vers
  // chaque niveau qu'il relie et qui n'est pas montré (Lot.couper) : en « Voisins » au +1, la moitié côté 0 d'une
  // pente 0 ↔ −1 ; en « Tous », entier. Mêmes règles que les voisins (portée, VOISINS_PAR_IMAGE, côté caché en vue
  // d'édition), sans bouches ni panneau. Les passages du niveau actif (▲▼, arrivées, raccords, règle du pas) n'en
  // lisent rien.

  // Contexte d'un voisin (niveau, hauteur, modèle, galeries inclinées, matériaux sans gabarit) le temps de `fn`.
  function _avecVoisin(v, pentes, fn) {
    const e = _e, M = _matsVoisins(v.dessus ? "haut" : "bas");
    const garde = { niveau: e.niveau, hauteur: e.hauteur, galerie: e.galerie, mixte: e.mixte, pentes: e.pentes,
      placesPassage: e.placesPassage, msFaces: e.msFaces, facesStructures: e.facesStructures };
    const mats = {};
    MATS_GABARIT.forEach(function (k) { mats[k] = e.mats[k]; e.mats[k] = M[k]; });
    e.niveau = v.niveau; e.hauteur = v.hauteur; e.galerie = v.galerie; e.mixte = v.mixte;
    if (pentes) e.pentes = pentes;
    e.placesPassage = new Map();
    try {
      return fn();
    } finally {
      MATS_GABARIT.forEach(function (k) { e.mats[k] = mats[k]; });
      Object.keys(garde).forEach(function (k) { e[k] = garde[k]; });
    }
  }

  // Volumes que le voisin v construit (contrat ci-dessus), chacun avec sa tranche `coupe` [y0, y1] (m, repère du
  // voisin) et ses niveaux `relie`.
  function _volumesVoisin(v) {
    const e = _e, J = window.KtaPoiJonction, G = window.KtaGalerie, N0 = e.niveau;
    if (!J || !G || N0 === null) return [];
    const montres = [N0].concat(_niveauxMontres()), d = _collecter(v.niveau);
    const vols = _avecVoisin(v, _pentesDuNiveau(v.niveau, d.jonctions), function () { return _volumesDuNiveau(d); });
    const out = [];
    vols.forEach(function (vol) {
      let relie = null;
      if (vol.genre === "pente") relie = [vol.p.r.fromLevel, vol.p.r.toLevel];
      else if (vol.point && J.estJonction(vol.point) && !vol.acces) relie = J.niveaux(vol.point);
      if (!relie || relie.indexOf(N0) >= 0) return;
      const vus = relie.filter(function (n) { return montres.indexOf(n) >= 0; });
      if (!vus.length || Math.max.apply(null, vus) !== v.niveau) return;
      let y0 = -Infinity, y1 = Infinity;
      relie.forEach(function (m) {
        if (m === v.niveau || montres.indexOf(m) >= 0) return;
        const a = G.denivele(v.niveau, m);
        if (!Number.isFinite(a)) return;
        if (a < 0) y0 = Math.max(y0, (a + _hauteurDuNiveau(m)) / 2);
        else y1 = Math.min(y1, (v.hauteur + a) / 2);
      });
      vol.coupe = [y0, y1];
      vol.relie = relie.slice().sort(function (a, b) { return b - a; });
      out.push(vol);
    });
    return out;
  }

  // Volumes du voisin refaits si le niveau actif ou les niveaux montrés ont changé (un voisin gardé les garde sinon).
  function _volumesVoisinAJour(v) {
    const e = _e, cle = e.niveau + "|" + _niveauxMontres().join(",") + "|" + _typeTraceMontre("jonction");
    if (v.volSig === cle) return;
    (v.volumes || []).forEach(_libererVolume);
    v.volSig = cle;
    v.volumes = _volumesVoisin(v);
  }

  function _construireVolumeVoisin(v, vol) {
    const e = _e;
    _avecVoisin(v, null, function () {
      e.volumeVoisin = { coupe: vol.coupe };
      try { _construireVolume(vol); } finally { e.volumeVoisin = null; }
    });
    if (!vol.obj) return;
    // Disque de ciel (puits de surface) : jamais au-dessus d'une coupe.
    if (Number.isFinite(vol.coupe[1])) {
      vol.obj.children.filter(function (o) { return o.userData.famille === "ciel"; })
        .forEach(function (o) { vol.obj.remove(o); if (o.material) o.material.dispose(); });
    }
    vol.obj.position.y = v.dy;
    vol.obj.userData.voisin = v.niveau;
    if (_voisinEstompe(v)) _estomperObjet(vol.obj, _voisinEstompe(v));
  }

  function _voisinNeuf(n, sig) {
    const e = _e, t0 = performance.now(), a = _altitudeVoisin(n), h = _hauteurDuNiveau(n), d = _collecter(n);
    const entre = _entreDe(n, a.dy, h);
    const v = { niveau: n, dy: a.dy, dessus: a.dessus, hauteur: h, galerie: null, mixte: null, plans: null,
      sig: sig + "|" + a.dy + "|" + h + "|" + _sigEntre(entre), entre: entre, plansCaches: _plansCaches(entre, h) };
    if (e.rendu === "galerie") v.galerie = d.galerie = window.KtaGalerie.modele(n);
    if (e.rendu === "mixte") v.mixte = d.mixte = window.KtaGalerie.modele(n, true);
    // Galeries inclinées du voisin (structures le long d'elles, zones jonction qu'il dessine), vues de son niveau.
    v.pentes = _avecVoisin(v, null, function () { return _pentesDuNiveau(n, d.jonctions); });
    _horsZonesActives(d, v.pentes);
    const plan = d.roads.filter(function (r) { return r.type !== "itinerary"; });
    v.tuiles = _indexer(Object.assign({}, d, { roads: plan, points: [] }), e.sc, e.tuilesActives ? TUILE : 0);
    // Mixte et structures : sol et plafond d'un seul tenant, comme ceux du niveau actif (en galerie, ceux des pièces).
    if (!v.galerie) {
      const M = _matsVoisins(a.dessus ? "haut" : "bas");
      v.plans = { sol: new THREE.Mesh(e.sol.geometry, M.sol), plafond: new THREE.Mesh(e.sol.geometry, M.plafond) };
      v.plans.sol.userData.voisin = v.plans.plafond.userData.voisin = n;
      e.scene.add(v.plans.sol, v.plans.plafond);
      const mode = _voisinEstompe(v);
      if (mode) { _estomperObjet(v.plans.sol, mode); _estomperObjet(v.plans.plafond, mode); }
    }
    v.ms = performance.now() - t0;
    return v;
  }

  // Voisins voulus (réglage, niveau de la scène) : gardés s'ils n'ont pas changé, sinon refaits. `tout` : tous refaits
  // (hauteur, 🧱 : _refaireTuiles). Appelé par _reindexer et _refaireTuiles ; les tuiles viennent ensuite (_gererVoisins).
  function _voisinsPreparer(tout) {
    const e = _e, voulus = _niveauxMontres(), sig = _sigVoisins(), gardes = [];
    (e.voisins || []).forEach(function (v) {
      const a = voulus.indexOf(v.niveau) >= 0 ? _altitudeVoisin(v.niveau) : null;
      const hv = a ? _hauteurDuNiveau(v.niveau) : 0;
      if (!tout && a && v.sig === sig + "|" + a.dy + "|" + hv + "|" + _sigEntre(_entreDe(v.niveau, a.dy, hv))) {
        v.dessus = a.dessus;
        gardes.push(v);
      } else _libererVoisin(v);
    });
    voulus.forEach(function (n) {
      if (!gardes.some(function (v) { return v.niveau === n; })) gardes.push(_voisinNeuf(n, sig));
    });
    e.voisins = gardes;
    if (e.matsV) { _matsVoisins("haut"); _matsVoisins("bas"); }
    // Niveaux montrés changés (réglage, côté) : les tuiles du niveau actif portent les trous et coupes de l'union des
    // vides, refaites si leur contexte a changé (les voisins viennent ensuite, _gererVoisins).
    if (_majEntreActif()) {
      e.tuiles.forEach(_libererTuile);
      _razCompteurs();
      _gererTuiles(true);
      (e.volPassages || []).forEach(function (v) { if (v.genre === "pente") _libererVolume(v); });
      _gererVolumes();
    }
    gardes.forEach(_volumesVoisinAJour);
    _estomperVoisins();
    _majSolActif();   // voisin du dessous montré ou non, 🧱 changé (_refaireTuiles)   // côté changé (voisins gardés), originaux changés (🧱)
    e.sale = true;
  }

  // Tuile d'un voisin : la fonction du niveau actif, avec le modèle, la hauteur et les matériaux du voisin ; compteurs
  // de la scène (checkup) laissés à ceux du niveau actif.
  function _construireTuileVoisin(v, t) {
    const e = _e, M = _matsVoisins(v.dessus ? "haut" : "bas");
    const garde = { galerie: e.galerie, mixte: e.mixte, hauteur: e.hauteur, poiMasques: e.poiMasques,
      niveau: e.niveau, pentes: e.pentes, entre: e.entre, bitsPlans: e.bitsPlans, dyContexte: e.dyContexte,
      zonesDecoupees: e.zonesDecoupees, rideaux: e.rideaux, facesRemblais: e.facesRemblais,
      facesEboulis: e.facesEboulis, rubans: e.rubans, liseres: e.liseres, zonesTube: e.zonesTube,
      poiTube: e.poiTube, halos: e.halos, itiChevrons: e.itiChevrons };
    const mats = {};
    MATS_GABARIT.forEach(function (k) { mats[k] = e.mats[k]; e.mats[k] = M[k]; });
    e.galerie = v.galerie; e.mixte = v.mixte; e.hauteur = v.hauteur;
    e.niveau = v.niveau; e.pentes = v.pentes || []; e.entre = v.entre || []; e.bitsPlans = _bitsVoisin(v.dessus);
    e.dyContexte = v.dy;
    _razCompteurs();
    try {
      _construireTuile(t);
    } finally {
      MATS_GABARIT.forEach(function (k) { e.mats[k] = mats[k]; });
      Object.keys(garde).forEach(function (k) { e[k] = garde[k]; });
    }
    if (!t.obj) return;
    t.obj.position.y = v.dy;
    t.obj.userData.voisin = v.niveau;
    if (e.vue === "plongee") {
      t.obj.children.forEach(function (o) { if (o.userData.famille === "plafond") o.visible = false; });
    }
    if (_voisinEstompe(v)) _estomperObjet(t.obj, _voisinEstompe(v));
  }

  // À chaque image (et `tout` pour une mesure) : tuiles des voisins à portée construites, seulement quand celles du
  // niveau actif sont toutes posées (e.construitesImage), montrées, cachées ou jetées comme les siennes.
  function _gererVoisins(tout) {
    const e = _e;
    if (!e.voisins || !e.voisins.length) return;
    const c = _centreScene(), rVue = _rayonScene(), rGarde = rVue + 2 * TUILE;
    const t0 = performance.now();
    let n = tout ? 0 : (e.construitesImage ? VOISINS_PAR_IMAGE : 0);
    e.voisins.forEach(function (v) {
      const cache = _voisinCache(v);
      v.tuiles.forEach(function (t) {
        const d = _distTuile(t, c.x, c.z);
        if (d <= rVue && !cache) {
          if (!t.obj && (tout || n < VOISINS_PAR_IMAGE)) { _construireTuileVoisin(v, t); n++; }
          if (t.obj && !t.obj.visible) { t.obj.visible = true; e.sale = true; }
        } else if (d > rGarde) {
          if (t.obj) { _libererTuile(t); e.sale = true; }
        } else if (t.obj && t.obj.visible) {
          t.obj.visible = false; e.sale = true;
        }
      });
      (v.volumes || []).forEach(function (vol) {
        const d = Math.max(0, Math.hypot(vol.cx - c.x, vol.cz - c.z) - vol.r);
        if (d <= rVue && !cache) {
          if (!vol.obj && (tout || n < VOISINS_PAR_IMAGE)) { _construireVolumeVoisin(v, vol); n++; }
          if (vol.obj && !vol.obj.visible) { vol.obj.visible = true; e.sale = true; }
        } else if (d > rGarde) {
          if (vol.obj) _libererVolume(vol);
        } else if (vol.obj && vol.obj.visible) {
          vol.obj.visible = false; e.sale = true;
        }
      });
    });
    e.msVoisins += performance.now() - t0;
  }

  // Vue changée (yeux / édition) : plafonds des voisins (cachés en vue d'édition), manière estompée (_estomperVoisins) ;
  // montrés ou cachés par _gererVoisins (_voisinCache).
  function _voisinsVue() {
    const e = _e, haut = e.vue === "plongee";
    (e.voisins || []).forEach(function (v) {
      v.tuiles.forEach(function (t) {
        if (t.obj) t.obj.children.forEach(function (o) { if (o.userData.famille === "plafond") o.visible = !haut; });
      });
    });
    _estomperVoisins();
    _gererVoisins(false);
  }

  // Sol et plafond d'un seul tenant des voisins (mixte, structures) : suivent le centre de la scène et la taille du
  // carré du niveau actif (_placerCamera).
  function _placerVoisins(c) {
    const e = _e, haut = e.vue === "plongee", solPlein = _maniereSol() === "plein";
    (e.voisins || []).forEach(function (v) {
      if (!v.plans) return;
      const vu = !(haut && v.dessus);
      v.plans.sol.position.set(c.x, v.dy, c.z);
      v.plans.plafond.position.set(c.x, v.dy + v.hauteur, c.z);
      v.plans.sol.scale.copy(e.sol.scale);
      v.plans.plafond.scale.copy(e.plafond.scale);
      const cache = v.plansCaches || {};
      v.plans.sol.visible = vu && (solPlein || v.dessus) && !cache.sol;
      v.plans.plafond.visible = vu && !haut && !cache.plafond;
    });
  }


  // ── Niveaux entremêlés et zones jonction (lot D du multi-niveau en 3D) ─────────────────────────────────────────
  // ⚠️ contrat (décision produit) : deux niveaux MONTRÉS qui occupent la même tranche de hauteur (écart négatif,
  // getNiveauVertical) suivent l'UNION DES VIDES : c'est ouvert dès que l'un des deux y a un vide ; une paroi, un sol ou
  // un plafond ne reste que là où les deux sont de la roche. Vide d'un niveau : ses pièces en galerie, ses pièces et ses
  // chambres en mixte, partout en structures (_videDe). Parois des tubes coupées dans la tranche commune là où l'autre
  // niveau a un vide derrière elles (_paroiEntre) ; sol et plafond troués par le gabarit au-dessus des pièces de l'autre
  // (_trousEntre, bits GABARIT) ; en structures, une surface prise dans la tranche de l'autre n'est pas dessinée
  // (_plansCaches). Les structures (piliers, murs, fronts) restent pleines : celles d'un autre niveau qui montent dans
  // notre tranche ARRÊTENT le pas (_niveauxQuiBloquent, _juger), quel que soit le réglage « Niveaux » (masquer ne retire
  // que le dessin) ; tout le reste suit le niveau actif. Plan sans écart négatif : rien ne change ici.
  // 🩸 Entre deux niveaux montrés autres que le niveau actif (« Tous »), seules les parois sont coupées : le gabarit n'a
  // qu'un bit par côté pour les sols et plafonds des voisins. En mixte, le sol d'un seul tenant n'est troué qu'au-dessus
  // des pièces (tubes) de l'autre niveau, pas de ses chambres (sans contour).
  // ⚠️ contrat (décision produit) : une zone jonction (KtaGalerie.penteDeZone : zone `pente` sur deux niveaux,
  // traversée par un tracé jonction) est une chambre dont le sol et le plafond suivent la pente de ce tracé, bout à bout
  // (_surPenteDe, la règle de la galerie inclinée), en mixte et en structures ; en galerie, le tracé reste la galerie
  // inclinée seule. Piliers, murs et fronts dessinés dans la zone, et murs et fronts le long d'un tracé jonction (à
  // ENTRE.longe m du bord de sa galerie inclinée), reposent sur le sol en pente et montent jusqu'au plafond en pente
  // (_structurePente). La zone est dessinée par le niveau actif s'il est l'un des siens (ses structures des deux niveaux
  // aussi), sinon par le voisin montré qui la porte : jamais en double. Dans la zone, la règle du pas est celle des
  // structures de ses deux niveaux (_bloqueEnZone) ; on la quitte par un bord seulement là où son sol est à moins de
  // PENTE.sortie de celui du niveau ; la scène change de niveau à mi-longueur du tracé, comme dans la galerie inclinée.
  const ENTRE = { eps: 1e-3, pas: 0.25, zoneFace: 0.5, fin: 1, longe: 1 };
  // Bits du gabarit (stencil) : bouches et trous du sol et du plafond du niveau actif (1, 2), sols et plafonds des
  // voisins du dessus (4, 8) et du dessous (16, 32), conduit dans la roche du dessus (64 : bouche d'un passage,
  // _sommetPlafond). Chaque matériau ne lit et n'écrit que ses bits.
  const GABARIT = { sol: 1, plafond: 2, vSolHaut: 4, vPlafHaut: 8, vSolBas: 16, vPlafBas: 32, conduit: 64 };

  function _bitsVoisin(dessus) {
    return dessus ? { sol: GABARIT.vSolHaut, plafond: GABARIT.vPlafHaut }
      : { sol: GABARIT.vSolBas, plafond: GABARIT.vPlafBas };
  }

  // Vide du niveau n dans le rendu affiché → { m (modèle, null en structures), partout, mixte, vide(x, y px) }.
  function _videDe(n) {
    const e = _e, G = window.KtaGalerie;
    if (e.rendu === "structures" || !G) {
      return { m: null, partout: true, mixte: false, vide: function () { return true; } };
    }
    const mixte = e.rendu === "mixte", m = G.modele(n, mixte);
    if (!m || !m.pieces.length) return { m: null, partout: false, mixte: mixte, vide: function () { return false; } };
    return { m: m, partout: false, mixte: mixte, vide: mixte
      ? function (x, y) { return m.dedans(x, y) || m.enChambre(x, y); }
      : function (x, y) { return m.dedans(x, y); } };
  }

  // Niveau actif et niveaux montrés : altitude de leur sol au-dessus de celui du niveau actif, hauteur, côté.
  function _montresAlt() {
    const e = _e;
    return [{ n: e.niveau, dy: 0, h: e.hauteur, actif: true }].concat(_niveauxMontres().map(function (n) {
      const a = _altitudeVoisin(n);
      return { n: n, dy: a.dy, h: _hauteurDuNiveau(n), dessus: a.dessus, actif: false };
    }));
  }

  // Niveaux montrés entremêlés avec le niveau n (sol à dyN au-dessus du niveau actif, hauteur hN) → [{ niveau, d (sol,
  // repère de n), h, y0, y1 (tranche commune, repère de n), V (_videDe), bits (trous de son sol et de son plafond faits
  // de nos pièces : tous depuis le niveau actif ; depuis un voisin, ceux du niveau actif seulement ; null sinon) }].
  function _entreDe(n, dyN, hN) {
    const e = _e, out = [];
    if (!Number.isInteger(n) || !window.KtaGalerie) return out;
    const actifN = n === e.niveau;
    _montresAlt().forEach(function (o) {
      if (o.n === n) return;
      const d = o.dy - dyN, y0 = Math.max(0, d), y1 = Math.min(hN, d + o.h);
      if (y1 - y0 <= ENTRE.eps) return;
      const bits = actifN ? _bitsVoisin(o.dessus) : o.actif ? { sol: GABARIT.sol, plafond: GABARIT.plafond } : null;
      out.push({ niveau: o.n, d: d, h: o.h, y0: y0, y1: y1, V: _videDe(o.n), bits: bits });
    });
    return out;
  }

  function _sigEntre(l) {
    return (l || []).map(function (o) { return o.niveau + ":" + o.d.toFixed(3) + ":" + o.h; }).join(",");
  }

  // Rendu structures : sol ou plafond du niveau (hauteur h) pris dans la tranche d'un niveau entremêlé → non dessiné.
  function _plansCaches(L, h) {
    const r = { sol: false, plafond: false };
    if (_e.rendu !== "structures") return r;
    (L || []).forEach(function (o) {
      if (o.d < -ENTRE.eps && o.d + o.h > ENTRE.eps) r.sol = true;
      if (o.d < h - ENTRE.eps && o.d + o.h > h + ENTRE.eps) r.plafond = true;
    });
    return r;
  }

  // Contexte du niveau actif relu (ouverture, niveau, hauteur, réglage « Niveaux ») → true s'il a changé.
  function _majEntreActif() {
    const e = _e, L = _entreDe(e.niveau, 0, e.hauteur);
    // Galeries inclinées du niveau : leurs trémies (_plansTremie, _zoneJonction) suivent les niveaux montrés.
    const tremie = !(e.pentes || []).length ? ""
      : _montresAlt().map(function (o) { return o.n + ":" + o.dy; }).join(",");
    const sig = _sigEntre(L) + "|" + e.rendu + "|" + tremie;
    e.entre = L;
    e.plansCaches = _plansCaches(L, e.hauteur);
    e.autresBloquent = _niveauxQuiBloquent();
    const change = e.entreSig !== undefined && e.entreSig !== sig;
    e.entreSig = sig;
    return change;
  }

  // Niveaux dont les structures arrêtent le pas au niveau actif : leur tranche [sol, plafond] recoupe la nôtre
  // (décision produit), montrés ou non. Rendu galerie : aucun (les structures n'y bloquent pas).
  function _niveauxQuiBloquent() {
    const e = _e, out = [];
    if (!Number.isInteger(e.niveau) || e.rendu === "galerie") return out;
    _niveauxEdition().forEach(function (n) {
      if (n === e.niveau) return;
      const a = _altitudeVoisin(n), y0 = Math.max(0, a.dy), y1 = Math.min(e.hauteur, a.dy + _hauteurDuNiveau(n));
      if (y1 - y0 > ENTRE.eps) out.push(n);
    });
    return out;
  }

  function _dansAnneauM(a, x, z) {
    let r = false;
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const p = a[i], q = a[j];
      if ((p[1] > z) !== (q[1] > z) && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) r = !r;
    }
    return r;
  }

  // Zone jonction de la galerie inclinée p sous (x, z m), ou null.
  function _zoneDePente(p, x, z) {
    const l = p.zones || [];
    for (let i = 0; i < l.length; i++) {
      const en = l[i];
      if (x >= en.x0 && x <= en.x1 && z >= en.z0 && z <= en.z1 && _dansAnneauM(en.ring, x, z)) return en;
    }
    return null;
  }

  // Zone jonction de la scène (contexte : e.pentes) sous (x, z m) → { p, en } | null.
  function _zoneSous(x, z) {
    const l = (_e && _e.pentes) || [];
    for (let i = 0; i < l.length; i++) {
      const en = _zoneDePente(l[i], x, z);
      if (en) return { p: l[i], en: en };
    }
    return null;
  }

  // Galerie inclinée dont la zone jonction est z (KtaGalerie.memeObjet : copie d'un calque comprise), ou null.
  function _penteDeLaZone(z) {
    const l = (_e && _e.pentes) || [];
    for (let i = 0; i < l.length; i++) {
      if ((l[i].zones || []).some(function (en) { return window.KtaGalerie.memeObjet(en.z, z); })) return l[i];
    }
    return null;
  }

  // Une zone jonction qui touche le niveau actif est dessinée par lui (contrat ci-dessus).
  function _zoneDuNiveauActif(z) {
    const N = _e.niveau;
    return Number.isInteger(N) && typeof window.ktaNiveauxObjet === "function" &&
      window.ktaNiveauxObjet(z).indexOf(N) >= 0;
  }

  function _centreM(pts, sc) {
    let x = 0, z = 0, n = 0;
    pts.forEach(function (q) { if (q && Number.isFinite(q.x)) { x += q.x / sc; z += q.y / sc; n++; } });
    return n ? [x / n, z / n] : [Number.NaN, Number.NaN];
  }

  // Galerie inclinée dont la pente porte la structure s (contrat ci-dessus), ou null.
  function _structurePente(s) {
    const e = _e, l = e.pentes || [];
    if (!l.length || !Array.isArray(s.points)) return null;
    const c = _centreM(s.points, e.sc), z = _zoneSous(c[0], c[1]);
    if (z) return z.p;
    if (!_estLigne(s.type) && !_estMur(s.type)) return null;
    for (let i = 0; i < l.length; i++) {
      const p = l[i], b = ENTRE.longe;
      if (c[0] < p.x0 - b || c[0] > p.x1 + b || c[1] < p.z0 - b || c[1] > p.z1 + b) continue;
      const longe = s.points.every(function (q) {
        if (!q || !Number.isFinite(q.x)) return true;
        const r = _surPenteDe(p, q.x / e.sc, q.y / e.sc);
        return r.lat <= r.demi + ENTRE.longe;
      });
      const m = _surPenteDe(p, c[0], c[1]);
      if (longe && m.s > 1e-3 && m.s < p.tot - 1e-3) return p;
    }
    return null;
  }

  // Contour (m) aux côtés coupés à `max` m au plus (les faces suivent la pente).
  function _anneauFin(ring, max) {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / max));
      for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    return out;
  }

  // Sommets du lot posés depuis `debut` relevés sur la pente p : y = 0 → sol en pente, y = h → plafond en pente
  // (proportionnel entre les deux). Relevé du checkup : emprise verticale dans e.structPente sous `cle`.
  function _releverPente(lot, debut, p, h, cle) {
    let y0 = Infinity, y1 = -Infinity;
    for (let i = debut; i < lot.p.length; i += 3) {
      const q = _surPenteDe(p, lot.p[i], lot.p[i + 2]), y = lot.p[i + 1];
      lot.p[i + 1] = q.dy + y * (q.plafond - q.dy) / h;
      y0 = Math.min(y0, lot.p[i + 1]); y1 = Math.max(y1, lot.p[i + 1]);
    }
    if (cle && _e.structPente && Number.isFinite(y0)) {
      const dy = _e.dyContexte || 0;
      _e.structPente.set(cle, { yMin: +(y0 + dy).toFixed(3), yMax: +(y1 + dy).toFixed(3), autre: p.autre });
    }
  }

  // Structure s posée sur la pente p (piliers, murs, fronts) : la forme plate, contour affiné, puis relevée.
  function _structureSurPente(lot, s, p, hs, col, m) {
    const e = _e, debut = lot.p.length;
    if (_estLigne(s.type)) {
      const p0 = s.points[0];
      let parcouru = m && p0 ? ((p0.x / e.sc * 0.37 + p0.y / e.sc * 0.61) % m + m) % m : 0;
      _pavesLigne(s.points, e.sc, _epaisseurLigne(s.type)).forEach(function (q) {
        _prisme(lot, _anneauFin(q.ring, ENTRE.fin), 0, hs, col, true, m, m ? parcouru : undefined);
        parcouru += q.l;
      });
    } else {
      _prisme(lot, _anneauFin(_anneau(s.points, e.sc), ENTRE.fin), 0, hs, col, true, m);
    }
    _releverPente(lot, debut, p, e.hauteur, s.uid || null);
  }

  // ⚠️ contrat (décision produit) : une structure (pilier, mur, front) qui n'est pas posée sur la pente mais déborde
  // sur une zone jonction n'est jamais suspendue dans la trémie, ni par sa base ni par son sommet. La part de son
  // emprise dans la zone :
  // - descend de sa base (sol de son niveau, 0 du contexte) jusqu'à l'appui : le plafond de la zone s'il passe sous la
  //   base (la roche qui porte), sinon son sol (la base serait dans le vide de la zone) ; rien là où le sol de la zone
  //   est déjà au-dessus de la base ;
  // - monte de son sommet (hs) jusqu'au plafond de la zone là où le sommet est dans le vide de la zone (sol de la zone
  //   dessous, plafond dessus) ; un mur garde son retrait sous le plafond (h − hs, HAUTEUR_MUR : sous un pilier).
  // Faces latérales seules, coupées aux bords de la zone : au-delà, c'est la roche (un prolongement hors de la zone
  // sortirait du sol ou du plafond, dans la tranche d'un niveau entremêlé). Repère du contexte (e.pentes : celles du
  // voisin dans sa tuile), même lot, couleur et motif que la structure.
  function _structureSurTremie(lot, s, hs, col, m) {
    const e = _e, l = (e.pentes || []).filter(function (p) { return p.zones && p.zones.length; });
    if (!l.length || !Array.isArray(s.points) || s.points.length < 2) return;
    let pieces;
    if (_estLigne(s.type)) {
      const p0 = s.points[0];
      let u = m && p0 ? ((p0.x / e.sc * 0.37 + p0.y / e.sc * 0.61) % m + m) % m : 0;
      pieces = _pavesLigne(s.points, e.sc, _epaisseurLigne(s.type)).map(function (q) {
        const o = { ring: q.ring, u0: u };
        u += q.l;
        return o;
      });
    } else {
      const ring = _anneau(s.points, e.sc);
      if (ring.length < 3) return;
      pieces = [{ ring: ring, u0: m ? _origineMotif(ring, m) : 0 }];
    }
    pieces.forEach(function (pc) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      pc.ring.forEach(function (q) {
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]);
      });
      l.forEach(function (p) {
        p.zones.forEach(function (en) {
          if (en.x1 < x0 || en.x0 > x1 || en.z1 < z0 || en.z0 > z1) return;
          _prolongerDansZone(lot, pc.ring, pc.u0, p, en, hs, col, m);
        });
      });
    });
  }

  // Faces du pied et de la tête de la structure de contour `ring` (sens positif, comme _prisme ; sommet à hs) dans la
  // zone `en` de la pente p : chaque côté coupé aux bords de la zone, tous les ENTRE.pas m (sol et plafond suivent la
  // pente) et là où l'une des bornes change de règle (plafond de la zone qui passe la base ou le sommet, sol de la
  // zone qui passe le sommet) : chaque morceau garde la règle de son milieu.
  function _prolongerDansZone(lot, ring, u0, p, en, hs, col, m) {
    const g = _e.hauteur - hs, eps = ENTRE.eps;
    const bornes = [function (r) { return r.plafond - eps; }, function (r) { return r.plafond - g - hs; },
      function (r) { return hs - r.dy; }];
    let s = u0;
    for (let i = 0; i < ring.length; i++) {
      const P = ring[i], Q = ring[(i + 1) % ring.length], dx = Q[0] - P[0], dz = Q[1] - P[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const ts = [0, 1], a = en.ring;
      for (let k = 0, j = a.length - 1; k < a.length; j = k++) {
        const ex = a[k][0] - a[j][0], ez = a[k][1] - a[j][1], den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((a[j][0] - P[0]) * ez - (a[j][1] - P[1]) * ex) / den;
        const u = ((a[j][0] - P[0]) * dz - (a[j][1] - P[1]) * dx) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
      }
      for (let d = ENTRE.pas; d < l; d += ENTRE.pas) ts.push(d / l);
      ts.sort(function (x, y) { return x - y; });
      const pt = function (t) { return [P[0] + dx * t, P[1] + dz * t]; };
      const R = function (t) { const q = pt(t); return _surPenteDe(p, q[0], q[1]); };
      const morceaux = [];
      for (let k = 0; k + 1 < ts.length; k++) {
        const ta = ts[k], tb = ts[k + 1];
        if ((tb - ta) * l < 1e-6) continue;
        const ra = R(ta), rb = R(tb), coupes = [ta];
        bornes.forEach(function (f) {
          const fa = f(ra), fb = f(rb);
          if ((fa > 0) !== (fb > 0)) coupes.push(ta + (tb - ta) * fa / (fa - fb));
        });
        coupes.sort(function (x, y) { return x - y; }).push(tb);
        for (let c = 0; c + 1 < coupes.length; c++) morceaux.push([coupes[c], coupes[c + 1]]);
      }
      const n = [dz / l, 0, -dx / l];
      const quad = function (A, B, ya0, yb0, ya1, yb1, sa, sb) {
        lot.quad([A[0], ya0, A[1]], [B[0], yb0, B[1]], [B[0], yb1, B[1]], [A[0], ya1, A[1]], n, col,
          m ? [sa / m, ya0 / m, sb / m, yb0 / m, sb / m, yb1 / m, sa / m, ya1 / m] : undefined);
      };
      morceaux.forEach(function (mc) {
        const ta = mc[0], tb = mc[1], tm = (ta + tb) / 2, M = pt(tm);
        if ((tb - ta) * l < 1e-6 || !_dansAnneauM(a, M[0], M[1])) return;
        // Règle du milieu du morceau, valeurs à ses bouts (un saut de règle tombe sur une borne).
        const rm = R(tm), ra = R(ta), rb = R(tb), A = pt(ta), B = pt(tb), sa = s + ta * l, sb = s + tb * l;
        const appui = function (r) { return rm.plafond > eps ? Math.min(r.dy, 0) : Math.min(r.plafond, 0); };
        const ya = appui(ra), yb = appui(rb);
        if (ya < -eps || yb < -eps) quad(A, B, ya, yb, 0, 0, sa, sb);
        if (rm.dy < hs && rm.plafond - g > hs) {
          const ha = Math.max(hs, ra.plafond - g), hb = Math.max(hs, rb.plafond - g);
          if (ha > hs + eps || hb > hs + eps) quad(A, B, hs, hs, ha, hb, sa, sb);
        }
      });
      s += l;
    }
  }

  // Triangles (m) d'un contour, coupés au côté le plus long jusqu'à `max` m (le sol en pente reste fidèle à la
  // projection sur un tracé coudé ; sur un tracé droit, la pente est plane et aucune couture ne s'ouvre).
  function _trianglesFins(ring, max) {
    const v2 = ring.map(function (q) { return new THREE.Vector2(q[0], q[1]); }), out = [];
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(v2, []); } catch (err) { return out; }
    const d = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); };
    const mi = function (a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    const couper = function (a, b, c, prof) {
      const ab = d(a, b), bc = d(b, c), ca = d(c, a), lm = Math.max(ab, bc, ca);
      if (lm <= max || prof > 14) { out.push([a, b, c]); return; }
      if (lm === ab) { const m = mi(a, b); couper(a, m, c, prof + 1); couper(m, b, c, prof + 1); }
      else if (lm === bc) { const m = mi(b, c); couper(a, b, m, prof + 1); couper(a, m, c, prof + 1); }
      else { const m = mi(c, a); couper(a, b, m, prof + 1); couper(m, b, c, prof + 1); }
    };
    tris.forEach(function (t) { couper(ring[t[0]], ring[t[1]], ring[t[2]], 0); });
    return out;
  }

  function _platFan(lot, ring, y) {
    for (let i = 1; i + 1 < ring.length; i++) {
      lot.tri([ring[0][0], y, ring[0][1]], [ring[i][0], y, ring[i][1]], [ring[i + 1][0], y, ring[i + 1][1]],
        [0, 1, 0], BLANC);
    }
  }

  // Trous (lots par bit) du sol et du plafond des niveaux entremêlés (contexte e.entre) au-dessus de nos pièces
  // `idx` du modèle m, dans notre tranche [0, h].
  function _trousEntre(trous, m, idx, h) {
    const e = _e, L = e.entre;
    if (!L || !L.length || !m) return;
    L.forEach(function (o) {
      if (!o.bits) return;
      [[o.d, o.bits.sol], [o.d + o.h, o.bits.plafond]].forEach(function (q) {
        if (!(q[0] > ENTRE.eps && q[0] < h - ENTRE.eps)) return;
        const lot = trous[q[1]] || (trous[q[1]] = new Lot());
        idx.forEach(function (i) { _platFan(lot, _metres(m.pieces[i].pts, e.sc), q[0]); });
      });
    });
  }

  function _matTrou(bit) {
    const e = _e;
    if (bit === GABARIT.sol) return e.mats.boucheSol;
    if (bit === GABARIT.plafond) return e.mats.bouchePlafond;
    if (!e.matsTrous) e.matsTrous = {};
    let m = e.matsTrous[bit];
    if (!m) {
      m = e.matsTrous[bit] = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false,
        side: THREE.DoubleSide, stencilWrite: true, stencilRef: bit, stencilWriteMask: bit,
        stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    }
    return m;
  }

  // Maillages des trous dans le groupe d'une tuile (dessinés avant tout, sans couleur ni profondeur).
  function _ajouterTrous(groupe, trous) {
    Object.keys(trous).forEach(function (b) {
      const g = trous[b].geometrie();
      if (!g) return;
      const me = new THREE.Mesh(g, _matTrou(Number(b)));
      me.renderOrder = -1;
      me.matrixAutoUpdate = false;
      me.userData.famille = "trou";
      groupe.add(me);
    });
  }

  // Paroi de tube (m) du sol au plafond h, sans ses morceaux pris dans la tranche d'un niveau entremêlé là où il a un
  // vide derrière elle, ni ceux posés dans une zone jonction (sa chambre en pente la remplace). `out` : morceaux
  // dessinés [x0, z0, x1, z1, y0, y1] (relevé du checkup).
  function _paroiEntre(lot, x0, z0, x1, z1, h, col, out) {
    const e = _e, L = e.entre || [];
    const zones = !e.galerie && (e.pentes || []).some(function (p) { return p.zones && p.zones.length; });
    if (!L.length && !zones) {
      _paroiY(lot, [x0, z0], [x1, z1], 0, h, col);
      if (out) out.push([x0, z0, x1, z1, 0, h]);
      return;
    }
    const sc = e.sc, dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz);
    if (l < 1e-6) return;
    const ts = [0, 1];
    const couper = function (ax, az, bx, bz) {
      const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-12) return;
      const t = ((ax - x0) * ez - (az - z0) * ex) / den, u = ((ax - x0) * dz - (az - z0) * dx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    };
    const bx0 = Math.min(x0, x1) * sc - 1, bx1 = Math.max(x0, x1) * sc + 1;
    const bz0 = Math.min(z0, z1) * sc - 1, bz1 = Math.max(z0, z1) * sc + 1;
    L.forEach(function (o) {
      if (!o.V.m) return;
      o.V.m.piecesPres(bx0, bz0, bx1, bz1).forEach(function (i) {
        const Q = o.V.m.pieces[i].pts;
        for (let k = 0, j = Q.length - 1; k < Q.length; j = k++) {
          couper(Q[j][0] / sc, Q[j][1] / sc, Q[k][0] / sc, Q[k][1] / sc);
        }
      });
      if (o.V.mixte) { for (let s = ENTRE.pas; s < l; s += ENTRE.pas) ts.push(s / l); }
    });
    if (zones) {
      e.pentes.forEach(function (p) {
        p.zones.forEach(function (en) {
          const a = en.ring;
          for (let k = 0, j = a.length - 1; k < a.length; j = k++) couper(a[j][0], a[j][1], a[k][0], a[k][1]);
        });
      });
    }
    ts.sort(function (a, b) { return a - b; });
    const ox = dz / l * 0.02, oz = -dx / l * 0.02;   // vers l'extérieur de la galerie (paroi : intérieur à gauche)
    let prec = null;
    const poser = function (m) {
      m.garde.forEach(function (g) {
        _paroiY(lot, [x0 + dx * m.t0, z0 + dz * m.t0], [x0 + dx * m.t1, z0 + dz * m.t1], g[0], g[1], col);
        if (out) out.push([x0 + dx * m.t0, z0 + dz * m.t0, x0 + dx * m.t1, z0 + dz * m.t1, g[0], g[1]]);
      });
    };
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i], t1 = ts[i + 1];
      if ((t1 - t0) * l < 1e-6) continue;
      const tm = (t0 + t1) / 2, mx = x0 + dx * tm, mz = z0 + dz * tm;
      let garde = zones && _zoneSous(mx, mz) ? [] : [[0, h]];
      L.forEach(function (o) {
        if (!garde.length || !(o.V.partout || o.V.vide((mx + ox) * sc, (mz + oz) * sc))) return;
        const r = [];
        garde.forEach(function (g) {
          if (o.y0 > g[0] + ENTRE.eps) r.push([g[0], Math.min(g[1], o.y0)]);
          if (o.y1 < g[1] - ENTRE.eps) r.push([Math.max(g[0], o.y1), g[1]]);
        });
        garde = r.filter(function (g) { return g[1] - g[0] > ENTRE.eps; });
        e.paroisCoupees = (e.paroisCoupees || 0) + 1;
      });
      const cle = JSON.stringify(garde);
      if (prec && prec.cle === cle && Math.abs(prec.t1 - t0) < 1e-9) { prec.t1 = t1; continue; }
      if (prec) poser(prec);
      prec = { t0: t0, t1: t1, garde: garde, cle: cle };
    }
    if (prec) poser(prec);
  }

  // Matériaux du sol et du plafond d'une zone jonction : ceux des pièces des galeries, sans gabarit (le trou du sol
  // du niveau, posé sur la zone, ne doit pas trouer son sol en pente vu à travers lui).
  function _matsPente() {
    const e = _e;
    if (!e.matsPente) {
      e.matsPente = { sol: e.mats.solGalerie.clone(), plafond: e.mats.plafondGalerie.clone() };
      ["sol", "plafond"].forEach(function (k) {
        e.matsPente[k].stencilWrite = false;
        e.matsPente[k].stencilFunc = THREE.AlwaysStencilFunc;
        e.matsPente[k].side = THREE.DoubleSide;
      });
    }
    [["sol", "solGalerie"], ["plafond", "plafondGalerie"]].forEach(function (q) {
      const a = e.mats[q[1]], b = e.matsPente[q[0]];
      if (b.map !== a.map || !b.color.equals(a.color)) { b.map = a.map; b.color.copy(a.color); b.needsUpdate = true; }
    });
    return e.matsPente;
  }

  // Intervalles [y0, y1] (triés, disjoints) présents dans un seul des deux ensembles.
  function _xorIntervalles(A, B) {
    const bornes = [];
    A.concat(B).forEach(function (g) { if (g[1] - g[0] > ENTRE.eps) bornes.push(g[0], g[1]); });
    bornes.sort(function (a, b) { return a - b; });
    const dans = function (L, y) { return L.some(function (g) { return y > g[0] && y < g[1]; }); };
    const out = [];
    for (let i = 0; i + 1 < bornes.length; i++) {
      const a = bornes[i], b = bornes[i + 1];
      if (b - a <= ENTRE.eps) continue;
      const m = (a + b) / 2;
      if (dans(A, m) === dans(B, m)) continue;
      const der = out[out.length - 1];
      if (der && Math.abs(der[1] - a) <= ENTRE.eps) der[1] = b; else out.push([a, b]);
    }
    return out;
  }

  // Zone jonction z sur la pente p, dans les lots L de la tuile (contrat ci-dessus) : sol et plafond en pente
  // (triangles fins, sommets projetés sur le tracé), faces du bord là où un seul côté est vide (dedans [sol, plafond] ;
  // dehors, la tranche de chacun des deux niveaux de la pente là où il a un vide), trous du sol et du plafond d'un seul
  // tenant du niveau (bits du contexte) et, au niveau actif, de ceux des voisins pris dans sa hauteur.
  function _zoneJonction(z, p, L) {
    const e = _e, ring = _anneau(z.points, e.sc), h = e.hauteur, g = GRAIN_METRES;
    if (ring.length < 3) return;
    let fmin = Infinity, cmax = -Infinity;
    const haut = function (q) {
      const r = _surPenteDe(p, q[0], q[1]);
      fmin = Math.min(fmin, r.dy); cmax = Math.max(cmax, r.plafond);
      return r;
    };
    _trianglesFins(ring, ENTRE.fin).forEach(function (t) {
      const r = t.map(haut);
      const P = function (k, y) { return [t[k][0], y, t[k][1]]; };
      const uv = [t[0][0] / g, t[0][1] / g, t[1][0] / g, t[1][1] / g, t[2][0] / g, t[2][1] / g];
      L.solPente.tri(P(0, r[0].dy), P(1, r[1].dy), P(2, r[2].dy), [0, 1, 0], BLANC, uv);
      L.plafondPente.tri(P(0, r[0].plafond), P(1, r[1].plafond), P(2, r[2].plafond), [0, -1, 0], BLANC, uv);
    });
    const Vici = _videDe(e.niveau), Vautre = _videDe(p.autre);
    const dehors = function (x, zz) {
      const l = [], q = _surPenteDe(p, x, zz);
      if (Vici.partout || Vici.vide(x * e.sc, zz * e.sc)) l.push([0, h]);
      if (Vautre.partout || Vautre.vide(x * e.sc, zz * e.sc)) l.push([p.dY, p.dY + p.hB]);
      if (q.lat <= q.demi) l.push([q.dy, q.plafond]);   // la galerie inclinée continue hors de la zone
      l.sort(function (a, b) { return a[0] - b[0]; });
      const u = [];
      l.forEach(function (q) {
        const der = u[u.length - 1];
        if (der && q[0] <= der[1]) der[1] = Math.max(der[1], q[1]); else u.push(q.slice());
      });
      return u;
    };
    const fin = _anneauFin(ring, ENTRE.zoneFace);
    for (let i = 0; i < fin.length; i++) {
      const A = fin[i], B = fin[(i + 1) % fin.length], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const ox = dz / l * 0.02, oz = -dx / l * 0.02;   // vers l'extérieur (contour de sens positif)
      const ra = haut(A), rb = haut(B);
      const xa = _xorIntervalles([[ra.dy, ra.plafond]], dehors(A[0] + ox, A[1] + oz));
      const xb = _xorIntervalles([[rb.dy, rb.plafond]], dehors(B[0] + ox, B[1] + oz));
      if (xa.length === xb.length) {
        for (let k = 0; k < xa.length; k++) _paroiPente(L.parois, A, B, xa[k][0], xa[k][1], xb[k][0], xb[k][1]);
      } else {
        const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], rm = haut(M);
        _xorIntervalles([[rm.dy, rm.plafond]], dehors(M[0] + ox, M[1] + oz)).forEach(function (q) {
          _paroiPente(L.parois, A, B, q[0], q[1], q[0], q[1]);
        });
      }
    }
    const trou = function (bit, y) { _dessus(L.trous[bit] || (L.trous[bit] = new Lot()), ring, y, BLANC); };
    const bits = e.bitsPlans || { sol: GABARIT.sol, plafond: GABARIT.plafond };
    trou(bits.sol, 0);
    trou(bits.plafond, h);
    // 🩸 Voisins lus à leur source (_montresAlt), jamais e.voisins : les tuiles du niveau actif sont construites AVANT
    // _voisinsPreparer (_reindexer) ; à l'ouverture e.voisins est vide, après une galerie inclinée ce sont ceux de
    // l'ancien niveau, et le sol du niveau d'arrivée passait en travers de la zone pendant la montée.
    if (!e.dyContexte) {
      _montresAlt().forEach(function (v) {
        if (v.actif) return;
        const b = _bitsVoisin(v.dessus), ys = v.dy + v.h;
        if (v.dy > fmin + ENTRE.eps && v.dy < cmax - ENTRE.eps) trou(b.sol, v.dy);
        if (ys > fmin + ENTRE.eps && ys < cmax - ENTRE.eps) trou(b.plafond, ys);
      });
    }
    e.zonesPente = (e.zonesPente || 0) + 1;
  }

  // Structures des autres niveaux des zones jonction du niveau, dans ces zones : dessinées et bloquantes avec lui
  // (contrat ci-dessus). Filtres de la carte appliqués (_montre).
  function _structuresEmpruntees(niveau, pentes) {
    const e = _e, out = [];
    if (!pentes.some(function (p) { return p.zones.length; })) return out;
    _filtrer(_tab(window.getStructures), _tab(window.getAllEmbeddedStructures), "structTypes", function (o) {
      return o.type;
    }).filter(_horsTrace).forEach(function (s) {
      if (!s || !Array.isArray(s.points)) return;
      const lvl = Number.isInteger(s.level) ? s.level : 0;
      if (lvl === niveau) return;
      const c = _centreM(s.points, e.sc);
      if (pentes.some(function (p) { return p.autre === lvl && !!_zoneDePente(p, c[0], c[1]); })) out.push(s);
    });
    return out;
  }

  // Voisin : sans les zones jonction ni les structures que le niveau actif dessine déjà (contrat ci-dessus).
  function _horsZonesActives(d, pentes) {
    const e = _e, G = window.KtaGalerie;
    d.zones = d.zones.filter(function (z) {
      return !(G.estZoneJonction(z) && _zoneDuNiveauActif(z) && G.penteDeZone(z));
    });
    d.structures = d.structures.filter(function (s) {
      const c = _centreM(s.points, e.sc);
      return !pentes.some(function (p) {
        const en = _zoneDePente(p, c[0], c[1]);
        return !!en && _zoneDuNiveauActif(en.z);
      });
    });
  }

  // Règle du pas dans une zone jonction : structures des deux niveaux de la pente et zones qui bouchent (ni paroi de
  // tube ni image de collision : on n'est plus au sol du niveau). → -1 (couloir coupé) ou rayons bloqués à l'arrivée.
  function _bloqueEnZone(x0, y0, x1, y1, ux, uy, autre) {
    const e = _e, r = RAYON_CORPS * e.sc, fx = x1 + ux * r, fy = y1 + uy * r, segs = [];
    if (x1 !== x0 || y1 !== y0) {
      for (let i = 0; i < RAILS.length; i++) {
        const ox = -uy * r * RAILS[i], oy = ux * r * RAILS[i];
        segs.push([x0 + ox, y0 + oy, fx + ox, fy + oy]);
      }
    }
    const nRails = segs.length;
    _rayons(segs, x1, y1, r);
    const n = _niveauPas(), S = window.ktaSegmentsBloquesParStructure;
    const z = window.KtaGalerie.zonesBloquent(segs, n, { x: x0, y: y0 }, e.rendu);
    const a = typeof S === "function" ? S(segs, n, true) : [], b = typeof S === "function" ? S(segs, autre, true) : [];
    let k = 0;
    for (let i = 0; i < segs.length; i++) {
      if (!(z[i] || a[i] || b[i])) continue;
      if (i < nRails) return -1;
      k++;
    }
    return k;
  }

  // Altitude du sol et du plafond (m, repère du niveau de la scène) au point (x, y px) : galerie inclinée ou zone
  // jonction, sinon 0 et la hauteur du niveau (checkup).
  function altitude(x, y) {
    if (!_e) return null;
    const e = _e, q = _surPente(x / e.sc, y / e.sc, 0);
    return { sol: q ? +q.dy.toFixed(3) : 0, plafond: q ? +q.plafond.toFixed(3) : e.hauteur, zone: !!(q && q.zone),
      pente: !!q, t: q ? +q.t.toFixed(4) : null };
  }

  // Relevé (checkup) : ce qu'on VOIT le long d'un rayon parti de (x, y px ; y0 m, repère du niveau de la scène) vers
  // `dir` [dx, dy, dz] (vers le haut par défaut) → { vu: { y, dist, mat, voisin } | null, faces : les 6 premières }.
  // Le gabarit est rejoué : une bouche ou un trou traversé par le rayon masque, sur lui, les matériaux qui testent son
  // bit (c'est ce que fait l'écran pour le pixel de ce rayon) ; une face tournée du mauvais côté ne compte pas.
  function rayon(x, y, y0, dir) {
    if (!_e) return null;
    const e = _e, d = dir || [0, 1, 0], mailles = [];
    e.scene.traverse(function (o) { if (o.isMesh && _montreDansScene(o)) mailles.push(o); });
    const r = new THREE.Raycaster(new THREE.Vector3(x / e.sc, y0, y / e.sc),
      new THREE.Vector3(d[0], d[1], d[2]).normalize(), 0, 400);
    const hits = r.intersectObjects(mailles, false);
    const nomMat = function (m) {
      let n = null;
      Object.keys(e.mats).forEach(function (k) { if (e.mats[k] === m) n = k; });
      Object.keys(e.matsV || {}).forEach(function (c) {
        Object.keys(e.matsV[c]).forEach(function (k) { if (e.matsV[c][k] === m) n = k + ":" + c; });
      });
      return n;
    };
    let bits = 0;
    hits.forEach(function (h) {
      const m = h.object.material;
      if (m.stencilWrite && m.stencilFunc === THREE.AlwaysStencilFunc) bits |= m.stencilRef;
    });
    const faces = hits.filter(function (h) {
      const m = h.object.material;
      if (m.colorWrite === false) return false;
      if (!m.stencilWrite) return true;
      if (m.stencilFunc === THREE.NotEqualStencilFunc) return !(bits & m.stencilFuncMask & m.stencilRef);
      if (m.stencilFunc === THREE.EqualStencilFunc) return (bits & m.stencilFuncMask) === m.stencilRef;
      return true;
    }).map(function (h) {
      let v = null;
      for (let q = h.object; q && v === null; q = q.parent) if (q.userData.voisin !== undefined) v = q.userData.voisin;
      return { y: +h.point.y.toFixed(3), dist: +h.distance.toFixed(3), mat: nomMat(h.object.material),
        famille: h.object.userData.famille || null, voisin: v };
    });
    return { vu: faces[0] || null, faces: faces.slice(0, 6), bits: bits };
  }

  // Relevé (checkup) : contexte entremêlé, parois dessinées (repère du niveau actif, voisins décalés de leur
  // altitude), trous, plans cachés, structures posées sur une pente.
  function entremeles() {
    if (!_e) return null;
    const e = _e, parois = [];
    let trous = 0;
    const lire = function (t, dy, niveau) {
      (t.paroisY || []).forEach(function (w) {
        parois.push({ niveau: niveau, x0: +w[0].toFixed(3), z0: +w[1].toFixed(3), x1: +w[2].toFixed(3),
          z1: +w[3].toFixed(3), y0: +(w[4] + dy).toFixed(3), y1: +(w[5] + dy).toFixed(3) });
      });
      t.obj.traverse(function (o) {
        if (o.isMesh && o.userData.famille === "trou") trous += o.geometry.attributes.position.count / 3;
      });
    };
    e.tuiles.forEach(function (t) { if (t.obj) lire(t, 0, e.niveau); });
    (e.voisins || []).forEach(function (v) {
      v.tuiles.forEach(function (t) { if (t.obj) lire(t, v.dy, v.niveau); });
    });
    return {
      niveaux: (e.entre || []).map(function (o) {
        return { niveau: o.niveau, d: +o.d.toFixed(3), h: o.h, y0: +o.y0.toFixed(3), y1: +o.y1.toFixed(3) };
      }),
      voisins: (e.voisins || []).map(function (v) {
        return { niveau: v.niveau, entre: (v.entre || []).map(function (o) { return o.niveau; }),
          plansCaches: v.plansCaches || null, plansVus: v.plans ? { sol: v.plans.sol.visible,
            plafond: v.plans.plafond.visible } : null };
      }),
      autresBloquent: (e.autresBloquent || []).slice(), plansCaches: Object.assign({}, e.plansCaches || {}),
      plansVus: { sol: !!e.sol && e.sol.visible, plafond: !!e.plafond && e.plafond.visible },
      parois: parois, trous: trous, paroisCoupees: e.paroisCoupees || 0, zonesPente: e.zonesPente || 0,
      structures: e.structPente ? Array.from(e.structPente.entries()).map(function (q) {
        return Object.assign({ uid: q[0] }, q[1]);
      }) : []
    };
  }

  // Réglage ⚙️ « Niveaux » : "voisins", "tous" ou "mien" (retenu sur l'appareil ; au téléphone, « voisins » revient à
  // l'ouverture). Rend le réglage en vigueur, null vue fermée.
  function reglerNiveauxVus(v) {
    const e = _e;
    if (!e) return null;
    const ok = ["voisins", "tous", "mien"].indexOf(v) >= 0 ? v : "voisins";
    e.niveauxVus = typeof window.setVue3DNiveauxVus === "function" ? window.setVue3DNiveauxVus(ok) : ok;
    _voisinsPreparer(false);
    _gererVoisins(false);
    _majNiveauxVus();
    return e.niveauxVus;
  }

  // Ligne « Niveaux » de la tuile : plan multi-niveau seulement ; le réglage en vigueur pressé.
  function _majNiveauxVus() {
    const e = _e, l = e && e.ligneNiveauxVus;
    if (!l) return;
    const multi = (window.APP_CONFIG || {}).multiLevel === true;
    l.hidden = !multi;
    (e.boutonsNiveauxVus || []).forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.niveauxVus === e.niveauxVus ? "true" : "false");
    });
    if (e.ligneEstomper) e.ligneEstomper.hidden = !multi;
    if (e.boutonEstomper) e.boutonEstomper.setAttribute("aria-pressed", _estomper() ? "true" : "false");
  }

  // ── Autres niveaux estompés en vue d'édition (réglage ⚙️ 🌫️, config.js > getVue3DEstomper) ─────────────────────
  // ⚠️ contrat (décision produit) : en vue d'édition, réglage activé (défaut), un voisin du DESSOUS (montré sans
  // plafond) est assombri (ESTOMPE.dessous : part de sa couleur gardée), pour qu'on le lise sous le niveau actif sans le
  // confondre avec lui ; un voisin du DESSUS est montré en FANTÔME (ESTOMPE.fantome : opacité, sans écriture de
  // profondeur, sans sol ni plafond) : on voit où passent ses galeries sans qu'il cache le niveau actif. Réglage coupé :
  // le dessous en rendu d'origine, le dessus pas montré (il couvrirait la scène). À hauteur d'yeux, jamais.
  // Copies des matériaux faites à la demande (_matEstompe, une par matériau d'origine et par manière), recolorées quand
  // l'original change (🧱 : carte et couleur du sol), libérées avec la vue ; un maillage garde son matériau d'origine
  // dans userData.matOrigine. Les voisins ne sont ni visés ni touchés (_pointVise ne lit que les tuiles du niveau
  // actif) : un fantôme ne capte aucun toucher.
  const ESTOMPE = { dessous: 0.35, fantome: 0.16 };

  function _estomper() {
    return typeof window.getVue3DEstomper !== "function" || window.getVue3DEstomper() === true;
  }

  // Copie du matériau m pour la manière `mode` ("sombre" | "fantome").
  function _matEstompe(m, mode) {
    const e = _e;
    if (!m || !m.color) return m;
    if (!e.matsEstompes) e.matsEstompes = new Map();
    const cle = mode + "|" + m.uuid;
    let a = e.matsEstompes.get(cle);
    if (!a) {
      a = m.clone();
      // 🩸 clone() ne reprend pas onBeforeCompile (hachures d'une zone inaccessible, _hachurer).
      if (Object.prototype.hasOwnProperty.call(m, "onBeforeCompile")) a.onBeforeCompile = m.onBeforeCompile;
      if (mode === "fantome") {
        a.transparent = true;
        a.opacity = (m.opacity || 1) * ESTOMPE.fantome;
        a.depthWrite = false;
        a.side = THREE.DoubleSide;
      }
      e.matsEstompes.set(cle, a);
    }
    if (a.map !== m.map || !a.userData.base || !a.userData.base.equals(m.color)) {
      a.map = m.map;
      a.color.copy(m.color);
      if (mode === "sombre") a.color.multiplyScalar(ESTOMPE.dessous);
      a.userData.base = m.color.clone();
      a.needsUpdate = true;
    }
    return a;
  }

  // Matériaux d'un objet d'un voisin selon `mode` (false : d'origine). Fantôme : sol caché (le plafond l'est déjà en
  // vue d'édition), rendu à la sortie.
  function _estomperObjet(obj, mode) {
    if (!obj) return;
    obj.traverse(function (o) {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      if (o.userData.famille === "trou") return;   // gabarit : jamais transparent (dessiné avant tout)
      const base = o.userData.matOrigine || o.material;
      if (mode) { o.userData.matOrigine = base; o.material = _matEstompe(base, mode); }
      else if (o.userData.matOrigine) { o.material = base; delete o.userData.matOrigine; }
      if (mode === "fantome" && o.userData.famille === "sol") { o.visible = false; o.userData.solFantome = true; }
      else if (o.userData.solFantome) { o.visible = true; delete o.userData.solFantome; }
    });
  }

  // Manière d'un voisin : "sombre" (dessous), "fantome" (dessus) en vue d'édition réglage activé, sinon false.
  function _voisinEstompe(v) {
    if (_e.vue !== "plongee" || !_estomper()) return false;
    return v.dessus ? "fantome" : "sombre";
  }

  // Voisin caché : celui du dessus en vue d'édition, réglage coupé.
  function _voisinCache(v) {
    return _e.vue === "plongee" && v.dessus && !_estomper();
  }

  function _estomperVoisin(v) {
    const mode = _voisinEstompe(v);
    v.tuiles.forEach(function (t) { if (t.obj) _estomperObjet(t.obj, mode); });
    (v.volumes || []).forEach(function (vol) { if (vol.obj) _estomperObjet(vol.obj, mode); });
    if (v.plans) { _estomperObjet(v.plans.sol, mode); _estomperObjet(v.plans.plafond, mode); }
    _e.sale = true;
  }

  function _estomperVoisins() { (_e.voisins || []).forEach(_estomperVoisin); }

  // ⚠️ contrat (décision produit) : sol du niveau actif en vue d'édition, rendus structures et mixte (le carré d'un
  // seul tenant cachait entièrement les niveaux du dessous) ; 🌫️ activé, plan au sol éteint, niveau actif qui n'est PAS
  // le plus profond du plan (_niveauxEdition : au plus bas, rien dessous, sol plein) :
  // 🧱 coupé → sol INVISIBLE (ni couleur ni profondeur : on voit le dessous à travers) ; 🧱 allumé et un voisin du
  // dessous montré → sol VOILÉ (SOL_VOILE : opacité, sans écriture de profondeur) ; sinon, sol plein. Sol non plein :
  // le sol d'un seul tenant des voisins du dessous est caché aussi (_placerVoisins) : là où le dessous n'a rien, le
  // vide (noir), jamais un sol de remplacement. Le maillage du sol actif reste là : la visée (_pointVise, dessin,
  // touchers au sol) le lit toujours. 🌫️ coupé, 🗺️ plan au sol allumé (le plan est le sol : il se dessine sans
  // profondeur, le dessous passerait dessus), hauteur d'yeux ou rendu galerie (rien de plein sous les galeries) : sol
  // plein. 🩸 Copies du matériau du sol (gabarit, recul SOL_RECULE compris), jamais le
  // matériau lui-même : les copies des voisins (_matsVoisins) en naissent. Le sol garde ORDRE_SOL : voilé, il passe
  // AVANT l'eau et les zones transparentes (trié par renderOrder dans la liste des transparents).
  const SOL_VOILE = 0.5;

  function _maniereSol() {
    const e = _e;
    if (!e.sol || e.vue !== "plongee" || e.galerie || !_estomper() || (e.dessin && e.dessin.planSol)) return "plein";
    const l = _niveauxEdition(), i = l.indexOf(e.niveau);
    if (i < 0 || i === l.length - 1) return "plein";   // plan à un niveau, niveau le plus profond
    if (e.textures !== true) return "invisible";
    return (e.voisins || []).some(function (v) { return !v.dessus; }) ? "voile" : "plein";
  }

  function _majSolActif() {
    const e = _e;
    if (!e || !e.sol || !e.mats) return;
    const m = _maniereSol(), base = e.mats.sol;
    if (m === "plein") {
      if (e.sol.material !== base) { e.sol.material = base; e.sale = true; }
      return;
    }
    const cle = m === "voile" ? "solVoile" : "solInvisible";
    let a = e.mats[cle];
    if (!a) {
      a = e.mats[cle] = base.clone();
      a.depthWrite = false;
      if (m === "voile") { a.transparent = true; a.opacity = SOL_VOILE; } else a.colorWrite = false;
    }
    if (a.map !== base.map || !a.color.equals(base.color)) {
      a.map = base.map; a.color.copy(base.color); a.needsUpdate = true;
    }
    if (e.sol.material !== a) { e.sol.material = a; e.sale = true; }
  }

  // Bouton 🌫️ de la tuile ⚙️ : bascule (ou pose) le réglage de cet appareil. Rend l'état en vigueur, null vue fermée.
  function reglerEstomper(oui) {
    if (!_e) return null;
    const v = oui === undefined ? !_estomper() : oui !== false;
    if (typeof window.setVue3DEstomper === "function") window.setVue3DEstomper(v);
    _estomperVoisins();
    _gererVoisins(false);
    _majSolActif();
    _majNiveauxVus();
    return _estomper();
  }

  // Relevé (checkup) des voisins : niveau, altitude, côté, hauteur, tuiles construites et montrées, plans.
  function _etatVoisins() {
    const e = _e;
    return { mode: e.niveauxVus, estomper: _estomper(), ms: +(e.msVoisins || 0).toFixed(1), niveaux: (e.voisins || []).map(function (v) {
      let construites = 0, montrees = 0, sansPlafond = 0, maillages = 0, estompes = 0, solsCaches = 0;
      v.tuiles.forEach(function (t) {
        if (!t.obj) return;
        construites++;
        if (_montreDansScene(t.obj)) montrees++;
        t.obj.children.forEach(function (o) { if (o.userData.famille === "plafond" && !o.visible) sansPlafond++; });
        t.obj.traverse(function (o) {
          if (!o.isMesh) return;
          maillages++;
          if (o.userData.matOrigine) estompes++;
          if (o.userData.solFantome && !o.visible) solsCaches++;
        });
      });
      return { niveau: v.niveau, dy: +v.dy.toFixed(3), dessus: v.dessus, hauteur: v.hauteur, tuiles: v.tuiles.size,
        maillages: maillages, estompes: estompes, solsCaches: solsCaches, maniere: _voisinEstompe(v) || null,
        volumes: (v.volumes || []).map(function (vol) {
          // Emprise verticale construite (après coupe), repère du voisin.
          let y0 = Infinity, y1 = -Infinity, bouches = 0;
          if (vol.obj) {
            vol.obj.children.forEach(function (o) {
              if (/^bouche/.test(o.userData.famille || "")) bouches++;
              if (!o.geometry) return;
              if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
              y0 = Math.min(y0, o.geometry.boundingBox.min.y); y1 = Math.max(y1, o.geometry.boundingBox.max.y);
            });
          }
          const r = function (y) { return Number.isFinite(y) ? +y.toFixed(2) : null; };
          return { genre: vol.genre, forme: vol.forme || null, relie: vol.relie, coupe: vol.coupe.map(r),
            construit: !!vol.obj, montre: !!vol.obj && _montreDansScene(vol.obj),
            y: vol.obj ? +vol.obj.position.y.toFixed(3) : null, yMin: r(y0), yMax: r(y1), bouches: bouches,
            maillages: vol.obj ? vol.obj.children.length : 0 };
        }),
        construites: construites, montrees: montrees, plafondsCaches: sansPlafond, y: (function () {
          let y = null;
          v.tuiles.forEach(function (t) { if (t.obj && y === null) y = +t.obj.position.y.toFixed(3); });
          return y;
        })(), plans: v.plans ? { sol: +v.plans.sol.position.y.toFixed(3), plafond: +v.plans.plafond.position.y.toFixed(3),
          vus: v.plans.sol.visible } : null, ms: +(v.ms || 0).toFixed(1) };
    }) };
  }

  // Données du plan changées pendant la vue (signal `kta:donneesPlanChange`, utils.js > ktaSignalerDonneesPlan) :
  // après la rafale (RAFALE) et jamais pendant un geste de passage (rattrapé à sa fin), l'empreinte est relue.
  // Changée : caches de KtaGalerie vidés (sa signature ne voit pas tout), scène refaite sur place (_reindexer :
  // position, cap, tangage, niveau, mode, vue, réglages, itinéraire et guidage gardés), place dégagée en libre si un
  // obstacle neuf la recouvre (en suivi, la place est celle du tracker), fiche ouverte relue. Inchangée : rien.
  // ⚠️ contrat : scène refaite entière, pas tuile par tuile (coût mesuré au checkup, KTA_V3D_PERF=1). Un objet dessiné
  // depuis la vue d'édition attend sa fin : un sommet ne refait rien (_traceEnCours), la fin refait la scène une fois.
  function _majDonnees() {
    const e = _e, d = e.donnees, t = performance.now();
    if (!d.signal || e.geste || _traceEnCours()) return;
    if (t - d.signal < RAFALE.calme && t - d.premier < RAFALE.max) return;
    d.signal = d.premier = 0;
    const emp = _empreinteDonnees();
    d.msEmpreinte = performance.now() - t;
    d.verifs++;
    if (emp === d.empreinte) return;
    d.empreinte = emp;
    // 🩸 La légende est dans l'empreinte : les couleurs résolues (_couleur) sont relues, sinon une couleur changée
    // pendant la vue refaisait la scène à l'ancienne teinte.
    e.couleurs.clear();
    if (window.KtaGalerie && typeof window.KtaGalerie.invalider === "function") window.KtaGalerie.invalider();
    e.filtresChanges = false; e.itiChange = false; e.rondsChange = false;
    e.sortie = null;
    // Reprise locale : seulement juste après la fin d'un objet (une emprise oubliée ne sert jamais plus tard).
    _reindexer(e.reprise && t - e.reprise.t < 2000 ? e.reprise : null);
    // Volumes comptés, comme à l'ouverture : un pilier posé sur la place ne la coince pas pour la règle du pas.
    if (e.mode === "libre" && _degager(true)) d.degagees++;
    _majFicheDonnees();
    d.refaites++;
    d.ms = performance.now() - t;
    if (e.dessin && e.dessin.finT && e.dessin.msFin === null) e.dessin.msFin = performance.now() - e.dessin.finT;
    e.sale = true;
  }

  // 🩸 Jamais l'identité seule pour reconnaître un POI ou un objet : les lectures des calques (utils.js >
  // getAllEmbeddedPoints, getAllEmbeddedZones…) rendent des objets NEUFS à chaque appel, une annulation rend des
  // copies. Même uid ; sans uid (calque ancien), un POI = même id, même place et même niveau, un objet = même type et
  // même tableau de points (partagé par les copies d'un calque). La copie d'un POI jonction posée sur un autre de ses
  // niveaux (_collecter, _v3dJonction) est ramenée à son original.
  function _memeObjet(a, b) {
    a = a && a._v3dJonction || a; b = b && b._v3dJonction || b;
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.uid || b.uid) return a.uid === b.uid;
    if (Array.isArray(a.points) || Array.isArray(b.points)) return a.points === b.points && a.type === b.type;
    return String(a.id || "") === String(b.id || "") && a.x === b.x && a.y === b.y &&
      (a.level || 0) === (b.level || 0);
  }

  // L'objet de `liste` qui est `o` (lui-même d'abord, sinon _memeObjet) → null s'il n'y est pas.
  function _retrouver(liste, o) {
    if (!o) return null;
    if (liste.indexOf(o) >= 0) return o;
    return liste.filter(function (q) { return _memeObjet(q, o); })[0] || null;
  }

  // Fiche ouverte : son POI retrouvé (_retrouver) est relu s'il a changé ; disparu (supprimé depuis la fiche
  // elle-même, annulé), la fiche se ferme.
  function _majFicheDonnees() {
    const e = _e, f = e.fiche;
    if (!f) return;
    if (f.objet) { _majFicheObjet(f); return; }
    const avant = f.point._v3dJonction || f.point;
    const p = _retrouver(_tab(window.getEditorPoints).concat(_tab(window.getAllEmbeddedPoints)), avant);
    if (!p) { _fermerFiche(); return; }
    if (p !== avant || _htmlFiche(p) !== f.html) _ouvrirFiche(p);
  }

  // Fiche d'un objet : retrouvé (_retrouver), elle reste, rouverte sur la copie s'il a été remplacé (annulation,
  // relecture d'un calque) ; disparu de la scène (supprimé, converti, passé à un autre niveau ou masqué), fermée.
  function _majFicheObjet(f) {
    const e = _e, l = _lecteurs(f.famille);
    const o = _retrouver(_tab(l[0]).concat(_tab(l[1])), f.objet);
    if (!o || !_retrouver((e.vus && e.vus[f.famille]) || [], o)) { _fermerFiche(); return; }
    if (o !== f.objet) _ouvrirFicheObjet(_objetVu(f.famille, o));
  }

  // ── Volumes des passages entre niveaux (POI jonction, puits de surface, tracé jonction) ─────────────────
  // ⚠️ contrat (décision produit) : un POI jonction ou un puits de surface montre son volume à la place
  // de KtaGalerie.placePassage (raccord validé du niveau, sinon le POI ramené dans le tube, un escalier dans une niche
  // latérale ; son panneau et 🪜 l'y suivent), selon son moyen (KtaPoiJonction.moyen) : escalier (jes, eso) = cage
  // de 2,5 × 1,5 m à marches ; échelons (jpe, peo) = puits carré de 1,2 m (paroi des galeries), échelons tous les 0,3 m ;
  // corde (jps) = puits nu. Ouvert dans le SOL vers un niveau lié au-dessous, dans le PLAFOND vers un niveau lié
  // au-dessus (le volume dépasse la hauteur et se perd dans le noir), les deux entre trois niveaux. Puits de surface
  // (peo, eso au plus haut de leurs niveaux ; pa partout) : plafond seulement, disque de ciel au sommet (peo, eso) ou
  // tube de 0,8 m à grille (pa, sans moyen : ni 🪜 ni passage). Cadre doré au sol d'un passage, panneau au-dessus.
  // Un tracé `jonction` devient une galerie inclinée (_pente, contrat de _pentesDuNiveau) : sol en pente, parois et
  // plafond là où elle sort de la tranche du niveau, ruban à la couleur du canon au milieu du sol.
  // Construits à portée seulement (_gererVolumes, la règle des tuiles) : rien hors de la distance de vue. Aucune
  // collision : le pas reste la règle du tracker (la galerie inclinée a la sienne : _pas). Les bouches trouent sol et
  // plafond par le gabarit (_materiaux).

  function _volumesDuNiveau(d) {
    const e = _e, J = window.KtaPoiJonction, N = e.niveau, out = [];
    e.msFaces = 0; e.facesStructures = 0;
    if (!J) return out;
    let F = null;
    // Faces des structures dessinées, indexées une fois, seulement si une forme murale n'a pas de paroi de tube.
    const surStructure = function (pl, forme) {
      const t0 = performance.now();
      if (!F) { F = _facesStructures(d.structures); e.facesStructures = F.faces.length; }
      const r = _surStructure(F, pl.x, pl.y, forme);
      e.msFaces += performance.now() - t0;
      return r;
    };
    d.points.forEach(function (p) {
      const src = p._v3dJonction || p, tag = _premierTag(src);
      if (!J.porteNiveaux(tag) && !window.KtaGalerie.ACCES[tag]) return;
      const moyen = J.moyen(tag);
      const autres = N === null || !J.estJonction(src) ? []
        : J.niveaux(src).filter(function (n) { return n !== N; });
      const dessus = autres.some(function (n) { return _auDessus(n, N); });
      const dessous = autres.some(function (n) { return !_auDessus(n, N); });
      const surface = J.TAGS_SURFACE_NIVEAUX.indexOf(tag) >= 0 && !dessus;
      const v = { genre: "poi", tag: tag, moyen: moyen, x: p.x, y: p.y, ext: _etenduePassage(autres),
        forme: !moyen ? "aeration" : moyen === "escalier" ? "escalier" : "puits",
        sol: !!moyen && dessous, plafond: !moyen || dessus || surface, ciel: !!moyen && surface, grille: !moyen,
        echelons: moyen === "echelons", passage: !!moyen && autres.length > 0 };
      if (window.KtaGalerie.ACCES[tag]) Object.assign(v, _volumeAcces(tag));
      if (!v.sol && !v.plafond && !v.acces) return;   // passage sans autre niveau (plan à un niveau) : rien à ouvrir
      const dim = v.forme === "escalier" ? VOLUME.escalier
        : v.forme === "puits" ? [VOLUME.puits, VOLUME.puits] : [VOLUME.aeration, VOLUME.aeration];
      // Place et axe : KtaGalerie.placePassage, le calcul de l'emprise qui ouvre le tube (une seule règle).
      let pl = window.KtaGalerie.placePassage(src, N, e.rendu) || { x: p.x, y: p.y, ang: 0, ramene: false };
      // Forme murale sans paroi de tube à cette place (structures, chambre, loin de tout axe) : sur la face de
      // structure la plus proche (_surStructure), hors rendu galerie ; aucune : le panneau seul.
      if (v.surParoi && !pl.paroi) {
        pl = e.rendu === "galerie" ? null : surStructure(pl, v.forme);
        if (!pl) return;
      }
      v.cote = pl.paroi || 0;
      v.appui = !v.surParoi ? null : pl.structure ? "structure" : "paroi";
      v.point = src;
      v.a = dim[0] / 2; v.b = dim[1] / 2;
      v.x = pl.x; v.y = pl.y; v.ramene = pl.ramene;
      // Escalier : repère retourné quand l'entrée (KtaGalerie, _entree) est du côté +ang, les marches partant de −a ;
      // en niche, ang est la normale vers le fond et l'entrée −1 (pied contre la paroi).
      v.dir = pl.ang + (v.forme === "escalier" && pl.entree === 1 ? Math.PI : 0);
      v.cx = pl.x / e.sc; v.cz = pl.y / e.sc;
      v.r = Math.hypot(v.a, v.b) + VOLUME.marge + VOLUME.cadre;
      // Volume ailleurs que le point (recalé, raccord validé) : son panneau le suit (_placePanneau).
      if (Math.hypot(pl.x - p.x, pl.y - p.y) > 1e-6) e.placesPassage.set(p, [v.cx, v.cz]);
      if (v.comble) {
        v.cone = pl.cone ? { cx: pl.cone.x / e.sc, cz: pl.cone.y / e.sc, R: pl.cone.R }
          : { cx: v.cx, cz: v.cz, R: DIM_ACCES.cone };
      }
      if (v.acces) _dimAcces(v);
      out.push(v);
    });
    // Panneau d'un POI à point précis (poiPrecis.js > centre) que son volume n'a pas déjà placé : au point précis,
    // ramené contre la paroi s'il tombe dans la roche (_contreParoi, la règle des POI).
    const P = window.KtaPoiPrecis, mod = e.galerie || e.mixte;
    if (P) {
      d.points.forEach(function (p) {
        const c = e.placesPassage.has(p) ? null : P.centre(p._v3dJonction || p);
        if (!c) return;
        const pp = mod ? mod.plusProche(c.x, c.y, POI_GALERIE * e.sc) : null;
        e.placesPassage.set(p, pp ? _contreParoi(c, pp) : [c.x / e.sc, c.y / e.sc]);
      });
    }
    return out.concat(_volumesPentes());
  }

  // Étendue verticale (m, repère du niveau de la scène) d'un passage vers les niveaux qu'il relie : `bas` = sol du niveau
  // lié le plus proche au-dessous, `basParoi` = son plafond, `haut` = sol du niveau lié le plus proche au-dessus,
  // `niveauHaut` = ce niveau (null sans niveau de ce côté). ⚠️ contrat (décision produit) : puits, escalier et échelle
  // vont d'un niveau à l'autre à leur altitude réelle (_altitudeVoisin : la même que les niveaux voisins montrés) ; vers
  // le haut, le sommet du conduit suit _sommetPlafond ; jamais une géométrie inversée sur des données incohérentes.
  function _etenduePassage(autres) {
    const out = { bas: null, basParoi: null, haut: null, niveauHaut: null };
    autres.forEach(function (n) {
      const a = _altitudeVoisin(n);
      if (a.dessus) { if (out.haut === null || a.dy < out.haut) { out.haut = a.dy; out.niveauHaut = n; } }
      else if (out.bas === null || a.dy > out.bas) { out.bas = a.dy; out.basParoi = a.dy + _hauteurDuNiveau(n); }
    });
    return out;
  }

  // Volumes des galeries inclinées du niveau (e.pentes), si le type « jonction » est montré (filtres de la carte).
  function _volumesPentes() {
    const e = _e;
    if (!_typeTraceMontre("jonction")) return [];
    return (e.pentes || []).map(function (p) {
      return { genre: "pente", p: p, monte: p.dY > 0, sol: p.dY < 0, plafond: p.dY > 0, x: p.pts[0][0], y: p.pts[0][1],
        cx: (p.x0 + p.x1) / 2, cz: (p.z0 + p.z1) / 2, r: Math.hypot(p.x1 - p.x0, p.z1 - p.z0) / 2 };
    });
  }

  // ⚠️ contrat (décision produit) : plaque, épure et portail sans paroi de tube (KtaGalerie.placePassage passe
  // d'abord, sa paroi gagne toujours) se posent à plat sur la face verticale de structure DESSINÉE (filtres de la
  // carte appliqués : jamais contre un pilier masqué) la plus proche du POI, à FACE_STRUCTURE.portee m au plus, du
  // côté du POI (la face qui le regarde ; POI dans la structure : sa face la plus proche), en face de lui et gardée
  // sur la face quand elle est assez longue. Rien à portée : le panneau seul. Pilier, mur, mur en ligne, front et
  // types perso : les faces des prismes que la 3D dessine (_anneau, _pavesLigne), pas une copie.
  // 🩸 Une face peut être noyée dans une autre structure (mur sous un pilier, pavés d'un mur en ligne qui se
  // recouvrent aux coudes) : refusée si un point à `devant` m devant la forme (centre et bouts) tombe dans un contour.
  // Faces en grille de `cellule` m : seules celles des cases à portée du POI sont lues.
  const FACE_STRUCTURE = { portee: 3, cellule: 4, devant: 0.05 };

  // Demi-longueur (m) d'une forme murale le long de sa face, la plus grande qu'elle puisse prendre.
  function _demiForme(forme) {
    if (forme === "plaque") return PLAQUE.lMax / 2;
    return forme === "epure" ? EPURE.l / 2 : PORTAIL.l / 2;
  }

  // Faces verticales des structures (m) → { faces: [{ ax, az, ux, uz, l, r }], rings, gf, gr (grilles), c }.
  // Contours de sens positif : la normale extérieure d'une face est (uz, −ux), celle de _prisme.
  function _facesStructures(structures) {
    const sc = _e.sc, c = FACE_STRUCTURE.cellule, faces = [], rings = [], gf = new Map(), gr = new Map();
    const poser = function (g, k, x0, z0, x1, z1) {
      for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
        for (let gz = Math.floor(z0 / c); gz <= Math.floor(z1 / c); gz++) {
          const cle = gx + "," + gz;
          if (!g.has(cle)) g.set(cle, []);
          g.get(cle).push(k);
        }
      }
    };
    structures.forEach(function (s) {
      if (!s || !Array.isArray(s.points)) return;
      const anneaux = _estLigne(s.type)
        ? _pavesLigne(s.points, sc, _epaisseurLigne(s.type)).map(function (q) { return q.ring; })
        : [_anneau(s.points, sc)];
      anneaux.forEach(function (ring) {
        if (ring.length < 3) return;
        const r = rings.length;
        rings.push(ring);
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i], q = ring[(i + 1) % ring.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]);
          x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
          if (l < 1e-6) continue;
          faces.push({ ax: p[0], az: p[1], ux: (q[0] - p[0]) / l, uz: (q[1] - p[1]) / l, l: l, r: r });
          poser(gf, faces.length - 1, Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]),
            Math.max(p[1], q[1]));
        }
        poser(gr, r, x0, z0, x1, z1);
      });
    });
    return { faces: faces, rings: rings, gf: gf, gr: gr, c: c };
  }

  // (x, z) (m) dans un contour de structure de F ?
  function _dansStructure(F, x, z) {
    const l = F.gr.get(Math.floor(x / F.c) + "," + Math.floor(z / F.c));
    if (!l) return false;
    for (let i = 0; i < l.length; i++) { if (_dansRing(F.rings[l[i]], x, z)) return true; }
    return false;
  }

  // Faces de F à FACE_STRUCTURE.portee m au plus de (px, pz) (m), du côté du point → [{ f, t (abscisse du point le
  // plus proche sur la face), d }], la plus proche d'abord.
  function _facesPres(F, px, pz) {
    const R = FACE_STRUCTURE.portee, c = F.c, vus = new Set(), out = [];
    for (let gx = Math.floor((px - R) / c); gx <= Math.floor((px + R) / c); gx++) {
      for (let gz = Math.floor((pz - R) / c); gz <= Math.floor((pz + R) / c); gz++) {
        const l = F.gf.get(gx + "," + gz) || [];
        for (let i = 0; i < l.length; i++) {
          if (vus.has(l[i])) continue;
          vus.add(l[i]);
          const f = F.faces[l[i]];
          const t = Math.max(0, Math.min(f.l, (px - f.ax) * f.ux + (pz - f.az) * f.uz));
          const qx = f.ax + f.ux * t, qz = f.az + f.uz * t, dist = Math.hypot(px - qx, pz - qz);
          // Côté du point : devant la face (normale extérieure (uz, −ux)), ou dans la structure.
          const devant = (px - qx) * f.uz - (pz - qz) * f.ux >= -1e-6;
          if (dist <= R && (devant || _dansRing(F.rings[f.r], px, pz))) out.push({ f: f, t: t, d: dist });
        }
      }
    }
    return out.sort(function (a, b) { return a.d - b.d; });
  }

  // Place d'une forme murale `forme` sur la face de structure la plus proche du POI en (x, y) (px) → place de
  // KtaGalerie.placePassage ({ x, y px : point de la face, ang : sens de la face, paroi : 1, structure : true }) |
  // null. ⚠️ contrat : paroi = 1 car la normale extérieure (uz, −ux) est −(−sin ang, cos ang) (_faceParoi).
  function _surStructure(F, x, y, forme) {
    const sc = _e.sc, L = _demiForme(forme), D = FACE_STRUCTURE.devant, cands = _facesPres(F, x / sc, y / sc);
    for (let k = 0; k < cands.length; k++) {
      const f = cands[k].f, tc = f.l >= 2 * L ? Math.max(L, Math.min(f.l - L, cands[k].t)) : f.l / 2;
      const libre = [tc - L, tc, tc + L].every(function (s) {
        return !_dansStructure(F, f.ax + f.ux * s + f.uz * D, f.az + f.uz * s - f.ux * D);
      });
      if (!libre) continue;
      return { x: (f.ax + f.ux * tc) * sc, y: (f.az + f.uz * tc) * sc, ang: Math.atan2(f.uz, f.ux), entree: 0,
        ramene: true, paroi: 1, structure: true };
    }
    return null;
  }

  // Volumes à portée construits, lointains libérés : la règle des tuiles (_gererTuiles).
  function _gererVolumes() {
    const e = _e;
    if (!e.volPassages || !e.volPassages.length) return;
    const c = _centreScene(), px = c.x, pz = c.z;
    const rVue = _rayonScene(), rGarde = rVue + 2 * TUILE;
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
        // Texture du ciel : celle de la vue (_e.texCiel) ; un panneau (plaque unie) a la sienne.
        if (o.isSprite && o.material) {
          if (o.userData.poi && (o.userData.texPanneau || o.material.map)) {
            (o.userData.texPanneau || o.material.map).dispose();
          }
          o.material.dispose();
        }
        if (o.isSprite) e.panneaux.delete(o);
        if (o.userData.plaqueCle !== undefined) _rendrePlaque(o.userData.plaqueCle);   // texture partagée par contenu
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

  // Repère du volume (m) : s le long de v.dir (la galerie ; en travers pour un escalier en niche), t en travers de s,
  // centre (v.cx, v.cz).
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
  // refait rien ici. `col` : paroi unie à cette couleur, sans coordonnées de texture (matériau `paroiUnie`).
  function _paroiY(lot, p, q, y0, y1, col) {
    const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
    if (l < 1e-6 || y1 <= y0) return;
    const u0 = (p[0] * dx + p[1] * dz) / l, u1 = u0 + l;
    lot.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], [-dz / l, 0, dx / l],
      col || BLANC, col ? undefined : [u0, y0, u1, y0, u1, y1, u0, y1]);
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
      plafond: new Lot(), plafondConduit: new Lot(), trous: {} };
    const g = new THREE.Group();
    g.userData.famille = "passage";
    if (v.genre === "pente") _pente(v, lots); else if (v.acces) _acces(v, lots, g); else _puits(v, lots, g);
    // Volume d'un voisin (_construireVolumeVoisin) : sans bouches (le gabarit trouerait le sol du niveau actif, que
    // rien ne masque encore quand elles se dessinent), coupé à la tranche montrée.
    const vv = e.volumeVoisin;
    const ajouter = function (lot, mat, ordre, famille) {
      if (vv && (famille === "boucheSol" || famille === "bouchePlafond")) return;
      const geo = (vv && vv.coupe ? lot.couper(vv.coupe[0], vv.coupe[1]) : lot).geometrie();
      if (!geo) return;
      const me = new THREE.Mesh(geo, mat);
      me.renderOrder = ordre;
      me.matrixAutoUpdate = false;
      me.userData.famille = famille;
      g.add(me);
    };
    ajouter(lots.sol, e.mats.boucheSol, -1, "boucheSol");
    ajouter(lots.plafond, e.mats.bouchePlafond, -1, "bouchePlafond");
    ajouter(lots.plafondConduit, e.mats.bouchePlafondConduit, -1, "bouchePlafond");
    // Trémie d'une galerie inclinée (_tremiePente) ; jamais sur un volume de voisin (gabarit du niveau actif).
    if (!vv) Object.keys(lots.trous).forEach(function (b) { ajouter(lots.trous[b], _matTrou(Number(b)), -1, "trou"); });
    if (lots.parois.p.length) _paroiTexturee();
    ajouter(lots.parois, e.mats.paroi, 0, "paroiPassage");
    ajouter(lots.opaque, e.mats.opaque, 0, "passage");
    ajouter(lots.lumineux, e.mats.lumineux, 1, "cadre");
    if (v.acces) _ajouterAcces(lots, ajouter);
    let y0 = Infinity, y1 = -Infinity;
    [lots.parois, lots.opaque].forEach(function (l) {
      for (let i = 1; i < l.p.length; i += 3) { y0 = Math.min(y0, l.p[i]); y1 = Math.max(y1, l.p[i]); }
    });
    const n = function (l) { return l.p.length / 9; };
    v.stats = { triangles: n(lots.parois) + n(lots.opaque) + n(lots.lumineux), bouchesSol: n(lots.sol),
      bouchesPlafond: n(lots.plafond) + n(lots.plafondConduit), conduit: v.conduit || null,
      cadre: n(lots.lumineux) > 0, yMin: Number.isFinite(y0) ? +y0.toFixed(2) : null,
      yMax: Number.isFinite(y1) ? +y1.toFixed(2) : null,
      cielVu: g.children.some(function (o) { return o.userData.famille === "ciel"; }),
      marches: v.relMarches || null };
    if (v.acces) Object.assign(v.stats, _statsAcces(v, lots, g));
    e.scene.add(g);
    v.obj = g;
    e.sale = true;
  }

  function _puits(v, lots, g) {
    const e = _e, h = e.hauteur, L = VOLUME.long, Q = _repere(v), a = v.a, b = v.b, X = v.ext || {};
    const ring = _sensPositif([Q(-a, -b), Q(a, -b), Q(a, b), Q(-a, b)]);
    const murs = function (y0, y1) {
      for (let k = 0; k < 4; k++) _paroiY(lots.parois, ring[k], ring[(k + 1) % 4], y0, y1);
    };
    // Parois de notre sol au plafond du niveau lié dessous ; vers le haut, jusqu'au sommet du conduit (_sommetPlafond).
    const fond = Number.isFinite(X.basParoi) ? Math.min(X.basParoi, 0) : -L;
    const S = v.plafond ? _sommetPlafond(v, ring) : { cime: h, roche: false }, cime = S.cime;
    if (v.sol) { murs(fond, 0); _quadPlat(lots.sol, ring, 0); }
    if (v.plafond) { murs(h, cime); _quadPlat(S.roche ? lots.plafondConduit : lots.plafond, ring, h); }
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
      sp.position.set(c[0], cime - 0.05, c[1]);
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

  // Sommet (m) d'un conduit ouvert dans le plafond (contour `ring`, m) → { cime, roche } ; relevé dans v.conduit.
  // ⚠️ contrat (décision produit) : niveau du dessus = le niveau lié le plus proche au-dessus (_etenduePassage) ; sans
  // niveau lié (aération d'un seul niveau ; ni accès ni puits de surface), le niveau juste au-dessus
  // (_niveauxEdition), montré ou non. Toute l'emprise dans son vide (_videDe : galerie au droit du puits ; en
  // structures, galeries et chambres) :
  // le conduit DÉBOUCHE à son sol (au moins à notre plafond : écart nul ou négatif, rien à traverser). Sinon il
  // traverse sa roche : parois jusqu'à VOLUME.long au-delà de notre plafond (ou du sol lié, s'il est plus haut),
  // qui se perdent dans le noir, et bouche au bit GABARIT.conduit : les sols et plafonds des voisins du dessus ne se
  // dessinent pas en travers (_matsVoisins). Puits de surface (ciel), accès, rien au-dessus : VOLUME.long.
  // 🩸 Les parois des tubes d'un voisin ne lisent pas le gabarit : une galerie du dessus qui ne couvre qu'une partie
  // de l'emprise reste visible là où elle coupe le conduit (fermé, sans trou).
  function _sommetPlafond(v, ring) {
    const e = _e, h = e.hauteur, L = VOLUME.long, X = v.ext || {};
    const base = Number.isFinite(X.haut) ? Math.max(X.haut, h) : h;
    let n = null, dy = null;
    if (Number.isFinite(X.haut) && Number.isInteger(X.niveauHaut)) { n = X.niveauHaut; dy = X.haut; }
    else if (!v.ciel && !v.acces) {
      const l = _niveauxEdition(), i = l.indexOf(e.niveau);
      if (i > 0) { n = l[i - 1]; dy = _altitudeVoisin(n).dy; }
    }
    let r = { cime: base + L, roche: false };
    if (n !== null) {
      // Rendu structures (vide partout pour les sols et les parois) : le vide du modèle mixte, galeries et chambres du
      // niveau du dessus ; ailleurs, c'est sa roche.
      const V = e.rendu === "structures" && window.KtaGalerie ? (function () {
        const m = window.KtaGalerie.modele(n, true);
        return { partout: false, vide: function (x, y) { return !!m && (m.dedans(x, y) || m.enChambre(x, y)); } };
      })() : _videDe(n), sc = e.sc;
      let cx = 0, cz = 0;
      ring.forEach(function (q) { cx += q[0] / ring.length; cz += q[1] / ring.length; });
      const pts = [[cx, cz]].concat(ring.map(function (q) {
        return [cx + (q[0] - cx) * 0.95, cz + (q[1] - cz) * 0.95];
      }));
      const debouche = V.partout || pts.every(function (q) { return V.vide(q[0] * sc, q[1] * sc); });
      r = debouche ? { cime: Math.max(dy, h), roche: false } : { cime: base + L, roche: true };
    }
    v.conduit = { cime: +r.cime.toFixed(3), roche: r.roche, niveau: n };
    return r;
  }

  // Marches d'une cage d'escalier, le long de s : vers le haut (du sol, à travers le plafond) et / ou vers le
  // bas (du sol dans le puits) ; entre trois niveaux, une volée par moitié de largeur.
  // ⚠️ contrat : toute volée part de s = −a (pied de celle qui monte, haut de celle qui descend : l'entrée, côte à
  // côte entre trois niveaux) ; _volumesDuNiveau oriente le repère pour que −a soit le côté d'entrée de la place
  // (KtaGalerie.placePassage > entree : la paroi d'une niche ; dans l'axe, où la galerie continue le plus longtemps,
  // égalité : sens du tracé).
  // Volée qui monte : jusqu'au sol du niveau lié dessus ; qui descend : jusqu'au sol du niveau lié dessous
  // (_etenduePassage, au moins 0,3 m) ; sans ce niveau, à 0,4 m au-delà du plafond ou du sol.
  function _marches(v, lot, Q, col) {
    const h = _e.hauteur, n = VOLUME.marches, a = v.a, b = v.b, pas = 2 * a / n, X = v.ext || {};
    const haut = (Number.isFinite(X.haut) ? Math.max(X.haut, 0.3) : h + 0.4) / n;
    const bas = (Number.isFinite(X.bas) ? Math.max(-X.bas, 0.3) : h + 0.4) / n;
    const pied = -Math.max(n * bas, Number.isFinite(X.bas) ? 0 : VOLUME.long);
    const monte = v.plafond && !v.grille, deux = monte && v.sol;
    // Relevé (etat().volumes, checkup) : centre [x, z] des sommets les plus hauts posés depuis l'indice i0.
    const plusHaut = function (i0) {
      let best = -Infinity, sx = 0, sz = 0, nb = 0;
      for (let i = i0; i < lot.p.length; i += 3) {
        const y = lot.p[i + 1];
        if (y > best + 1e-6) { best = y; sx = 0; sz = 0; nb = 0; }
        if (y >= best - 1e-6) { sx += lot.p[i]; sz += lot.p[i + 2]; nb++; }
      }
      return nb ? [+(sx / nb).toFixed(3), +(sz / nb).toFixed(3)] : null;
    };
    const rel = { haut: null, entreeBas: null };
    let i0 = lot.p.length;
    if (monte) {
      for (let k = 0; k < n; k++) {
        const s0 = -a + k * pas;
        _pave(lot, Q, s0, s0 + pas, deux ? 0 : -b, b, 0, (k + 1) * haut, col);
      }
      rel.haut = plusHaut(i0);
    }
    i0 = lot.p.length;
    if (v.sol) {
      for (let k = 0; k < n; k++) {
        const s0 = -a + k * pas;
        if (-(k + 1) * bas - pied > 1e-3) _pave(lot, Q, s0, s0 + pas, -b, deux ? 0 : b, pied, -(k + 1) * bas, col);
      }
      rel.entreeBas = plusHaut(i0);
    }
    v.relMarches = rel;   // haut de la volée qui monte ; marche d'entrée (la plus haute) de celle qui descend
  }

  // Échelle scellée contre une paroi : échelons tous les VOLUME.echelon m et deux montants ; vers le bas, les montants
  // dépassent du sol d'un mètre (la sortie).
  function _echellePuits(v, lot, Q, col) {
    const h = _e.hauteur, L = VOLUME.long, tw = -v.b + 0.12, X = v.ext || {};
    // Du sol du niveau lié dessous au sol du niveau lié dessus (montants d'un mètre au-delà : la sortie) ; sans
    // niveau de ce côté, VOLUME.long.
    const cime = Number.isFinite(X.haut) ? Math.max(X.haut, h) : h + L;
    const yA = v.sol ? (Number.isFinite(X.bas) ? Math.min(X.bas, 0) : -L) : 0;
    const yB = v.plafond ? cime + (Number.isFinite(X.haut) ? 1 : 0) : 1, yR = v.plafond ? cime : 0;
    for (let y = yA + VOLUME.echelon / 2; y <= yR; y += VOLUME.echelon) {
      _pave(lot, Q, -0.2, 0.2, tw - 0.02, tw + 0.02, y - 0.02, y + 0.02, col);
    }
    _pave(lot, Q, -0.25, -0.2, tw - 0.03, tw + 0.03, yA, yB, col);
    _pave(lot, Q, 0.2, 0.25, tw - 0.03, tw + 0.03, yA, yB, col);
  }

  // Galerie inclinée d'un tracé jonction (contrat : _pentesDuNiveau ; géométrie : KtaGalerie.pente), en moellons :
  // sol en pente sur toute la longueur, ruban à la couleur du canon au milieu ; parois et plafond seulement hors de la
  // tranche [0, h] du niveau. En descente : tranchée sous le sol (bouche au sol jusqu'à tOuvert), puis galerie couverte
  // sous lui. En montée : bouche au plafond et talus sous la rampe jusqu'à tOuvert, parois et plafond au-dessus du
  // plafond du niveau. Le bout d'en face reste ouvert : la scène a basculé avant d'y arriver (_suivrePente).
  function _pente(v, lots) {
    const p = v.p, dY = p.dY, hA = p.hA, tO = p.tOuvert, col = _couleur("traces", "jonction", "color");
    const W = function (t) { return window.KtaGalerie.demiPente(p, t); };
    // Parois verticales posées (m, relevé du checkup : etat().volumes[].paroisPente) : [x0, z0, x1, z1, bas, haut].
    v.paroisPente = [];
    const mur = function (P, Q, y0p, y1p, y0q, y1q) {
      if (y1p - y0p < 1e-3 && y1q - y0q < 1e-3) return;
      _paroiPente(lots.parois, P, Q, y0p, y1p, y0q, y1q);
      v.paroisPente.push([+P[0].toFixed(3), +P[1].toFixed(3), +Q[0].toFixed(3), +Q[1].toFixed(3),
        +Math.min(y0p, y0q).toFixed(3), +Math.max(y1p, y1q).toFixed(3)]);
    };
    const ys = function (t) { return dY * t; };
    const yc = function (t) { return dY * t + hA + (p.hB - hA) * t; };
    const plans = _e.volumeVoisin ? [] : _plansTremie(p);
    const st = [];   // stations (m) : sommets du tracé et bout de la part ouverte
    for (let i = 0; i < p.ptsM.length; i++) {
      const t = p.cum[i] / p.tot;
      if (i > 0 && st[st.length - 1].t < tO - 1e-6 && t > tO + 1e-6) {
        const a = p.ptsM[i - 1], b = p.ptsM[i], k = (tO * p.tot - p.cum[i - 1]) / (p.cum[i] - p.cum[i - 1]);
        st.push({ x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, t: tO });
      }
      st.push({ x: p.ptsM[i][0], z: p.ptsM[i][1], t: t });
    }
    // Zone jonction traversée : la chambre en pente remplace la galerie inclinée sur ce qu'elle couvre (_zoneJonction) ;
    // stations ajoutées là où le tracé franchit son bord.
    (p.zones || []).forEach(function (en) {
      for (let i = st.length - 2; i >= 0; i--) {
        const A = st[i], B = st[i + 1], cps = [];
        for (let k = 0, j = en.ring.length - 1; k < en.ring.length; j = k++) {
          const a = en.ring[j], b = en.ring[k], ex = b[0] - a[0], ez = b[1] - a[1];
          const dx = B.x - A.x, dz = B.z - A.z, den = dx * ez - dz * ex;
          if (Math.abs(den) < 1e-12) continue;
          const t = ((a[0] - A.x) * ez - (a[1] - A.z) * ex) / den, u = ((a[0] - A.x) * dz - (a[1] - A.z) * dx) / den;
          if (t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1) cps.push(t);
        }
        cps.sort(function (a, b) { return b - a; }).forEach(function (t) {
          st.splice(i + 1, 0, { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t, t: A.t + (B.t - A.t) * t });
        });
      }
    });
    const norme = function (n) { const l = Math.hypot(n[0], n[1], n[2]); return [n[0] / l, n[1] / l, n[2] / l]; };
    let pied = null;
    for (let i = 0; i + 1 < st.length; i++) {
      const A = st[i], B = st[i + 1], dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      if (_zoneDePente(p, (A.x + B.x) / 2, (A.z + B.z) / 2)) continue;
      const ux = dx / l, uz = dz / l, nx = -uz, nz = ux, ouvert = B.t <= tO + 1e-6;
      const G = function (S, c) { return [S.x + nx * c, S.z + nz * c]; };
      const wA = W(A.t), wB = W(B.t);
      const gA = G(A, -wA), dA = G(A, wA), gB = G(B, -wB), dB = G(B, wB);
      const yA = ys(A.t), yB = ys(B.t), uA = A.t * p.tot, uB = B.t * p.tot, k = (yB - yA) / l;
      plans.forEach(function (q) { _tremiePente(lots.trous, q, A, B, wA, wB, ys, yc, G); });
      const haut = norme([-ux * k, 1, -uz * k]), bas = norme([ux * k, -1, uz * k]);
      lots.parois.quad([gA[0], yA, gA[1]], [gB[0], yB, gB[1]], [dB[0], yB, dB[1]], [dA[0], yA, dA[1]], haut, BLANC,
        [uA, -wA, uB, -wB, uB, wB, uA, wA]);
      const r = LARGEUR_TRACE / 2, rgA = G(A, -r), rdA = G(A, r), rgB = G(B, -r), rdB = G(B, r);
      lots.opaque.quad([rgA[0], yA + 0.03, rgA[1]], [rgB[0], yB + 0.03, rgB[1]], [rdB[0], yB + 0.03, rdB[1]],
        [rdA[0], yA + 0.03, rdA[1]], haut, col);
      if (dY < 0) {
        mur(gA, gB, yA, Math.min(yc(A.t), 0), yB, Math.min(yc(B.t), 0));
        mur(dA, dB, yA, Math.min(yc(A.t), 0), yB, Math.min(yc(B.t), 0));
        if (ouvert) _quadPlat(lots.sol, [gA, gB, dB, dA], 0);
        else {
          lots.parois.quad([gA[0], yc(A.t), gA[1]], [gB[0], yc(B.t), gB[1]], [dB[0], yc(B.t), dB[1]],
            [dA[0], yc(A.t), dA[1]], bas, BLANC, [uA, -wA, uB, -wB, uB, wB, uA, wA]);
        }
      } else if (dY > 0) {
        mur(gA, gB, Math.max(yA, hA), yc(A.t), Math.max(yB, hA), yc(B.t));
        mur(dA, dB, Math.max(yA, hA), yc(A.t), Math.max(yB, hA), yc(B.t));
        lots.parois.quad([gA[0], yc(A.t), gA[1]], [gB[0], yc(B.t), gB[1]], [dB[0], yc(B.t), dB[1]],
          [dA[0], yc(A.t), dA[1]], bas, BLANC, [uA, -wA, uB, -wB, uB, wB, uA, wA]);
        if (ouvert) {
          _quadPlat(lots.plafond, [gA, gB, dB, dA], hA);
          const wtA = wA - PENTE.talus, wt = wB - PENTE.talus;
          mur(G(A, -wtA), G(B, -wt), 0, yA, 0, yB);
          mur(G(A, wtA), G(B, wt), 0, yA, 0, yB);
          if (tO < 1 && Math.abs(B.t - tO) < 1e-6) pied = { B: B, ux: ux, uz: uz, G: G, wt: wt };
        }
      }
    }
    // Pied du talus (montée) : face verticale sous le bout de la part ouverte, en retrait (paroi du modèle galerie).
    if (pied) {
      const c = { x: pied.B.x - pied.ux * PENTE.talus, z: pied.B.z - pied.uz * PENTE.talus };
      mur(pied.G(c, -pied.wt), pied.G(c, pied.wt), 0, hA, 0, hA);
    }
  }

  // ⚠️ contrat (décision produit) : trémie d'une galerie inclinée. Sol et plafond d'un niveau voisin montré
  // (_montresAlt, lus à leur source comme _zoneJonction) qui passent DANS la galerie, strictement entre son sol et son
  // plafond, ne s'y dessinent pas : trou plat du gabarit à leur bit (_matTrou, _matsVoisins) sur la bande de la
  // galerie, là seulement où le plan est dans sa section. En montant comme en descendant, rien ne coupe la vue ni la
  // tête ; plafond et parois de la galerie restent (sans gabarit) : rien d'ouvert sur le noir. Galerie d'un voisin
  // (_construireVolumeVoisin) : aucun trou. La zone jonction traversée pose les siens sur toute son emprise.
  // → [{ bit, y }] (m, repère du niveau de la scène) des plans qui recoupent la hauteur de la galerie p.
  function _plansTremie(p) {
    const out = [], bas = Math.min(0, p.dY), haut = Math.max(p.hA, p.dY + p.hB);
    _montresAlt().forEach(function (v) {
      if (v.actif) return;
      const b = _bitsVoisin(v.dessus);
      [[b.sol, v.dy], [b.plafond, v.dy + v.h]].forEach(function (q) {
        if (q[1] > bas + ENTRE.eps && q[1] < haut - ENTRE.eps) out.push({ bit: q[0], y: q[1] });
      });
    });
    return out;
  }

  // Trou du plan q sur le tronçon A → B de la galerie inclinée (demi-largeurs wA, wB ; sol ys(t), plafond yc(t) ;
  // G(station, décalage) : point latéral), sur la part où ys < q.y < yc (deux fonctions affines de la part du tronçon).
  function _tremiePente(trous, q, A, B, wA, wB, ys, yc, G) {
    let lo = 0, hi = 1;
    const borner = function (fa, fb) {   // garder où f > 0, f affine de fa (k = 0) à fb (k = 1)
      if (fa > ENTRE.eps && fb > ENTRE.eps) return;
      if (fa <= ENTRE.eps && fb <= ENTRE.eps) { hi = -1; return; }
      const k0 = (fa - ENTRE.eps) / (fa - fb);
      if (fa > fb) hi = Math.min(hi, k0); else lo = Math.max(lo, k0);
    };
    borner(q.y - ys(A.t), q.y - ys(B.t));
    borner(yc(A.t) - q.y, yc(B.t) - q.y);
    if (hi - lo < 1e-6) return;
    const S = function (k) {
      return { x: A.x + (B.x - A.x) * k, z: A.z + (B.z - A.z) * k };
    };
    const a = S(lo), b = S(hi), wa = wA + (wB - wA) * lo, wb = wA + (wB - wA) * hi;
    _quadPlat(trous[q.bit] || (trous[q.bit] = new Lot()), [G(a, -wa), G(b, -wb), G(b, wb), G(a, wa)], q.y);
  }

  // Paroi verticale de P à Q (m) dont le bas et le haut varient le long du mur (y0p, y1p en P ; y0q, y1q en Q).
  function _paroiPente(lot, P, Q, y0p, y1p, y0q, y1q) {
    if (y1p - y0p < 1e-4 && y1q - y0q < 1e-4) return;
    const dx = Q[0] - P[0], dz = Q[1] - P[1], l = Math.hypot(dx, dz);
    if (l < 1e-6) return;
    const u0 = (P[0] * dx + P[1] * dz) / l, u1 = u0 + l;
    lot.quad([P[0], y0p, P[1]], [Q[0], y0q, Q[1]], [Q[0], y1q, Q[1]], [P[0], y1p, P[1]], [-dz / l, 0, dx / l], BLANC,
      [u0, y0p, u1, y0q, u1, y1q, u0, y1p]);
  }

  // ── Accès de surface sans passage (esf, pef, pb, pc, psf, ps, pe, cao, caf) ──────────────────────────────
  // ⚠️ contrat (décision produit) : un volume à la place d'un passage (KtaGalerie.placePassage : le POI ramené dans
  // le tube, sur l'axe pour une porte, en niche pour esf ; _volumesDuNiveau), panneau au-dessus ; jamais de 🪜, de
  // cadre doré ni d'itinéraire (aucun moyen : KtaPoiJonction.moyen).
  //   esf / pef : cage à marches ou puits à échelons d'eso / peo, fermés par une dalle sombre (DIM_ACCES.fermeY) ;
  //   pb : dalle maçonnée au ras du plafond, sans bouche ;
  //   pc / psf : bouche au plafond (carrée / ronde) remplie de remblais, cône d'éboulis au sol, poussé vers la paroi
  //   du côté du POI dans un tube pour laisser un corps (ACCES_DIM.bassinLibre) en face (KtaGalerie.placePassage >
  //   cone : v.cone) ; il arrête le pas, on passe à côté ;
  //   ps : puits rond maçonné de DIM_ACCES.rond, sans échelons, ciel au sommet ;
  //   pe : bassin creusé dans le sol contre la paroi du côté du POI, margelle basse, eau à −DIM_ACCES.eau (couleur de
  //   la zone eau) ; il n'arrête pas le pas : on passe à côté ;
  //   cao / caf : porte à deux battants en travers de la galerie (sa largeur à cet endroit), ouverte (battants
  //   rabattus contre les parois) ou fermée ; en mixte et structures, pierre de taille du cadre jusqu'à la structure
  //   la plus proche de chaque côté (KtaGalerie.comblementPorte), qui ferme le passage autour de la porte.
  // Cône, porte fermée et comblement arrêtent le pas en 3D seulement (KtaGalerie.zonesBloquent : contours de
  // galerieEmprise.js > _obstaclesAcces, même cercle de COTES_CERCLE côtés que _cercle) ; l'itinéraire passe
  // par-dessus le cône et la margelle (_volumesItiAcces). Remblais et bois texturés avec 🧱, couleurs unies sinon :
  // la bascule refait les volumes (_refaireTuiles).

  // Champs d'un accès, posés sur ceux d'un passage (_volumesDuNiveau) ; dimensions : _dimAcces.
  function _volumeAcces(tag) {
    const f = window.KtaGalerie.ACCES[tag], paroi = !!window.KtaGalerie.PAROI[f];
    return { acces: true, moyen: null, forme: f, sol: f === "bassin",
      plafond: tag !== "pb" && f !== "bassin" && f !== "porte" && f !== "chatiere" && f !== "vehicule" && !paroi,
      ciel: tag === "ps",
      grille: false, echelons: tag === "pef", passage: false, ferme: tag === "esf" || tag === "pef",
      bouche: tag === "pb", comble: tag === "pc" || tag === "psf", bassin: f === "bassin", porte: f === "porte",
      ouvert: tag === "cao", chatiere: f === "chatiere", surParoi: paroi, vehicule: f === "vehicule" };
  }

  // Dimensions d'un accès placé (v.cx, v.cz, v.dir) : rond et bassin d'après DIM_ACCES ; porte de la largeur de la
  // galerie à sa place, comblée jusqu'aux structures (v.comblement = [côté −t, côté +t] m,
  // KtaGalerie.comblementPorte : la règle de l'obstacle) ; portée (v.r) qui couvre le cône (v.cone, décalé de la
  // bouche) et le comblement.
  function _dimAcces(v) {
    const D = DIM_ACCES;
    if (v.forme === "rond") v.a = v.b = D.rond / 2;
    else if (v.bassin) v.a = v.b = D.bassin / 2 + D.margelle;
    else if (v.chatiere) {
      v.b = _demiLargeurGalerie(v.cx, v.cz);
      const s = _segmentChatiere(v.point);
      v.a = s ? Math.max(CHATIERE.court, s.l) / 2 : CHATIERE.long / 2;
      if (s) v.dir = s.ang;
    } else if (v.surParoi) {
      v.a = Math.max(PLAQUE.lMax, EPURE.l, PORTAIL.l) / 2;
      v.b = PORTAIL.ep;
    } else if (v.vehicule) {
      v.a = D.vehiculeL / 2;
      v.b = D.vehiculeW / 2;
    } else if (v.porte) {
      v.b = _demiLargeurGalerie(v.cx, v.cz);
      v.a = v.ouvert ? v.b : PORTE.cadre;
      const sc = _e.sc, niv = _e.niveau === null ? undefined : _e.niveau;
      v.comblement = window.KtaGalerie.comblementPorte(v.cx * sc, v.cz * sc, v.dir || 0, v.b * sc, niv, _e.rendu);
    }
    const cb = v.comblement ? Math.max(v.comblement[0], v.comblement[1]) : 0;
    v.r = Math.hypot(v.a, v.b + cb) + VOLUME.marge + VOLUME.cadre;
    if (v.cone) v.r = Math.max(v.r, Math.hypot(v.cone.cx - v.cx, v.cone.cz - v.cz) + v.cone.R);
  }

  // Chatière relevée en deux points (poiPrecis.js > lire : début x, y et fin x2, y2) → { l (m), ang (rad, repère de
  // KtaGalerie.placePassage) } | null. Le centre reste celui de placePassage (le milieu, ramené sur l'axe de la
  // galerie : la roche barre toute sa largeur) ; seuls la longueur et l'axe viennent des deux points.
  function _segmentChatiere(p) {
    const q = window.KtaPoiPrecis && p ? window.KtaPoiPrecis.lire(p) : null;
    if (!q || q.x2 === undefined) return null;
    const dx = q.x2 - q.x, dy = q.y2 - q.y;
    if (Math.hypot(dx, dy) < 1e-6) return null;
    return { l: Math.hypot(dx, dy) / _e.sc, ang: Math.atan2(dy, dx) };
  }

  // Demi-largeur (m) de la galerie dont l'axe est le plus proche de (x, z) (m) à 10 m, modèle du rendu affiché :
  // DIM_ACCES.porteDefaut / 2 sans galerie (la règle de galerieEmprise.js > _indexObstacles : même porte).
  function _demiLargeurGalerie(x, z) {
    const e = _e, niv = e.niveau === null ? undefined : e.niveau;
    const m = e.galerie || e.mixte || (window.KtaGalerie ? window.KtaGalerie.modele(niv) : null);
    const pp = m ? m.plusProche(x * e.sc, z * e.sc, 10 * e.sc) : null;
    return pp ? pp.w / e.sc : DIM_ACCES.porteDefaut / 2;
  }

  function _lot(lots, nom) { return lots[nom] || (lots[nom] = new Lot()); }

  // Cercle de rayon R (m) autour de v (cx, cz : un volume ou son cône), COTES_CERCLE côtés à partir de l'axe x
  // (même contour que l'obstacle).
  function _cercle(v, R) {
    const n = window.KtaGalerie.COTES_CERCLE, out = [];
    for (let k = 0; k < n; k++) {
      const a = 2 * Math.PI * k / n;
      out.push([v.cx + R * Math.cos(a), v.cz + R * Math.sin(a)]);
    }
    return _sensPositif(out);
  }

  // Cône d'un puits comblé assez grand pour être dessiné et arrêter le pas (galerieEmprise.js > CONE_MIN_M).
  function _coneMontre(v) { return !!v.cone && v.cone.R >= window.KtaGalerie.CONE_MIN_M; }

  function _carre(v) {
    const Q = _repere(v);
    return _sensPositif([Q(-v.a, -v.b), Q(v.a, -v.b), Q(v.a, v.b), Q(-v.a, v.b)]);
  }

  // Disque plat (contour de sens positif) à y, face vers le haut (sens 1) ou le bas (−1) ; `m` : uv = x, z / m.
  function _disque(lot, ring, y, sens, col, m) {
    const v2 = ring.map(function (q) { return new THREE.Vector2(q[0], q[1]); });
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(v2, []); } catch (err) { return; }
    for (let i = 0; i < tris.length; i++) {
      const a = ring[tris[i][0]], b = ring[tris[i][1]], c = ring[tris[i][2]];
      lot.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [0, sens, 0], col,
        m ? [a[0] / m, a[1] / m, b[0] / m, b[1] / m, c[0] / m, c[1] / m] : undefined);
    }
  }

  function _acces(v, lots, g) {
    if (v.ferme) { _puits(v, lots, g); _dalleFermee(v, lots); return; }
    if (v.porte) { _porte(v, lots); return; }
    if (v.bassin) { _bassin(v, lots); return; }
    if (v.chatiere) { _chatiere(v, lots); return; }
    if (v.forme === "plaque") { _plaque(v, lots, g); return; }
    if (v.forme === "epure") { _epure(v, lots); return; }
    if (v.forme === "portail") { _portail(v, lots); return; }
    if (v.vehicule) { _vehicule(v, lots); return; }
    const ring = v.forme === "rond" ? _cercle(v, v.a) : _carre(v);
    if (v.bouche) _dalleBouchee(v, lots);
    else if (v.comble) { _puitsComble(v, lots, ring); if (_coneMontre(v)) _cone(v, lots); }
    else _puitsOuvert(v, lots, g, ring);
  }

  // esf / pef : la dalle qui ferme la cage (vue d'en bas, à portée de la lampe), dessus et dessous.
  function _dalleFermee(v, lots) {
    const y = _e.hauteur + DIM_ACCES.fermeY;
    _pave(lots.opaque, _repere(v), -v.a, v.a, -v.b, v.b, y, y + DIM_ACCES.fermeEp, _couleurFixe(COULEUR_DALLE));
    v.trace = { dalleY: y };
  }

  // pb : dalle maçonnée (matériau des parois, pierre avec 🧱) au ras du plafond, débordant autour de la bouche ;
  // le plafond n'est pas troué.
  function _dalleBouchee(v, lots) {
    const h = _e.hauteur, d = DIM_ACCES.boucheDeborde, Q = _repere(v), a = v.a + d, b = v.b + d;
    const ring = _sensPositif([Q(-a, -b), Q(a, -b), Q(a, b), Q(-a, b)]), y0 = h - DIM_ACCES.boucheEp;
    for (let k = 0; k < 4; k++) _paroiY(lots.parois, ring[k], ring[(k + 1) % 4], y0, h);
    _disque(lots.parois, ring, y0, -1, BLANC, 1);
    v.trace = { dalleY: +y0.toFixed(3) };
  }

  // pc / psf : bouche au plafond, paroi sur DIM_ACCES.comble, remblais qui la remplit (vu d'en bas).
  function _puitsComble(v, lots, ring) {
    const h = _e.hauteur, yc = h + DIM_ACCES.comble, tx = _e.textures === true;
    for (let k = 0; k < ring.length; k++) _paroiY(lots.parois, ring[k], ring[(k + 1) % ring.length], h, yc + 0.02);
    _dessus(lots.plafond, ring, h, BLANC);
    _disque(tx ? _lot(lots, "remblais") : lots.opaque, ring, yc, -1,
      tx ? BLANC : _couleur("zones", "remblais", "fillColor"), tx ? REMBLAIS.m : undefined);
    v.trace = { combleY: yc };
  }

  // Cône d'éboulis au pied d'un puits comblé, à v.cone (centre et rayon de l'obstacle) : pied au rayon, mi-pente
  // bosselée (tirage fixe par place : le même cône à chaque construction), sommet. Hauteur réduite comme le rayon
  // (même pente) ; la part enfoncée dans la paroi reste cachée par la roche.
  function _cone(v, lots) {
    const c = v.cone, R = c.R, H = DIM_ACCES.coneH * Math.min(1, R / DIM_ACCES.cone);
    const n = window.KtaGalerie.COTES_CERCLE, tx = _e.textures === true;
    const lot = tx ? _lot(lots, "remblais") : lots.opaque, m = tx ? REMBLAIS.m : 0;
    const col = tx ? BLANC : _couleur("zones", "remblais", "fillColor");
    let gr = (Math.abs(Math.round(v.cx * 97 + v.cz * 13)) % 2147483646) + 1;
    const alea = function () { gr = (gr * 16807) % 2147483647; return gr / 2147483647; };
    const pied = _cercle(c, R), mi = [], sommet = [c.cx, H, c.cz];
    const bas = pied.map(function (q) { return [q[0], 0, q[1]]; });
    pied.forEach(function (q) {
      const f = 0.5 + (alea() - 0.5) * 0.12, y = H * 0.55 * (0.9 + alea() * 0.2);
      mi.push([c.cx + (q[0] - c.cx) * f, y, c.cz + (q[1] - c.cz) * f]);
    });
    const face = function (a, b, c) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      lot.tri(a, b, c, [nx / l, ny / l, nz / l], col,
        m ? [a[0] / m, a[2] / m, b[0] / m, b[2] / m, c[0] / m, c[2] / m] : undefined);
    };
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      face(bas[k], bas[k1], mi[k1]);
      face(bas[k], mi[k1], mi[k]);
      face(mi[k], mi[k1], sommet);
    }
    v.trace = Object.assign(v.trace || {}, { cone: { R: R, H: +H.toFixed(3), x: +(c.cx * _e.sc).toFixed(3),
      y: +(c.cz * _e.sc).toFixed(3) } });
  }

  // ps : puits rond maçonné, ouvert dans le plafond, ciel au sommet (comme un puits de surface).
  function _puitsOuvert(v, lots, g, ring) {
    const e = _e, h = e.hauteur, L = VOLUME.long;
    for (let k = 0; k < ring.length; k++) _paroiY(lots.parois, ring[k], ring[(k + 1) % ring.length], h, h + L);
    _dessus(lots.plafond, ring, h, BLANC);
    if (!e.texCiel) e.texCiel = _texCiel();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: e.texCiel, fog: false, depthWrite: false,
      toneMapped: false, transparent: true }));
    const r = 2 * v.a * 0.95;
    sp.position.set(v.cx, h + L - 0.05, v.cz);
    sp.scale.set(r, r, 1);
    sp.renderOrder = 2;
    sp.userData.famille = "ciel";
    g.add(sp);
  }

  // pe : bassin rond creusé dans le sol (bouche au sol), parois jusqu'au fond, margelle basse, eau à −DIM_ACCES.eau.
  function _bassin(v, lots) {
    const D = DIM_ACCES, R = D.bassin / 2, mh = D.margelleH, ri = _cercle(v, R), re = _cercle(v, R + D.margelle);
    for (let k = 0; k < ri.length; k++) {
      const k1 = (k + 1) % ri.length, a = ri[k], b = ri[k1], c = re[k1], d = re[k];
      _paroiY(lots.parois, a, b, -D.fond, mh);
      _paroiY(lots.parois, d, c, 0, mh);
      lots.parois.quad([a[0], mh, a[1]], [b[0], mh, b[1]], [c[0], mh, c[1]], [d[0], mh, d[1]], [0, 1, 0], BLANC,
        [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]]);
    }
    _dessus(lots.sol, ri, 0, BLANC);
    _disque(lots.opaque, ri, -D.fond, 1, _couleurFixe(COULEUR_FOND));
    _disque(_lot(lots, "eau"), ri, -D.eau, 1, _couleur("zones", "eau", "fillColor"));
    v.trace = { eauY: -D.eau, margelleH: mh, rayon: R + D.margelle };
  }

  // cao / caf : cadre de fer (deux montants, linteau) en travers de la galerie, paroi au-dessus jusqu'au plafond,
  // deux battants de bois : fermés dans le plan du cadre, ou ouverts à 90°, rabattus contre les parois. De chaque
  // côté du cadre, le comblement (v.comblement), dans le plan du cadre, du sol au plafond, enfoncé de COMBLE_ENFONCE
  // dans la structure (aucun jour au bord). Paroi au-dessus du linteau et comblement = un même mur : pierre de taille
  // des parois avec 🧱, unie (PIERRE.couleur) sinon (décision produit : mur de porte homogène).
  function _porte(v, lots) {
    const e = _e, h = e.hauteur, Q = _repere(v), w = v.b, c = PORTE.cadre, H = Math.min(PORTE.haut, h - c);
    const fer = _couleurFixe(COULEUR_FER);
    _pave(lots.opaque, Q, -c / 2, c / 2, -w, -w + c, 0, H, fer);
    _pave(lots.opaque, Q, -c / 2, c / 2, w - c, w, 0, H, fer);
    _pave(lots.opaque, Q, -c / 2, c / 2, -w, w, H, H + c, fer);
    // Mur de la porte (au-dessus du linteau, comblement) : un seul matériau, pierre des parois avec 🧱, uni sinon.
    const cb = v.comblement || [0, 0], uni = e.textures !== true ? _couleurFixe(PIERRE.couleur) : null;
    const mur = function (a, b, y0, y1) {
      if (uni) { _pave(lots.opaque, Q, -c / 2, c / 2, a, b, y0, y1, uni); return; }
      _paroiY(lots.parois, Q(-c / 2, a), Q(-c / 2, b), y0, y1);
      _paroiY(lots.parois, Q(c / 2, b), Q(c / 2, a), y0, y1);
    };
    const tympan = h > H + c + 0.01;
    if (tympan) mur(-w, w, H + c, h);
    [[-1, cb[0]], [1, cb[1]]].forEach(function (q) {
      if (!(q[1] > 0)) return;
      const t0 = q[0] * w, t1 = q[0] * (w + q[1] + COMBLE_ENFONCE);
      mur(Math.min(t0, t1), Math.max(t0, t1), 0, h);
    });
    const tx = e.textures === true, lot = tx ? _lot(lots, "bois") : lots.opaque;
    const col = tx ? BLANC : _couleurFixe(COULEUR_BOIS), lw = w - c, ep = PORTE.ep, j = PORTE.jeu;
    const battants = v.ouvert ? [[c / 2, c / 2 + lw, -lw, -lw + ep], [c / 2, c / 2 + lw, lw - ep, lw]]
      : [[-ep / 2, ep / 2, -lw, -j / 2], [-ep / 2, ep / 2, j / 2, lw]];
    battants.forEach(function (b) { _battant(lot, Q, b, j, H - j, col, tx); });
    v.trace = { largeur: +(2 * w).toFixed(3), haut: +H.toFixed(3), ouvert: !!v.ouvert,
      battants: battants.map(function (b) { return b.map(function (x) { return +x.toFixed(3); }); }),
      comble: cb.slice(), combleUni: !!uni, tympan: tympan, tympanUni: tympan && !!uni };
  }

  // Chatière : roche de -a à a le long de l'axe, de toute la largeur de la galerie (v.b) plus CHATIERE.deborde dans
  // les parois, du sol au plafond, percée au sol du trou (PROFIL_CHATIERE : CHATIERE.large × CHATIERE.trou, sur
  // l'axe, axe long de la roche le long de la galerie : le trou se traverse dans le sens de la marche) : deux faces
  // trouées, le tour du trou (vu du dedans) et le dessus (vue d'édition, plafond masqué). Roche brute des piliers
  // avec 🧱 (matériau `roche`, coordonnées de texture en mètres), couleur du pilier sinon. ⚠️ contrat : aucune
  // emprise ni obstacle (galerieEmprise.js > ACCES) ; seule la caméra s'abaisse (_baisseChatiere).
  function _chatiere(v, lots) {
    const e = _e, h = e.hauteur, Q = _repere(v), a = v.a, B = v.b + CHATIERE.deborde, T = CHATIERE.trou;
    const Wt = Math.max(0.5, Math.min(CHATIERE.large, 2 * v.b - CHATIERE.jeu));
    const tx = e.textures === true, lot = tx ? _lot(lots, "roche") : lots.opaque, m = tx ? ROCHE.m : 0;
    const col = tx ? BLANC : _couleur("structures", "pilier-1");
    const trou = PROFIL_CHATIERE.map(function (q) { return [q[0] * Wt, Math.min(q[1] * T, h - 0.05)]; });
    const bord = [[-B, 0], [B, 0], [B, h], [-B, h]];
    const V2 = function (q) { return new THREE.Vector2(q[0], q[1]); };
    let tris = [];
    try { tris = THREE.ShapeUtils.triangulateShape(bord.map(V2), [trou.map(V2)]); } catch (err) { tris = []; }
    const tous = bord.concat(trou), ux = Math.cos(v.dir || 0), uz = Math.sin(v.dir || 0);
    const P = function (s, q) { const w = Q(s, q[0]); return [w[0], q[1], w[1]]; };
    const uvF = function (q) { return [q[0] / m, q[1] / m]; };
    [[-a, -1], [a, 1]].forEach(function (f) {
      const n = [ux * f[1], 0, uz * f[1]];
      tris.forEach(function (tr) {
        const A = tous[tr[0]], Bq = tous[tr[1]], C = tous[tr[2]];
        lot.tri(P(f[0], A), P(f[0], Bq), P(f[0], C), n, col, m ? uvF(A).concat(uvF(Bq), uvF(C)) : undefined);
      });
    });
    // Tour du trou (sauf le sol) : normales vers l'intérieur du trou.
    let u = 0;
    for (let i = 1; i < trou.length; i++) {
      const p = trou[i], q = trou[(i + 1) % trou.length], dt = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dt, dy);
      if (l < 1e-6) continue;
      let nt = dy / l, ny = -dt / l;
      if (nt * -(p[0] + q[0]) / 2 + ny * (T / 2 - (p[1] + q[1]) / 2) < 0) { nt = -nt; ny = -ny; }
      lot.quad(P(-a, p), P(a, p), P(a, q), P(-a, q), [-uz * nt, ny, ux * nt], col,
        m ? [-a / m, u / m, a / m, u / m, a / m, (u + l) / m, -a / m, (u + l) / m] : undefined);
      u += l;
    }
    _dessus(lot, _sensPositif([Q(-a, -B), Q(a, -B), Q(a, B), Q(-a, B)]), h, col, m || undefined);
    v.trace = { long: +(2 * a).toFixed(3), trou: T, largeur: +(2 * v.b).toFixed(3), largeTrou: +Wt.toFixed(3),
      hautTrou: +Math.max.apply(null, trou.map(function (q) { return q[1]; })).toFixed(3),
      dir: +((v.dir || 0) * 180 / Math.PI).toFixed(2) };
  }

  // Repère d'une forme sur la paroi (v.cote : côté de la paroi, galerieEmprise.js > _surParoi) : Q(s, recul) = point
  // à `recul` m devant la paroi, côté galerie ; n = normale de la face (vers la galerie) ; droite = sens de s qui va
  // vers la droite de qui regarde la paroi (±1).
  function _faceParoi(v) {
    const Q = _repere(v), c = v.cote || -1, ux = Math.cos(v.dir || 0), uz = Math.sin(v.dir || 0);
    return { Q: function (s, recul) { return Q(s, -c * recul); }, n: [c * uz, 0, -c * ux], droite: -c };
  }

  // Rectangle plat sur la paroi, de s0 à s1 (repère du volume) et de y0 à y1, à `recul` m, face vers la galerie ;
  // `uv` (facultatif) : la texture entière, lue à l'endroit de face.
  function _rectParoi(lot, F, s0, s1, y0, y1, recul, col, uv) {
    const a = F.Q(s0, recul), b = F.Q(s1, recul), u0 = F.droite > 0 ? 0 : 1, u1 = 1 - u0;
    lot.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], F.n, col,
      uv ? [u0, 0, u1, 0, u1, 1, u0, 1] : undefined);
  }

  // Plaque gravée : chants (pierre unie) et face au nom du POI (_texPlaque, 🧱 allumé ou coupé), à la taille du nom
  // (_mesurePlaque) ; unie, liseré de joint, au-delà de PLAQUE.max textures vivantes, son panneau gardé alors (le
  // nom n'y est plus). ⚠️ contrat (décision produit) : une plaque posée porte le nom, le POI n'a pas de panneau
  // (_sansPanneau) ; toucher la plaque ouvre sa fiche (_plaqueVisee).
  function _plaque(v, lots, g) {
    const e = _e, F = _faceParoi(v), ep = PLAQUE.ep, r = PLAQUE.recul, B = PLAQUE.bord;
    const nom = _nomPlaque(v.point), l2 = _secondePlaque(v.point), m = _mesurePlaque(nom, l2), L = m.l / 2, h = m.h;
    const y = Math.min(PLAQUE.y, e.hauteur - PLAQUE.plafond - h / 2), y0 = y - h / 2, y1 = y0 + h;
    const fond = _couleurFixe(PLAQUE.pierre);
    const p = F.Q(-L, r), q = F.Q(L, r), p2 = F.Q(-L, r + ep), q2 = F.Q(L, r + ep);
    [[y1, 1], [y0, -1]].forEach(function (c) {
      lots.opaque.quad([p[0], c[0], p[1]], [q[0], c[0], q[1]], [q2[0], c[0], q2[1]], [p2[0], c[0], p2[1]],
        [0, c[1], 0], fond);
    });
    const variante = _variantePlaque(v.point), cle = nom + "\u0001" + l2 + "\u0001" + variante;
    const t = _texPlaque(cle, nom, m);
    v.trace = { plaqueY: +y.toFixed(3), texture: !!t, nom: nom, plaqueL: +m.l.toFixed(3), plaqueH: +h.toFixed(3),
      lignes: m.lignes.slice(), taillePx: m.taille, coupe: m.lignes.join(" ") !== nom.replaceAll(/\s+/g, " "),
      seconde: m.seconde, taille2Px: m.taille2, variante: variante };
    if (!t) {
      _rectParoi(lots.opaque, F, -L, L, y0, y1, r + ep, fond);
      _rectParoi(lots.opaque, F, -L + B, L - B, y0 + B, y1 - B, r + ep + 0.002, _couleurFixe(PLAQUE.joint));
      _rectParoi(lots.opaque, F, -L + 1.3 * B, L - 1.3 * B, y0 + 1.3 * B, y1 - 1.3 * B, r + ep + 0.004, fond);
      if (v.point) _ajouterPanneau(g, v.point, _placePanneau(v.point) || [v.cx, v.cz], true);
      return;
    }
    const face = new Lot();
    _rectParoi(face, F, -L, L, y0, y1, r + ep, BLANC, true);
    const me = new THREE.Mesh(face.geometrie(), t.mat);
    me.matrixAutoUpdate = false;
    me.userData.famille = "plaque";
    me.userData.plaqueCle = cle;
    me.userData.plaquePoint = v.point || null;
    g.add(me);
  }

  // 🩸 Nom entier (le panneau en garde 120 caractères) : une plaque ne coupe jamais le nom, elle s'élargit puis passe
  // sur deux lignes, puis réduit la police (_mesurePlaque).
  function _nomPlaque(p) { return String((p && (p.nom || p.name || p.id)) || "").slice(0, 120); }

  // 2ᵉ ligne gravée, plus petite : la 1re ligne de la description, seulement si elle COMMENCE par une date (1857,
  // 12/03/1890) ou un sigle de 1 à 4 capitales suivi d'un chiffre ou d'un point (« IGC 1902 », « R. 45 ») ; sinon
  // rien (décision produit : aucun champ de plus, une description ordinaire ne se grave pas). Au plus
  // PLAQUE.secondeMax caractères, coupée entre deux mots : la ligne est un millésime, pas un texte.
  const RX_SECONDE = /^(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4})(?!\d)|^[A-ZÀ-ÖØ-Þ]{1,4}(?:\.|\s*\d)/;
  function _secondePlaque(p) {
    const l = String((p && p.description) || "").trim().split(/\r?\n/)[0].trim().replaceAll(/\s+/g, " ");
    if (!RX_SECONDE.test(l)) return "";
    if (l.length <= PLAQUE.secondeMax) return l;
    const c = l.slice(0, PLAQUE.secondeMax), k = c.lastIndexOf(" ");
    return (k > 4 ? c.slice(0, k) : c).trim();
  }

  // Usure d'une plaque : une variante sur PLAQUE.variantes, tirée de l'uid du point (repli : id, puis nom).
  // ⚠️ contrat : FIXE pour un même point (jamais Math.random : graine → _aleaGraine) ; en nombre borné, pour que des
  // plaques au même texte partagent leurs textures (cache par contenu, _texPlaque).
  function _variantePlaque(p) {
    return _hachage(String((p && (p.uid || p.id || p.nom || p.name)) || "")) % PLAQUE.variantes;
  }

  // FNV-1a 32 bits d'une chaîne → entier non signé.
  function _hachage(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  // Générateur à graine (mulberry32) → fonction () → [0, 1[ : même graine, même suite, sur tout navigateur.
  function _aleaGraine(graine) {
    let a = graine >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Police des plaques sur `ctx` : capitales Didone (Bodoni Moda une fois chargée, _chargerPolicePlaques, sinon le
  // serif du système), légèrement espacées comme une inscription gravée.
  function _fontePlaque(ctx, px, poids) {
    ctx.font = poids + " " + px + "px " + FAMILLE_PLAQUE;
    if ("letterSpacing" in ctx) ctx.letterSpacing = Math.round(px * 0.06) + "px";
  }

  function _largeurPlaque(ctx, texte, px, poids) {
    _fontePlaque(ctx, px, poids);
    return ctx.measureText(texte.toUpperCase()).width;
  }

  // Corps des deux lignes réduits jusqu'à tenir dans `utileW` × `utileH` px (jamais agrandis au-delà de m.taille0).
  // ⚠️ contrat (décision produit) : la 2ᵉ ligne ne réduit jamais le nom en largeur et garde PLAQUE.min2 px ; sous un
  // nom long (deux lignes ou resserré), c'est la plaque qui grandit en hauteur (_mesurePlaque : utileH infini).
  function _ajusterPlaque(ctx, m, utileW, utileH) {
    const plusLarge = function (px) {
      return Math.max.apply(null, m.lignes.map(function (l) { return _largeurPlaque(ctx, l, px, 700); }));
    };
    const corps2 = function (px) { return m.seconde ? Math.max(PLAQUE.min2, Math.round(px * PLAQUE.corps2)) : 0; };
    const haut = function (px, px2) { return (m.lignes.length - 1) * 1.15 * px + px + (px2 ? 0.35 * px + px2 : 0); };
    let taille = m.taille0;
    while (taille > 8 && (plusLarge(taille) > utileW || haut(taille, corps2(taille)) > utileH)) taille--;
    let t2 = corps2(taille);
    while (t2 > PLAQUE.min2 && _largeurPlaque(ctx, m.seconde, t2, 600) > utileW) t2--;
    // Trop large même à PLAQUE.min2 : la ligne perd ses derniers mots plutôt que de devenir illisible.
    while (t2 && m.seconde.indexOf(" ") > 0 && _largeurPlaque(ctx, m.seconde, t2, 600) > utileW) {
      m.seconde = m.seconde.slice(0, m.seconde.lastIndexOf(" ")).trim();
    }
    m.taille = taille; m.taille2 = t2;
    m.pas = m.lignes.length > 1 ? 1.15 * taille : 0;
    m.largeTexte = Math.max(plusLarge(taille), t2 ? _largeurPlaque(ctx, m.seconde, t2, 600) : 0);
    m.hautTexte = haut(taille, t2);
    return m;
  }

  // Taille d'une plaque au nom `nom` et à la 2ᵉ ligne `l2` → { l, h (m), lignes, seconde, taille, taille2 (px de
  // police), W, H (px de texture) }. Police de PLAQUE.police de la hauteur d'une ligne ; une ligne si le nom tient
  // dans PLAQUE.lMax (plaque élargie de PLAQUE.l à lMax), au besoin resserré jusqu'à PLAQUE.serre du corps, sinon
  // deux lignes équilibrées (coupées entre deux mots) ; ce qui dépasse encore réduit la police. La 2ᵉ ligne, à
  // PLAQUE.corps2 du corps, ajoute sa hauteur.
  function _mesurePlaque(nom, l2) {
    const e = _e, R = PLAQUE.pxm, marge = 4 * PLAQUE.bord * R;
    const ctx = (e.ctxPlaque || (e.ctxPlaque = document.createElement("canvas").getContext("2d")));
    const taille0 = Math.round(PLAQUE.h * PLAQUE.police * R), utile = PLAQUE.lMax * R - marge;
    const large = function (t) { return _largeurPlaque(ctx, t, taille0, 700); };
    let lignes = [nom];
    const mots = nom.split(/\s+/).filter(Boolean);
    if (large(nom) * PLAQUE.serre > utile && mots.length > 1) {
      let mieux = null;
      for (let k = 1; k < mots.length; k++) {
        const a = mots.slice(0, k).join(" "), b = mots.slice(k).join(" "), w = Math.max(large(a), large(b));
        if (!mieux || w < mieux.w) mieux = { w: w, l: [a, b] };
      }
      lignes = mieux.l;
    }
    const m = _ajusterPlaque(ctx, { lignes: lignes, seconde: l2 || "", taille0: taille0 }, utile, Infinity);
    m.W = Math.round(Math.min(PLAQUE.lMax * R, Math.max(PLAQUE.l * R, m.largeTexte + marge)));
    m.H = Math.round(Math.max(PLAQUE.h * R, m.hautTexte + marge));
    m.l = m.W / R; m.h = m.H / R;
    return m;
  }

  // Texture et matériau d'une plaque de contenu `cle` (nom, 2ᵉ ligne, variante d'usure ; mesure `m` : _mesurePlaque),
  // partagés par toutes les plaques de ce contenu à portée (compte de références, rendu par _libererVolume) →
  // { tex, mat, n, octets, nom } | null au-delà de PLAQUE.max textures vivantes.
  function _texPlaque(cle, nom, m) {
    const e = _e;
    let t = e.plaques.get(cle);
    if (t) { t.n++; return t; }
    if (e.plaques.size >= PLAQUE.max) return null;
    const cv = document.createElement("canvas");
    cv.width = m.W; cv.height = m.H;
    t = { nom: nom, m: m, graine: _hachage(cle), n: 1, octets: m.W * m.H * 4, bodoni: false };
    _dessinerPlaque(cv, t);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    t.tex = tex;
    t.mat = new THREE.MeshLambertMaterial({ map: tex });
    e.plaques.set(cle, t);
    return t;
  }

  // Bloc de pierre de taille gravé (canvas `cv`, texture `t`) : calcaire teinté et marbré, grain, joint et
  // chanfrein au bord, lettres en creux (fond noir, ombre en haut, lèvre claire en bas), usées par endroits, puis
  // salissures. ⚠️ contrat : tout le hasard vient de _aleaGraine(t.graine), dans le même ordre d'appels — un même
  // point redonne la même plaque, à l'octet près (checkup § plaques). Redessiné sur place quand la police arrive
  // (_redessinerPlaques) : taille de texture inchangée, le texte se réajuste dedans.
  function _dessinerPlaque(cv, t) {
    const m = t.m, W = cv.width, H = cv.height, b = Math.round(PLAQUE.bord * PLAQUE.pxm);
    const alea = _aleaGraine(t.graine), entre = function (a, z) { return a + (z - a) * alea(); };
    const ctx = cv.getContext("2d");
    _ajusterPlaque(ctx, m, W - 4 * b, H - 4 * b);
    t.bodoni = _police.etat === "prete";
    ctx.save();
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    // Pierre : teinte du calcaire (beige à ocre), marbrures larges, puis grain fin au pixel.
    const teinte = entre(33, 44), sat = entre(20, 36), lum = entre(58, 67);
    ctx.fillStyle = "hsl(" + teinte.toFixed(1) + "," + sat.toFixed(1) + "%," + lum.toFixed(1) + "%)";
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {
      const x = entre(0, W), y = entre(0, H), rr = entre(0.15, 0.5) * W, clair = alea() < 0.5;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, clair ? "rgba(255,248,232," + entre(0.05, 0.14).toFixed(3) + ")"
        : "rgba(92,72,44," + entre(0.04, 0.12).toFixed(3) + ")");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    ctx.save();
    ctx.translate(-Math.floor(entre(0, 256)), -Math.floor(entre(0, 256)));
    ctx.fillStyle = ctx.createPattern(_grainPlaque(), "repeat");
    ctx.fillRect(0, 0, W + 256, H + 256);
    ctx.restore();
    // Joint de mortier tout autour, puis chanfrein (arête haute éclairée, basse dans l'ombre).
    ctx.strokeStyle = "rgba(78,66,50,0.9)"; ctx.lineWidth = b * 0.9;
    ctx.strokeRect(0, 0, W, H);
    const k = b * 0.6;
    ctx.lineWidth = Math.max(2, b * 0.25);
    ctx.strokeStyle = "rgba(255,246,226,0.45)";
    ctx.beginPath(); ctx.moveTo(k, H - k); ctx.lineTo(k, k); ctx.lineTo(W - k, k); ctx.stroke();
    ctx.strokeStyle = "rgba(48,36,22,0.4)";
    ctx.beginPath(); ctx.moveTo(W - k, k); ctx.lineTo(W - k, H - k); ctx.lineTo(k, H - k); ctx.stroke();
    // Lettres sur un calque (les user sans entamer la pierre) : lèvre claire, ombre du haut, fond noir.
    const cal = _e.calquePlaque || (_e.calquePlaque = document.createElement("canvas"));
    cal.width = W; cal.height = H;
    const c2 = cal.getContext("2d");
    c2.textAlign = "center"; c2.textBaseline = "middle";
    const relief = Math.max(1, m.taille * 0.045), encre = "hsl(30,15%," + entre(5, 10).toFixed(1) + "%)";
    const graver = function (texte, x, y, px, poids) {
      _fontePlaque(c2, px, poids);
      const T = texte.toUpperCase();
      c2.fillStyle = "rgba(255,248,232,0.7)"; c2.fillText(T, x + relief * 0.5, y + relief);
      c2.fillStyle = "rgba(20,14,8,0.85)"; c2.fillText(T, x - relief * 0.4, y - relief * 0.6);
      c2.fillStyle = encre; c2.fillText(T, x, y);
    };
    const yH = H / 2 - m.hautTexte / 2 + m.taille / 2 + 1;
    m.lignes.forEach(function (l, i) { graver(l, W / 2, yH + i * m.pas, m.taille, 700); });
    if (m.seconde) {
      graver(m.seconde, W / 2, yH + (m.lignes.length - 1) * m.pas + m.taille * 0.85 + m.taille2 / 2, m.taille2, 600);
    }
    // Usure : la peinture et l'arête des lettres partent par plaques et par points, jamais au point de ne plus lire.
    const usure = entre(0.3, 1);
    c2.globalCompositeOperation = "destination-out";
    const nTaches = Math.round(4 + 10 * usure);
    for (let i = 0; i < nTaches; i++) {
      const x = entre(2 * b, W - 2 * b), y = entre(2 * b, H - 2 * b), rr = entre(0.05, 0.18) * m.taille;
      const gr = c2.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, "rgba(0,0,0," + (entre(0.3, 0.6) * usure).toFixed(3) + ")");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      c2.fillStyle = gr; c2.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
    }
    c2.fillStyle = "rgba(0,0,0,0.55)";
    const nPoints = Math.round(150 + 350 * usure);
    for (let i = 0; i < nPoints; i++) c2.fillRect(entre(0, W), entre(0, H), entre(1, 2.5), entre(1, 2.5));
    c2.globalCompositeOperation = "source-over";
    ctx.drawImage(cal, 0, 0);
    // Salissures : pied du bloc encrassé, coulures depuis le haut, taches.
    const pied = ctx.createLinearGradient(0, H * 0.45, 0, H);
    pied.addColorStop(0, "rgba(60,46,30,0)");
    pied.addColorStop(1, "rgba(60,46,30," + entre(0.1, 0.28).toFixed(3) + ")");
    ctx.fillStyle = pied; ctx.fillRect(0, 0, W, H);
    const nCoulures = Math.floor(entre(0, 3));
    for (let i = 0; i < nCoulures; i++) {
      const x = entre(b, W - b), l = entre(0.01, 0.03) * W, bas = entre(0.4, 1) * H;
      const gc = ctx.createLinearGradient(0, 0, 0, bas);
      gc.addColorStop(0, "rgba(70,54,34," + entre(0.08, 0.16).toFixed(3) + ")");
      gc.addColorStop(1, "rgba(70,54,34,0)");
      ctx.fillStyle = gc; ctx.fillRect(x, 0, l, bas);
    }
    const nTachesS = Math.round(2 + 4 * usure);
    for (let i = 0; i < nTachesS; i++) {
      const x = entre(0, W), y = entre(0, H), rr = entre(0.03, 0.12) * W;
      const gt = ctx.createRadialGradient(x, y, 0, x, y, rr);
      gt.addColorStop(0, "rgba(74,58,36," + entre(0.05, 0.14).toFixed(3) + ")");
      gt.addColorStop(1, "rgba(74,58,36,0)");
      ctx.fillStyle = gt; ctx.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
    }
    ctx.restore();
  }

  // Grain de la pierre : tuile de 256 px de points clairs et sombres translucides, faite une fois (graine fixe) et
  // posée en motif, décalée par plaque. 🩸 Un grain au pixel par plaque (getImageData) coûtait ~5 ms par texture.
  let _grain = null;
  function _grainPlaque() {
    if (_grain) return _grain;
    const N = 256, cv = document.createElement("canvas"), alea = _aleaGraine(0x5eed);
    cv.width = N; cv.height = N;
    const g = cv.getContext("2d"), img = g.createImageData(N, N), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = alea() - 0.5, tache = alea() < 0.006;
      const v = tache || n < 0 ? 30 : 255;
      d[i] = v; d[i + 1] = v; d[i + 2] = v - (v > 128 ? 20 : 0);
      d[i + 3] = tache ? 90 : Math.round(Math.abs(n) * 46);
    }
    g.putImageData(img, 0, 0);
    _grain = cv;
    return cv;
  }

  // Police des plaques arrivée (_chargerPolicePlaques) : chaque texture vivante redessinée sur place, avec la même
  // graine (même usure), au même encombrement.
  function _redessinerPlaques() {
    const e = _e;
    if (!e || !e.plaques || !e.plaques.size) return;
    e.plaques.forEach(function (t) { _dessinerPlaque(t.tex.image, t); t.tex.needsUpdate = true; });
    e.sale = true;
  }

  function _rendrePlaque(cle) {
    const e = _e, t = e && e.plaques ? e.plaques.get(cle) : null;
    if (!t || --t.n > 0) return;
    t.tex.dispose(); t.mat.dispose();
    e.plaques.delete(cle);
  }

  // Épure : traits clairs à plat sur la paroi (ligne, talons aux bouts, croix au milieu, flèche vers la droite du
  // regard), lot opaque, couleur EPURE.couleur.
  function _epure(v, lots) {
    const e = _e, F = _faceParoi(v), E = EPURE, w = E.larg / 2, L = E.l / 2, col = _couleurFixe(E.couleur);
    const y = Math.min(E.y, e.hauteur - 0.3), d = F.droite;
    const trait = function (s0, y0, s1, y1) {
      const ds = s1 - s0, dy = y1 - y0, l = Math.hypot(ds, dy);
      if (l < 1e-6) return;
      const ns = -dy / l * w, ny = ds / l * w;
      const A = F.Q(s0 + ns, E.recul), B = F.Q(s1 + ns, E.recul), C = F.Q(s1 - ns, E.recul), D = F.Q(s0 - ns, E.recul);
      lots.opaque.quad([A[0], y0 + ny, A[1]], [B[0], y1 + ny, B[1]], [C[0], y1 - ny, C[1]], [D[0], y0 - ny, D[1]],
        F.n, col);
    };
    trait(-L, y, L, y);
    trait(-L, y - E.talon, -L, y + E.talon);
    trait(L, y - E.talon, L, y + E.talon);
    trait(-E.croix, y - E.croix, E.croix, y + E.croix);
    trait(-E.croix, y + E.croix, E.croix, y - E.croix);
    const bout = d * (L - 0.15);
    trait(bout, y, bout - d * E.fleche, y + E.fleche * 0.7);
    trait(bout, y, bout - d * E.fleche, y - E.fleche * 0.7);
    v.trace = { epureY: +y.toFixed(3), traits: 7 };
  }

  // Portail : cadre de porte (deux montants, linteau) à plat devant la paroi ; lumineux à la couleur d'interaction
  // (jetons sombres) si le point a une liaison (_liaisonsPortail), éteint sinon.
  function _portail(v, lots) {
    const e = _e, F = _faceParoi(v), L = PORTAIL.l / 2, b = PORTAIL.bord, r = PORTAIL.recul, ep = PORTAIL.ep;
    const H = Math.min(PORTAIL.h, e.hauteur - PORTAIL.plafond), ux = Math.cos(v.dir || 0), uz = Math.sin(v.dir || 0);
    v.allume = _liaisonsPortail(v.point).length > 0;
    const lot = v.allume ? lots.lumineux : lots.opaque;
    const col = _couleurFixe(v.allume ? _jetonsSombres().interaction : COULEUR_PORTAIL_ETEINT);
    const barre = function (s0, s1, y0, y1) {
      _rectParoi(lot, F, s0, s1, y0, y1, r + ep, col);
      [[s0, -1], [s1, 1]].forEach(function (q) {
        const p = F.Q(q[0], r), p2 = F.Q(q[0], r + ep);
        lot.quad([p[0], y0, p[1]], [p2[0], y0, p2[1]], [p2[0], y1, p2[1]], [p[0], y1, p[1]], [ux * q[1], 0, uz * q[1]],
          col);
      });
    };
    barre(-L, -L + b, 0, H);
    barre(L - b, L, 0, H);
    barre(-L + b, L - b, H - b, H);
    v.trace = { allume: v.allume, haut: +H.toFixed(3), largeur: PORTAIL.l };
  }

  // Véhicule : caisse, habitacle (vitres sombres sur les quatre côtés) et quatre roues, le long de l'axe (v.dir),
  // dans le lot opaque. ⚠️ contrat : l'obstacle est son rectangle au sol (galerieEmprise.js > _obstaclesAcces).
  function _vehicule(v, lots) {
    const e = _e, V = VEHICULE, Q = _repere(v), a = v.a, b = v.b, lot = lots.opaque;
    const haut = Math.min(DIM_ACCES.vehiculeH, e.hauteur - 0.05), caisse = Math.min(V.caisse, haut - 0.2);
    const ha = a * V.hab, hb = b - V.retrait, verre = 0.012;
    const corps = _couleurFixe(V.carrosserie), vitre = _couleurFixe(V.vitre), pneu = _couleurFixe(V.pneu);
    _pave(lot, Q, -a, a, -b, b, V.garde, caisse, corps);
    _pave(lot, Q, -ha * 0.9, ha, -hb, hb, caisse, haut, corps);
    const yv0 = caisse + 0.06, yv1 = haut - 0.08;
    [[-hb - verre, -1], [hb + verre, 1]].forEach(function (c) {
      const p = Q(-ha * 0.9 + 0.1, c[0]), q = Q(ha - 0.1, c[0]), n = [-Math.sin(v.dir || 0) * c[1], 0,
        Math.cos(v.dir || 0) * c[1]];
      lot.quad([p[0], yv0, p[1]], [q[0], yv0, q[1]], [q[0], yv1, q[1]], [p[0], yv1, p[1]], n, vitre);
    });
    [[ha + verre, 1], [-ha * 0.9 - verre, -1]].forEach(function (c) {
      const p = Q(c[0], -hb + 0.1), q = Q(c[0], hb - 0.1), n = [Math.cos(v.dir || 0) * c[1], 0,
        Math.sin(v.dir || 0) * c[1]];
      lot.quad([p[0], yv0, p[1]], [q[0], yv0, q[1]], [q[0], yv1, q[1]], [p[0], yv1, p[1]], n, vitre);
    });
    // Roues : prismes à V.cotes faces, axe en travers (t), posées au sol.
    const R = V.roue, ux = Math.cos(v.dir || 0), uz = Math.sin(v.dir || 0);
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (r) {
      const sc = r[0] * (a - R - 0.2), t0 = r[1] * (b - V.roueL), t1 = r[1] * b + r[1] * 0.01;
      for (let k = 0; k < V.cotes; k++) {
        const a0 = 2 * Math.PI * k / V.cotes, a1 = 2 * Math.PI * (k + 1) / V.cotes;
        const s0 = sc + R * Math.cos(a0), y0 = R + R * Math.sin(a0);
        const s1 = sc + R * Math.cos(a1), y1 = R + R * Math.sin(a1);
        const nm = (a0 + a1) / 2, n = [ux * Math.cos(nm), Math.sin(nm), uz * Math.cos(nm)];
        const A = Q(s0, t0), B = Q(s1, t0), C = Q(s1, t1), D = Q(s0, t1);
        lot.quad([A[0], y0, A[1]], [B[0], y1, B[1]], [C[0], y1, C[1]], [D[0], y0, D[1]], n, pneu);
        const F = Q(sc, t1), G = Q(s0, t1), H = Q(s1, t1), nf = [-uz * r[1], 0, ux * r[1]];
        lot.tri([F[0], R, F[1]], [G[0], y0, G[1]], [H[0], y1, H[1]], nf, pneu);
      }
    });
    v.trace = { long: +(2 * a).toFixed(3), large: +(2 * b).toFixed(3), haut: +haut.toFixed(3) };
  }

  // Battant : pavé b = [s0, s1, t0, t1] (repère du volume) de y0 à y1 ; ses deux grandes faces portent le motif
  // entier (u en travers, v vers le haut), les chants et les tranches un coin du motif.
  function _battant(lot, Q, b, y0, y1, col, tx) {
    const ring = _sensPositif([Q(b[0], b[2]), Q(b[1], b[2]), Q(b[1], b[3]), Q(b[0], b[3])]);
    const grand = Math.max(b[1] - b[0], b[3] - b[2]) * 0.5, zero = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const p = ring[k], q = ring[(k + 1) % 4], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      lot.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], [dz / l, 0, -dx / l], col,
        tx ? (l > grand ? [0, 0, 1, 0, 1, 1, 0, 1] : zero) : undefined);
    }
    [[y1, 1], [y0, -1]].forEach(function (f) {
      lot.quad([ring[0][0], f[0], ring[0][1]], [ring[1][0], f[0], ring[1][1]], [ring[2][0], f[0], ring[2][1]],
        [ring[3][0], f[0], ring[3][1]], [0, f[1], 0], col, tx ? zero : undefined);
    });
  }

  // Bois des battants (🧱), dessiné une fois par page : planches verticales (fil, nuance par planche, rainures),
  // pentures de fer horizontales cloutées, en relief. → { couleur, normale } (canvas BOIS.px, puissance de 2 :
  // mipmaps). 🩸 Hauteur en v vers le haut (comme _appareil) : ligne y écrite à n − 1 − y.
  function _bois(alea) {
    const B = BOIS, n = B.px, haut = new Float32Array(n * n), img = new Uint8ClampedArray(n * n * 4);
    const fil = _champBoucle(alea, 24, 3, n), fin = _champBoucle(alea, 64, 8, n), nuance = _champBoucle(alea, 4, 4, n);
    const bois = new THREE.Color(B.couleur), fer = new THREE.Color(B.fer), larg = n / B.planches, teintes = [];
    for (let i = 0; i < B.planches; i++) teintes.push(0.82 + alea() * 0.3);
    const demi = B.bande * n / 2;
    const surBande = function (y) {
      return B.pentures.some(function (c) { return Math.abs(y - c * n) < demi; });
    };
    for (let y = 0; y < n; y++) {
      const bande = surBande(y);
      for (let x = 0; x < n; x++) {
        const p = y * n + x, o4 = ((n - 1 - y) * n + x) * 4, k = Math.min(B.planches - 1, Math.floor(x / larg));
        const dx = x - k * larg, joint = Math.min(dx, larg - dx), rainure = joint < 2 ? 1 - joint / 2 : 0;
        let c, f;
        if (bande) {
          haut[p] = 0.9 + 0.05 * fin[p];
          c = fer; f = 0.8 + 0.3 * nuance[p];
        } else {
          haut[p] = 0.45 + 0.12 * fil[p] + 0.05 * fin[p] - 0.4 * rainure;
          c = bois; f = teintes[k] * (0.72 + 0.4 * fil[p]) * (0.92 + 0.16 * fin[p]) * (1 - 0.6 * rainure);
        }
        img[o4] = c.r * 255 * f; img[o4 + 1] = c.g * 255 * f; img[o4 + 2] = c.b * 255 * f; img[o4 + 3] = 255;
      }
    }
    // Clous des pentures : têtes rondes en relief, un peu plus claires.
    B.pentures.forEach(function (cy) {
      for (let cx = B.clou / 2; cx < n; cx += B.clou) {
        for (let y = Math.floor(cy * n - 3); y <= cy * n + 3; y++) {
          for (let x = Math.floor(cx - 3); x <= cx + 3; x++) {
            const d = Math.hypot(x - cx, y - cy * n);
            if (d > 3 || y < 0 || y >= n || x < 0 || x >= n) continue;
            const p = y * n + x, o4 = ((n - 1 - y) * n + x) * 4, s = 1 - d / 3;
            haut[p] += 0.2 * s;
            for (let q = 0; q < 3; q++) img[o4 + q] = Math.min(255, img[o4 + q] * (1 + 0.35 * s));
          }
        }
      }
    });
    return { couleur: _canvasDe(img, n), normale: _carteNormale(haut, n, B.relief) };
  }

  // Matériau des battants (🧱), fait au premier cavage construit (aucun coût sans cavage ni 🧱 coupé) ; libéré avec
  // la vue (_demonter).
  function _matPorte() {
    const e = _e;
    if (e.mats.porte) return e.mats.porte;
    const t0 = performance.now(), t = _texturesPeintes("porte", _bois, BOIS.graine);
    e.mats.porte = new THREE.MeshLambertMaterial({ map: t.couleur, normalMap: t.normale });
    e.msPorte = performance.now() - t0;
    return e.mats.porte;
  }

  function _ajouterAcces(lots, ajouter) {
    if (lots.bois && lots.bois.p.length) ajouter(lots.bois, _matPorte(), 0, "porte");
    if (lots.roche && lots.roche.p.length) { _matsTextures(); ajouter(lots.roche, _e.mats.roche, 0, "chatiere"); }
    if (lots.remblais && lots.remblais.p.length) ajouter(lots.remblais, _matZone("remblais"), 0, "remblais");
    if (lots.eau) ajouter(lots.eau, _e.mats.eauGalerie, 2, "eau");
  }

  // Ce que le checkup lit d'un accès construit (KtaVue3D.etat().volumes) : genre, triangles par lot, matériaux.
  function _statsAcces(v, lots, g) {
    const n = function (l) { return l ? l.p.length / 9 : 0; };
    const maille = function (f) { return g.children.filter(function (o) { return o.userData.famille === f; })[0]; };
    const porte = maille("porte"), remblais = maille("remblais");
    return Object.assign({ acces: true, ferme: !!v.ferme, bouchee: !!v.bouche, comble: !!v.comble,
      bassin: !!v.bassin, porte: !!v.porte, ouvert: !!v.ouvert, chatiere: !!v.chatiere, surParoi: !!v.surParoi,
      cote: v.cote || 0, appui: v.appui || null,
      dirParoi: v.surParoi ? +((v.dir || 0) * 180 / Math.PI).toFixed(2) : null, vehicule: !!v.vehicule,
      roche: n(lots.roche), bois: n(lots.bois),
      remblais: n(lots.remblais),
      eau: n(lots.eau), porteTexturee: !!(porte && porte.material.map), remblaisTexture: !!(remblais &&
      remblais.material.map), familles: g.children.map(function (o) { return o.userData.famille; }) }, v.trace || {});
  }

  // Cône et bassin que l'itinéraire enjambe (comme un remblais, _volumesIti), à leur hauteur propre (h).
  function _volumesItiAcces(vols) {
    const out = [];
    (vols || []).forEach(function (v) {
      if (!v.acces || (!v.comble && !v.bassin) || (v.comble && !_coneMontre(v))) return;
      const D = DIM_ACCES, ring = v.comble ? _cercle(v.cone, v.cone.R) : _cercle(v, D.bassin / 2 + D.margelle);
      const h = v.comble ? D.coneH * Math.min(1, v.cone.R / D.cone) : D.margelleH;
      const o = { ring: ring, h: h, x0: Infinity, z0: Infinity, x1: -Infinity,
        z1: -Infinity };
      ring.forEach(function (q) {
        o.x0 = Math.min(o.x0, q[0]); o.x1 = Math.max(o.x1, q[0]);
        o.z0 = Math.min(o.z0, q[1]); o.z1 = Math.max(o.z1, q[1]);
      });
      out.push(o);
    });
    return out;
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
    // 🩸 Bascule à l'image où le temps passe M, et le temps repart de M : sur une image lente (dt jusqu'à 0,1 s), il
    // dépassait M et la scène d'arrivée apparaissait sous un voile déjà levé de moitié (WebKit sous charge). L'image
    // de la bascule est noire ; le voile se lève ensuite.
    if (!g.fait && g.t >= M) {
      g.t = M;
      g.fait = true;
      try { g.bascule(); } catch (err) { console.warn("[Vue3D] bascule de niveau :", err && err.message); }
      if (!_e) return;
    }
    const t = Math.min(g.t, T);
    let op;
    if (t < M) {
      e.dy = g.sens * g.d1 * _lisse(t / M);
      op = (t - (M - F)) / F;
    } else {
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
  // Icônes de la barre de la carte (ktaIcones.js) : m-pilier = les structures, m-galerie = les tracés ; le mixte
  // montre les deux.
  const RENDU_UI = {
    mixte: { icones: ["m-pilier", "m-galerie"], nom: "vue3d.modeMixte", passer: "vue3d.passerMixte" },
    structures: { icones: ["m-pilier"], nom: "vue3d.modeStructures", passer: "vue3d.passerStructures" },
    galerie: { icones: ["m-galerie"], nom: "vue3d.modeGalerie", passer: "vue3d.passerGalerie" }
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
    const cache = e.plansCaches || {};
    e.sol.visible = !gal && !cache.sol;
    _majSolActif();
    e.plafond.visible = !gal && e.vue !== "plongee" && !cache.plafond;
    if (b) {
      const ici = RENDU_UI[e.rendu] || RENDU_UI.structures, apres = RENDU_UI[_renduSuivant(e.rendu)];
      _poserIcone(b, ici.icones, _t(ici.nom));
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

  // Tuiles proches du centre de la scène (_centreScene) construites (toutes à l'ouverture, puis quelques-unes par
  // image), lointaines jetées.
  function _gererTuiles(tout) {
    const e = _e, c = _centreScene(), px = c.x, pz = c.z;
    const rVue = _rayonScene();
    const rGarde = rVue + 2 * TUILE;
    let construites = 0;
    const t0 = performance.now();
    e.tuiles.forEach(function (t) {
      const d = _distTuile(t, px, pz);
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
    e.construitesImage = construites;
  }

  // Distance (m) de (px, pz) au carré d'une tuile (0 dedans).
  function _distTuile(t, px, pz) {
    return Math.hypot(Math.max(t.x0 - px, 0, px - t.x1), Math.max(t.z0 - pz, 0, pz - t.z1));
  }

  // Tuiles à portée pas encore montrées, et tuiles montrées hors de portée (checkup : 0 et 0 une fois posé).
  function _ecartTuiles() {
    const e = _e, c = _centreScene(), px = c.x, pz = c.z, r = _rayonScene();
    let manquantes = 0, hors = 0, montrees = 0;
    e.tuiles.forEach(function (t) {
      const d = _distTuile(t, px, pz), vue = !!t.obj && t.obj.visible;
      if (vue) montrees++;
      if (d <= r && !vue) manquantes++;
      if (vue && d > r) hors++;
    });
    return { manquantes: manquantes, hors: hors, montrees: montrees };
  }

  // Part (0..1) de l'abaissement dans une chatière à la place (x, z) m : 1 dans la roche (de −a à a le long de son
  // axe, sur la largeur de la galerie), décroissante (_lisse) sur CHATIERE.approche m de part et d'autre, 0 ailleurs.
  // ⚠️ contrat (décision produit) : la chatière n'arrête jamais le pas ; on la traverse en rampant, en suivi comme en
  // libre (la place est celle du tracker en suivi), à hauteur d'yeux seulement (la vue d'édition ne s'abaisse pas).
  function _baisseChatiere(x, z) {
    const vols = _e.volPassages || [];
    let k = 0;
    for (let i = 0; i < vols.length; i++) {
      const v = vols[i];
      if (!v.chatiere) continue;
      const ux = Math.cos(v.dir || 0), uz = Math.sin(v.dir || 0), dx = x - v.cx, dz = z - v.cz;
      if (Math.abs(-uz * dx + ux * dz) > v.b + CHATIERE.deborde) continue;
      const d = Math.abs(ux * dx + uz * dz) - v.a;
      k = Math.max(k, d <= 0 ? 1 : 1 - _lisse(d / CHATIERE.approche));
    }
    return k;
  }

  function _placerCamera() {
    const e = _e, x = e.pos.x / e.sc, z = e.pos.y / e.sc, cap = e.cap * Math.PI / 180, c = _centreScene();
    // Chatière (_baisseChatiere) : l'œil descend vers CHATIERE.oeil, jamais plus haut qu'il n'est.
    e.ramper = e.vue === "plongee" ? 0 : _baisseChatiere(x, z);
    const baisse = e.ramper * Math.max(0, e.oeil - CHATIERE.oeil);
    // Geste d'un passage (_majGeste) : la caméra descend ou monte dans le volume ; galerie inclinée : sur sa pente.
    const sol = _solPlace(), dy = (e.dy || 0) - baisse + sol;
    e.tete.position.set(x, e.oeil + dy, z);
    e.tete.rotation.set(e.tangage, -cap, 0);
    e.sol.position.set(c.x, 0, c.z);
    // Le carré de sol suit le centre de la scène : le motif est décalé d'autant pour rester fixe sous les pieds.
    e.grain.offset.set(c.x / GRAIN_METRES, -c.z / GRAIN_METRES);
    e.plafond.position.set(c.x, e.hauteur, c.z);
    _placerVoisins(c);
    e.avatar.position.set(x, 0.45 + sol, z);
    e.avatar.rotation.set(0, -cap, 0);
    _majLampesMembres();
    if (e.vue === "plongee") {
      const fx = Math.sin(cap), fz = -Math.cos(cap), i = e.inclinaison * Math.PI / 180;
      const v = _viseeCamera(), vx = v.x, vz = v.z, h = e.recul * Math.cos(i), y0 = e.vise ? 0 : sol;
      e.camera.position.set(vx - fx * h, y0 + e.recul * Math.sin(i), vz - fz * h);
      e.camera.lookAt(vx, y0, vz);
    } else {
      e.camera.position.set(x, e.oeil + dy, z);
      e.camera.rotation.set(e.tangage, -cap, 0);
    }
    _majPanneaux();
    _majBoussole();
  }

  // ── Caméra libre de la vue plongeante ─────────────────────────────────────────────────────────────
  // ⚠️ contrat (décision produit : comme une carte) : un doigt glissé (la souris au PC) déplace le point visé `e.vise`
  // ({ x, z } m), jamais la place : avatar, position de la 3D et tracker restent (la 3D ne recale jamais le tracker sans
  // demande). e.vise null = la caméra suit la place (2 m devant soi). Tuiles, volumes, panneaux, sol et plan au sol
  // suivent le point visé (_centreScene) : la scène existe là où l'on regarde. Marcher (joystick, pavé, clavier :
  // _rattacher), ⌖ (surPlace) et le retour à hauteur d'yeux (_appliquerVue) ramènent la caméra sur la place.
  function _viseeCamera() {
    const e = _e;
    if (e.vise) return e.vise;
    const cap = e.cap * Math.PI / 180;
    return { x: e.pos.x / e.sc + Math.sin(cap) * 2, z: e.pos.y / e.sc - Math.cos(cap) * 2 };
  }

  // Centre de la scène (m) : le point visé en plongée détachée, sinon la place.
  function _centreScene() {
    const e = _e;
    return e.vue === "plongee" && e.vise ? e.vise : { x: e.pos.x / e.sc, z: e.pos.y / e.sc };
  }

  // Point visé déplacé de (dx, dz) m, gardé sur l'image du plan. Rend le point visé, null hors plongée.
  function panner(dx, dz) {
    const e = _e;
    if (!e || e.vue !== "plongee" || !Number.isFinite(dx) || !Number.isFinite(dz)) return null;
    const v = _viseeCamera(), pc = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
    let x = v.x + dx, z = v.z + dz;
    if (pc && pc.imageWidth && pc.imageHeight) {
      x = Math.max(0, Math.min(pc.imageWidth / e.sc, x));
      z = Math.max(0, Math.min(pc.imageHeight / e.sc, z));
    }
    e.vise = { x: x, z: z };
    _majBoutonPlace();
    e.sale = true;
    return { x: x, z: z };
  }

  // Doigt glissé de (x0, y0) à (x1, y1) px écran : le sol pris sous le doigt le suit (rayons contre le plan y = 0).
  // 🩸 La caméra ne fait que se translater : l'écart entre les deux points du sol vaut aussi avec la caméra de l'image
  // précédente (plusieurs mouvements entre deux images). Un rayon près de l'horizon partirait au loin : un pas est borné
  // au recul.
  function _panner(x0, y0, x1, y1) {
    const e = _e, plan = e.planSol0 || (e.planSol0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    const sol = function (cx, cy) {
      if (!_rayonEcran(cx, cy)) return null;
      return e.rayon.ray.intersectPlane(plan, new THREE.Vector3());
    };
    const a = sol(x0, y0), b = sol(x1, y1);
    if (!a || !b) return;
    let dx = a.x - b.x, dz = a.z - b.z;
    const l = Math.hypot(dx, dz);
    if (l > e.recul) { dx *= e.recul / l; dz *= e.recul / l; }
    panner(dx, dz);
  }

  // Caméra ramenée sur la place (⌖, marcher, hauteur d'yeux). Rend true si elle était détachée.
  function surPlace() {
    const e = _e;
    if (!e || !e.vise) return false;
    e.vise = null;
    _majBoutonPlace();
    e.sale = true;
    return true;
  }
  function _rattacher() { if (_e.vise) surPlace(); }

  // ⌖ montré en plongée seulement, caméra détachée de la place.
  function _majBoutonPlace() {
    const e = _e;
    if (e.boutonPlace) e.boutonPlace.hidden = !(e.vue === "plongee" && e.vise);
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
    _orienterSoleil();
    if (e.mc) e.mc.sale = true;
    e.roseAngle = Number.NaN;
    if (e.boussole) {
      const non = e.nordCalibre ? "" : " · " + _t("vue3d.nordNonCalibre");
      e.boussole.setAttribute("aria-label", _t("vue3d.boussole") + non);
    }
    e.sale = true;
  }

  // Soleil du Plein jour vers SOLEIL.azimut° du nord réel (e.nord = cap plan du nord ; angle plan 0 = haut de
  // l'image = −z, 90 = +x), SOLEIL.hauteur° au-dessus de l'horizon. Nord pas encore lu : le haut du plan.
  function _orienterSoleil() {
    const e = _e;
    if (!e || !e.soleil) return;
    const a = ((Number(e.nord) || 0) + SOLEIL.azimut) * Math.PI / 180, h = SOLEIL.hauteur * Math.PI / 180;
    e.soleil.position.set(Math.sin(a) * Math.cos(h), Math.sin(h), -Math.cos(a) * Math.cos(h)).multiplyScalar(10);
    e.sale = true;
  }

  // Inclinaison de la vue plongeante, bornée, retenue tant que la vue est ouverte.
  function incliner(deg) {
    if (!_e) return;
    _e.inclinaison = Math.max(INCLINAISON.min, Math.min(INCLINAISON.max, _e.inclinaison + deg));
    _e.sale = true;
    if (deg) _retenirEdition(false);
  }

  // Zoom de la vue plongeante : recul multiplié par `facteur` (< 1 = plus près), borné à RECUL, retenu tant que la vue
  // est ouverte. Refusé quand une greffe interdit la plongée (ctx.regler({ plongee: false })). Rend le recul.
  function zoomer(facteur) {
    const e = _e;
    if (!e) return null;
    const f = Number(facteur);
    if (!(f > 0) || !Number.isFinite(f) || !_permisGreffe("plongee")) return e.recul;
    const v = Math.max(RECUL.min, Math.min(_reculMax(), e.recul * f));
    if (v !== e.recul) { e.recul = v; _appliquerPortee(); _retenirEdition(false); }
    _majZoom();
    return e.recul;
  }

  // ⚠️ contrat : + − ▲ ▼ de la vue d'édition suivent la case « Boutons de zoom » de l'accueil (config.js >
  // ktaBoutonsZoom, APP_CONFIG.zoomBoutons, défaut OFF), relue à chaque application et à kta:zoomBoutonsChange
  // (case changée vue ouverte). Molette, clavier et doigts zooment et inclinent sans eux ; ⌖ n'en dépend pas.
  function _majBoutonsIncl() {
    const e = _e;
    if (!e || !e.boutonsIncl) return;
    e.boutonsIncl.hidden = e.vue !== "plongee" || !(window.APP_CONFIG && window.APP_CONFIG.zoomBoutons === true);
  }

  function _majZoom() {
    const e = _e;
    if (e.zoomPlus) e.zoomPlus.disabled = e.recul <= RECUL.min + 1e-6;
    if (e.zoomMoins) e.zoomMoins.disabled = e.recul >= _reculMax() - 1e-6;
  }

  // ── 🛡️ Limiter la portée (anti-crash mémoire) ─────────────────────────────────────────────────────────────
  // Limitée : la case cochée (préférence de l'appareil, recochée à chaque ouverture au doigt : _limiterVoulu), ou une
  // greffe qui fige les réglages (_fige : la partie garde la portée par défaut, case grisée, préférence jamais réécrite).
  function _limitee() {
    const e = _e;
    return !e || e.limiter !== false || _fige();
  }

  // Diagonale (m) de l'emprise du plan : image du plan et objets indexés (un objet peut déborder de l'image). Portée
  // « Tout le plan » et recul le plus grand : vu de n'importe où sur le plan, tout le plan est dans ce rayon.
  function _diagPlan() {
    const e = _e, pc = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
    let x0 = 0, z0 = 0, x1 = pc && pc.imageWidth ? pc.imageWidth / e.sc : 0;
    let z1 = pc && pc.imageHeight ? pc.imageHeight / e.sc : 0;
    e.tuiles.forEach(function (t) {
      if (!(t.x1 >= t.x0)) return;
      x0 = Math.min(x0, t.x0); z0 = Math.min(z0, t.z0); x1 = Math.max(x1, t.x1); z1 = Math.max(z1, t.z1);
    });
    return Math.ceil(Math.hypot(x1 - x0, z1 - z0));
  }

  function _reculMax() {
    const e = _e;
    return _limitee() ? RECUL.max : Math.max(RECUL.max, e.diag || 0);
  }

  // Portée en vigueur : celle de la partie (_fige), sinon le cran « Tout le plan » (case décochée), sinon la portée
  // voulue. 🩸 Jamais rebornée ici : `ouvrir({ distanceVue })` (mesures, checkup) peut sortir de PORTEE.
  function _distanceEnVigueur() {
    const e = _e;
    if (_fige()) return PORTEE.defaut;
    if (!_limitee() && e.porteeTout) return Math.max(PORTEE.max, e.diag || 0);
    return e.porteeVoulue;
  }

  // Case cochée ou non (retenue sur l'appareil) : portée, recul, rayon construit et brouillard suivent. Décocher pose
  // d'abord la question (ktaConfirm, comme 🛡️ « Limiter le dézoom sur mobile » de la carte) ; `o.confirme` la
  // saute (mesures). Rend (Promise) l'état en vigueur (true = limitée), false si une greffe fige les réglages
  // (refusée, rien d'écrit), null vue fermée.
  function limiterPortee(oui, o) {
    const e = _e;
    if (!e) return Promise.resolve(null);
    if (_fige()) return Promise.resolve(false);
    const v = oui !== false;
    if (v === (e.limiter !== false)) return Promise.resolve(v);
    const question = v || (o && o.confirme) || typeof window.ktaConfirm !== "function" ? Promise.resolve(true)
      : window.ktaConfirm(window.ktaEsc(_t("vue3d.limiterTexte")), {
        titre: window.ktaEsc(_t("vue3d.limiterTitre")),
        okLabel: window.ktaEsc(_t("vue3d.limiterOui")),
        cancelLabel: window.ktaEsc(_t("vue3d.limiterNon"))
      }).then(function (r) { _rendreFocus(e.boutonLimiter); return r; });
    return question.then(function (accord) {
      if (_e !== e) return null;
      if (accord && !_fige()) {
        e.limiter = typeof window.setVue3DLimiterPortee === "function" ? window.setVue3DLimiterPortee(v) : v;
        // ⚠️ contrat (décision produit) : décocher, c'est vouloir tout voir : la portée passe aussitôt au cran
        // « Tout le plan » (sinon le curseur restait sur sa portée en mètres jusqu'au premier toucher).
        if (!v) e.porteeTout = typeof window.setVue3DPorteeTout === "function" ? window.setVue3DPorteeTout(true) : true;
        _appliquerGreffeReglages();
      }
      return _limitee();
    });
  }

  function _majLimiter() {
    const e = _e, b = e && e.boutonLimiter;
    if (!b) return;
    const suffixe = _fige() ? " · " + _t("vue3d.reglageGreffe") : "";
    b.setAttribute("aria-pressed", _limitee() ? "true" : "false");
    b.disabled = _fige();
    b.title = _t("vue3d.limiterAide") + suffixe;
    b.setAttribute("aria-label", _t("vue3d.limiter") + suffixe);
  }

  // Rayon de scène (m autour de soi) : tuiles, volumes, panneaux. À hauteur d'yeux, la portée ; en plongée, il suit
  // aussi le recul (vu de plus haut, on voit plus loin), jusqu'à RAYON_RECUL_MAX (sans plafond, portée non limitée).
  function _rayonScene() {
    const e = _e, plafond = _limitee() ? RAYON_RECUL_MAX : Infinity;
    return e.vue === "plongee" ? Math.max(e.distance * 1.4, Math.min(plafond, e.recul * SOL_PAR_RECUL))
      : e.distance;
  }

  // Rayon vu (m) : sol, plafond, plan au sol et brouillard. Il suit le recul sans plafond (pas de bord noir en
  // dézoomant) ; entre _rayonScene et lui, le sol nu (et le plan au sol s'il est allumé) sans structures.
  function _rayonVue() {
    const e = _e;
    return e.vue === "plongee" ? Math.max(e.distance * 1.4, e.recul * SOL_PAR_RECUL) : e.distance;
  }

  // Brouillard, profondeur de la caméra, carré de sol, ambiance et lampe selon la vue, la portée, le recul et le
  // réglage de la lampe. En plongée, le brouillard se compte depuis la caméra : il part du recul.
  // ⚠️ contrat (décision produit) : la case ☀️ vaut dans les deux vues. Cochée : soleil rasant (SOLEIL), ambiance
  // baissée, brouillard et fond clairs (jeton neutre de la charte) ; la lampe garde son réglage et s'ajoute autour de
  // soi. Décochée : nuit à hauteur d'yeux, éclairage plat en vue d'édition (AMBIANCE_PLONGEE, lisible pour dessiner),
  // brouillard et fond noirs. En vue d'édition, le brouillard clair part du point visé (au-delà, le lointain pâlit ;
  // en deçà, net). Une greffe qui fige les réglages coupe Plein jour (_lampeEnVigueur).
  function _appliquerPortee() {
    const e = _e, haut = e.vue === "plongee", l = _lampeEnVigueur(), r = _rayonVue();
    const brume = l.jour ? AMBIANCE.brumeJour : l.courbe.brume;
    e.ambiance.intensity = l.jour ? AMBIANCE.jour : haut ? AMBIANCE_PLONGEE : AMBIANCE.nuit;
    e.soleil.intensity = l.jour ? SOLEIL.force : 0;
    // Fond clair seulement avec le brouillard clair du Plein jour (il s'y fond) ; sans brouillard (🛡️ décochée), ciel
    // noir comme la nuit (décision produit).
    const fond = l.jour && _limitee() ? _couleurFixe(_jetonsSombres().neutre) : _couleurFixe("#000000");
    e.scene.fog.color.copy(fond);
    e.scene.background.copy(fond);
    const loin = haut ? e.recul + r + 2 : e.distance;
    // ⚠️ contrat (décision produit) : portée non limitée (🛡️ décochée), aucun brouillard : on voit tout le plan.
    // Le brouillard est repoussé hors de vue plutôt que retiré (scene.fog = null recompilerait tous les shaders).
    const sansBrume = !_limitee();
    e.scene.fog.near = sansBrume ? 1e7 : haut ? e.recul + (l.jour ? 0 : r * 0.3) : e.distance * brume;
    e.scene.fog.far = sansBrume ? 1e7 + 1 : loin;
    e.camera.far = loin + (haut ? 10 : 5);
    // 🩸 En vue d'édition, le plan proche suit le recul (PROCHE_PAR_RECUL), sans saut : à 5 cm pour 150 m de recul
    // (cas du téléphone, 🛡️ recochée à chaque ouverture), la profondeur ne séparait plus l'eau du sol (10 cm d'écart
    // minimal en haut de l'écran). La caméra reste à plus de recul · sin(15°) du point visé, au-dessus des volumes.
    e.camera.near = haut ? Math.max(0.05, e.recul * PROCHE_PAR_RECUL) : 0.05;
    e.camera.updateProjectionMatrix();
    const cote = 2.4 * r;
    e.sol.scale.set(cote, 1, cote);
    e.plafond.scale.set(cote, 1, cote);
    e.grain.repeat.set(cote / GRAIN_METRES, cote / GRAIN_METRES);
    _lampeGreffe();
    e.sale = true;
  }

  function _appliquerVue() {
    const e = _e, haut = e.vue === "plongee";
    // Retour à hauteur d'yeux : caméra sur la place ; la place survolée (_pas) peut être dans un pilier, elle en est
    // sortie par la règle de l'ouverture en libre. En suivi, la place est celle du tracker : rien n'est déplacé.
    if (!haut && e.vueAppliquee === "plongee") {
      e.vise = null;
      if (e.mode === "libre") _degager(true);
    }
    e.vueAppliquee = e.vue;
    if (e.ov) e.ov.classList.toggle("kta-v3d-edition", haut);
    _majBoutonPlace();
    _majNiveauEdition();
    e.plafond.visible = !haut && !e.galerie && !(e.plansCaches && e.plansCaches.plafond);
    e.tuiles.forEach(function (t) {
      if (t.obj) t.obj.children.forEach(function (o) { if (o.userData.famille === "plafond") o.visible = !haut; });
    });
    _voisinsVue();
    _majSolActif();
    e.avatar.visible = haut && _permisGreffe("avatar");
    _appliquerPortee();
    if (e.boutonVue) e.boutonVue.setAttribute("aria-pressed", haut ? "true" : "false");
    _majRepere();
    _majBoutonsIncl();
    _appliquerMiniCarte();
    // Dessin : en vue d'édition seulement ; la quitter éteint l'outil (_suivrePermisDessin).
    _suivrePermisDessin();
    _majBarreDessin();
    _majRechercheHaut();
    _majZoom();
    e.sale = true;
  }

  // ── Portée et lampe (tuile ⚙️, réglages de cet appareil) ─────────────────────────────────────────────────
  // ⚠️ contrat (décision produit) : une greffe qui fige les réglages (ctx.regler({ reglagesFiges: true }), _fige)
  // impose portée par défaut (PORTEE.defaut), lampe à 100 %, faisceau par défaut et Plein jour coupé, curseurs et
  // bouton grisés ; les réglages retenus (e.porteeVoulue, e.lampeVoulue, et ceux de l'appareil) ne sont jamais
  // réécrits et reviennent tels quels au retrait ou avec la clé à false (_appliquerGreffeReglages). Sans la clé, la
  // greffe garde portée et lampe de l'utilisateur (Plein jour compris), son facteur lampe s'y multiplie toujours.
  // e.distance = la portée en vigueur.
  function _fige() {
    const gr = _e && _e.greffe;
    return !!gr && gr.reglage.reglagesFiges === true;
  }

  // Aussi après la case 🛡️ (limiterPortee) : portée en vigueur, recul ramené sous sa borne.
  function _appliquerGreffeReglages() {
    const e = _e;
    const v = _distanceEnVigueur();
    if (v !== e.distance) e.distance = v;
    if (e.recul > _reculMax()) { e.recul = _reculMax(); if (!_fige()) _retenirEdition(false); }
    _appliquerPortee();
    _majPortee();
    _majLampe();
    _majLimiter();
    _majZoom();
    _majRepere();
  }

  // Portée bornée (config.js > V3D_PORTEE), retenue sur l'appareil ; brouillard, profondeur, lampe et rayon des tuiles
  // suivent à l'image suivante (_gererTuiles construit au plus TUILES_PAR_IMAGE par image : pas d'à-coup). Case 🛡️
  // décochée (_limitee), "tout" ou plus que PORTEE.max = le cran « Tout le plan » (diagonale du plan, retenu à part :
  // la portée en mètres reste celle qui revient case cochée). Rend la portée retenue ("tout" pour le cran), false si
  // une greffe fige les réglages (refusée, rien d'écrit), null vue fermée.
  function reglerPortee(m) {
    const e = _e;
    if (!e) return null;
    if (_fige()) return false;
    const n = m === "tout" ? Infinity : Math.round(Number(m));
    if (Number.isNaN(n)) return e.distance;
    const tout = n > PORTEE.max && !_limitee();
    if (!tout) {
      const v = Math.max(PORTEE.min, Math.min(PORTEE.max, n));
      if (typeof window.setVue3DPortee === "function") window.setVue3DPortee(v);
      e.porteeVoulue = v;
    }
    e.porteeTout = typeof window.setVue3DPorteeTout === "function" ? window.setVue3DPorteeTout(tout) : tout;
    const d = _distanceEnVigueur();
    if (d !== e.distance) { e.distance = d; _appliquerPortee(); }
    _majPortee();
    _majRepere();
    return tout ? "tout" : e.porteeVoulue;
  }

  function _porteeVoulue() {
    return typeof window.getVue3DPortee === "function" ? window.getVue3DPortee() : PORTEE.defaut;
  }

  // ⚠️ contrat (décision produit) : au doigt (ktaAppareilTactile), la case 🛡️ revient cochée à chaque ouverture
  // (réécrite sur l'appareil) ; au pointeur fin, la préférence retenue.
  function _limiterVoulu() {
    const tactile = typeof window.ktaAppareilTactile === "function" && window.ktaAppareilTactile();
    if (tactile && typeof window.setVue3DLimiterPortee === "function") window.setVue3DLimiterPortee(true);
    return tactile || typeof window.getVue3DLimiterPortee !== "function" || window.getVue3DLimiterPortee() !== false;
  }

  // Case 🛡️ décochée : un cran de plus au bout du curseur, « Tout le plan ».
  function _majPortee() {
    const e = _e;
    if (!e || !e.curseurPortee) return;
    const tout = !_limitee() && e.porteeTout;
    e.curseurPortee.max = String(_limitee() ? PORTEE.max : PORTEE.max + 1);
    const txt = tout ? _t("vue3d.porteeTout") : typeof window.formatDistance === "function"
      ? window.formatDistance(e.distance, 0) : e.distance + " m";
    _majCurseur(e.curseurPortee, e.porteeValeur, tout ? PORTEE.max + 1 : e.distance, "vue3d.porteeAide", txt);
  }

  // Lampe selon l'intensité k (part de 1 : 0,25 à 3) → facteurs de force, de coupure (part de la portée) et de halo,
  // décroissance, début du brouillard (part de la portée). ⚠️ contrat (décision produit) : plus on monte, plus la
  // lumière porte loin — c'est la décroissance qui porte (1,2 · k^−1,263 au-dessus de 100 %), la force ne monte que
  // de 25 % par 100 % (de près, rien ne brûle) ; coupure, halo et brouillard repoussés avec elle. k = 2 donne
  // exactement l'ancienne lampe « Forte » (config.js > V3D_LAMPE_FORTE : 1,25 · 1,3 · 1,5 · 0,5 · 0,8). Sous 100 % :
  // force et halo ∝ k, coupure √k, décroissance plus rapide, brouillard plus tôt.
  function _courbeLampe(k) {
    if (k >= 1) {
      return { force: 1 + 0.25 * (k - 1), coupure: 1 + 0.3 * (k - 1), halo: 1 + 0.5 * (k - 1),
        decay: +(1.2 * Math.pow(k, -Math.log2(2.4))).toFixed(3), brume: Math.min(0.85, 0.45 + 0.35 * (k - 1)) };
    }
    const b = (1 - k) / 0.75;   // 0 à 100 %, 1 à 25 %
    return { force: k, coupure: Math.sqrt(k), halo: k, decay: +(1.2 + 0.4 * b).toFixed(3), brume: 0.45 - 0.2 * b };
  }

  // Faisceau (° de cône total) → demi-angle (rad) et pénombre du SpotLight. 🩸 three.js borne le demi-angle à π/2 :
  // 160° = 80°, sous la borne. Pénombre linéaire de PENOMBRE.min (40°) à PENOMBRE.defaut (71°), puis jusqu'à
  // PENOMBRE.max (160° : le bord se fond dans le noir).
  function _coneLampe(deg) {
    const F = REGLAGE_LAMPE.faisceau, d = Math.max(F.min, Math.min(F.max, deg));
    const p = d <= F.defaut ? PENOMBRE.defaut - (PENOMBRE.defaut - PENOMBRE.min) * (F.defaut - d) / (F.defaut - F.min)
      : PENOMBRE.defaut + (PENOMBRE.max - PENOMBRE.defaut) * (d - F.defaut) / (F.max - F.defaut);
    return { angle: Math.min(Math.PI / 2, d * Math.PI / 360), penombre: +Math.max(0, Math.min(1, p)).toFixed(3) };
  }

  // Lampe en vigueur : la préférence, sauf réglages figés par une greffe (100 %, faisceau par défaut, Plein jour
  // coupé ; la préférence revient au retrait ou avec la clé à false, jamais réécrite).
  function _lampeEnVigueur() {
    const e = _e, v = e && e.lampeVoulue, L = REGLAGE_LAMPE;
    const r = !v || _fige() ? { intensite: L.intensite.defaut, faisceau: L.faisceau.defaut, jour: false }
      : { intensite: v.intensite, faisceau: v.faisceau, jour: v.jour };
    r.courbe = _courbeLampe(r.intensite / 100);
    r.cone = _coneLampe(r.faisceau);
    return r;
  }

  function _borner(v, b) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(b.min, Math.min(b.max, n)) : null;
  }

  function _apresReglageLampe() {
    _appliquerPortee();
    _majLampe();
    _majRepere();
  }

  // Intensité de la lampe (%, bornée à REGLAGE_LAMPE.intensite), retenue sur l'appareil. Rend l'intensité en vigueur,
  // false si une greffe fige les réglages (refusée, rien d'écrit), null vue fermée.
  function reglerLampe(pourcent) {
    const e = _e;
    if (!e) return null;
    if (_fige()) return false;
    const v = _borner(pourcent, REGLAGE_LAMPE.intensite);
    if (v === null) return e.lampeVoulue.intensite;
    e.lampeVoulue.intensite = typeof window.setVue3DLampeIntensite === "function"
      ? window.setVue3DLampeIntensite(v) : v;
    _apresReglageLampe();
    return e.lampeVoulue.intensite;
  }

  // Largeur du faisceau (° de cône total, bornée à REGLAGE_LAMPE.faisceau), retenue sur l'appareil ; mêmes retours.
  function reglerFaisceau(deg) {
    const e = _e;
    if (!e) return null;
    if (_fige()) return false;
    const v = _borner(deg, REGLAGE_LAMPE.faisceau);
    if (v === null) return e.lampeVoulue.faisceau;
    e.lampeVoulue.faisceau = typeof window.setVue3DFaisceau === "function" ? window.setVue3DFaisceau(v) : v;
    _apresReglageLampe();
    return e.lampeVoulue.faisceau;
  }

  // ☀️ Plein jour (soleil rasant, brouillard clair : _appliquerPortee), retenu sur l'appareil. Rend l'état en vigueur ; une
  // greffe qui fige les réglages le refuse (false, rien d'écrit) ; null vue fermée.
  function reglerPleinJour(oui) {
    const e = _e;
    if (!e) return null;
    if (_fige()) return false;
    const v = !!oui;
    e.lampeVoulue.jour = typeof window.setVue3DPleinJour === "function" ? window.setVue3DPleinJour(v) : v;
    _apresReglageLampe();
    return _lampeEnVigueur().jour;
  }

  function _lampeVoulue() {
    const L = REGLAGE_LAMPE, w = window;
    return {
      intensite: _borner(typeof w.getVue3DLampeIntensite === "function" ? w.getVue3DLampeIntensite() : Number.NaN,
        L.intensite) || L.intensite.defaut,
      faisceau: _borner(typeof w.getVue3DFaisceau === "function" ? w.getVue3DFaisceau() : Number.NaN, L.faisceau) ||
        L.faisceau.defaut,
      jour: typeof w.getVue3DPleinJour === "function" ? w.getVue3DPleinJour() === true : false
    };
  }

  function _fmtPourcent(p) {
    try {
      const loc = typeof window.ktaLocale === "function" ? window.ktaLocale() : "fr-FR";
      return new Intl.NumberFormat(loc, { style: "percent", maximumFractionDigits: 0 }).format(p / 100);
    } catch (err) { return p + " %"; }
  }

  // Curseur de la tuile (valeur, grisé, titre, valeur dite) ; `txt` = la valeur écrite à côté.
  function _majCurseur(c, val, v, aide, txt) {
    if (Number(c.value) !== v) c.value = String(v);
    c.disabled = _fige();
    c.title = _t(aide) + (_fige() ? " · " + _t("vue3d.reglageGreffe") : "");
    val.textContent = txt;
    c.setAttribute("aria-valuetext", txt);
  }

  function _majLampe() {
    const e = _e;
    if (!e || !e.curseurLampe) return;
    const l = _lampeEnVigueur(), suffixe = _fige() ? " · " + _t("vue3d.reglageGreffe") : "";
    _majCurseur(e.curseurLampe, e.lampeValeur, l.intensite, "vue3d.lampeAide", _fmtPourcent(l.intensite));
    _majCurseur(e.curseurFaisceau, e.faisceauValeur, l.faisceau, "vue3d.faisceauAide", l.faisceau + "°");
    const b = e.boutonJour;
    b.setAttribute("aria-pressed", l.jour ? "true" : "false");
    b.disabled = _fige();
    b.title = _t("vue3d.lampeJourAide") + suffixe;
    b.setAttribute("aria-label", _t("vue3d.lampeJour") + suffixe);
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
    // ⚠️ contrat (décision produit) : en vue plongeante, rien ne bloque, comme un survol (piliers, murs, fronts, zones,
    // portes, parois) ; seule l'image du plan borne la place. Une greffe qui en ferait tricher interdit la plongée
    // (ctx.regler({ plongee: false })) ; la règle du pas et ctx.libre restent celles de la hauteur d'yeux.
    if (e.vue === "plongee") {
      const pc = window.PLAN_CONFIG && window.PLAN_CONFIG.plan, x1 = e.pos.x + dx, y1 = e.pos.y + dy;
      if (pc && (x1 < 0 || y1 < 0 || x1 > pc.imageWidth || y1 > pc.imageHeight)) { e.butees++; return false; }
      _poser(x1, y1);
      return true;
    }
    const essais = [[dx, dy], [dx, 0], [0, dy]];
    let auDepart = -1;   // rayons bloqués au départ, lus seulement si une arrivée en a
    const depart = function () { if (auDepart < 0) auDepart = _rayonsBloques(e.pos.x, e.pos.y); return auDepart; };
    // ⚠️ contrat : dans une galerie inclinée (_pentesDuNiveau), la règle est sa largeur : le corps (RAYON_CORPS) reste
    // dans ses parois, jamais plus près du bord qu'au départ ; en sortir par le côté ou par notre bout n'est permis
    // que là où son sol est à moins de PENTE.sortie m de celui du niveau (la règle du rendu reprend alors).
    const pd = _surPente(e.pos.x / e.sc, e.pos.y / e.sc, 0);
    let auDepartZone = -1;
    const departZone = function () {
      if (auDepartZone < 0) auDepartZone = Math.max(0, _bloqueEnZone(e.pos.x, e.pos.y, e.pos.x, e.pos.y, 1, 0, pd.p.autre));
      return auDepartZone;
    };
    for (let i = 0; i < essais.length; i++) {
      const sx = essais[i][0], sy = essais[i][1], l = Math.hypot(sx, sy);
      if (l < 1e-9) continue;
      const x1 = e.pos.x + sx, y1 = e.pos.y + sy;
      if (pd) {
        const pa = _surPenteDe(pd.p, x1 / e.sc, y1 / e.sc), za = _zoneDePente(pd.p, x1 / e.sc, y1 / e.sc);
        // Zone jonction (contrat : _entreDe) : on y reste tant qu'on est dans la zone ou dans la galerie inclinée ;
        // structures de ses deux niveaux.
        if (pd.zone || za) {
          if (za || pa.lat <= pa.demi - RAYON_CORPS + 1e-9) {
            const nz = _bloqueEnZone(e.pos.x, e.pos.y, x1, y1, sx / l, sy / l, pd.p.autre);
            if (nz === 0 || (nz > 0 && nz <= departZone())) { _poser(x1, y1); return true; }
            continue;
          }
        } else if (pa.lat <= Math.max(pa.demi - RAYON_CORPS, pd.lat) + 1e-9) { _poser(x1, y1); return true; }
        if (Math.abs(pd.dy) >= PENTE.sortie) continue;
      } else {
        // Entrer dans une zone jonction : seulement là où son sol est au niveau du nôtre.
        const qa = _surPente(x1 / e.sc, y1 / e.sc, 0);
        if (qa && qa.zone && Math.abs(qa.dy) >= PENTE.sortie) continue;
      }
      const n = _balayage(e.pos.x, e.pos.y, x1, y1, sx / l, sy / l);
      if (n < 0 || (n > 0 && n > depart())) continue;
      _poser(x1, y1);
      return true;
    }
    // Jamais coincé : parti d'une place d'où aucun pas n'est possible (dans un pilier, dans la roche de l'image de
    // collision), tout pas qui rapproche du point libre le plus proche passe (_sortie). Pas dans une galerie inclinée,
    // loin du sol du niveau : ses parois tiennent.
    if (pd && Math.abs(pd.dy) >= PENTE.sortie) { e.butees++; return false; }
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
  // Corps dans une zone qui bouche ou contre elle (centre dedans, ou un rayon de RAYON_CORPS qui y entre), dans tous
  // les rendus : coincé (on en sortirait librement, mais la place serait dans le volume) ; le point libre est donc à
  // un corps du bord. `volumes` : aussi dans une structure dessinée ou à moins d'un corps d'elle (la règle du pas
  // ignore la structure où l'on est déjà : on en sortirait, mais la place serait dans le pilier), comme ctx.libre.
  function _coince(x, y, volumes) {
    const e = _e, G = window.KtaGalerie, n = _niveauPas();
    if (_surPente(x / e.sc, y / e.sc, 0)) return false;   // galerie inclinée : sa règle, pas celle du niveau (_pas)
    if (volumes && (_volumeContenant(x / e.sc, y / e.sc) || _rayonsBloques(x, y) > 0)) return true;
    if (G.dansZone(x, y, n, e.rendu) ||
        G.zonesBloquent(_rayons([], x, y, RAYON_CORPS * e.sc), n, undefined, e.rendu).some(Boolean)) return true;
    if (e.galerie) return !G.dedans(x, y, n);
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
  function _pointLibre(x, y, volumes) {
    const e = _e, m = e.galerie || e.mixte, R = _rayonLibre();
    const pp = m ? m.plusProche(x, y, R) : null;
    if (pp && !_coince(pp.x, pp.y, volumes)) return { x: pp.x, y: pp.y };
    const pas = 0.25 * e.sc;
    for (let r = pas; r <= R; r += pas) {
      const n = Math.max(8, Math.ceil(2 * Math.PI * r / pas));
      for (let k = 0; k < n; k++) {
        const qx = x + r * Math.cos(2 * Math.PI * k / n), qy = y + r * Math.sin(2 * Math.PI * k / n);
        if (!e.galerie && typeof window.ktaEstAccessible === "function" && !window.ktaEstAccessible(qx, qy)) continue;
        if (!_coince(qx, qy, volumes)) return { x: qx, y: qy };
      }
    }
    return null;
  }

  // Ramène la place au point libre le plus proche si elle est coincée. `volumes` : aussi si son centre est dans une
  // structure dessinée, et le point libre cherché à un corps de toute structure (_coince). 🩸 La place elle-même
  // n'est jugée que sur son centre : à moins d'un corps d'une face (galerie étroite de l'image de collision), elle
  // reste où elle est. → true si elle a bougé.
  function _degager(volumes) {
    const e = _e;
    const dedans = !!volumes && !!_volumeContenant(e.pos.x / e.sc, e.pos.y / e.sc);
    if (!dedans && !_coince(e.pos.x, e.pos.y)) return false;
    const p = _pointLibre(e.pos.x, e.pos.y, volumes);
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
  // Mode galerie : on bute contre les parois (KtaGalerie.segmentsBloques) et les zones qui bouchent, l'image de
  // collision du plan n'est pas lue ; parti d'en dehors des galeries (tracker hors tracé, dans une zone qui bouche),
  // on se déplace librement pour y entrer.
  // Mode mixte : règle des structures (image de collision comprise), parois dessinées des tubes et zones (_juger).
  function _balayage(x0, y0, x1, y1, ux, uy) {
    const r = RAYON_CORPS * _e.sc, fx = x1 + ux * r, fy = y1 + uy * r, gal = !!_e.galerie;
    const pc = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
    if (pc && (fx < 0 || fy < 0 || fx > pc.imageWidth || fy > pc.imageHeight)) return -1;
    if (gal && !window.KtaGalerie.dedans(x0, y0, _niveauPas())) return 0;
    if (!gal && typeof window.ktaEstAccessible === "function" && !window.ktaEstAccessible(fx, fy)) return -1;
    const segs = [];
    for (let i = 0; i < RAILS.length; i++) {
      const ox = -uy * r * RAILS[i], oy = ux * r * RAILS[i];
      segs.push([x0 + ox, y0 + oy, fx + ox, fy + oy]);
    }
    _rayons(segs, x1, y1, r);
    const res = _juger(segs, { x: x0, y: y0 });
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
  // Dans les trois rendus, les zones qui bouchent (KtaGalerie.zonesBloquent : remblais, effondrement, inaccessible).
  // ⚠️ contrat : la 3D seulement ; ktaSegmentsBloquesParStructure (pas du tracker en 2D) ne lit aucune zone.
  // `depart` ({ x, y } px, facultatif) : place d'où part le pas ; une zone qui la contient ne l'arrête pas.
  function _juger(segs, depart) {
    const n = _niveauPas(), z = window.KtaGalerie.zonesBloquent(segs, n, depart, _e.rendu);
    let r;
    if (_e.galerie) r = window.KtaGalerie.segmentsBloques(segs, n);
    else {
      r = typeof window.ktaSegmentsBloquesParStructure === "function"
        ? window.ktaSegmentsBloquesParStructure(segs, n, true) : segs.map(function () { return false; });
      if (_e.mixte) {
        const p = window.KtaGalerie.paroisBloquent(segs, n);
        r = r.map(function (b, i) { return b || p[i]; });
      }
      // Structures d'un niveau entremêlé qui montent dans notre tranche (_niveauxQuiBloquent).
      (_e.autresBloquent || []).forEach(function (o) {
        if (typeof window.ktaSegmentsBloquesParStructure !== "function") return;
        const q = window.ktaSegmentsBloquesParStructure(segs, o, true);
        r = r.map(function (b, i) { return b || q[i]; });
      });
    }
    return r.map(function (b, i) { return b || z[i]; });
  }

  function _rayonsBloques(x, y) {
    return _juger(_rayons([], x, y, RAYON_CORPS * _e.sc)).filter(Boolean).length;
  }

  function _passerEnLibre() { if (_e.mode !== "libre") { _e.mode = "libre"; _majBoutonSuivre(); } }

  // ── Changer de niveau par un passage (🪜, mode libre) ─────────────────────────────────────────────────
  // ⚠️ contrat (décision produit) : la 3D change seulement SON niveau ; ni le tracker ni le niveau actif de la
  // carte ne bougent (« Je suis ici ? » recale aussi le niveau à la fermeture). En suivi, le niveau est celui du
  // tracker : 🪜 n'apparaît qu'en libre. Arrivée au raccord validé du niveau choisi, sinon à la même position (au
  // passage touché s'il est à plus de PASSAGE m). Cap conservé. Un tracé jonction se marche (_suivrePente).

  // Niveau a au-dessus de b : d'après les profondeurs saisies si les deux en ont, sinon le plus grand numéro.
  function _auDessus(a, b) {
    const z = typeof window.getProfondeurNiveau === "function" ? window.getProfondeurNiveau : null;
    const za = z ? z(a) : null, zb = z ? z(b) : null;
    return Number.isFinite(za) && Number.isFinite(zb) && za !== zb ? za > zb : a > b;
  }

  // ── Niveau choisi en vue d'édition (▲ niveau ▼), sans passage ──────────────────────────────────────────
  // ⚠️ contrat (décision produit) : change le niveau DE LA 3D (`niveauLibre`, comme 🪜), sans geste de descente
  // (bandeau « Niveau n » seul) ; caméra et place gardent leur position plan (rien ne bloque en vue d'édition, la place
  // est dégagée au retour à hauteur d'yeux) ; ni le tracker ni le niveau actif de la carte ne bougent (« Je suis ici ? »
  // le propose à la fermeture). Niveaux = ceux qui portent quelque chose (main.js > ktaNiveauxOccupes) et le niveau
  // affiché, du plus haut au plus bas (_auDessus : profondeurs saisies, sinon numéro). Plan à un niveau : rien.
  function _niveauxEdition() {
    const e = _e, c = window.APP_CONFIG || {};
    if (c.multiLevel !== true || !Number.isInteger(e.niveau)) return [];
    const l = _tab(window.ktaNiveauxOccupes).filter(Number.isInteger);
    if (l.indexOf(e.niveau) < 0) l.push(e.niveau);
    return l.filter(function (v, i) { return l.indexOf(v) === i; }).sort(function (a, b) {
      return _auDessus(a, b) ? -1 : _auDessus(b, a) ? 1 : 0;
    });
  }

  // `sens` : "haut", "bas" ou un niveau. Rend true si le niveau a changé.
  function niveauEdition(sens) {
    const e = _e;
    if (!e || e.vue !== "plongee" || e.geste) return false;
    const l = _niveauxEdition(), i = l.indexOf(e.niveau);
    if (l.length < 2 || i < 0) return false;
    const n = Number.isInteger(sens) ? sens : l[i + (sens === "haut" ? -1 : 1)];
    if (!Number.isInteger(n) || l.indexOf(n) < 0 || n === e.niveau) return false;
    _passerEnLibre();
    const cfg = window.APP_CONFIG || {};
    e.niveauLibre = n;
    e.actifVu = Number.isInteger(cfg.activeLevel) ? cfg.activeLevel : 0;
    e.aBouge = true; e.libreBouge = true;
    e.changementsNiveau++;
    console.log("[Vue3D] vue d'édition : niveau " + n);
    _reindexer();
    _majPassage();
    _annoncerNiveau();
    e.sale = true;
    return true;
  }

  function _majNiveauEdition() {
    const e = _e, b = e.boiteNiveauEdition;
    if (!b) return;
    const l = e.vue === "plongee" ? _niveauxEdition() : [], i = l.indexOf(e.niveau);
    // Tuile ⚙️ ouverte : caché (la tuile, large au téléphone, passerait dessus).
    b.hidden = l.length < 2 || i < 0 || (!!e.tuileReglages && !e.tuileReglages.hidden);
    if (b.hidden) return;
    e.niveauEditionValeur.textContent = _fmtNiveau(e.niveau);
    e.niveauEditionHaut.disabled = i <= 0;
    e.niveauEditionBas.disabled = i >= l.length - 1;
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
    marque.innerHTML = _ico("m-echelle");
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
  // `long` au titre et au libellé accessible. POI sans nom : le moyen seul.
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

  // ⚠️ contrat (décision produit) : arrivée au raccord validé du niveau, sinon au point ; ramenée dans le tube si
  // elle tombe à côté (_degager) ; cap vers la prochaine consigne si un itinéraire passe là, sinon vers la galerie
  // d'arrivée (_capArrivee).
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

  // Outil de dessin armé (vue d'édition) : le toucher pose un sommet, rien d'autre (_poserSommet).
  // Toucher bref sur la scène, par priorité : panneau de POI (sa fiche de la carte, _ouvrirFiche, POI jonction
  // compris : boutons de passage, _passagesFiche), puis l'objet sous le doigt, structure, zone, tracé (sa fiche de
  // la carte, _ouvrirFicheObjet). Rien dessous : rien. Une greffe coupe tout (ctx.regler({ fiches: false })).
  // 🩸 Les panneaux de membres et de repères d'une extension sont aussi dans _e.panneaux (même fondu) : ils ne sont
  // pas des POI, `point` n'y est qu'un { nom } — pas de fiche, un toast court avec leur nom (le 🏁 de l'arrivée
  // aussi). Ils arrêtent quand même le toucher : sinon la fiche d'un POI ou d'un pilier caché derrière s'ouvrirait.
  // ⚠️ contrat (utils.js > _modeClicCarteActif) : un outil de la carte armé hors du dessin de la vue (armé en 2D,
  // ✏️ fermé, vue à hauteur d'yeux) n'ouvre aucune fiche non plus ; le toucher est consommé sans rien poser.
  function _toucher(cx, cy) {
    const e = _e, A = _ajusteur();
    // Insertion de sommets ouverte (＋ au sommet) : le toucher est un point, rien d'autre (ni fiche, ni outil).
    if (A && A.insertionEnCours() && _dessinPermis()) return _insererAuSol(cx, cy);
    if (_dessinActif()) return _poserSommet(cx, cy);
    if (_outilArme()) {
      _refusDessin(e.vue !== "plongee" ? "vue à hauteur d'yeux (le dessin se fait en Édition)"
        : "une greffe coupe le dessin (fiches: false)");
    }
    if (_permisGreffe("fiches") && _poserAuSol(cx, cy)) return true;
    if (window._modeClicCarteActif && window._modeClicCarteActif()) return true;
    if (!_permisGreffe("fiches") || !_rayonEcran(cx, cy)) return false;
    const hit = _panneauVise();
    if (hit && hit.object.userData.poi.genre !== "poi") {
      e.toucheNom = hit.object.userData.poi.nom;
      _toast(e.toucheNom, "success");
      return true;
    }
    if (hit) return _ouvrirFiche(hit.object.userData.poi.point);
    const plaque = _plaqueVisee();
    if (plaque) return _ouvrirFiche(plaque);
    // ⚠️ contrat (décision produit) : réglage ⚙️ coupé, structure, zone ou tracé touchés n'ouvrent rien (le POI, si).
    if (!_fichesObjets()) return false;
    const o = _objetAuPoint(_pointVise());
    return o ? _ouvrirFicheObjet(o) : false;
  }

  // ── Visée : ce qui est sous le doigt (fiches ; fonctions sans état, prêtes pour le dessin depuis la vue) ─────
  // ⚠️ contrat : les tuiles fusionnent la géométrie (un maillage par matériau, plus d'objet par structure). La visée
  // prend donc le POINT touché (rayon contre les maillages montrés : tuiles, sol, plafond) puis cherche l'objet par
  // la géométrie des données, en px plan : point dans le contour d'une structure ou d'une zone, distance à un tracé.
  // Même règle dans les trois rendus et dans les deux vues (seule la face touchée change), indépendante de la
  // façon dont les tuiles sont construites.

  // Rayon de la caméra par le point écran (cx, cy) → false si la vue n'a pas de taille.
  function _rayonEcran(cx, cy) {
    const e = _e, r = e.cv.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    e.rayon = e.rayon || new THREE.Raycaster();
    e.viseEcran = { x: cx - r.left, y: cy - r.top };
    e.rayon.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1),
      e.camera);
    return true;
  }

  function _montreDansScene(o) {
    for (let q = o; q; q = q.parent) if (!q.visible) return false;
    return true;
  }

  // Panneau (POI, membre, repère) le plus proche sur le rayon, ou null. Rien sous le rayon : l'icône réduite
  // (_iconeReduite, PANNEAU_REDUIT.px px, plus petite qu'un doigt) la plus proche du point touché à
  // PANNEAU_REDUIT.toucher px près, rendue sous la forme d'un résultat de rayon ({ object }).
  function _panneauVise() {
    const e = _e, sprites = [];
    e.panneaux.forEach(function (sp) { if (sp.parent && _montreDansScene(sp)) sprites.push(sp); });
    const hit = sprites.length ? e.rayon.intersectObjects(sprites, false)[0] || null : null;
    if (hit || !e.viseEcran) return hit;
    let best = null, d = PANNEAU_REDUIT.toucher;
    sprites.forEach(function (sp) {
      const q = sp.userData.poi.icone && sp.userData.poi.ecran;
      const k = q ? Math.hypot(q.x - e.viseEcran.x, q.y - e.viseEcran.y) : Infinity;
      if (k <= d) { d = k; best = sp; }
    });
    return best ? { object: best } : null;
  }

  // Premier maillage montré sur le rayon → { x, y (px plan), h (m au-dessus du sol), dist (m), sol (bool) }, ou null
  // (rien, au-delà de la portée — en plongée, du fond du brouillard : la caméra est au recul —, ou plafond : on ne
  // vise pas le plafond).
  // 🩸 three.js teste aussi les objets masqués (visible n'arrête pas le raycast) : tuiles hors portée et plafond de la
  // vue plongeante sont écartés à la main.
  function _pointVise() {
    const e = _e, cibles = [];
    e.tuiles.forEach(function (t) { if (t.obj && t.obj.visible) cibles.push(t.obj); });
    [e.sol, e.plafond].forEach(function (m) { if (m && m.visible) cibles.push(m); });
    const hits = e.rayon.intersectObjects(cibles, true);
    const loin = e.vue === "plongee" ? Math.max(e.distance, e.scene.fog.far) : e.distance;
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i], o = h.object;
      if (!o.isMesh || !_montreDansScene(o)) continue;
      if (h.distance > loin || o === e.plafond || o.userData.famille === "plafond") return null;
      return { x: h.point.x * e.sc, y: h.point.z * e.sc, h: h.point.y, dist: h.distance,
        sol: o === e.sol || o.userData.famille === "sol" };
    }
    return null;
  }

  // POI dont la plaque (au nom, sans panneau : _plaque) est sous le rayon, devant toute paroi, ou null.
  function _plaqueVisee() {
    const e = _e, cibles = [];
    (e.volPassages || []).forEach(function (v) {
      if (!v.obj || v.forme !== "plaque") return;
      v.obj.children.forEach(function (o) { if (o.userData.plaquePoint && _montreDansScene(o)) cibles.push(o); });
    });
    const h = cibles.length ? e.rayon.intersectObjects(cibles, false)[0] : null;
    if (!h) return null;
    const devant = _pointVise();
    return devant && devant.dist < h.distance - 0.05 ? null : h.object.userData.plaquePoint;
  }

  // Distance (px) de p au contour (fermé ou non) d'une liste de points.
  function _distContour(p, pts, ferme) {
    let d = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, window.ktaDistPointSegment(p, pts[i], pts[i + 1]));
    if (ferme && pts.length > 2) d = Math.min(d, window.ktaDistPointSegment(p, pts[pts.length - 1], pts[0]));
    return d;
  }

  // Objet dessiné au point visé v (_pointVise) → { famille ("structures" | "zones" | "roads"), obj, session } ou
  // null. Priorité : structure, zone, tracé ; à famille égale, le plus proche. Tolérances (m) : une face de structure
  // est touchée sur son contour (VISEE.face) ; zone et tracé gagnent VISEE.parMetre par mètre de distance (le doigt
  // couvre plus de sol au loin) ; un tracé en tube prend toute la largeur de sa galerie (parois comprises).
  const VISEE = { face: 0.08, zone: 0.1, trace: 0.35, parMetre: 0.02 };
  function _objetAuPoint(v) {
    const e = _e, d = e.vus;
    const geo = typeof window.ktaPointInPolygon === "function" && typeof window.ktaDistPointSegment === "function";
    if (!v || !d || !geo) return null;
    const sc = e.sc, p = { x: v.x, y: v.y }, loin = VISEE.parMetre * v.dist;
    const meilleur = function (liste, ecart) {
      let o = null, best = Infinity;
      for (let i = 0; i < liste.length; i++) {
        const q = liste[i];
        if (!q || !Array.isArray(q.points) || q.points.length < 2) continue;
        const k = ecart(q);
        if (k < best) { best = k; o = q; }
      }
      return o;
    };
    const s = meilleur(d.structures, function (q) {
      if (_estLigne(q.type)) {
        const ep = _epaisseurLigne(q.type) / 2;
        const k = _distContour(p, q.points, false) / sc - ep;
        return k <= VISEE.face ? Math.max(0, k) : Infinity;
      }
      if (q.points.length > 2 && window.ktaPointInPolygon(p, q.points)) return 0;
      const k = _distContour(p, q.points, true) / sc;
      return k <= VISEE.face ? k : Infinity;
    });
    if (s) return _objetVu("structures", s);
    const z = meilleur(d.zones, function (q) {
      if (q.points.length > 2 && window.ktaPointInPolygon(p, q.points)) return 0;
      const k = _distContour(p, q.points, true) / sc;
      return k <= VISEE.zone + loin ? k : Infinity;
    });
    if (z) return _objetVu("zones", z);
    const tube = e.galerie || e.mixte ? _demiLargeurGalerie(v.x / sc, v.y / sc) : 0;
    const r = meilleur(d.roads, function (q) {
      const k = _distContour(p, q.points, false) / sc;
      return k <= Math.max(tube, LARGEUR_TRACE / 2 + VISEE.trace) + loin ? k : Infinity;
    });
    return r ? _objetVu("roads", r) : null;
  }

  // Lecteurs d'une famille : [session, calques embarqués], lus à l'appel (modules chargés avant la vue).
  function _lecteurs(famille) {
    const n = { structures: ["getStructures", "getAllEmbeddedStructures"], zones: ["getZones", "getAllEmbeddedZones"],
      roads: ["getRoads", "getAllEmbeddedRoads"] }[famille];
    return n ? [window[n[0]], window[n[1]]] : [null, null];
  }

  function _objetVu(famille, o) {
    return { famille: famille, obj: o, session: _tab(_lecteurs(famille)[0]).indexOf(o) >= 0 };
  }

  // Ce qui est sous le point écran (cx, cy), sans rien ouvrir (checkup, dessin depuis la vue) → { genre ("poi" |
  // "panneau" | famille d'objet | null), nom, x, y (px plan du point touché), h (m), sol, uid, type, session } ou
  // null (rien sous le doigt).
  function viser(cx, cy) {
    const e = _e;
    if (!e || !_rayonEcran(cx, cy)) return null;
    const sp = _panneauVise();
    if (sp) {
      const q = sp.object.userData.poi, pt = q.point || {};
      return { genre: q.genre === "poi" ? "poi" : "panneau", nom: String(q.genre === "poi" ? pt.nom || pt.id || "" :
        q.nom || ""), uid: pt.uid || null };
    }
    const v = _pointVise();
    if (!v) return null;
    const o = _objetAuPoint(v);
    return { genre: o ? o.famille : null, x: v.x, y: v.y, h: v.h, sol: v.sol, uid: o ? o.obj.uid || null : null,
      type: o ? o.obj.type : null, session: o ? o.session : null };
  }

  // ── Dessin depuis la vue d'édition (plongée) ──────────────────────────────────────────────────────────
  // ⚠️ contrat (décision produit) : en vue d'édition seulement, et toujours là, la colonne (🔍) 🗺️ 📐 ✏️ 🛣️ ⬛ 🏛️
  // (boutons .leaflet-bar de la barre de droite 2D, dans son ordre, icône et état recopiés de son bouton :
  // _majBarreDessin). Chaque bouton ouvre le panneau de son groupe 2D (interface.js > ktaOuvrirOutils : mêmes types,
  // customs, ➕ et ✅) ; ✏️ (ajout de point, sans panneau) joue le geste de son bouton 2D. Rien ne se dessine
  // tant qu'aucun outil n'est armé ; armer un outil suffit : un toucher bref de la scène pose un sommet AVANT toute
  // fiche (_toucher). Le désarmer (son bouton, son panneau) suffit pour arrêter.
  // Le toucher rejoue le geste de la carte (_poserSommet : map.fire mousedown puis click, latlng du point touché) :
  // undo, uid, styles, fermeture et droits restent ceux des outils 2D, jamais copiés. Le niveau de l'objet est celui
  // de la 3D : APP_CONFIG.activeLevel le prend le temps du geste, puis est rendu. Objet en cours : aperçu léger au sol
  // (_majApercu) et aucune reconstruction de la scène (_majDonnees attend sa fin). Sortir de la vue d'édition, fermer
  // la vue ou Échap désarment (_desactiverTousLesModes de la carte : un objet non fini se traite comme en 2D). Une
  // greffe `fiches: false` coupe aussi le dessin (ni colonne, ni sommet).
  // 🩸 Les outils 2D lisent `e.latlng` seul ; ce qui dépend de la carte est donné par la vue. Fermeture d'une zone ou
  // d'une structure (décision produit) : toucher le rond doré du 1er sommet, DESSIN.premier m de rayon dessiné à
  // l'échelle (le point est alors ce sommet exact) ; en mètres et non en px d'écran, sinon le 4e coin d'un mur de
  // 0,4 m fermait la forme au recul par défaut (zoomer agrandit la cible). Le rayon est celui de la carte
  // (utils.js > KTA_FERMETURE_M, ktaToleranceFermeture) : une seule règle en 2D et en 3D. Aimantation des tracés
  // (road.js > _snapSurSommetProche) au même rayon d'écran que la 2D, converti à la profondeur du point touché
  // (`ktaTolerancePlan`).
  const DESSIN = { larg: 0.12, sommet: 0.16, premier: window.KTA_FERMETURE_M || 0.3, y: 0.09 };
  // Toucher bref de la scène (_toucher) : moins de TAPE.bouge px et de TAPE.ms entre l'appui et le lâcher.
  // 🩸 Durée lue sur `ev.timeStamp` (instant du geste), jamais sur performance.now() au traitement : vue dézoomée,
  // une image de la scène peut prendre des centaines de ms et un clic de 150 ms arrivait « tenu 500 ms » (refusé).
  const TAPE = { bouge: 8, ms: 500 };
  // Toucher refusé alors qu'un outil est armé : une ligne de console qui dit pourquoi (diagnostic sur le terrain, le
  // geste semblait « ne rien faire »). Rien sans outil armé : la scène se touche aussi pour tourner et zoomer.
  function _refusDessin(raison) {
    if (!_e || !_e.dessin || !_outilArme()) return;
    _e.dessin.refus = raison;
    console.log("[Vue3D] toucher refusé : " + raison);
  }
  const DESSIN_AVALER = 700;          // ms : toucher qui ferme le panneau d'un groupe, avalé (comme sur la carte)
  // Ordre de la barre de droite 2D ; ✏️ « edition » = l'ajout de point (bouton seul, sans panneau : editor.js).
  const GROUPES_DESSIN = ["mesure", "edition", "traces", "zones", "structures"];
  const CAT_DESSIN = { structures: "structures", zones: "zones", roads: "traces" };
  const COULEUR_MESURE = "#ff0000";   // la mesure de la carte (measure.js : red), pas une couleur de la charte

  // Colonne (dans la vue, posée par _monterDom), en vue d'édition seulement, sous la rangée du haut : ▾ / ◂ la replie
  // (retenu sur l'appareil, LS_OUTILS_PLIE), 🗺️ plan au sol, 🧭 menu Tracker de la carte, puis un bouton par groupe.
  // 🔍 est dans la rangée du haut dans les deux vues (_majRechercheHaut, décision produit), sauf pendant une greffe qui
  // coupe les fiches (_rechercheDispo). Sans la barre de droite 2D (interface.js absent), pas de colonne.
  function _monterOutils(ov) {
    const e = _e;
    e.dessin = { permis: false, sig: null, apSig: null, apercu: null, etiquettes: [], poses: 0, msPoses: [],
      fermetures: 0, finT: 0, msFin: null, avaleJusqua: 0, renduBascule: null, barre: null, planSol: false,
      sol: null, suivi: null };
    e.ajuste = null;
    e.ajusteMenu = null;
    e.ajustements = { armes: 0, annules: 0, ajoute: 0, deplace: 0, supprime: 0, refus: 0, menu: 0, rien: 0,
      insertion: 0, insere: 0, insertionFin: 0, coupe: 0 };
    if (!window._groupes) return;
    const barre = document.createElement("div");
    barre.className = "leaflet-bar leaflet-control kta-v3d-outils";
    barre.setAttribute("role", "toolbar");
    barre.setAttribute("aria-label", _t("vue3d.dessin.barre"));
    barre.hidden = true;
    const lien = function (action, groupe) {
      const a = document.createElement("a");
      a.href = "#";
      a.className = "kta-group-toggle";
      a.setAttribute("role", "button");
      a.dataset.v3d = action;
      if (groupe) a.dataset.groupe = groupe;
      barre.appendChild(a);
      return a;
    };
    const d = e.dessin;
    // ▾ / ◂ En tête : replie la colonne comme le bouton de la barre 2D (refonteInterface.js > _creerBoutonReduction),
    // le mode en cours continue ; ici retenu sur l'appareil (décision produit).
    d.boutonPlier = lien("outilsPlier");
    d.boutonPlier.classList.add("kta-v3d-outils-plier");
    // Plan au sol (_majPlanSol) : interrupteur, au-dessus des outils (décision produit).
    d.boutonSol = lien("planSol");
    d.boutonSol.innerHTML = _ico("map");
    d.boutonSol.title = _t("vue3d.dessin.planSol");
    d.boutonSol.setAttribute("aria-label", _t("vue3d.dessin.planSol"));
    d.boutonSol.setAttribute("aria-pressed", "false");
    d.boutonSol.hidden = true;
    // 🧭 Menu Tracker de la carte, entre 🗺️ et 📐 (décision produit) : le même, complet (_ouvrirTracker).
    d.boutonTracker = lien("tracker");
    d.boutonTracker.hidden = true;
    d.outils = GROUPES_DESSIN.map(function (g) { const b = lien("outil", g); b.hidden = true; return b; });
    ov.appendChild(barre);
    d.barre = barre;
    _plierOutils(_lireOutilsPlie());
  }

  const LS_OUTILS_PLIE = "myktamap_v3d_outils_plie_v1";
  function _lireOutilsPlie() {
    try { return localStorage.getItem(LS_OUTILS_PLIE) === "1"; } catch (err) { return false; }
  }

  // Colonne repliée : seul ▾ / ◂ reste ; un panneau de groupe ouvert se ferme (il se rouvrirait au dépliage).
  function _plierOutils(plie, retenir) {
    const d = _e && _e.dessin;
    if (!d || !d.barre) return;
    d.barre.classList.toggle("kta-v3d-outils-plie", plie);
    d.boutonPlier.textContent = plie ? "◂" : "▾";
    const titre = _t(plie ? "ui.refonte.btn_sidebar_expand" : "ui.refonte.btn_sidebar_collapse");
    d.boutonPlier.title = titre;
    d.boutonPlier.setAttribute("aria-label", titre);
    d.boutonPlier.setAttribute("aria-pressed", plie ? "true" : "false");
    if (plie && typeof window.ktaOutilsOuverts === "function" && window.ktaOutilsOuverts()) window.ktaFermerOutils();
    if (retenir) {
      try { localStorage.setItem(LS_OUTILS_PLIE, plie ? "1" : "0"); } catch (err) { /* stockage refusé : non retenu */ }
    }
  }

  // 🧭 Le menu Tracker de la carte, par son bouton de la barre 2D. Une tuile qui agit sur la carte (`data-carte`,
  // interface.js > _creerTuileTracker) ferme d'abord la vue 3D ; les autres (suivi, itinéraire, guidage, verrou)
  // agissent dans la vue (décision produit).
  function _ouvrirTracker() {
    const g = window._groupes && window._groupes.tracker;
    if (!g || !g.btnPrincipal) return false;
    if (typeof window.ktaOutilsOuverts === "function" && window.ktaOutilsOuverts()) window.ktaFermerOutils();
    g.btnPrincipal.click();
    const ov = document.querySelector(".kta-tracker-modal-overlay");
    if (ov) {
      ov.addEventListener("click", function (ev) {
        const t = ev.target.closest && ev.target.closest(".kta-tracker-modal-tile[data-carte]");
        if (t && _e) fermer();
      }, true);
    }
    return !!ov;
  }

  function _outilArme() {
    if (window.modeEdition) return { famille: "points", type: "poi" };
    if (window.modeStructure) return { famille: "structures", type: window.modeStructure };
    if (window.modeZone) return { famille: "zones", type: window.modeZone };
    if (window.modeRoad) return { famille: "roads", type: window.modeRoad };
    if (window.modeMesure) {
      return { famille: "mesure", type: typeof window.getMeasureMode === "function" ? window.getMeasureMode() : "distance" };
    }
    return null;
  }

  function _dessinPermis() { return !!_e && !!_e.dessin && _e.vue === "plongee" && _permisGreffe("fiches"); }
  function _dessinActif() { return _dessinPermis() && !!_outilArme(); }

  function _enCours(f) { try { return typeof f === "function" ? f() || null : null; } catch (err) { return null; } }
  function _objetEnCours(famille) {
    return _enCours({ structures: window.getCurrentStructure, zones: window.getCurrentZone,
      roads: window.getCurrentRoad }[famille]);
  }
  // Objet commencé en vue d'édition : la scène attend sa fin (_majDonnees) et ne le montre pas encore (_collecter).
  function _traceEnCours() {
    return _dessinPermis() && !!(_objetEnCours("structures") || _objetEnCours("zones") || _objetEnCours("roads"));
  }
  function _horsTrace(o) {
    return !_dessinPermis() || (o !== _objetEnCours("structures") && o !== _objetEnCours("zones") &&
      o !== _objetEnCours("roads"));
  }

  // Dessin qui cesse d'être permis (vue d'édition quittée, greffe `fiches: false`) : l'outil s'éteint. ⚠️ contrat :
  // sur ce passage seulement ; un outil armé en 2D puis la vue ouverte à hauteur d'yeux reste armé (le toucher est
  // consommé sans fiche, _toucher).
  function _suivrePermisDessin() {
    const d = _e && _e.dessin;
    if (!d) return;
    const permis = _dessinPermis();
    if (d.permis && !permis) _desarmerDessin();
    if (d.permis !== permis) d.sig = null;
    d.permis = permis;
  }

  // Outil éteint comme sur la carte (interface.js > _desactiverTousLesModes : bouton, mode, objet non fini validé ou
  // abandonné) ; panneau d'un groupe fermé.
  function _desarmerDessin() {
    if (typeof window.ktaOutilsOuverts === "function" && window.ktaOutilsOuverts()) window.ktaFermerOutils();
    if (_outilArme() && typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
  }

  // Boutons des groupes = ceux de la barre de droite 2D : icône (pastille du type armé comprise), titre, mode actif
  // et lecture seule lus sur eux, jamais recalculés.
  function _majBarreDessin() {
    const e = _e, d = e.dessin;
    if (!d || !d.barre) return;
    const permis = _dessinPermis();
    d.barre.hidden = !permis;
    const ouvert = typeof window.ktaOutilsOuverts === "function" ? window.ktaOutilsOuverts() : null;
    d.outils.forEach(function (b) {
      const g = window._groupes && window._groupes[b.dataset.groupe], src = g && g.btnPrincipal;
      b.hidden = !src || !permis;
      if (!src) return;
      if (b.innerHTML !== src.innerHTML) b.innerHTML = src.innerHTML;
      if (b.title !== src.title) { b.title = src.title; b.setAttribute("aria-label", src.title); }
      b.classList.toggle("kta-group-mode-actif", src.classList.contains("kta-group-mode-actif"));
      b.classList.toggle("kta-outil-lecture-seule", src.classList.contains("kta-outil-lecture-seule"));
      b.classList.toggle("kta-group-open", ouvert === b.dataset.groupe);
    });
    const trk = window._groupes && window._groupes.tracker && window._groupes.tracker.btnPrincipal;
    d.boutonTracker.hidden = !trk || !permis;
    if (trk) {
      if (d.boutonTracker.innerHTML !== trk.innerHTML) d.boutonTracker.innerHTML = trk.innerHTML;
      if (d.boutonTracker.title !== trk.title) {
        d.boutonTracker.title = trk.title;
        d.boutonTracker.setAttribute("aria-label", trk.title);
      }
      d.boutonTracker.classList.toggle("kta-group-mode-actif", trk.classList.contains("kta-group-mode-actif"));
    }
    d.boutonSol.hidden = !permis;
    d.boutonSol.classList.toggle("kta-actif", !!d.planSol);
    d.boutonSol.setAttribute("aria-pressed", d.planSol ? "true" : "false");
  }

  // À chaque image, sur signature : barre suivie (outil armé ou éteint par le panneau, une annulation, une modale),
  // outil éteint si le dessin n'est plus permis, rendu galerie quitté pour une structure, aperçu refait.
  // 🔍 de la rangée du haut, dans les deux vues (décision produit), si la recherche est permise (pas pendant une greffe
  // qui coupe les fiches).
  function _majRechercheHaut() {
    const e = _e, b = e && e.boutonRechercheHaut;
    if (!b) return;
    const cache = !_rechercheDispo();
    if (b.hidden !== cache) b.hidden = cache;
  }

  function _majDessin() {
    const e = _e, d = e.dessin;
    _majRechercheHaut();
    if (!d || !d.barre) return;
    _suivrePermisDessin();
    if (!_dessinPermis()) {
      _ajusterAnnuler();
      _ajusterFermerMenu();
      const A = _ajusteur();
      if (A && A.insertionEnCours()) A.terminerInsertion();
    } else _placerMenuAjuster();
    const G = window._groupes || {}, o = _outilArme();
    const trk = window._groupes && window._groupes.tracker && window._groupes.tracker.btnPrincipal;
    let sig = (_dessinPermis() ? "1" : "0") + (d.planSol ? "1" : "0") + e.niveau +
      (trk ? trk.className + trk.innerHTML : "") +
      (o ? o.famille + ":" + o.type : "") + "|" +
      (typeof window.ktaOutilsOuverts === "function" ? window.ktaOutilsOuverts() || "" : "");
    GROUPES_DESSIN.forEach(function (g) {
      const b = G[g] && G[g].btnPrincipal;
      if (b) sig += "|" + b.className + b.innerHTML;
    });
    if (sig !== d.sig) {
      d.sig = sig;
      _majBarreDessin();
      // ⚠️ contrat (décision produit) : le rendu galerie ne dessine aucune structure ; armer un outil de structure y
      // passe en mixte (retenu par plan, comme un toucher du bouton), un toast le dit : on voit ce qu'on dessine.
      if (_dessinPermis() && o && o.famille === "structures" && e.rendu === "galerie") {
        basculerRendu("mixte");
        d.renduBascule = "mixte";
        _toast(_t("vue3d.dessin.renduMixte"), "success");
      }
    }
    // Objet fini autrement que par un toucher (✅ du panneau, annulation) : la reconstruction qui suit est locale.
    const cur = o && o.famille !== "mesure" ? _objetEnCours(o.famille) : null;
    if (d.suivi && d.suivi !== cur) _noterFin(d.suivi);
    d.suivi = cur;
    _majApercu(false);
    _majPlanSol();
    _majBandeauMesure();
  }

  // Bandeau fixe de la mesure 📐 (outil de mesure armé) : les lignes du libellé de la carte (measure.js >
  // _afficherMesureValeur : distance totale, surface, ou l'invite du mode actif), mêmes clés et mêmes formats
  // (formatDistance à 2 décimales, formatSurface à 1), relues à chaque sommet. Caché outil désarmé.
  function _majBandeauMesure() {
    const e = _e, b = e.bandeauMesure;
    if (!b) return;
    const o = _outilArme(), lignes = [];
    if (_dessinActif() && o && o.famille === "mesure") {
      const mD = _tab(window.getMeasurePoints), mS = _tab(window.getMeasurePointsSurface);
      if (mD.length && typeof window.calculDistance === "function" && typeof window.formatDistance === "function") {
        lignes.push(["distance", "ruler", _t("measure.label.distance",
          { val: window.formatDistance(window.calculDistance(), 2) })]);
      }
      if (mS.length && typeof window.calculSurface === "function") {
        const m2 = window.calculSurface();
        lignes.push(["surface", "square-dashed", _t("measure.label.surface", { val: typeof window.formatSurface === "function"
          ? window.formatSurface(m2, 1) : Math.round(m2) + " m²" })]);
      }
      if (!lignes.length) {
        lignes.push([o.type, o.type === "surface" ? "square-dashed" : "ruler",
          _t(o.type === "surface" ? "measure.hint.surface" : "measure.hint.distance")]);
      }
    }
    const sig = lignes.map(function (l) { return l.join("|"); }).join(";") + "|" + (o ? o.type : "");
    if (sig === e.mesureSig) return;
    e.mesureSig = sig;
    b.textContent = "";
    lignes.forEach(function (l) {
      const ligne = document.createElement("div");
      ligne.className = "kta-v3d-mesure-ligne" + (o && l[0] === o.type ? " kta-v3d-mesure-active" : "");
      _poserIcone(ligne, l[1], l[2]);
      b.appendChild(ligne);
    });
    b.hidden = !lignes.length;
  }

  // Groupe touché dans la barre : son panneau 2D, ancré au bouton ; retouché, fermé. Groupe grisé (lecture seule) :
  // le refus de la carte (ktaEditionRefusee le dit), rien d'ouvert.
  function _ouvrirOutil(groupe, ancre) {
    const g = window._groupes && window._groupes[groupe];
    if (!g || typeof window.ktaOuvrirOutils !== "function") return false;
    if (g.btnPrincipal.classList.contains("kta-outil-lecture-seule") &&
        typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return false;
    _e.dessin.sig = null;
    // Bouton seul (✏️ ajout de point) : son geste de la barre 2D, qui arme ou désarme (un seul outil armé).
    if (!g.useFlyout && !g.useModal && !(g.sousActionsConfig && g.sousActionsConfig.length)) {
      if (window.ktaOutilsOuverts()) window.ktaFermerOutils();
      g.btnPrincipal.click();
      return true;
    }
    if (window.ktaOutilsOuverts() === groupe) { window.ktaFermerOutils(); return false; }
    window.ktaOuvrirOutils(groupe, { ancre: ancre });
    return true;
  }

  // Point du sol sous le doigt (rayon posé par _rayonEcran) : le plan du sol y = 0, toujours → { x, y (px plan), dist
  // (m) } ou null (rayon vers le ciel).
  // ⚠️ contrat (décision produit) : jamais la surface d'un objet. Le dessus d'un pilier, le haut d'une paroi de tube ou
  // d'un mur touchés donnaient un sommet décalé du doigt d'autant que l'objet est haut (jusqu'à 1,3 m mesuré en vue
  // inclinée), alors que l'aperçu et le plan au sol se dessinent au sol, sous le doigt : on pose où l'on voit le trait.
  // Le plan est mathématique, aucun maillage requis : hors galerie (rendu Galerie, fond noir), au-delà du carré de sol
  // ou de la portée, le point visé se pose quand même.
  // ⚠️ contrat (décision produit) : un sol visé hors de l'image du plan (vue dézoomée : le bas ou un coin de l'écran
  // déborde) est refusé avec un toast, jamais ramené sur le bord (le sommet partait sans prévenir jusqu'à 100 m du
  // doigt). Plan sans dimensions connues : tout passe.
  function _dansPlan(v) {
    const W = window.PLAN_CONFIG && window.PLAN_CONFIG.plan ? Number(window.PLAN_CONFIG.plan.imageWidth) : 0;
    const H = window.APP_CONFIG ? Number(window.APP_CONFIG.imageHeight) : 0;
    return !(W > 0 && (v.x < 0 || v.x > W)) && !(H > 0 && (v.y < 0 || v.y > H));
  }

  function _pointSol() {
    const e = _e;
    const q = e.rayon.ray.intersectPlane(e.planSol0 || (e.planSol0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)),
      new THREE.Vector3());
    if (!q) return null;
    return { x: q.x * e.sc, y: q.z * e.sc, dist: q.distanceTo(e.camera.position) };
  }

  // Rayon d'aimantation des tracés de la carte (APP_CONFIG.snapDrawPx, px d'écran ; `pxVoulu` à la place s'il est donné)
  // à la profondeur `dist` (m) → px plan.
  function _tolerancePlan(dist, pxVoulu) {
    const e = _e, cfg = window.APP_CONFIG || {}, r = e.cv.getBoundingClientRect();
    const px = pxVoulu > 0 ? pxVoulu : Number.isFinite(cfg.snapDrawPx) && cfg.snapDrawPx > 0 ? cfg.snapDrawPx : 14;
    if (!r.height) return undefined;
    return px * 2 * dist * Math.tan(e.camera.fov * Math.PI / 360) / r.height * e.sc;
  }

  // Un toucher, outil armé : le geste de la carte au point du sol touché (voir l'en-tête de la section). Le toucher qui
  // ferme le panneau d'un groupe est avalé (comme la carte : interface.js > _onDocClickFlyout).
  function _poserSommet(cx, cy) {
    const e = _e, d = e.dessin, o = _outilArme();
    if (performance.now() < d.avaleJusqua) {
      _refusDessin("toucher avalé : il refermait le panneau de l'outil (" + DESSIN_AVALER + " ms)");
      return true;
    }
    if (!o || !window.map || typeof window.convertCoord !== "function" || !_rayonEcran(cx, cy)) {
      _refusDessin(!o ? "aucun outil armé" : !window.map ? "carte absente" : "canvas de taille nulle");
      return false;
    }
    const v = _pointSol();
    if (!v) {
      _refusDessin("aucun sol sous le pointeur (rayon vers le ciel)");
      _toast(_t("vue3d.dessin.horizon"), "info");
      return false;
    }
    if (!_dansPlan(v)) {
      _refusDessin("sol visé hors de l'image du plan");
      _toast(_t("vue3d.dessin.horsPlan"), "info");
      return false;
    }
    let x = v.x, y = v.y;
    const cur = _objetEnCours(o.famille);
    const poly = !!cur && (o.famille === "zones" || (o.famille === "structures" && !_estLigne(cur.type)));
    if (poly && cur.points.length >= 3) {
      const p0 = cur.points[0];
      if (Math.hypot(x - p0.x, y - p0.y) <= DESSIN.premier * e.sc) { x = p0.x; y = p0.y; }
    }
    const cfg = window.APP_CONFIG || {}, avant = cfg.activeLevel, niv = e.niveau;
    const ev = { latlng: L.latLng(window.convertCoord(x, y)), ktaVue3D: true, ktaTolerancePlan: _tolerancePlan(v.dist) };
    const t0 = performance.now();
    if (cfg.multiLevel === true && Number.isInteger(niv)) cfg.activeLevel = niv;
    try {
      window.map.fire("mousedown", ev);
      window.map.fire("click", ev);
    } catch (err) {
      console.warn("[Vue3D] sommet non posé :", err && err.message);
    } finally {
      cfg.activeLevel = avant;
    }
    d.poses++;
    d.refus = null;
    d.msPoses.push(performance.now() - t0);
    if (d.msPoses.length > 50) d.msPoses.shift();
    // Objet fini (re-toucher du 1er sommet) : la scène est refaite à l'image suivante, sans attendre la fin de rafale.
    d.suivi = _objetEnCours(o.famille);
    if (cur && !d.suivi) {
      _noterFin(cur);
      d.fermetures++;
      d.finT = performance.now();
      d.msFin = null;
      if (e.donnees.signal) e.donnees.premier = e.donnees.signal - RAFALE.max;
    }
    _majApercu(true);
    e.sale = true;
    return true;
  }

  // ── Ajuster une forme depuis la vue d'édition : appui long, les gestes et les règles de la carte ────────────────
  // ⚠️ contrat (décision produit) : une seule prise pour la carte et la vue (ajusterSommets.js > KtaAjusterSommets.plan :
  // familles, droits, minimum et toast, aimantation, une entrée ⏪, un rendu au lâcher). La vue ne mène que le geste :
  // appui long (APPUI_MS) sur un sommet ou au milieu d'un côté de ce qu'elle montre (son niveau, ses filtres : e.vus ;
  // la mesure toujours), au sol sous le point d'APPUI (_pointSol), sinon au maillage touché (le dessus d'un pilier :
  // _pointVise), RAYON_PX px d'écran convertis à la profondeur ;
  // puis glisser (aperçu au sol, ronds dorés, aucune reconstruction : la scène est refaite au lâcher) ou, sans bouger,
  // 🗑️ au sommet. Un outil de dessin armé passe avant (sauf 📐 pour la mesure), comme sur la carte.
  // 🩸 Caméra : plus de BOUGE_PX avant l'appui long = un pan (l'appui est oublié, le pan part à TAPE.bouge) ; armé, le
  // doigt ne tient plus que le sommet (ni pan, ni cap) ; un 2e doigt, une sortie de la vue d'édition ou Échap annulent
  // sans rien écrire.
  function _ajusteur() {
    const A = window.KtaAjusterSommets;
    return A && A.plan && typeof A.plan.saisir === "function" ? A : null;
  }
  function _garderVu(famille, o) {
    if (famille === "mesure") return true;
    const v = _e.vus && _e.vus[famille];
    if (!v) return false;
    // 🩸 Objets remplacés par des copies au contenu identique (annuler puis rétablir, relecture) : l'empreinte n'a pas
    // changé, la scène n'est pas refaite et e.vus garde les anciens objets (_memeObjet).
    return !!_retrouver(v, o);
  }

  // Appui d'un seul pointeur sur la scène (vue d'édition) : un sommet ou un milieu visé → l'appui long est attendu.
  function _ajusterAppui(ev) {
    const e = _e, A = _ajusteur();
    if (!A || e.ajuste || !_dessinPermis() || !_rayonEcran(ev.clientX, ev.clientY)) return false;
    const v = _pointSol();
    let c = v ? A.plan.saisir(v.x, v.y, _tolerancePlan(v.dist, A.RAYON_PX), _garderVu) : null;
    // 🩸 Un sommet se vise là où on le VOIT : le coin du dessus d'un pilier, à plus de RAYON_PX au-dessus de son pied à
    // l'écran en vue d'édition (pied caché ou loin) ; rien au sol, l'appui partait en pan (la souris, précise, vise ce
    // coin). Rien au sol : le point du maillage touché (_pointVise) est essayé. Le glisser reste mené au sol (depart =
    // v) : le sommet garde son écart au pointeur, sans saut.
    if (!c && v) {
      const m = _pointVise();
      if (m && !m.sol) c = A.plan.saisir(m.x, m.y, _tolerancePlan(m.dist, A.RAYON_PX), _garderVu);
    }
    if (!c) return false;
    e.ajuste = { id: ev.pointerId, cx: ev.clientX, cy: ev.clientY, depart: v, dist: v.dist, c: c, arme: false,
      bouge: false, n: 0, timer: setTimeout(_ajusterArmer, A.APPUI_MS) };
    return true;
  }

  function _ajusterArmer() {
    const e = _e, g = e && e.ajuste, A = _ajusteur();
    if (!g) return;
    g.timer = 0;
    const f = A && _dessinPermis() ? A.plan.forme(g.c) : null;
    if (!f) { _ajusterAnnuler(); return; }
    g.arme = true;
    g.pts = f.pts; g.idx = f.idx; g.ferme = f.ferme; g.avant = f.pts.slice();
    g.decalage = { x: f.pts[f.idx].x - g.depart.x, y: f.pts[f.idx].y - g.depart.y };
    e.ajustements.armes++;
    if (window.kta_vibrate && typeof window.kta_vibrate.light === "function") window.kta_vibrate.light();
    e.sale = true;
  }

  // Pointeur bougé → true s'il appartient à l'ajustement (la caméra ne le reçoit pas).
  function _ajusterBouge(ev) {
    const e = _e, g = e.ajuste, A = _ajusteur();
    if (!g || ev.pointerId !== g.id || !A) return false;
    const d = Math.hypot(ev.clientX - g.cx, ev.clientY - g.cy);
    if (!g.arme) {
      if (d > A.BOUGE_PX) { _ajusterAnnuler(); return false; }
      return true;
    }
    if (!g.bouge && d > A.GLISSE_PX) g.bouge = true;
    if (g.bouge && _rayonEcran(ev.clientX, ev.clientY)) {
      const v = _pointSol();
      if (v) {
        g.pts[g.idx] = { x: v.x + g.decalage.x, y: v.y + g.decalage.y };
        g.dist = v.dist;
        g.n++;
      }
    }
    return true;
  }

  // Pointeur levé → true si c'était un ajustement armé (le lâcher n'est pas un toucher).
  function _ajusterLacher(ev) {
    const e = _e, g = e.ajuste, A = _ajusteur();
    if (!g || ev.pointerId !== g.id) return false;
    if (!g.arme || !A) { _ajusterFin(); return false; }
    const p = g.bouge || g.c.genre === "milieu" ? g.pts[g.idx] : null;
    const r = A.plan.lacher(g.c, p, p ? _tolerancePlan(g.dist) : undefined);
    e.ajustements[r] = (e.ajustements[r] || 0) + 1;
    if (r === "menu" || r === "refus") _ajusterMenu(g, r === "refus");
    else if (r === "ajoute" || r === "deplace") _ajusterRefaire(g.avant.concat(g.pts));
    _ajusterFin();
    return true;
  }

  function _ajusterFin() {
    const e = _e, g = e && e.ajuste;
    if (!g) return;
    clearTimeout(g.timer);
    e.ajuste = null;
    e.sale = true;
  }
  function _ajusterAnnuler() {
    const e = _e, A = _ajusteur();
    if (!e || !e.ajuste) return false;
    if (A) A.plan.annule();
    e.ajustements.annules++;
    _ajusterFin();
    return true;
  }

  // Forme écrite : scène refaite à l'image suivante (sans attendre la fin de la rafale), sur l'emprise de l'avant et
  // de l'après seulement (_noterFin). La mesure n'est que dans l'aperçu : sa signature suffit.
  function _ajusterRefaire(pts) {
    const e = _e;
    _noterFin({ points: pts });
    if (e.donnees.signal) e.donnees.premier = e.donnees.signal - RAFALE.max;
    e.sale = true;
  }

  // ＋, ✂️ et 🗑️ au sommet (les boutons de la carte : ajusterSommets.js > htmlMenu ; pas de 🗑️ sous le minimum, ✂️
  // sur un sommet coupable), suivis à l'écran ; ils se retirent seuls (MENU_MS), au toucher suivant hors d'eux (avalé
  // sur la scène) ou par Échap.
  function _ajusterMenu(g, sansSuppr) {
    const e = _e, A = _ajusteur();
    _ajusterFermerMenu();
    if (!A) return;
    const boite = document.createElement("div");
    const V3D = { inserer: "ajusterInserer", couper: "ajusterCouper", supprimer: "ajusterSuppr" };
    boite.innerHTML = A.htmlMenu(function (action) {
      return ' data-v3d="' + V3D[action] + '"';
    }, sansSuppr, !!(A.plan.coupable && A.plan.coupable(g.c)));
    const b = boite.firstChild;
    b.classList.add("kta-v3d-ajuster-menu");
    e.ov.appendChild(b);
    e.ajusteMenu = { b: b, c: g.c, pts: g.avant, p: g.pts[g.idx],
      timer: setTimeout(_ajusterFermerMenu, A ? A.MENU_MS : 6000) };
    _placerMenuAjuster();
    e.sale = true;
  }
  function _placerMenuAjuster() {
    const e = _e, m = e.ajusteMenu;
    if (!m) return;
    const s = _ecran({ x: m.p.x / e.sc, y: DESSIN.y, z: m.p.y / e.sc }), r = e.ov.getBoundingClientRect();
    const x = Math.round(s.x - r.left - m.b.offsetWidth / 2) + "px", y = Math.round(s.y - r.top - 58) + "px";
    if (m.b.style.left !== x) m.b.style.left = x;
    if (m.b.style.top !== y) m.b.style.top = y;
    m.b.hidden = !s.devant;
  }
  function _ajusterFermerMenu() {
    const e = _e, m = e && e.ajusteMenu;
    if (!m) return false;
    clearTimeout(m.timer);
    if (m.b.parentNode) m.b.parentNode.removeChild(m.b);
    e.ajusteMenu = null;
    e.sale = true;
    return true;
  }
  // ＋ : l'insertion part de ce sommet ; chaque toucher au sol pose ensuite un point (_toucher → _insererAuSol).
  function _ajusterInserer() {
    const e = _e, m = e.ajusteMenu, A = _ajusteur();
    if (!m) return;
    _ajusterFermerMenu();
    if (A && A.plan.inserer(m.c)) e.ajustements.insertion++;
  }
  // Un toucher pendant l'insertion : le point du sol sous le doigt (refusé hors du plan), aimanté, et la fin au
  // sommet suivant, par les règles de la carte ; la scène est refaite sur l'emprise de la forme.
  function _insererAuSol(cx, cy) {
    const e = _e, A = _ajusteur();
    if (!A || !_rayonEcran(cx, cy)) return false;
    const v = _pointSol();
    if (!v) { _toast(_t("vue3d.dessin.horizon"), "info"); return true; }
    if (!_dansPlan(v)) { _toast(_t("vue3d.dessin.horsPlan"), "info"); return true; }
    const x = v.x, y = v.y;
    const r = A.plan.poser({ x: x, y: y }, _tolerancePlan(v.dist), _tolerancePlan(v.dist, A.RAYON_PX));
    e.ajustements[r === "ajoute" ? "insere" : r === "fin" ? "insertionFin" : "rien"]++;
    const ins = r === "ajoute" ? A.insertion() : null;
    if (ins) _ajusterRefaire(ins.pts);
    e.sale = true;
    return true;
  }
  // ✂️ : la forme coupée à ce sommet (règles de la carte : ajusterSommets.js > _couper) ; scène refaite sur son emprise.
  function _ajusterCouper() {
    const e = _e, m = e.ajusteMenu, A = _ajusteur();
    if (!m) return;
    _ajusterFermerMenu();
    if (A && A.plan.couper && A.plan.couper(m.c)) {
      e.ajustements.coupe++;
      _ajusterRefaire(m.pts);
    }
  }
  function _ajusterSupprimer() {
    const e = _e, m = e.ajusteMenu, A = _ajusteur();
    if (!m) return;
    _ajusterFermerMenu();
    if (A && A.plan.supprimer(m.c)) {
      e.ajustements.supprime++;
      _ajusterRefaire(m.pts);
    }
  }

  // ── Aperçu au sol : objet en cours (ruban et sommets, 1er sommet cerclé pour fermer) et mesures de la carte (ruban
  // rouge, total en panneau). Une géométrie de quelques triangles, refaite sur signature : jamais la scène.
  function _apercuSig() {
    const e = _e, o = _outilArme(), parts = [e.niveau, o ? o.famille + o.type : ""];
    const cur = o && o.famille !== "mesure" ? _objetEnCours(o.famille) : null;
    const pts = function (l) {
      const n = l ? l.length : 0;
      parts.push(n);
      if (n) parts.push(l[0].x, l[0].y, l[n - 1].x, l[n - 1].y);
    };
    pts(cur && cur.points);
    // Mesures : tous les sommets comptent (une annulation ⏪ remet en place un sommet du milieu ajusté sur la carte).
    [_tab(window.getMeasurePoints), _tab(window.getMeasurePointsSurface)].forEach(function (l) {
      let somme = 0;
      for (let i = 0; i < l.length; i++) somme += l[i].x * (i + 1) + l[i].y * (i + 2);
      parts.push(l.length, somme);
    });
    // Ajustement armé (chaque déplacement compte) ou 🗑️ proposé : ronds dorés de la forme touchée.
    const g = e.ajuste && e.ajuste.arme ? e.ajuste : null;
    parts.push(g ? "a" + g.n + ":" + g.idx : "", e.ajusteMenu ? "m" : "");
    // Insertion ouverte : ses ronds suivent chaque point posé ou annulé.
    const A = _ajusteur(), ins = A && A.insertionEnCours() ? A.insertion() : null;
    parts.push(ins ? "i" + ins.pts.length + ":" + ins.ancre : "");
    return parts.join(",");
  }

  function _libererApercu() {
    const e = _e, d = e.dessin;
    if (d.apercu) { e.scene.remove(d.apercu); d.apercu.geometry.dispose(); d.apercu = null; }
    d.etiquettes.forEach(function (sp) {
      if (sp.parent) sp.parent.remove(sp);
      e.panneaux.delete(sp);
      if (sp.material.map) sp.material.map.dispose();
      sp.material.dispose();
    });
    d.etiquettes = [];
  }

  function _majApercu(force) {
    const e = _e, d = e.dessin;
    if (!d || !e.scene) return;
    const sig = _apercuSig();
    if (!force && sig === d.apSig) return;
    d.apSig = sig;
    _libererApercu();
    const sc = e.sc, lot = new Lot(), o = _outilArme(), coul = _jetonsSombres();
    const disque = function (p, r, col) {
      const cx = p.x / sc, cz = p.y / sc, n = 16;
      for (let k = 0; k < n; k++) {
        const a0 = 2 * Math.PI * k / n, a1 = 2 * Math.PI * (k + 1) / n;
        lot.tri([cx, DESSIN.y, cz], [cx + Math.cos(a0) * r, DESSIN.y, cz + Math.sin(a0) * r],
          [cx + Math.cos(a1) * r, DESSIN.y, cz + Math.sin(a1) * r], [0, 1, 0], col);
      }
    };
    const ligne = function (pts, ferme, col) {
      for (let i = 0; i + 1 < pts.length; i++) _ruban(lot, pts[i], pts[i + 1], sc, DESSIN.larg, DESSIN.y, col);
      if (ferme && pts.length > 2) _ruban(lot, pts[pts.length - 1], pts[0], sc, DESSIN.larg, DESSIN.y, col);
    };
    const accent = new THREE.Color();
    try { accent.setStyle(coul.accent); } catch (err) { accent.set(0xf4c542); }
    const cur = o && o.famille !== "mesure" ? _objetEnCours(o.famille) : null;
    if (cur && Array.isArray(cur.points) && cur.points.length) {
      const champ = o.famille === "roads" || _estLigne(cur.type) ? "color" : "fillColor";
      const col = _couleur(CAT_DESSIN[o.famille], cur.type, champ);
      ligne(cur.points, false, col);
      const poly = o.famille === "zones" || (o.famille === "structures" && !_estLigne(cur.type));
      if (poly && cur.points.length >= 3) disque(cur.points[0], DESSIN.premier, accent);
      cur.points.forEach(function (p) { disque(p, DESSIN.sommet, col); });
    }
    const rouge = new THREE.Color(COULEUR_MESURE);
    const mD = _tab(window.getMeasurePoints), mS = _tab(window.getMeasurePointsSurface);
    ligne(mD, false, rouge);
    ligne(mS, true, rouge);
    // ⚠️ contrat (décision produit) : un rond doré à chaque sommet de la mesure, comme sur la carte (measure.js >
    // _majSommetsMesure) : on voit qu'il se déplace. Les autres formes n'en portent que pendant leur ajustement.
    mD.concat(mS).forEach(function (p) { disque(p, DESSIN.sommet, accent); });
    const g = e.ajuste && e.ajuste.arme ? e.ajuste : null, mm = e.ajusteMenu;
    if (g) {
      ligne(g.pts, g.ferme, accent);
      g.pts.forEach(function (p, i) { disque(p, i === g.idx ? DESSIN.sommet * 1.6 : DESSIN.sommet, accent); });
    } else if (mm) {
      mm.pts.forEach(function (p) { disque(p, DESSIN.sommet, accent); });
      disque(mm.p, DESSIN.sommet * 1.6, accent);
    }
    // Insertion ouverte : ronds dorés de la forme, le dernier point posé (l'ancre) plus gros.
    const A = _ajusteur(), ins = !g && !mm && A && A.insertionEnCours() ? A.insertion() : null;
    if (ins) {
      ins.pts.forEach(function (p, i) { disque(p, i === ins.ancre ? DESSIN.sommet * 1.6 : DESSIN.sommet, accent); });
    }
    const formeN = g ? g.pts.length : mm ? mm.pts.length : ins ? ins.pts.length : 0;
    d.ronds = { mesure: mD.length + mS.length, forme: formeN };
    const geo = lot.geometrie();
    if (geo) {
      if (!e.mats.apercu) {
        e.mats.apercu = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, depthTest: false,
          depthWrite: false, transparent: true, side: THREE.DoubleSide });
      }
      d.apercu = new THREE.Mesh(geo, e.mats.apercu);
      d.apercu.renderOrder = 20;
      d.apercu.matrixAutoUpdate = false;
      e.scene.add(d.apercu);
    }
    // Totaux de la carte (measure.js > calculDistance / calculSurface), libellés de la carte, au dernier point ;
    // longueur de chaque segment et angle à chaque sommet : les libellés que la carte a posés (ktaMesureLibelles),
    // lus tels quels. Lettres jamais sous PANNEAU_LETTRE_MIN px (_majPanneaux).
    const etiquette = function (texte, p, bord, y) {
      const sp = _panneau({ nom: texte }, [p.x / sc, p.y / sc], { sansIcone: true, bord: bord || COULEUR_MESURE,
        genre: "mesure", y: y || 0.6 });
      e.scene.add(sp);
      d.etiquettes.push(sp);
    };
    if (mD.length > 1 && typeof window.ktaMesureLibelles === "function") {
      window.ktaMesureLibelles().forEach(function (l) {
        if (l.texte) etiquette(l.texte, l, l.genre === "angle" ? coul.neutre : COULEUR_MESURE, 0.3);
      });
    }
    if (mD.length > 1 && typeof window.calculDistance === "function" && typeof window.formatDistance === "function") {
      etiquette("📐 " + _t("measure.label.distance", { val: window.formatDistance(window.calculDistance(), 2) }),
        mD[mD.length - 1]);
    }
    if (mS.length > 2 && typeof window.calculSurface === "function") {
      const m2 = window.calculSurface();
      const txt = typeof window.formatSurface === "function" ? window.formatSurface(m2, 1) : Math.round(m2) + " m²";
      etiquette("♦️ " + _t("measure.label.surface", { val: txt }), mS[mS.length - 1]);
    }
    e.sale = true;
  }

  // ── Plan au sol (🗺️ de la colonne d'outils, vue d'édition) : l'image du plan sous la scène, pour dessiner dessus ──
  // ⚠️ contrat (décision produit) : interrupteur de la colonne, coupé par défaut, gardé tant que la vue est ouverte.
  // Une seule texture carrée (PLAN_SOL.px côté : 1024 au doigt, 2048 au pointeur fin) qui couvre le carré de sol
  // (2,4 × le rayon de scène) autour de la place, posée à une position fixe et redessinée quand on s'en écarte d'un
  // quart ou que le recul change l'emprise de plus d'un quart. Source : les images que la carte a déjà (overlays du
  // fond, direct ou tuiles V1 : leur <img> chargé) ; plan tuilé V2 : tiling.js > ktaDessinerRegionTuiles (tuiles du
  // ZIP en mémoire ou du cache, au niveau le moins détaillé qui suffit). Rien n'est téléchargé de plus.
  // ⚠️ contrat (décision produit) : offert à TOUS les niveaux. Un niveau ≠ 0 qui a ses calques image (Générateur,
  // `imageLayers[].level`, map.js > window._ktaImageOverlays) montre ceux-là, calés comme sur la carte ; sinon le plan
  // de base. Un calque jamais posé sur la carte (niveau masqué en 2D) est lu depuis son URL, déjà servie au plan.
  // 🩸 Posé 6 mm au-dessus du sol et départagé par la profondeur seule, le plan perdait contre le sol sous WebKit (le
  // grain calcaire restait seul à l'écran : précision de profondeur trop courte à 18 m de recul). ⚠️ contrat : il se
  // dessine juste après le sol (ORDRE_SOL < `ordre` < tout le reste), sans test ni écriture de profondeur, troué par
  // les bouches des passages comme lui ; tout ce qui vient ensuite (tracés, zones, structures) passe dessus par la
  // profondeur du sol.
  // 🩸 Sous WebKit sans anticrénelage (écran dense : iPhone), la première image qui montre une texture tout juste tirée
  // d'un canvas la montre absente ou noire, les suivantes sont justes ; or la vue ne redessine qu'au mouvement : le plan
  // restait invisible, vue immobile. `reprises` : images redessinées d'office après chaque nouvelle texture.
  const PLAN_SOL = { pxFin: 2048, pxDoigt: 1024, y: 0, ecart: 0.25, ordre: -0.5, reprises: 2 };

  // Calques image propres au niveau de la vue (le niveau 0 garde le plan de base : ses calques sont des surcouches).
  function _calquesNiveauSol() {
    const n = _e.niveau;
    if (!Number.isInteger(n) || n === 0) return [];
    return (window._ktaImageOverlays || []).filter(function (c) { return c && c.overlay && c.level === n; });
  }

  // <img> d'un overlay : celui de la carte s'il est chargé, sinon une copie lue depuis son URL (gardée sur l'overlay).
  function _imageOverlay(ov) {
    const pret = function (i) { return i && i.complete && i.naturalWidth > 0; };
    const vu = ov._rawImage || ov._image;
    if (pret(vu)) return Promise.resolve(vu);
    if (!ov._url) return Promise.resolve(null);
    if (!ov._ktaImgSol) {
      ov._ktaImgSol = new Promise(function (res) {
        const img = new Image();
        img.onload = function () { res(img); };
        img.onerror = function () { ov._ktaImgSol = null; res(null); };
        img.src = ov._url;
      });
    }
    return ov._ktaImgSol;
  }

  // Calques du niveau dessinés dans la texture : bornes du plan, ou parallélogramme d'un calque calé (3 coins Leaflet
  // du plugin Rotated → transformation affine de l'image).
  function _dessinerCalquesSol(ctx, calques, region, echelle, H) {
    return Promise.all(calques.map(function (c) { return _imageOverlay(c.overlay); })).then(function (imgs) {
      let n = 0;
      imgs.forEach(function (img, i) {
        if (!img) return;
        const ov = calques[i].overlay, w = img.naturalWidth, h = img.naturalHeight;
        const P = function (ll) { return { x: (ll.lng - region.x) * echelle, y: (H - ll.lat - region.y) * echelle }; };
        if (ov._topLeft && ov._topRight && ov._bottomLeft) {
          const tl = P(ov._topLeft), tr = P(ov._topRight), bl = P(ov._bottomLeft);
          ctx.setTransform((tr.x - tl.x) / w, (tr.y - tl.y) / w, (bl.x - tl.x) / h, (bl.y - tl.y) / h, tl.x, tl.y);
          ctx.drawImage(img, 0, 0);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
          const b = ov.getBounds(), a = P(b.getNorthWest()), z = P(b.getSouthEast());
          ctx.drawImage(img, a.x, a.y, z.x - a.x, z.y - a.y);
        }
        n++;
      });
      return { ok: n > 0, calques: n };
    });
  }

  function _basculerPlanSol(oui) {
    const e = _e, d = e && e.dessin;
    if (!d) return false;
    d.planSol = oui === undefined ? !d.planSol : !!oui;
    if (!d.planSol) _libererPlanSol();
    _majSolActif();
    d.sig = null;
    e.sale = true;
    return d.planSol;
  }

  function _libererPlanSol() {
    const e = _e, d = e.dessin, s = d && d.sol;
    if (!s) return;
    s.jeton++;
    if (s.mesh) { e.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
    if (s.tex) s.tex.dispose();
    d.sol = { jeton: s.jeton };
    e.sale = true;
  }

  // Overlays du fond posés par la carte (tiling.js : direct, tuiles V1) dont l'image est chargée.
  function _imagesFond() {
    const out = [];
    const prendre = function (ov) {
      const img = ov && ov._image;
      if (img && img.complete && img.naturalWidth && typeof ov.getBounds === "function") out.push({ img: img, b: ov.getBounds() });
    };
    (window._ktaBaseLayers || []).forEach(prendre);
    (window._baseTiles || []).forEach(function (t) { prendre(t && t.overlay); });
    return out;
  }

  // À chaque image (_majDessin) : plan au sol voulu et permis → texture (re)faite si la place ou l'emprise ont bougé.
  function _majPlanSol() {
    const e = _e, d = e.dessin;
    const voulu = d.planSol && _dessinPermis();
    if (!voulu) { if (d.sol && d.sol.mesh) _libererPlanSol(); return; }
    const c = _centreScene(), s = d.sol || (d.sol = { jeton: 0 }), cote = 2.4 * _rayonVue(), px = c.x, pz = c.z;
    if (s.enCours) return;
    if (s.reprises > 0) { s.reprises--; e.sale = true; }
    if (s.mesh && s.niveau === e.niveau && Math.hypot(px - s.cx, pz - s.cz) < s.cote * PLAN_SOL.ecart &&
        Math.abs(cote - s.cote) < s.cote * PLAN_SOL.ecart) return;
    _dessinerPlanSol(px, pz, cote);
  }

  function _dessinerPlanSol(cx, cz, cote) {
    const e = _e, d = e.dessin, s = d.sol, jeton = ++s.jeton, sc = e.sc;
    const fin = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
    const N = Math.min(fin ? PLAN_SOL.pxFin : PLAN_SOL.pxDoigt, e.renderer.capabilities.maxTextureSize || 2048);
    const cv = document.createElement("canvas");
    cv.width = cv.height = N;
    const ctx = cv.getContext("2d");
    // 🩸 Plan à canal alpha (PNG / WebP transparents) : le matériau est opaque, donc l'alpha de la texture est ignoré et
    // WebKit montrait la couleur cachée des pixels transparents (mosaïque multicolore). Fond opaque d'abord, celui de
    // la carte 2D (--kta-fond).
    ctx.fillStyle = _jetonsSombres().fond;
    ctx.fillRect(0, 0, N, N);
    // Région en px plan (origine en haut à gauche de l'image, comme les données) ; echelle = px de texture par px plan.
    const region = { x: (cx - cote / 2) * sc, y: (cz - cote / 2) * sc, w: cote * sc, h: cote * sc };
    const echelle = N / region.w, H = window.APP_CONFIG.imageHeight;
    s.enCours = true;
    const t0 = performance.now();
    const pc = window.PLAN_CONFIG, niveau = e.niveau, calques = _calquesNiveauSol();
    const v2 = !calques.length &&
      !!(pc && pc.plan && pc.plan.tiledV2 && pc.tiling && typeof window.ktaDessinerRegionTuiles === "function");
    const fait = calques.length ? _dessinerCalquesSol(ctx, calques, region, echelle, H)
      : v2 ? Promise.resolve(window.ktaDessinerRegionTuiles(ctx, pc, region, echelle, { aligner: true }))
      : Promise.resolve().then(function () {
        _imagesFond().forEach(function (f) {
          // Bornes Leaflet (lat = H − y) → rectangle plan, puis rectangle de la texture.
          const x0 = f.b.getWest(), x1 = f.b.getEast(), y0 = H - f.b.getNorth(), y1 = H - f.b.getSouth();
          ctx.drawImage(f.img, (x0 - region.x) * echelle, (y0 - region.y) * echelle, (x1 - x0) * echelle,
            (y1 - y0) * echelle);
        });
        return { ok: true };
      });
    return fait.catch(function (err) {
      console.warn("[Vue3D] plan au sol :", err && err.message);
      return { ok: false };
    }).then(function (r) {
      if (!_e || _e !== e || s.jeton !== jeton) return;
      s.enCours = false;
      if (s.mesh) { e.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
      if (s.tex) s.tex.dispose();
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(4, e.renderer.capabilities.getMaxAnisotropy());
      const geo = new THREE.PlaneGeometry(cote, cote);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshLambertMaterial({ map: tex, depthTest: false, depthWrite: false,
        stencilWrite: true, stencilRef: 1, stencilFuncMask: 1, stencilFunc: THREE.NotEqualStencilFunc });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, PLAN_SOL.y, cz);
      mesh.renderOrder = PLAN_SOL.ordre;
      mesh.userData.famille = "planSol";
      e.scene.add(mesh);
      Object.assign(s, { mesh: mesh, tex: tex, cx: cx, cz: cz, cote: cote, px: N, ok: !!(r && r.ok),
        v2: v2, niveau: niveau, calques: (r && r.calques) || 0, tuiles: r && r.tuiles, ms: performance.now() - t0, faits: (s.faits || 0) + 1,
        reprises: PLAN_SOL.reprises });
      e.sale = true;
    });
  }

  // État du dessin (checkup) : barre, outil armé, sommets posés et leur coût (ms, geste de la carte compris), objet
  // fini et délai jusqu'à la scène refaite, aperçu (triangles) et étiquettes de mesure.
  function _etatDessin() {
    const e = _e, d = e.dessin;
    if (!d) return null;
    const o = _outilArme();
    // barre : les outils de dessin montrés ; colonne : la colonne elle-même (🔍 seul à hauteur d'yeux).
    const colonne = !!d.barre && !d.barre.hidden;
    return { barre: colonne && _dessinPermis(), colonne: colonne, actif: _dessinActif(), outil: o,
      boutons: d.outils ? d.outils.filter(function (b) { return !b.hidden; }).map(function (b) {
        return b.dataset.groupe; }) : [],
      poses: d.poses, msPoses: d.msPoses.slice(), fermetures: d.fermetures, msFin: d.msFin, refus: d.refus || null,
      apercu: d.apercu ? d.apercu.geometry.attributes.position.count / 3 : 0,
      etiquettes: d.etiquettes.map(function (sp) { return sp.userData.poi.nom; }), renduBascule: d.renduBascule,
      tuilesReprises: e.tuilesReprises || 0, textures: e.renderer.info.memory.textures,
      ajuste: e.ajuste ? { arme: e.ajuste.arme, bouge: e.ajuste.bouge, genre: e.ajuste.c.genre, famille: e.ajuste.c.f,
        pts: e.ajuste.pts ? e.ajuste.pts.length : 0 } : null,
      ajusteMenu: e.ajusteMenu ? { visible: !e.ajusteMenu.b.hidden, ecran: e.ajusteMenu.b.getBoundingClientRect() }
        : null,
      ajustements: Object.assign({}, e.ajustements), ronds: Object.assign({}, d.ronds || {}),
      planSol: d.sol && d.sol.mesh ? { px: d.sol.px, cote: +d.sol.cote.toFixed(1), ok: d.sol.ok, v2: d.sol.v2,
        tuiles: d.sol.tuiles || null, ms: Math.round(d.sol.ms), faits: d.sol.faits, niveau: d.sol.niveau,
        calques: d.sol.calques,
        octets: d.sol.px * d.sol.px * 4 } : { voulu: !!d.planSol } };
  }

  // Objet fini depuis la vue : la reconstruction qui suit ne refait que les tuiles qu'il peut toucher (_reprendreTuiles).
  function _noterFin(o) {
    const e = _e, pts = o && Array.isArray(o.points) ? o.points : [];
    if (!pts.length) return;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    pts.forEach(function (p) {
      x0 = Math.min(x0, p.x / e.sc); x1 = Math.max(x1, p.x / e.sc);
      z0 = Math.min(z0, p.y / e.sc); z1 = Math.max(z1, p.y / e.sc);
    });
    const r = e.reprise;
    e.reprise = r ? { x0: Math.min(r.x0, x0), z0: Math.min(r.z0, z0), x1: Math.max(r.x1, x1), z1: Math.max(r.z1, z1),
      t: performance.now() } : { x0: x0, z0: z0, x1: x1, z1: z1, t: performance.now() };
  }

  // ⚠️ contrat : une tuile garde sa géométrie si elle a le même contenu (mêmes objets, segments, pièces : nombres
  // égaux) et que son emprise reste à plus de REPRISE_M de l'objet fini. Pourquoi cette marge : un pilier ouvre les
  // côtés des tubes à moins de 3 m (galerieEmprise.js > SEUIL_CHAMBRE_M), décide la règle d'une zone ou d'un POI à
  // 3 m (mixte) et attire un POI qui tombe dedans ; au-delà, rien de ce qu'une tuile dessine n'en dépend. Niveau ou
  // rendu changé entre-temps : tout est refait. 🩸 Les compteurs de construction (etat : rubans, halos, faces) ne
  // comptent alors que les tuiles refaites.
  const REPRISE_M = 4;
  function _reprendreTuiles(anciennes, b, memeScene) {
    const e = _e;
    let reprises = 0;
    const loin = function (t) {
      return t.x1 < b.x0 - REPRISE_M || t.x0 > b.x1 + REPRISE_M || t.z1 < b.z0 - REPRISE_M || t.z0 > b.z1 + REPRISE_M;
    };
    const meme = function (a, t) {
      return a.s.length === t.s.length && a.z.length === t.z.length && a.r.length === t.r.length &&
        a.p.length === t.p.length && a.g.length === t.g.length && a.a.length === t.a.length &&
        a.x0 === t.x0 && a.z0 === t.z0 && a.x1 === t.x1 && a.z1 === t.z1;
    };
    if (memeScene) {
      e.tuiles.forEach(function (t, k) {
        const a = anciennes.get(k);
        if (!a || !a.obj || !loin(t) || !loin(a) || !meme(a, t)) return;
        t.obj = a.obj; t.parois = a.parois; a.obj = null;
        reprises++;
      });
    }
    anciennes.forEach(_libererTuile);
    e.tuilesReprises = reprises;
  }

  // Fermeture de la vue : outil éteint (comme en 2D), aperçu libéré.
  function _quitterDessin() {
    const e = _e, d = e && e.dessin;
    if (!d) return;
    _ajusterAnnuler();
    _ajusterFermerMenu();
    _desarmerDessin();
    d.permis = false;
    if (e.scene) { _libererApercu(); _libererPlanSol(); }
  }

  // ── Guidage de l'itinéraire : bandeau et chevrons (js/itiGuidage.js, aucun calcul de chemin ici) ──────────

  function _itineraire() {
    if (!_permisGreffe("itineraire")) return null;
    const r = _tab(window.getRoads).filter(function (x) { return x && x.type === "itinerary" && !x._preview; })[0];
    return r && Array.isArray(r.points) && r.points.length >= 2 ? r : null;
  }

  // ⚠️ contrat (décision produit) : 🪧 Guidage montré dans ⚙️ suffit ; le bandeau 2D réglé sur « Jamais » (croix,
  // bouton de la barre) n'éteint pas la 3D, et la 3D ne touche pas ce réglage. En suivi, la consigne RÉELLE du
  // guidage (ItiGuidage.etat(), comme l'écran XL, avec ses boutons d'écart) quand le bandeau 2D parle, sinon un
  // APERÇU depuis la position du tracker ; en libre, un APERÇU depuis la position 3D (ItiGuidage.apercu, qui ne
  // touche pas l'état du guidage ; son `masque` ne vaut que pour la 2D). → { bandeau, chevrons } : consigne à
  // montrer (null = rien) et abscisses { s, sCible } (px le long du trajet) des chevrons. Guidage coupé dans ⚙️
  // (_guidageMontre) : ni bandeau ni chevrons, sauf un guidage d'urgence, toujours montré (comme en 2D).
  // Écart de la place libre au trajet (m, Infinity sans tronçon à son niveau ; null hors libre) : `e.ecartLibre`, lu
  // par _recalerLibre, mesuré par le même aperçu, même guidage coupé (le recalcul vise l'itinéraire, pas le bandeau).
  function _lireGuidage() {
    const e = _e, G = window.ItiGuidage;
    e.ecartLibre = null;
    if (!G || !_itineraire()) {
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
      const tr = e.mode === "suivi" && typeof window.getTrackingPosition === "function"
        ? window.getTrackingPosition() : null;
      const depuis = tr && Number.isFinite(tr.x) && Number.isFinite(tr.y) ? tr : e.pos;
      ap = G.apercu(depuis, { cap: e.cap, sPrec: e.apS, niveau: e.niveau === null ? undefined : e.niveau });
      if (!ap || !ap.visible) ap = null;
    }
    e.apS = ap ? ap.s : undefined;
    if (e.mode === "libre" && typeof G.apercu === "function") e.ecartLibre = ap ? ap.distM : Infinity;
    if (!_permisGreffe("guidage")) return { bandeau: null, chevrons: null };
    const src = reel || ap;
    if (!_guidageMontre() && !(src && src.urgence)) return { bandeau: null, chevrons: null };
    return { bandeau: src, chevrons: src && Number.isFinite(src.s) && Number.isFinite(src.sCible) ? src : null };
  }

  function _majGuidage(ts) {
    const e = _e;
    if (!e.guidageForce && ts - (e.guidageT || 0) < GUIDAGE_MS) return;
    e.guidageT = ts;
    e.guidageForce = false;
    const g = _lireGuidage();
    _majBandeau(g.bandeau);
    _majChevrons(g.chevrons);
    const cible = g.chevrons ? g.chevrons.sCible : null;
    if (cible !== e.mcCible) { e.mcCible = cible; if (e.mc) e.mc.sale = true; }
    _recalerLibre(ts);
  }

  // Recalcul automatique en libre (RECALCUL_LIBRE) : depuis la place et le niveau de la 3D, même destination, étapes
  // non validées dans l'ordre (interfaceItineraire.js > itineraireReplanifierDepuis, `discret`) ; le tracker ne bouge
  // pas. Rien en suivi (règle de la 2D : bandeau d'écart, ItiGuidage), en vue d'édition, pendant un geste de passage,
  // tant que la place n'a pas bougé depuis l'ouverture (l'écart serait celui du tracker), pour un parcours d'équipe ni
  // quand une greffe coupe l'itinéraire (_itineraire). Un calcul à la fois ; un résultat arrivé alors que la vue a
  // changé (fermée, suivi, édition, greffe) ou l'itinéraire aussi est jeté ; pas de chemin : l'itinéraire est gardé.
  function _recalerLibre(ts) {
    const e = _e, R = RECALCUL_LIBRE, road = _itineraire();
    const permis = e.mode === "libre" && e.libreBouge && e.vue !== "plongee" && !e.geste && !!road && !road.secours &&
      typeof window.itineraireReplanifierDepuis === "function";
    if (!permis || e.recalcul.enCours || !(e.ecartLibre > R.ecartM)) { e.recalcul.depuis = 0; return; }
    const der = e.recalcul.dernier;
    if (der && der.niveau === e.niveau && Math.hypot(e.pos.x - der.x, e.pos.y - der.y) / e.sc < R.repriseM) return;
    if (!e.recalcul.depuis) { e.recalcul.depuis = ts; return; }
    if (ts - e.recalcul.depuis < R.tenirMs || (der && ts - der.t < R.entreMs)) return;
    const vue = e, x = e.pos.x, y = e.pos.y, niveau = e.niveau, t0 = performance.now();
    e.recalcul.enCours = true;
    e.recalcul.depuis = 0;
    e.recalcul.dernier = { x: x, y: y, niveau: niveau, t: ts };
    const valide = function () {
      return _e === vue && vue.mode === "libre" && vue.vue !== "plongee" && _itineraire() === road;
    };
    Promise.resolve(window.itineraireReplanifierDepuis(x, y, Number.isInteger(niveau) ? niveau : undefined,
      { discret: true, valide: valide })).then(function (r) {
      vue.recalcul.enCours = false;
      vue.recalcul.ms = Math.round(performance.now() - t0);
      vue.recalcul.raison = r && r.raison ? r.raison : null;
      if (_e !== vue || !r) return;
      if (r.ok) {
        vue.recalcul.n++;
        _toast(_t("vue3d.itiRecalcule"), "success");
      } else if (r.raison === "chemin") {
        vue.recalcul.echecs++;
        _toast(_t("vue3d.itiRecalculEchec"), "warn");
      }
    }, function (err) {
      vue.recalcul.enCours = false;
      console.warn("[Vue3D] recalcul de l'itinéraire échoué :", err);
    });
  }

  // Bandeau compact dans _e.bandeau : icône (ou schéma du carrefour), consigne, ligne « puis… », encart « reste »
  // (destination, distance et temps restants sur une ligne : `resume` d'ItiGuidage, rendu par ItiGuidage.rendreEncart,
  // comme en 2D). Mêmes textes que le bandeau 2D. Le DOM n'est touché que si la consigne ou l'encart change.
  function _majBandeau(g) {
    const e = _e, b = e.bandeau;
    if (!b) return;
    // En suivi, sur un écart ou un demi-tour : les boutons du bandeau 2D (ItiGuidage.etat().actions, dans son ordre),
    // joués par _actionGuidage.
    const actions = g && Array.isArray(g.actions) ? g.actions : [];
    const G = window.ItiGuidage, resume = g && g.resume ? g.resume : null;
    const cle = g ? [g.apercu ? "a" : "r", g.mode, g.icone, g.picto, g.principal, g.sous, g.fleche, g.urgence,
      actions.map(function (a) { return a.id; }).join(), resume ? resume.texte : ""].join("|") : "";
    if (cle === e.bandeauCle) return;
    e.bandeauCle = cle;
    e.bandeauEtat = g ? { visible: true, apercu: !!g.apercu, mode: g.mode, principal: g.principal || "",
      sous: g.sous || "", actions: actions.map(function (a) { return a.id; }),
      resume: resume ? { texte: resume.texte, resteM: resume.resteM, tempsMin: resume.tempsMin } : null }
      : { visible: false };
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
    if (actions.length) {
      const boite = document.createElement("div");
      boite.className = "kta-v3d-guid-actions";
      actions.forEach(function (a, i) {
        const bt = document.createElement("button");
        bt.type = "button";
        bt.className = "kta-btn " + (i === 0 ? "kta-btn-primary" : "kta-btn-ghost") + " kta-v3d-guid-btn";
        bt.dataset.v3d = "guidAction";
        bt.dataset.guidAction = a.id;
        bt.textContent = a.label;
        boite.appendChild(bt);
      });
      b.appendChild(boite);
    }
    if (resume && G && typeof G.rendreEncart === "function") {
      const enc = document.createElement("div");
      enc.className = "kta-guid-resume kta-guid-resume-ligne";
      G.rendreEncart(enc, resume);
      b.appendChild(enc);
    }
    b.hidden = false;
    _majSousHaut();
  }

  // Bouton d'écart du bandeau (suivi) : la règle de la 2D, jouée par ItiGuidage.agir. « Je suis ici » : le picker se
  // joue sur la carte, la vue se ferme d'abord et se rouvre (au tracker recalé) une fois la position choisie ; picker
  // annulé : on reste sur la carte (comme interfaceItineraire.js > _repositionnerPuisAller).
  function _actionGuidage(id) {
    const G = window.ItiGuidage;
    if (!G || typeof G.agir !== "function") return;
    _e.bandeauCle = null;
    if (id !== "ici") { G.agir(id); _e.guidageForce = true; return; }
    fermer().then(function () {
      G.agir("ici", { apres: function () { ouvrir({}); } });
    });
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
    const l = CHEVRON.l, ep = CHEVRON.ep, haut = [0, 1, 0];
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
      if (d < 1e-6) continue;
      // Tronçon d'une galerie inclinée du niveau (ses deux bouts sur son axe) : chevrons posés sur sa pente.
      const pa = _segmentDuNiveau(road, a, b, e.niveau) ? null : _penteDuTroncon(a, b);
      if (!pa && !_segmentDuNiveau(road, a, b, e.niveau)) continue;
      const t = (s - cum) / d, ux = (b.x - a.x) / d, uz = (b.y - a.y) / d, nx = -uz, nz = ux;
      const cx = (a.x + t * (b.x - a.x)) / sc, cz = (a.y + t * (b.y - a.y)) / sc;
      // Par-dessus un remblais ou un effondrement, comme le ruban.
      const y0 = CHEVRON.y + (pa ? 0 : _dessusIti(cx, cz));
      const Y = function (x, z) { return pa ? y0 + _surPenteDe(pa, x, z).dy : y0; };
      // Pointe devant, deux branches vers l'arrière de part et d'autre.
      const px = cx + ux * l / 2, pz = cz + uz * l / 2;
      [-1, 1].forEach(function (cote) {
        const qx = cx - ux * l / 2 + cote * nx * l / 2, qz = cz - uz * l / 2 + cote * nz * l / 2;
        const bx = qx - px, bz = qz - pz, bl = Math.hypot(bx, bz), ox = -bz / bl * ep / 2, oz = bx / bl * ep / 2;
        lot.quad([px + ox, Y(px + ox, pz + oz), pz + oz], [qx + ox, Y(qx + ox, qz + oz), qz + oz],
          [qx - ox, Y(qx - ox, qz - oz), qz - oz], [px - ox, Y(px - ox, pz - oz), pz - oz], haut, col);
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

  // ── Itinéraire sur une galerie inclinée ───────────────────────────────────────────────────────────────
  // ⚠️ contrat : le tronçon de l'itinéraire qui emprunte un tracé jonction du niveau affiché (ses deux bouts dans le
  // trajet, l'un après l'autre) se dessine sur le sol de la galerie inclinée, du même ruban que le reste (liseré,
  // chevrons de sens dans le sens du trajet) ; _itiDuNiveau l'écarte des morceaux à plat. Refait avec la scène
  // (_reindexer) et avec l'itinéraire (_refaireIti).
  const BOUT_ITI = 0.3;   // m : écart toléré entre le bout d'un tracé jonction et le point du trajet (nœuds fusionnés)

  // Galerie inclinée du niveau qui porte le tronçon a → b (px, deux points du trajet), ou null.
  function _penteDuTroncon(a, b) {
    const e = _e, qa = _surPente(a.x / e.sc, a.y / e.sc, 0), qb = _surPente(b.x / e.sc, b.y / e.sc, 0);
    return qa && qb && qa.p === qb.p && qa.lat <= BOUT_ITI && qb.lat <= BOUT_ITI ? qa.p : null;
  }

  function _majItiPentes() {
    const e = _e, road = _itineraire();
    _viderGroupe(e.itiPentes);
    e.itiPentes = null;
    e.nItiPentes = 0;
    if (!road || !e.pentes || !e.pentes.length) return;
    const pts = road.points, tol = BOUT_ITI * e.sc, lot = new Lot(), cols = _couleursIti();
    const pres = function (q, P) { return !!q && Math.hypot(q.x - P[0], q.y - P[1]) <= tol; };
    e.pentes.forEach(function (p) {
      const A = p.pts[0], B = p.pts[p.pts.length - 1], n = p.pts.length - 1;
      let sens = 0;
      for (let i = 0; i < pts.length && !sens; i++) {
        if (!pres(pts[i], A)) continue;
        for (let k = Math.max(1, n - 2); k <= n + 2 && !sens; k++) {
          if (pres(pts[i + k], B)) sens = 1;
          else if (pres(pts[i - k], B)) sens = -1;
        }
      }
      if (!sens) return;
      _rubanPente(lot, p, sens, cols);
      e.nItiPentes++;
    });
    const geo = lot.geometrie();
    if (!geo) return;
    const g = new THREE.Group(), m = new THREE.Mesh(geo, e.mats.iti);
    m.renderOrder = 1;
    m.matrixAutoUpdate = false;
    m.userData.famille = "itineraire";
    g.add(m);
    e.scene.add(g);
    e.itiPentes = g;
    e.sale = true;
  }

  // Ruban de l'itinéraire sur la galerie inclinée p (sens 1 : de notre bout vers l'autre niveau) : liseré, ruban et
  // chevrons de sens tous les ITI.pas m, chaque sommet à la hauteur de la pente sous lui.
  function _rubanPente(lot, p, sens, cols) {
    const Y = function (s, dy) { return p.dY * Math.max(0, Math.min(1, s / p.tot)) + dy; };
    for (let i = 0; i + 1 < p.ptsM.length; i++) {
      const A = p.ptsM[i], B = p.ptsM[i + 1], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const nx = -dz / l, nz = dx / l, sA = p.cum[i], sB = p.cum[i + 1];
      const bandes = [[LARGEUR_ITI + 2 * ITI.lisere, ITI.y - 0.005, cols.lisere], [LARGEUR_ITI, ITI.y, cols.ruban]];
      bandes.forEach(function (b) {
        const w = b[0] / 2, yA = Y(sA, b[1]), yB = Y(sB, b[1]);
        lot.quad([A[0] + nx * w, yA, A[1] + nz * w], [B[0] + nx * w, yB, B[1] + nz * w],
          [B[0] - nx * w, yB, B[1] - nz * w], [A[0] - nx * w, yA, A[1] - nz * w], [0, 1, 0], b[2]);
      });
      for (let s = Math.ceil((sA - ITI.pas / 2) / ITI.pas) * ITI.pas + ITI.pas / 2; s < sB; s += ITI.pas) {
        if (s < sA) continue;
        const k = (s - sA) / l, cx = A[0] + dx * k, cz = A[1] + dz * k, ux = dx / l * sens, uz = dz / l * sens;
        const c = ITI.chevron, ep = ITI.ep, px = cx + ux * c / 2, pz = cz + uz * c / 2;
        const yv = function (x, z) { return Y(s + ((x - cx) * dx + (z - cz) * dz) / l, ITI.y + ITI.dy); };
        [-1, 1].forEach(function (cote) {
          const qx = cx - ux * c / 2 - cote * uz * c / 2, qz = cz - uz * c / 2 + cote * ux * c / 2;
          const bx = qx - px, bz = qz - pz, bl = Math.hypot(bx, bz), ox = -bz / bl * ep / 2, oz = bx / bl * ep / 2;
          lot.quad([px + ox, yv(px + ox, pz + oz), pz + oz], [qx + ox, yv(qx + ox, qz + oz), qz + oz],
            [qx - ox, yv(qx - ox, qz - oz), qz - oz], [px - ox, yv(px - ox, pz - oz), pz - oz], [0, 1, 0], cols.lisere);
        });
      }
    }
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
      m.position.set(r.vers.x / sc, _dessusIti(r.vers.x / sc, r.vers.y / sc), r.vers.y / sc);
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
        genre: "arrivee", y: Math.min(_dessusIti(fin.x / sc, fin.y / sc) + MARQUEUR.mat + 0.5, e.hauteur - 0.15) }));
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
    if (!montre || !_lignesSol() || typeof window.getRoadIntersections !== "function") return;
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

  // ── Surlignage 📏 Distance totale des tracés (groupe 📐, vue d'édition) ─────────────────────────────────
  // ⚠️ contrat : la 3D ne compte rien ; elle lit les tronçons COMPTÉS par la carte (interfaceDistanceTotale.js >
  // ktaDistanceTotaleSurlignage : cases du panneau, niveau de la vue) et pose un ruban au sol par segment, à la
  // couleur du surlignage 2D, dans un seul maillage hors tuiles. Refait à _reindexer et à `kta:distanceTotaleChange`
  // (panneau ouvert, case cochée, ❌ Effacer) : jamais de reconstruction de la scène. Au sol comme les rubans des
  // tracés (pas par-dessus un remblais : c'est le tracé qui est surligné, pas l'itinéraire).
  function _majDistTot() {
    const e = _e, sc = e.sc;
    if (e.distTot) {
      if (e.distTot.parent) e.distTot.parent.remove(e.distTot);
      e.distTot.geometry.dispose();
      e.distTot = null;
      e.sale = true;
    }
    e.listeDistTot = null;
    const S = typeof window.ktaDistanceTotaleSurlignage === "function" ? window.ktaDistanceTotaleSurlignage() : null;
    if (!S) return;
    const col = new THREE.Color();
    try { col.setStyle(S.couleur); } catch (err) { col.set(0xff4ecb); }
    const lot = new Lot();
    let segments = 0;
    S.troncons.forEach(function (r) {
      if (!r || !Array.isArray(r.points) || !_surNiveau(r, e.niveau)) return;
      for (let j = 0; j + 1 < r.points.length; j++) {
        const a = r.points[j], b = r.points[j + 1];
        if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
        _ruban(lot, a, b, sc, SURLIGNE.larg, SURLIGNE.y, col);
        segments++;
      }
    });
    e.listeDistTot = { couleur: S.couleur, troncons: S.troncons.length, segments: segments };
    const geo = lot.geometrie();
    if (!geo) return;
    e.distTot = new THREE.Mesh(geo, e.mats.iti);
    e.distTot.renderOrder = 1;
    e.distTot.matrixAutoUpdate = false;
    e.distTot.userData.famille = "distTot";
    e.scene.add(e.distTot);
    e.sale = true;
  }

  // ── Fiche d'un POI (la fiche de la carte, utils.js > buildPointPopupHtml) ───────────────────────────────
  // Ouverte par-dessus la scène, dans la vue : ses boutons agissent par l'écouteur unique de la carte
  // (utils.js > _ktaPopupAction, en capture sur document). ⚠️ La fiche de la carte sans ✏️ / Repositionner / 🗑️ ;
  // un POI de session dans la vue d'édition y gagne ✏️ Modifier, 📍 Déplacer et 🎯 point précis (_editionFiche),
  // 🗑️ reste sur la carte (décision produit). Photos : utils.js > attachPopupPhotos, branché sur un marqueur
  // de substitution qui n'offre que on / isPopupOpen (les deux seules méthodes qu'il appelle).

  // Calque d'un POI de calque de données : id et libellé (favoris), comme utils.js > ajouterPointsDepuisJSON.
  function _infoCalque(id) {
    if (!id) return { layerId: "data", layerLabel: "" };
    const cfg = window.PLAN_CONFIG && window.PLAN_CONFIG.dataLayers;
    const lc = Array.isArray(cfg) ? cfg.filter(function (d) { return d && d.id === id; })[0] : null;
    return { layerId: id, layerLabel: lc && lc.label ? lc.label : id };
  }

  // POI de session qui est `p` (_retrouver : une copie identique remplace l'objet sans refaire la scène, les panneaux
  // gardent l'ancien) → null pour un POI de calque.
  function _pointSession(p) { return _retrouver(_tab(window.getEditorPoints), p); }

  function _htmlFiche(p) {
    const session = !!_pointSession(p);
    const info = session ? { layerId: "editor", layerLabel: _t("editor.popup.myAdds") } : _infoCalque(p.layerId);
    return window.buildPointPopupHtml(p, false, info);   // HTML échappé par la fiche elle-même
  }

  // 🩸 Au doigt, le navigateur envoie un click après le toucher, au même point : il tombait sur la fiche qui venait de
  // s'ouvrir sous le doigt (« 🗺️ Voir sur la carte » fermait la vue). La fiche ignore le pointeur FICHE_NEUVE ms.
  const FICHE_NEUVE = 400;
  function _ficheNeuve(boite) {
    boite.classList.add("kta-v3d-fiche-neuve");
    setTimeout(function () { boite.classList.remove("kta-v3d-fiche-neuve"); }, FICHE_NEUVE);
  }

  function _ouvrirFiche(p) {
    const e = _e;
    if (!p || typeof window.buildPointPopupHtml !== "function") return false;
    _fermerFiche();
    const html = _htmlFiche(p);
    const boite = document.createElement("div");
    boite.className = "kta-v3d-fiche";
    boite.setAttribute("role", "group");
    boite.tabIndex = -1;
    boite.setAttribute("aria-label", String(p.nom || p.id || ""));
    _bouton(boite, "kta-v3d-btn-petit kta-v3d-fiche-fermer", "✕", _t("vue3d.ficheFermer"), "ficheFermer");
    const corps = document.createElement("div");
    corps.className = "kta-v3d-fiche-corps";
    corps.innerHTML = html;
    _passagesFiche(boite, p);
    _passerPlanFiche(boite, p);
    boite.appendChild(corps);
    _editionFiche(boite, p);
    e.ov.appendChild(boite);
    _ficheNeuve(boite);
    const marqueur = {
      h: {}, ouvert: true,
      on: function (type, f) { (this.h[type] = this.h[type] || []).push(f); return this; },
      isPopupOpen: function () { return this.ouvert; },
      emettre: function (type, ev) { (this.h[type] || []).forEach(function (f) { f(ev); }); }
    };
    e.fiche = { boite: boite, point: p, marqueur: marqueur, html: html };
    if (typeof window.attachPopupPhotos === "function") {
      try {
        window.attachPopupPhotos(marqueur, String(p.id || ""), p.uid);
        marqueur.emettre("popupopen", { popup: { getElement: function () { return corps; } } });
      } catch (err) { console.warn("[Vue3D] photos de la fiche :", err && err.message); }
    }
    try { boite.focus({ preventScroll: true }); } catch (err) { /* focus refusé : la fiche reste lisible */ }
    return true;
  }

  // Vue d'édition, POI de session, droit de modifier (ktaEditionRefusee : lecture seule ; un POI de calque non
  // rapatrié n'est pas en session) : Modifier ouvre le formulaire de la carte au-dessus de la vue (editor.js >
  // modifierPointEditor ; la scène suit par kta:donneesPlanChange) ; Déplacer et la précision arment le mode de pose de
  // poiPrecis.js (son bandeau, Échap / ✕), le toucher au sol le sert (_poserAuSol). La fiche se ferme d'abord.
  function _editionFiche(boite, pVu) {
    const e = _e, P = window.KtaPoiPrecis, p = _pointSession(pVu);
    if (e.vue !== "plongee" || !_permisGreffe("fiches") || !p) return;
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee(true)) return;
    const zone = document.createElement("div");
    zone.className = "kta-v3d-fiche-passages kta-v3d-fiche-edition";
    zone.setAttribute("role", "group");
    const ajout = function (act, cle, titre, ico) {
      _bouton(zone, "kta-v3d-btn-mode kta-v3d-fiche-passage", _t(cle), _t(titre), null, ico).dataset.v3dEdit = act;
    };
    ajout("modifier", "poi.editBtn", "poi.editPoint", "pencil");
    if (P) ajout("deplacer", "poiPrecis.deplacer", "poiPrecis.deplacerTitre", "move");
    if (P && P.applicable(p)) {
      const pose = !!P.lire(p);
      ajout("precis", pose ? "poiPrecis.refaire" : "poiPrecis.augmenter", "poiPrecis.titre", "crosshair");
      if (pose) ajout("precis-retirer", "poiPrecis.retirer", "poiPrecis.retirerTitre");
    }
    zone.addEventListener("click", function (ev) {
      const b = ev.target.closest && ev.target.closest("[data-v3d-edit]");
      if (!b || !_e) return;
      const act = b.dataset.v3dEdit, x = p.x, y = p.y, id = p.id;
      _fermerFiche();
      if (act === "modifier" && typeof window.modifierPointEditor === "function") window.modifierPointEditor(id, x, y);
      else if (act === "deplacer" && P) P.armer(id, x, y, "deplacer");
      else if (act === "precis" && P) P.armer(id, x, y, "precis");
      else if (act === "precis-retirer" && P) P.retirer(id, x, y);
    });
    boite.appendChild(zone);
  }

  // Mode de pose de poiPrecis.js armé (📍 Déplacer, 🎯 point précis) : le toucher au sol (_pointSol, refus hors de
  // l'image du plan comme le dessin) devient un clic de la carte à cet endroit. Pas d'aimantation : un POI n'en a
  // pas, ni sur la carte ni en dessin depuis la vue. → true si le toucher est pris.
  function _poserAuSol(cx, cy) {
    const P = window.KtaPoiPrecis;
    if (!P || !P.enCours() || !window.map || typeof window.convertCoord !== "function") return false;
    if (!_rayonEcran(cx, cy)) return true;
    const v = _pointSol();
    if (!v) { _toast(_t("vue3d.dessin.horizon"), "info"); return true; }
    if (!_dansPlan(v)) { _toast(_t("vue3d.dessin.horsPlan"), "info"); return true; }
    try { window.map.fire("click", { latlng: L.latLng(window.convertCoord(v.x, v.y)), ktaVue3D: true }); }
    catch (err) { console.warn("[Vue3D] pose au sol :", err && err.message); }
    _e.sale = true;
    return true;
  }

  // Fiche d'un POI jonction : un bouton par niveau lié (« ▼ Descendre au niveau -1 (échelle) », le plus haut
  // d'abord), d'où que l'on soit ; même arrivée que 🪜 (_allerNiveau). Ses boutons n'ont pas de data-v3d : les
  // écouteurs de la vue (_brancher) les ignorent, celui de la fiche les joue.
  function _passagesFiche(boite, p) {
    const e = _e, J = window.KtaPoiJonction;
    // POI de calque : e.passages et le panneau touché viennent de deux lectures (objets distincts, _memeObjet).
    const pas = (e.passages || []).filter(function (q) { return q.poi && _memeObjet(q.poi, p); })[0];
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

  // Liaisons inter-plan d'un point (InterPlanLinks.liaisonsDuPoint : registre et liaisons embarquées) → [] sans
  // module ou sans liaison.
  function _liaisonsPortail(p) {
    const L = window.InterPlanLinks;
    try { return p && L && typeof L.liaisonsDuPoint === "function" ? L.liaisonsDuPoint(p) || [] : []; }
    catch (err) { return []; }
  }

  // Fiche de tout point lié à un autre plan (décision produit ; le cadre lumineux reste au tag portail) : un bouton
  // « Passer au plan X » par liaison, qui passe par la mini-confirmation de la carte (InterPlanLinks.naviguerVers),
  // posée au-dessus de la vue ; confirmé, le changement de plan ferme la vue sans « Je suis ici ? »
  // (kta:avantChangementPlan, _fermerPourPlan : la liaison recale elle-même le tracker à l'arrivée). Plan absent de
  // l'appareil : bouton inactif. Sans liaison : rien.
  function _passerPlanFiche(boite, p) {
    const liens = _liaisonsPortail(p);
    if (!liens.length) return;
    const zone = document.createElement("div");
    zone.className = "kta-v3d-fiche-passages kta-v3d-fiche-portail";
    zone.setAttribute("role", "group");
    zone.setAttribute("aria-label", _t("vue3d.liaisonsPlan"));
    liens.forEach(function (l, i) {
      const txt = _t("vue3d.passerPlan", { plan: l.planName || l.planId || "?" });
      const b = _bouton(zone, "kta-v3d-btn-mode kta-v3d-fiche-passage", txt, l.dispo ? txt : _t("ipl.popup.planAbsent"),
        null);
      b.dataset.v3dPortail = String(i);
      if (!l.dispo) b.disabled = true;
    });
    zone.addEventListener("click", function (ev) {
      const b = ev.target.closest && ev.target.closest("[data-v3d-portail]");
      const l = b && !b.disabled ? liens[Number(b.dataset.v3dPortail)] : null;
      if (!l || !_e || !window.InterPlanLinks) return;
      window.InterPlanLinks.naviguerVers(l.id, l.cote);
    });
    boite.appendChild(zone);
  }

  // Changement de plan demandé pendant la vue (« Passer au plan » ou ➜ d'une fiche, confirmés) : la vue se ferme sans
  // question ni carte replacée (le plan change sous elle ; InterPlanLinks recale le tracker à l'arrivée).
  function _fermerPourPlan() {
    if (!_e) return;
    _retenirEdition(true);
    _demonter("utilisateur");
    console.log("[Vue3D] fermée : changement de plan");
  }

  // Liaisons changées pendant la vue : cadres des portails rallumés ou éteints (volume refait à l'image suivante).
  function _majPortails() {
    const e = _e;
    if (!e) return;
    (e.volPassages || []).forEach(function (v) {
      if (v.forme !== "portail" || !v.obj) return;
      if ((_liaisonsPortail(v.point).length > 0) !== !!v.allume) _libererVolume(v);
    });
    _gererVolumes();
    e.sale = true;
  }

  // ── Fiche d'une structure, d'une zone ou d'un tracé (la fiche de la carte, utils.js > attacherNotePopup) ─────
  // ⚠️ contrat : la MÊME fiche que le clic sur la carte, rejouée sur un hôte de substitution : arguments relus dans
  // le registre de la carte (utils.js > ktaFicheObjetDe), donc mêmes droits — calque de données en lecture seule,
  // copie de session d'un calque en « Modifier » modifiable, lecture seule d'une extension (ktaEditionRefusee).
  // Objet sans fiche sur la carte (calque de données sans note, dessin en cours en 2D) : titre et note en lecture
  // seule (décision produit : on voit ce qu'on touche, rien de plus n'est permis). Note, Convertir, Niveau et 🗑️
  // écrivent par la carte ; la scène suit par `kta:donneesPlanChange` (_majFicheDonnees ferme la fiche d'un objet
  // disparu). « Voir sur la carte » : _voirSurCarte.
  // 🩸 L'hôte de la fiche est un faux layer : bindPopup garde le HTML, on / closePopup / l'événement popupopen sont
  // ceux que attacherNotePopup appelle ; le corps porte .leaflet-popup-content, la racine qu'il cherche.
  const CAT_FAMILLE = { structures: "structures", zones: "zones", roads: "traces" };

  function _titreObjet(cat, type) {
    const L = window.LegendCustomization;
    if (L && typeof L.findCustomEntry === "function" && String(type).indexOf("cust-") === 0) {
      const c = L.findCustomEntry(type);
      if (c && c.label) return c.label;
    }
    return L && typeof L.getLabel === "function" ? L.getLabel(cat, type) || String(type) : String(type);
  }

  function _ouvrirFicheObjet(v) {
    const e = _e, o = v && v.obj;
    if (!o || typeof window.attacherNotePopup !== "function") return false;
    _fermerFiche();
    const cat = CAT_FAMILLE[v.famille];
    const boite = document.createElement("div");
    boite.className = "kta-v3d-fiche kta-v3d-fiche-objet";
    boite.setAttribute("role", "dialog");
    boite.tabIndex = -1;
    boite.setAttribute("aria-label", _titreObjet(cat, o.type));
    _bouton(boite, "kta-v3d-btn-petit kta-v3d-fiche-fermer", "✕", _t("vue3d.ficheFermer"), "ficheFermer");
    const corps = document.createElement("div");
    corps.className = "kta-v3d-fiche-corps leaflet-popup-content";
    boite.appendChild(corps);
    // « Voir sur la carte » : un bouton de fiche comme ceux de la note (kta-popup-btn), hors du corps que la fiche
    // réécrit à chaque ouverture.
    const ligne = document.createElement("div");
    ligne.className = "kta-popup-actions kta-v3d-fiche-voir-ligne";
    const voir = document.createElement("button");
    voir.type = "button";
    voir.className = "kta-popup-btn kta-v3d-fiche-voir";
    _poserIcone(voir, "map", _t("vue3d.voirSurCarte"));
    voir.title = _t("vue3d.voirSurCarteTitre");
    voir.dataset.v3d = "ficheVoir";
    ligne.appendChild(voir);
    boite.appendChild(ligne);
    e.ov.appendChild(boite);
    _ficheNeuve(boite);
    const fiche = { boite: boite, objet: o, famille: v.famille, session: v.session, marqueur: null };
    const hote = {
      h: {}, html: "", ouvert: true,
      bindPopup: function (html) { this.html = html; return this; },
      on: function (type, f) { (this.h[type] = this.h[type] || []).push(f); return this; },
      closePopup: function () { if (_e && _e.fiche === fiche) _fermerFiche(); },
      emettre: function (type, ev) { (this.h[type] || []).forEach(function (f) { f(ev); }); }
    };
    fiche.marqueur = hote;
    const reg = typeof window.ktaFicheObjetDe === "function" ? window.ktaFicheObjetDe(o) : null;
    const args = reg ? reg.args.slice() : [function () { return o.description; }, null,
      function () { return _titreObjet(cat, o.type); }, { mode: "readonly", pastille: { cat: cat, cle: o.type } }];
    args[3] = Object.assign({}, args[3], { horsCarte: true });   // le registre garde le layer de la carte
    fiche.registre = !!reg;
    e.fiche = fiche;
    try {
      window.attacherNotePopup.apply(null, [hote].concat(args));
      corps.innerHTML = hote.html;
      hote.emettre("popupopen", { popup: {
        setContent: function (h) { corps.innerHTML = h; },
        getElement: function () { return boite; }
      } });
    } catch (err) {
      console.warn("[Vue3D] fiche de l'objet :", err && err.message);
      _fermerFiche();
      return false;
    }
    try { boite.focus({ preventScroll: true }); } catch (err) { /* focus refusé : la fiche reste lisible */ }
    return true;
  }

  // « Voir sur la carte » : la vue se ferme (carte placée là où l'on était, « Je suis ici ? » comme ✕), puis la carte
  // montre l'objet (_montrerObjetCarte).
  function _voirSurCarte() {
    const f = _e && _e.fiche;
    if (!f || !f.objet) return;
    const famille = f.famille, o = f.objet;
    fermer();
    _montrerObjetCarte(famille, o);
  }

  // La carte montre l'objet comme après un clic dessus, le geste 2D le plus proche : centrée sur lui (dézoomée
  // seulement s'il ne tient pas à l'écran), sa fiche ouverte sur la carte s'il en a une, contour en surbrillance
  // quelques secondes (couleur d'interaction de la charte, sans clic). La 2D ne retouche pas une forme sommet par
  // sommet : sa fiche (Convertir, Niveau, 🗑️) et l'annulation sont les gestes qu'elle offre.
  // → { centre: bool, fiche: bool } (checkup).
  function _montrerObjetCarte(famille, o) {
    const map = window.map, L = window.L, out = { centre: false, fiche: false };
    if (!map || !L || typeof window.convertCoord !== "function" || !o || !Array.isArray(o.points)) return out;
    const lls = o.points.filter(function (p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); })
      .map(function (p) { return window.convertCoord(p.x, p.y); });
    if (!lls.length) return out;
    const b = L.latLngBounds(lls);
    try {
      const z = Math.min(map.getZoom(), map.getBoundsZoom(b, false, L.point(80, 80)));
      map.setView(b.getCenter(), z, { animate: false });
      out.centre = true;
    } catch (err) { console.warn("[Vue3D] carte non centrée sur l'objet :", err && err.message); }
    // 🩸 Un tracé hors de l'écran au dernier rendu n'a pas sa zone de clic sur la carte (road.js > renderRoads) :
    // rendu refait une fois la carte centrée.
    if (famille === "roads" && typeof window.renderRoads === "function") {
      try { window.renderRoads(); } catch (err) { /* la fiche ne s'ouvre pas, la surbrillance reste */ }
    }
    const ferme = famille === "zones" || (famille === "structures" && !_estLigne(o.type));
    const reg = typeof window.ktaFicheObjetDe === "function" ? window.ktaFicheObjetDe(o) : null;
    if (reg && reg.layer && reg.layer._map && typeof reg.layer.openPopup === "function") {
      try { reg.layer.openPopup(ferme ? b.getCenter() : lls[Math.floor(lls.length / 2)]); out.fiche = true; }
      catch (err) { console.warn("[Vue3D] fiche de la carte non ouverte :", err && err.message); }
    }
    let col = "";
    try { col = getComputedStyle(document.documentElement).getPropertyValue("--kta-interaction").trim(); }
    catch (err) { col = ""; }
    const style = { weight: 5, opacity: 0.95, dashArray: "7 5", fill: false, interactive: false };
    if (col) style.color = col;
    const trait = (ferme ? L.polygon : L.polyline)(lls, style).addTo(map);
    let fini = false;
    const retirer = function () {
      if (fini) return;
      fini = true;
      try { map.removeLayer(trait); } catch (err) { /* carte déjà déchargée */ }
      map.off("click", retirer);
    };
    map.on("click", retirer);
    setTimeout(retirer, SURBRILLANCE_MS);
    _derniereMontre = { famille: famille, uid: o.uid || null, centre: out.centre, fiche: out.fiche,
      trait: trait, at: Date.now() };
    return out;
  }

  // ── « Y aller en 3D » : résultat de la recherche (🔍 de la colonne, Ctrl/Cmd+K) ──────────────────────────────
  // ⚠️ contrat (décision produit) : fenêtre, portée et filtres de la recherche de la carte (searchPoints.js) ;
  // le résultat choisi est pris par la vue (SearchPoints.prendreChoix, posé à l'ouverture, retiré à la fermeture) : la
  // carte dessous ne bouge pas. La vue passe en libre (le tracker ne bouge pas), prend le niveau de l'objet s'il n'est
  // pas sur le sien (niveau de la 3D seul, comme ▲ ▼ de la vue d'édition, derrière le geste d'un passage), se place
  // devant lui et ouvre sa fiche : fiche du point, ou fiche de l'objet comme un toucher, même réglage 🗂️ coupé (le
  // choix est explicite). Cible : le point précis d'un POI (KtaPoiPrecis.cible), le milieu d'un tracé ou d'une
  // structure en ligne (à mi-longueur), le centre des sommets d'une zone ou d'une structure (celui de la carte).
  // Vue d'édition : la place à ALLER.recul[0] m de la cible, cap gardé, caméra rattachée (elle vise 2 m devant la
  // place : la cible au centre). Hauteur d'yeux : la première place libre (_coince, structures comprises) à
  // ALLER.recul m, du côté d'où l'on vient d'abord, face à la cible ; aucune : le point libre le plus proche.
  // Une greffe qui coupe les fiches (jeu) refuse : 🔍 caché, choix refusé avec un toast, la carte ne bouge pas.
  const ALLER = { recul: [2, 3.5, 5, 8], directions: 12 };
  const FAMILLE_RECHERCHE = { road: "roads", zone: "zones", structure: "structures" };

  function _rechercheDispo() { return typeof window.ouvrirRecherche === "function" && _permisGreffe("fiches"); }

  function _ouvrirRecherche() {
    if (!_e || !_rechercheDispo()) return false;
    _basculerReglages(false);
    window.ouvrirRecherche();
    return true;
  }

  // Point à mi-longueur d'une ligne (px plan).
  function _milieuLigne(pts) {
    const l = [];
    let tot = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      l.push(d); tot += d;
    }
    let r = tot / 2;
    for (let i = 1; i < pts.length; i++) {
      if (l[i - 1] > 0 && r <= l[i - 1]) {
        const t = r / l[i - 1];
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
      }
      r -= l[i - 1];
    }
    return { x: pts[0].x, y: pts[0].y };
  }

  // Niveau où aller voir `o` : celui de la vue s'il en est (zone ou POI sur plusieurs niveaux), sinon le sien (un
  // tracé jonction : son niveau de départ). null : plan à un niveau.
  function _niveauCible(o) {
    const e = _e;
    if (!Number.isInteger(e.niveau)) return null;
    let l;
    if (o.type === "jonction" && (Number.isInteger(o.fromLevel) || Number.isInteger(o.toLevel))) {
      l = [o.fromLevel, o.toLevel].filter(Number.isInteger);
    } else {
      const lv = Number.isInteger(o.level) ? o.level : 0;
      l = typeof window.ktaNiveauxObjet === "function" ? window.ktaNiveauxObjet(o) : [];
      l = [lv].concat(l.filter(function (n) { return n !== lv; }));
    }
    return l.indexOf(e.niveau) >= 0 ? e.niveau : l[0];
  }

  function _cibleRecherche(c) {
    const o = c && c.item;
    if (!o) return null;
    const ok = function (p) { return !!p && Number.isFinite(p.x) && Number.isFinite(p.y); };
    if (c.kind === "point") {
      if (!ok(o)) return null;
      const P = window.KtaPoiPrecis, q = P && typeof P.cible === "function" ? P.cible(o) : o;
      return ok(q) ? { x: q.x, y: q.y } : { x: o.x, y: o.y };
    }
    const f = FAMILLE_RECHERCHE[c.kind], pts = Array.isArray(o.points) ? o.points.filter(ok) : [];
    if (!f || !pts.length) return null;
    if (f === "roads" || (f === "structures" && _estLigne(o.type))) return _milieuLigne(pts);
    let x = 0, y = 0;
    pts.forEach(function (p) { x += p.x; y += p.y; });
    return { x: x / pts.length, y: y / pts.length };
  }

  // Place devant la cible t (px plan) → { x, y, cap }.
  function _placeDevant(t) {
    const e = _e, sc = e.sc;
    if (e.vue === "plongee") {
      const a = e.cap * Math.PI / 180, d = ALLER.recul[0] * sc;
      return { x: t.x - Math.sin(a) * d, y: t.y + Math.cos(a) * d, cap: e.cap };
    }
    const face = function (x, y) {
      return Math.hypot(t.x - x, t.y - y) < 0.05 * sc ? e.cap :
        (Math.atan2(t.x - x, -(t.y - y)) * 180 / Math.PI + 360) % 360;
    };
    const a0 = Math.atan2(e.pos.y - t.y, e.pos.x - t.x);
    for (let i = 0; i < ALLER.recul.length; i++) {
      const d = ALLER.recul[i] * sc;
      for (let k = 0; k < ALLER.directions; k++) {
        // Du côté d'où l'on vient, puis en s'en écartant de part et d'autre (0, +30°, −30°, +60°…).
        const pas = Math.ceil(k / 2) * (k % 2 ? 1 : -1), a = a0 + pas * 2 * Math.PI / ALLER.directions;
        const x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d;
        if (!_coince(x, y, true)) return { x: x, y: y, cap: face(x, y) };
      }
    }
    const p = _pointLibre(t.x, t.y, true) || { x: t.x, y: t.y };
    return { x: p.x, y: p.y, cap: face(p.x, p.y) };
  }

  // Résultat choisi (SearchPoints.prendreChoix) → true : pris (la carte ne le montre pas).
  function _choixRecherche(c) {
    if (!_e) return false;
    if (!_permisGreffe("fiches")) { _toast(_t("vue3d.rechercheGreffe"), "info"); return true; }
    allerA(c);
    return true;
  }

  // c : { kind ("point" | "road" | "zone" | "structure"), item, layerId } (le choix de la recherche). → true si la vue
  // y va (geste de niveau compris : la fiche s'ouvre à l'arrivée).
  function allerA(c) {
    const e = _e;
    if (!e || !c || !c.item || e.geste) return false;
    const t = _cibleRecherche(c);
    if (!t) { _toast(_t("vue3d.rechercheSansPlace"), "info"); return false; }
    const f = FAMILLE_RECHERCHE[c.kind];
    let o = c.item;
    // L'objet tel que la vue le lit (POI d'un calque : la recherche a pu le lire dans le fichier du calque).
    if (f) o = _retrouver(_tab(_lecteurs(f)[0]).concat(_tab(_lecteurs(f)[1])), o) || o;
    else {
      o = _retrouver(_tab(window.getEditorPoints).concat(_tab(window.getAllEmbeddedPoints)), o) ||
        (o.layerId || !c.layerId || c.layerId === "editor" ? o : Object.assign({}, o, { layerId: c.layerId }));
    }
    const n = _niveauCible(o), autre = Number.isInteger(n) && n !== e.niveau;
    _fermerFiche();
    _ajusterAnnuler();
    const arriver = function () {
      if (_e !== e) return;   // vue fermée (ou rouverte) pendant le geste
      const cfg = window.APP_CONFIG || {};
      _passerEnLibre();
      if (Number.isInteger(n)) {
        e.niveauLibre = n;
        e.actifVu = Number.isInteger(cfg.activeLevel) ? cfg.activeLevel : 0;
      }
      if (autre) {
        e.changementsNiveau++;
        console.log("[Vue3D] recherche : niveau " + n);
        _reindexer();
      }
      _rattacher();
      const p = _placeDevant(t);
      e.pos.x = p.x; e.pos.y = p.y; e.cap = p.cap;
      e.aBouge = true; e.libreBouge = true; e.sortie = null;
      if (autre) { _majPassage(); _annoncerNiveau(); }
      e.recherche = { allees: (e.recherche ? e.recherche.allees : 0) + 1, kind: c.kind, cible: { x: t.x, y: t.y },
        niveau: e.niveau, place: { x: p.x, y: p.y }, fiche: false, masque: false };
      e.sale = true;
      e.recherche.fiche = !!(f ? _ouvrirFicheObjet(_objetVu(f, o)) : _ouvrirFiche(o));
      // Objet masqué (filtre, calque, niveau décoché) : la vue y est, sa fiche se fermerait à la première relecture.
      if (f && !_retrouver((e.vus && e.vus[f]) || [], o)) {
        e.recherche.masque = true;
        _toast(_t("vue3d.rechercheMasque"), "info");
      }
    };
    if (autre && _gesteAnime) _lancerGeste(_auDessus(n, e.niveau) ? 1 : -1, arriver);
    else arriver();
    return true;
  }

  function _fermerFiche() {
    const e = _e, f = e && e.fiche;
    if (!f) return false;
    e.fiche = null;
    f.marqueur.ouvert = false;
    try { f.marqueur.emettre("popupclose", {}); } catch (err) { /* photos déjà libérées */ }
    // Focus rendu à la vue s'il était dans la fiche (sinon il tombe sur <body>, hors de la fenêtre).
    const focus = f.boite.contains(document.activeElement);
    if (f.boite.parentNode) f.boite.parentNode.removeChild(f.boite);
    if (focus) { try { e.ov.focus({ preventScroll: true }); } catch (err) { /* sans effet sur la vue */ } }
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
    // navigation = le tracker, comme son menu sur la carte ; joystick = le déplacement à la main.
    _poserIcone(b, e.mode === "suivi" ? "navigation" : "joystick",
      _t(e.mode === "suivi" ? "vue3d.etatSuivi" : "vue3d.etatLibre"));
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
    const vit = VITESSE * _facteurGreffe("vitesse") * (rapide ? FACTEUR_RAPIDE : 1);
    const av = (k.av ? 1 : 0) - (k.ar ? 1 : 0), lat = (k.dr ? 1 : 0) - (k.ga ? 1 : 0);
    const rot = (k.td ? 1 : 0) - (k.tg ? 1 : 0);
    e.rapide = !!rapide && !!(av || lat);
    if (av || lat || rot) _passerEnLibre();
    if (av || lat) _rattacher();
    if (rot) { e.cap = (e.cap + rot * ROTATION * dt + 360) % 360; e.sale = true; }
    if (av) _pas(vit * dt * av, e.cap);
    if (lat) _pas(vit * dt, e.cap + 90 * lat);
    // Joystick : un seul pas dans la direction du bouton, à sa vitesse ; course = pleine vitesse × FACTEUR_RAPIDE.
    const st = e.stick;
    if (st && st.m > 0) {
      const course = _permisGreffe("course") && st.fortDepuis > 0 && ts - st.fortDepuis > APPUI_LONG;
      _passerEnLibre();
      _rattacher();
      _pas(VITESSE * _facteurGreffe("vitesse") * (course ? FACTEUR_RAPIDE : st.m) * dt, e.cap + st.ang);
      e.rapide = e.rapide || course;
    }
    if (_trackerActif() !== e.suiviDispo) {
      if (e.mode === "suivi" && !_trackerActif()) e.mode = "libre";
      _majBoutonSuivre();
    }
    if (e.mode === "suivi") _lireTracker();
    if (e.geste) _majGeste(dt);
    _majDonnees();
    if (e.dessin) _majDessin();
    _suivrePente();
    _majPassage();
    const niv = _niveauCourant();
    // Pendant un geste, la scène attend sa bascule (au noir). Niveau changé hors passage (tracker en suivi, niveau
    // de la carte) : même fondu, sans descente ; tracker au bout d'une galerie inclinée vers ce niveau : sans fondu
    // (la caméra y est déjà à la hauteur de son sol).
    if (!e.geste) {
      const penteVers = niv !== e.niveau && e.mode === "suivi" && Number.isInteger(niv) &&
        (function () {
          const q = _surPente(e.pos.x / e.sc, e.pos.y / e.sc, PENTE.suivi);
          return !!q && q.p.autre === niv;
        })();
      if (penteVers) {
        e.pentesFranchies++;
        _reindexer();
        _annoncerNiveau();
      } else if (niv !== e.niveau && e.niveau !== null && niv !== null && _gesteAnime) {
        _lancerGeste(0, function () { _reindexer(); _annoncerNiveau(); });
      } else if (niv !== e.niveau || (e.filtresChanges && !e.donnees.signal)) {
        // Filtres changés avec des données en attente (annulation, import) : une seule reconstruction, celle de
        // _majDonnees ; données inchangées, faite ici ensuite.
        e.filtresChanges = false; e.itiChange = false; e.rondsChange = false; e.distTotChange = false;
        _reindexer();
      } else if (e.itiChange && !e.donnees.signal) {
        // Itinéraire seul changé : setRoads annonce aussi les données, leur relecture passe d'abord (elle refait
        // tout si le plan a changé avec lui) ; sinon ses tuiles et ses étapes, rien d'autre.
        e.itiChange = false;
        _refaireIti();
      }
    }
    if (e.rondsChange) { e.rondsChange = false; _majRonds(); }
    if (e.distTotChange) { e.distTotChange = false; _majDistTot(); }
    _gererTuiles(false);
    _gererVoisins(false);
    _gererVolumes();
    _majBandeauNiveau(ts);
    _majEquipe();
    _publierPosition();
    _majGuidage(ts);
    _majMiniCarte(ts);
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

  // Déplacement par la place de la touche (ev.code) : ZQSD en AZERTY comme WASD en QWERTY.
  const TOUCHES = {
    ArrowUp: "av", KeyW: "av", KeyZ: "av", ArrowDown: "ar", KeyS: "ar",
    ArrowLeft: "tg", ArrowRight: "td", KeyA: "ga", KeyQ: "ga", KeyD: "dr", KeyE: "dr"
  };
  // Vue d'édition, par le caractère tapé (ev.key) : +1 = plus près (zoom), plus verticale (inclinaison).
  const TOUCHES_ZOOM = { "+": 1, "=": 1, "-": -1, "_": -1 };
  const TOUCHES_INCLINAISON = { PageUp: 1, PageDown: -1 };
  const TOUCHE_VUE = "KeyV";   // ev.code : la même place sur toutes les dispositions

  // Touches et gestes de la vue pour la fiche des raccourcis (shortcutsCheatsheet.js), lus dans les tables ci-dessus
  // et les gestes de souris de _brancher : une touche ajoutée là s'affiche dans la fiche.
  // Rend [{ id, touches: [[jeton, …], …] (une combinaison par sous-liste), edition (vue d'édition seulement) }] ;
  // jeton = ev.code (« KeyW », « ArrowUp »), ev.key (« + », « PageUp », « Escape », « Shift », « Control », « Tab »)
  // ou geste (« Molette », « ClicDroit », « Glisser »).
  // ⚠️ contrat : scripts/smoke/checkup-raccourcis.js joue chaque ligne et vérifie son effet.
  function raccourcis() {
    const par = {};
    Object.keys(TOUCHES).forEach(function (c) { (par[TOUCHES[c]] = par[TOUCHES[c]] || []).push([c]); });
    const de = function (table, sens) {
      return Object.keys(table).filter(function (k) { return table[k] === sens; }).map(function (k) { return [k]; });
    };
    return [
      { id: "avancer", touches: par.av }, { id: "reculer", touches: par.ar },
      { id: "gauche", touches: par.ga }, { id: "droite", touches: par.dr },
      { id: "tournerGauche", touches: par.tg }, { id: "tournerDroite", touches: par.td },
      { id: "courir", touches: [["Shift"]] },
      { id: "vue", touches: [[TOUCHE_VUE]] },
      { id: "zoomPlus", touches: de(TOUCHES_ZOOM, 1), edition: true },
      { id: "zoomMoins", touches: de(TOUCHES_ZOOM, -1), edition: true },
      { id: "zoomMolette", touches: [["Molette"]], edition: true },
      { id: "inclinerPlus", touches: de(TOUCHES_INCLINAISON, 1), edition: true },
      { id: "inclinerMoins", touches: de(TOUCHES_INCLINAISON, -1), edition: true },
      { id: "inclinerMolette", touches: [["Shift", "Molette"]], edition: true },
      { id: "panner", touches: [["Glisser"]], edition: true },
      { id: "cap", touches: [["ClicDroit", "Glisser"], ["Control", "Glisser"]], edition: true },
      { id: "sommet", touches: [["ClicLong", "Glisser"]], edition: true },
      { id: "tab", touches: [["Tab"]] },
      { id: "echap", touches: [["Escape"]] }
    ].map(function (r) { return { id: r.id, touches: r.touches, edition: r.edition === true }; });
  }

  // Icône(s) SVG de l'interface (ktaIcones.js) : chaîne vide si le module manque (la vue reste utilisable).
  function _ico(noms) {
    if (typeof window.ktaIcone !== "function") return "";
    return [].concat(noms).map(function (n) { return window.ktaIcone(n); }).join("");
  }
  // Icône puis libellé (nœud texte : jamais interprété comme du HTML).
  function _poserIcone(el, noms, texte) {
    el.innerHTML = _ico(noms);
    if (texte) el.appendChild(document.createTextNode(" " + texte));
  }
  // Pour etat() (checkups) : « [nom+nom] libellé », icônes SVG lues par leur classe kta-ico-<nom>.
  function _texteIco(el) {
    if (!el) return "";
    const noms = Array.prototype.map.call(el.querySelectorAll("svg.kta-ico"), function (s) {
      const c = Array.prototype.find.call(s.classList, function (x) { return x.indexOf("kta-ico-") === 0; });
      return c ? c.slice(8) : "?";
    });
    const t = el.textContent.trim();
    return (noms.length ? "[" + noms.join("+") + "]" + (t ? " " : "") : "") + t;
  }

  // `ico` : nom(s) d'icône SVG à la place du texte ; `txt` reste le libellé écrit à côté (vide = icône seule).
  function _bouton(parent, cls, txt, titre, action, ico) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kta-v3d-btn " + cls;
    if (ico) _poserIcone(b, ico, txt); else b.textContent = txt;
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
    // ⚠️ contrat : le glyphe du bouton de la carte (☰, interface.js > ktaFilterControl), pas ≡ (U+2261).
    e.boutonFiltres = _bouton(haut, "kta-v3d-filtres", "☰", _t("ui.filter.title"), "filtres");
    e.boutonFiltres.setAttribute("aria-label", _t("ui.filter.aria"));
    e.boutonFiltres.setAttribute("data-kta-pastille-filtres", "");
    // ⚠️ contrat : même icône que la Sortie d'urgence de la barre du haut de la carte (refonteInterface.js).
    const urgence = _bouton(haut, "kta-v3d-urgence", "", _t("ui.refonte.counter_sortie_title"), "urgence",
      "siren");
    urgence.setAttribute("aria-label", _t("ui.refonte.counter_sortie_title"));
    // ⚙️ ouvre la tuile des réglages de la vue (_basculerReglages) ; point doré si l'un n'est pas celui par défaut.
    // ⚠️ contrat : même icône que Réglages de la carte (ktaIcones.js), sinon les deux barres divergent.
    e.boutonReglages = _bouton(haut, "kta-v3d-btn-reglages", "", _t("vue3d.reglages"), "reglages", "settings");
    e.boutonReglages.setAttribute("aria-expanded", "false");
    e.boutonReglages.setAttribute("aria-controls", "kta-v3d-reglages");
    // 🔍 La recherche de la carte (allerA) à hauteur d'yeux, à gauche de ⚙️ (décision produit) ; en vue d'édition, celle
    // de la tête de la colonne d'outils (_monterOutils). Montrée par _majRechercheHaut.
    e.boutonRechercheHaut = _bouton(haut, "kta-v3d-recherche", "", _t("vue3d.recherche"), "recherche", "search");
    e.boutonRechercheHaut.setAttribute("aria-keyshortcuts", "Control+K Meta+K");
    e.boutonRechercheHaut.hidden = true;
    // Tuile des réglages (décision produit : la rangée du haut tient sur une ligne au téléphone) : suivi / libre, vue,
    // hauteur et son − / +, rendu, chacun écrit en clair avec son état. Petit panneau ancré sous ⚙️.
    const tuile = document.createElement("div");
    tuile.id = "kta-v3d-reglages";
    tuile.className = "kta-v3d-reglages";
    tuile.setAttribute("role", "group");
    tuile.setAttribute("aria-label", _t("vue3d.reglages"));
    tuile.hidden = true;
    e.tuileReglages = tuile;
    e.boutonSuivre = _bouton(tuile, "kta-v3d-btn-mode kta-v3d-btn-suivre", "", _t("vue3d.suivre"), "suivre",
      "navigation");
    e.boutonVue = _bouton(tuile, "kta-v3d-btn-mode kta-v3d-vue", _t("vue3d.plongee"), _t("vue3d.plongee"), "vue",
      "pencil");
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
    // Rendu et textures des structures (🧱, réglage de cet appareil, actif par défaut) côte à côte : la tuile tient
    // au téléphone en hauteur (393 × 852 : elle finit au-dessus des boutons + − ▲ ▼ de la vue plongeante).
    const ligneRendu = document.createElement("div");
    ligneRendu.className = "kta-v3d-reglages-ligne";
    tuile.appendChild(ligneRendu);
    e.boutonRendu = _bouton(ligneRendu, "kta-v3d-btn-mode kta-v3d-btn-rendu", "", "", "rendu");
    e.boutonTextures = _bouton(ligneRendu, "kta-v3d-btn-mode kta-v3d-btn-textures", "", _t("vue3d.texturesMontrer"),
      "textures");
    const icT = document.createElement("span");
    icT.className = "kta-v3d-btn-icone";
    icT.setAttribute("aria-hidden", "true");
    icT.innerHTML = _ico("brick-wall");
    e.boutonTextures.appendChild(icT);
    e.boutonTextures.appendChild(document.createTextNode(_t("vue3d.texturesNom")));
    // Lignes au sol (rubans des tracés, liseré des galeries, ronds) : 3D seulement, l'itinéraire reste.
    const ligneSol = document.createElement("div");
    ligneSol.className = "kta-v3d-reglages-ligne";
    tuile.appendChild(ligneSol);
    e.boutonLignesSol = _bouton(ligneSol, "kta-v3d-btn-mode kta-v3d-btn-lignessol", "", _t("vue3d.lignesSolMontrer"),
      "lignesSol");
    const icLs = document.createElement("span");
    icLs.className = "kta-v3d-btn-icone";
    icLs.setAttribute("aria-hidden", "true");
    icLs.innerHTML = _ico("route");
    e.boutonLignesSol.appendChild(icLs);
    e.boutonLignesSol.appendChild(document.createTextNode(_t("vue3d.lignesSolNom")));
    e.boutonLignesSol.setAttribute("aria-pressed", _lignesSol() ? "true" : "false");
    // Boussole et mini-carte montrées ou non (réglages de cet appareil, montrées par défaut), côte à côte, même
    // raison ; guidage et fiches sur la ligne suivante.
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
    // Mini-carte : le médaillon en haut à droite (_appliquerMiniCarte).
    e.boutonMiniCarte = _bouton(ligne, "kta-v3d-btn-mode kta-v3d-btn-minicarte", "", _t("vue3d.miniCarteMontrer"),
      "miniCarte");
    const icM = document.createElement("span");
    icM.className = "kta-v3d-btn-icone";
    icM.setAttribute("aria-hidden", "true");
    icM.innerHTML = _ico("map");
    e.boutonMiniCarte.appendChild(icM);
    e.boutonMiniCarte.appendChild(document.createTextNode(_t("vue3d.miniCarteNom")));
    // Fiches des objets au toucher (structure, zone, tracé ; jamais les POI) : réglage de cet appareil, coupé par
    // défaut au doigt (config.js > getVue3DFichesObjets). Guidage (bandeau et chevrons, pas l'itinéraire) à sa gauche.
    const ligneF = document.createElement("div");
    ligneF.className = "kta-v3d-reglages-ligne";
    tuile.appendChild(ligneF);
    e.boutonGuidage = _bouton(ligneF, "kta-v3d-btn-mode kta-v3d-btn-guidage", "", _t("vue3d.guidageMontrer"),
      "guidage");
    const icG = document.createElement("span");
    icG.className = "kta-v3d-btn-icone";
    icG.setAttribute("aria-hidden", "true");
    icG.innerHTML = _ico("signpost");
    e.boutonGuidage.appendChild(icG);
    e.boutonGuidage.appendChild(document.createTextNode(_t("vue3d.guidageNom")));
    e.boutonFiches = _bouton(ligneF, "kta-v3d-btn-mode kta-v3d-btn-fiches", "", _t("vue3d.fichesMontrer"),
      "fichesObjets");
    const icF = document.createElement("span");
    icF.className = "kta-v3d-btn-icone";
    icF.setAttribute("aria-hidden", "true");
    icF.innerHTML = _ico("info");
    e.boutonFiches.appendChild(icF);
    e.boutonFiches.appendChild(document.createTextNode(_t("vue3d.fichesNom")));
    // Portée, intensité et faisceau de la lampe : curseurs libres (réglages de cet appareil : reglerPortee,
    // reglerLampe, reglerFaisceau), valeur écrite à côté ; flèches, Origine et Fin au clavier (le clavier de la vue
    // leur laisse leurs touches, _brancher). Grisés pendant une greffe qui fige les réglages (_majCurseur).
    const curseur = function (id, icone, nom, aide, b, pas, valeur) {
      const ligne = document.createElement("div");
      ligne.className = "kta-v3d-curseur";
      const lab = document.createElement("label");
      lab.className = "kta-v3d-curseur-nom";
      lab.htmlFor = id;
      _poserIcone(lab, icone, _t(nom));
      const c = document.createElement("input");
      c.type = "range";
      c.id = id;
      c.className = "kta-v3d-curseur-champ";
      c.min = String(b.min); c.max = String(b.max); c.step = String(pas);
      c.value = String(valeur);
      c.title = _t(aide);
      const val = document.createElement("span");
      val.className = "kta-v3d-curseur-valeur";
      val.setAttribute("aria-hidden", "true");   // dite par aria-valuetext du curseur
      ligne.appendChild(lab); ligne.appendChild(c); ligne.appendChild(val);
      tuile.appendChild(ligne);
      return [c, val];
    };
    const lv = _lampeEnVigueur();
    let cc = curseur("kta-v3d-portee", "telescope", "vue3d.portee", "vue3d.porteeAide", PORTEE, 1, e.distance);
    e.curseurPortee = cc[0]; e.porteeValeur = cc[1];
    cc = curseur("kta-v3d-lampe", "lightbulb", "vue3d.lampe", "vue3d.lampeAide", REGLAGE_LAMPE.intensite, 5, lv.intensite);
    e.curseurLampe = cc[0]; e.lampeValeur = cc[1];
    cc = curseur("kta-v3d-faisceau", "flashlight", "vue3d.faisceau", "vue3d.faisceauAide", REGLAGE_LAMPE.faisceau, 1,
      lv.faisceau);
    e.curseurFaisceau = cc[0]; e.faisceauValeur = cc[1];
    _majPortee();
    // Plein jour et Limiter la portée : interrupteurs (aria-pressed : reglerPleinJour, limiterPortee), comme le suivi
    // ou le guidage, côte à côte (la tuile tient au téléphone en hauteur).
    const ligneJ = document.createElement("div");
    ligneJ.className = "kta-v3d-reglages-ligne";
    tuile.appendChild(ligneJ);
    e.boutonJour = _bouton(ligneJ, "kta-v3d-btn-mode kta-v3d-btn-jour", "", _t("vue3d.lampeJour"), "pleinJour");
    const icJ = document.createElement("span");
    icJ.className = "kta-v3d-btn-icone";
    icJ.setAttribute("aria-hidden", "true");
    icJ.innerHTML = _ico("sun");
    e.boutonJour.appendChild(icJ);
    e.boutonJour.appendChild(document.createTextNode(_t("vue3d.lampeJour")));
    e.boutonLimiter = _bouton(ligneJ, "kta-v3d-btn-mode kta-v3d-btn-limiter", "", _t("vue3d.limiter"), "limiter");
    const icL = document.createElement("span");
    icL.className = "kta-v3d-btn-icone";
    icL.setAttribute("aria-hidden", "true");
    icL.innerHTML = _ico("shield");
    e.boutonLimiter.appendChild(icL);
    e.boutonLimiter.appendChild(document.createTextNode(_t("vue3d.limiterNom")));
    _majLampe();
    _majLimiter();
    // 🏗️ Niveaux montrés (reglerNiveauxVus) : trois choix côte à côte, plan multi-niveau seulement (_majNiveauxVus).
    const ligneN = document.createElement("div");
    ligneN.className = "kta-v3d-reglages-ligne kta-v3d-niveaux-vus";
    ligneN.setAttribute("role", "group");
    ligneN.setAttribute("aria-label", _t("vue3d.niveauxVusTitre"));
    tuile.appendChild(ligneN);
    const nomN = document.createElement("span");
    nomN.className = "kta-v3d-niveaux-vus-nom";
    nomN.setAttribute("aria-hidden", "true");
    _poserIcone(nomN, "m-niveaux", _t("vue3d.niveauxVusNom"));
    ligneN.appendChild(nomN);
    e.ligneNiveauxVus = ligneN;
    e.boutonsNiveauxVus = ["voisins", "tous", "mien"].map(function (k) {
      const b = _bouton(ligneN, "kta-v3d-btn-mode kta-v3d-btn-niveaux", _t("vue3d.niveauxVus." + k),
        _t("vue3d.niveauxVus." + k + "Aide"), "niveauxVus");
      b.dataset.niveauxVus = k;
      return b;
    });
    const ligneE = document.createElement("div");
    ligneE.className = "kta-v3d-reglages-ligne";
    tuile.appendChild(ligneE);
    e.ligneEstomper = ligneE;
    e.boutonEstomper = _bouton(ligneE, "kta-v3d-btn-mode kta-v3d-btn-estomper", "", _t("vue3d.estomperAide"),
      "estomper");
    const icE = document.createElement("span");
    icE.className = "kta-v3d-btn-icone";
    icE.setAttribute("aria-hidden", "true");
    icE.innerHTML = _ico("cloud-fog");
    e.boutonEstomper.appendChild(icE);
    e.boutonEstomper.appendChild(document.createTextNode(_t("vue3d.estomperNom")));
    _majNiveauxVus();
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
      ov.classList.add("kta-v3d-avec-pave");   // le bandeau de mesure passe au-dessus du pavé (css)
    }
    // Zoom et inclinaison (vue plongeante seulement) : + − à gauche de ▲ ▼, en bas à droite (la tuile ⚙️ ouverte ne
    // les recouvre pas). Ordre du DOM = ordre de tabulation : +, ▲, −, ▼ (grille de deux colonnes).
    const incl = document.createElement("div");
    incl.className = "kta-v3d-incl";
    incl.hidden = true;
    e.zoomPlus = _bouton(incl, "kta-v3d-btn-petit", "+", _t("vue3d.zoomPlus"), "zoomPlus");
    _bouton(incl, "kta-v3d-btn-petit", "▲", _t("vue3d.inclinaisonPlus"), "inclPlus");
    e.zoomMoins = _bouton(incl, "kta-v3d-btn-petit", "−", _t("vue3d.zoomMoins"), "zoomMoins");
    _bouton(incl, "kta-v3d-btn-petit", "▼", _t("vue3d.inclinaisonMoins"), "inclMoins");
    ov.appendChild(incl);
    e.boutonsIncl = incl;
    // ⌖ : caméra de la vue plongeante ramenée sur la place, au-dessus de la grille ; montré caméra détachée seulement.
    e.boutonPlace = _bouton(ov, "kta-v3d-btn-petit kta-v3d-place", "⌖", _t("vue3d.surPlace"), "place");
    e.boutonPlace.hidden = true;
    // Niveau en vue d'édition (_majNiveauEdition) : ▲ niveau ▼ à gauche, sous la rangée du haut.
    const nivE = document.createElement("div");
    nivE.className = "kta-v3d-niveau-edition";
    nivE.setAttribute("role", "group");
    nivE.setAttribute("aria-label", _t("vue3d.niveauEdition"));
    nivE.hidden = true;
    e.niveauEditionHaut = _bouton(nivE, "kta-v3d-btn-petit", "▲", _t("vue3d.niveauEditionHaut"), "niveauEditionHaut");
    e.niveauEditionValeur = document.createElement("span");
    e.niveauEditionValeur.className = "kta-v3d-niveau-edition-valeur";
    e.niveauEditionValeur.setAttribute("aria-live", "polite");
    nivE.appendChild(e.niveauEditionValeur);
    e.niveauEditionBas = _bouton(nivE, "kta-v3d-btn-petit", "▼", _t("vue3d.niveauEditionBas"), "niveauEditionBas");
    ov.appendChild(nivE);
    e.boiteNiveauEdition = nivE;
    // Bandeau de la mesure 📐 en cours (_majBandeauMesure) : en bas, entre la boussole et la grille, lu à voix haute.
    const mes = document.createElement("div");
    mes.className = "kta-v3d-mesure";
    mes.setAttribute("role", "status");
    mes.setAttribute("aria-live", "polite");
    mes.hidden = true;
    ov.appendChild(mes);
    e.bandeauMesure = mes;
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
    // Mini-carte : après la zone du joystick dans le document (agrandie au centre, elle passe au-dessus).
    _monterMiniCarte(ov);
    _appliquerGuidage();
    _appliquerFichesObjets();
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
    _monterOutils(ov);
    // 🎮 Add-ons visibles (manifeste sans `secret`, allumés dans Configuration › Add-ons) : dernière ligne de la tuile,
    // masquée tant qu'il n'y en a aucun (la rangée du haut tient sur une ligne au téléphone, décision produit).
    e.boutonAddons = _bouton(e.tuileReglages, "kta-v3d-btn-mode kta-v3d-btn-addons", _t("vue3d.addons"),
      _t("vue3d.addons"), "addons", "gamepad-2");
    e.boutonAddons.hidden = true;
    _majBoutonAddons();
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
    _majNiveauEdition();
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

  // ── Mini-carte (médaillon en haut à droite) ──────────────────────────────────────────────────────────
  // ⚠️ contrat (décision produit) : un canvas 2D dessiné à partir des objets que la scène a déjà lus (_reindexer :
  // mêmes filtres ≡ de la carte, niveau ACTIF de la 3D seulement), jamais une seconde carte Leaflet, une image du plan
  // ni une seconde caméra. Plan FIXE, nord réel en haut (sans nord calibré : le haut du plan, comme la boussole,
  // _majBoussole) ; la place = une flèche au centre qui tourne avec le cap réel, dans un cône de vue. Zones qui
  // bouchent (KtaGalerie.ZONES_BOUCHENT), structures, tracés (sans les jonctions, jamais dessinées), POI importants
  // (passage ↕ vers un autre niveau, danger, sortie : SortieUrgence.estUneSortie), itinéraire (ruban, étapes, arrivée,
  // prochaine consigne du guidage) et membres d'une extension (KtaPresences). Montrée par défaut (config.js >
  // getVue3DMiniCarte, tuile ⚙️), jamais en vue d'édition ni quand une greffe la coupe (ctx.regler({ miniCarte:
  // false })). Toucher = agrandie au centre de l'écran (sous le bandeau), toucher encore = refermée ; pincer ou la molette = rayon
  // montré (MINI_CARTE.min / max) ; aucun geste posé sur elle n'atteint la scène (_brancherMiniCarte).
  // ⚠️ contrat (css/vue3d.css) : posée sous --kta-v3d-sous-haut (rangée du haut ET bandeau de guidage visible,
  // _majSousHaut) ; sa taille cède à la hauteur qui reste, elle ne recouvre jamais le bandeau.
  // Coût : le FOND (zones, structures, tracés, POI) est dessiné une fois dans un canvas hors écran, une fenêtre de
  // MINI_CARTE.fenetre rayons autour de la place, à la résolution du médaillon, déjà tourné vers le nord : refait au
  // changement de niveau, de filtres, de données ou de légende (_reindexer), de nord, de rayon ou de taille, ou quand
  // la place approche du bord de la fenêtre. Une mise à jour pose ce fond décalé, puis l'itinéraire, les membres et la
  // flèche : au plus toutes les MINI_CARTE.ms, seulement si la place a bougé de MINI_CARTE.bouge m, tourné de
  // BRUIT_CAP ou si quelque chose a changé. Jamais un rendu three.js de plus.
  // 🩸 Pas tout le niveau d'un coup : un réseau de 2 km à la résolution d'un médaillon dépasse ce qu'un téléphone
  // accepte pour un canvas (iOS : ~16 M pixels) ; la fenêtre est plafonnée à MINI_CARTE.fondMax px de côté.
  // `rayon` (m) par défaut, bornes ; `grande` : facteur du rayon une fois agrandie ; `fenetre` : demi-côté du fond en
  // rayons montrés ; `ms` entre deux mises à jour ; `bouge` (m) ; `densite` : pixels par px CSS au plus ; `fondMax` :
  // côté du fond (px) ; `cone` : demi-angle du cône (°) ; `traitM` : largeur d'un tracé (m), jamais moins de
  // `traitPx` px CSS ; `poiPx` : rayon d'une pastille de POI (px CSS).
  const MINI_CARTE = { rayon: 30, min: 10, max: 100, grande: 2, fenetre: 3, ms: 100, bouge: 0.3, densite: 2,
    fondMax: 2048, cone: 35, traitM: 1, traitPx: 1.5, poiPx: 8, voisinAlpha: 0.35 };
  let _rayonMiniCarte = MINI_CARTE.rayon;   // retenu tant que la page vit (vue refermée puis rouverte)
  const _iconesMiniCarte = new Map();       // url → Image (icônes des POI, chargées une fois)

  function _monterMiniCarte(ov) {
    const e = _e;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kta-v3d-minicarte";
    b.setAttribute("aria-pressed", "false");
    const cv = document.createElement("canvas");
    cv.className = "kta-v3d-minicarte-canvas";
    cv.setAttribute("aria-hidden", "true");
    b.appendChild(cv);
    ov.appendChild(b);
    e.mc = { el: b, cv: cv, ctx: cv.getContext("2d"), fond: document.createElement("canvas"), fondCtx: null,
      grande: false, taille: 0, densite: 1, fondSale: true, sale: true, t: 0, x: Number.NaN, z: Number.NaN,
      cap: Number.NaN, f: null, presences: null, pinces: new Map(), pince: null, tape: null, appui: 0,
      fonds: 0, majs: 0, msFond: 0, msFondMax: 0, msMaj: 0, msMajMax: 0, msMajSomme: 0, dernieres: [],
      fleche: 0 };
    e.mc.fondCtx = e.mc.fond.getContext("2d");
    _majLibelleMiniCarte();
  }

  function _majLibelleMiniCarte() {
    const m = _e && _e.mc;
    if (!m) return;
    const t = _t(m.grande ? "vue3d.miniCarteGrande" : "vue3d.miniCarte");
    m.el.title = t;
    m.el.setAttribute("aria-label", t);
    m.el.setAttribute("aria-pressed", m.grande ? "true" : "false");
  }

  // 🩸 vue3d.js est chargé à la demande, config.js avec la page : une page ouverte avant une mise à jour garde l'ancien
  // config.js (sans le réglage) et reçoit le nouveau vue3d.js. Sans repli, le bouton se décochait sans effet et le
  // choix ne restait pas. Repli : la même clé, lue et écrite ici (config.js reste la source quand il l'a).
  function _reglageAppareil(get, set, cle) {
    return {
      lire: function () {
        if (typeof window[get] === "function") return window[get]() === true;
        try { return localStorage.getItem(cle) !== "0"; } catch (err) { return true; }
      },
      ecrire: function (oui) {
        if (typeof window[set] === "function") { window[set](oui); return; }
        try { localStorage.setItem(cle, oui ? "1" : "0"); } catch (err) { /* stockage refusé : la session seule */ }
      }
    };
  }
  const _regMiniCarte = _reglageAppareil("getVue3DMiniCarte", "setVue3DMiniCarte", "myktamap_v3d_minicarte_v1");
  const _regLignesSol = _reglageAppareil("getVue3DLignesSol", "setVue3DLignesSol", "myktamap_v3d_lignessol_v1");

  function _miniCarteVoulue() { return _regMiniCarte.lire(); }

  // Montrée = réglage de l'appareil, hors vue d'édition, permise par la greffe. Masquée, elle se referme.
  function _appliquerMiniCarte() {
    const e = _e;
    if (!e || !e.mc) return false;
    const voulue = _miniCarteVoulue(), oui = voulue && e.vue !== "plongee" && _permisGreffe("miniCarte");
    if (e.boutonMiniCarte) e.boutonMiniCarte.setAttribute("aria-pressed", voulue ? "true" : "false");
    if (!oui && e.mc.grande) _agrandirMiniCarte(false);
    e.mc.el.hidden = !oui;
    e.mc.sale = true;
    return oui;
  }

  function _basculerMiniCarte() {
    const e = _e;
    if (!e) return null;
    const oui = !_miniCarteVoulue();
    _regMiniCarte.ecrire(oui);
    _appliquerMiniCarte();
    return oui;
  }

  function _agrandirMiniCarte(oui) {
    const m = _e && _e.mc;
    if (!m) return false;
    const v = typeof oui === "boolean" ? oui : !m.grande;
    m.grande = v;
    m.el.classList.toggle("kta-v3d-minicarte-grande", v);
    m.sale = true;
    _majLibelleMiniCarte();
    return v;
  }

  // Rayon montré (m) : borné, retenu pour la page.
  function _reglerRayonMiniCarte(r) {
    if (!Number.isFinite(r)) return _rayonMiniCarte;
    _rayonMiniCarte = Math.max(MINI_CARTE.min, Math.min(MINI_CARTE.max, r));
    if (_e && _e.mc) _e.mc.sale = true;
    return _rayonMiniCarte;
  }

  // Objets du niveau (_reindexer, `d` = _collecter, filtres appliqués) en mètres, avec leur emprise ; fond à refaire.
  function _donneesMiniCarte(d) {
    const e = _e, sc = e.sc, B = (window.KtaGalerie && window.KtaGalerie.ZONES_BOUCHENT) || {};
    const SU = window.SortieUrgence, formes = [], pois = [];
    const forme = function (o, cat, ferme, voisin) {
      const pts = [];
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < o.points.length; i++) {
        const q = o.points[i];
        if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
        const x = q.x / sc, z = q.y / sc;
        pts.push(x, z);
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
      if (pts.length < 4) return;
      formes.push({ cat: cat, cle: o.type, pts: pts, ferme: ferme, x0: x0, z0: z0, x1: x1, z1: z1,
        voisin: voisin || null });
    };
    // Niveaux voisins (celui du dessus et celui du dessous, ordre de ▲▼ : _niveauxEdition), mêmes filtres que la
    // carte : structures et tracés seulement, dessinés estompés SOUS le niveau actif (_dessinerFondMiniCarte).
    const ln = _niveauxEdition(), iN = ln.indexOf(e.niveau);
    if (iN >= 0) {
      [[ln[iN - 1], "dessus"], [ln[iN + 1], "dessous"]].forEach(function (v) {
        if (!Number.isInteger(v[0])) return;
        const dv = _collecter(v[0]);
        dv.structures.forEach(function (o) { forme(o, "structures", !_estLigne(o.type), v[1]); });
        dv.roads.forEach(function (r) {
          if (r.type !== "itinerary" && r.type !== "jonction") forme(r, "traces", false, v[1]);
        });
      });
    }
    d.zones.forEach(function (z) { if (B[z.type]) forme(z, "zones", true); });
    d.structures.forEach(function (s) { forme(s, "structures", !_estLigne(s.type)); });
    d.roads.forEach(function (r) { if (r.type !== "itinerary" && r.type !== "jonction") forme(r, "traces", false); });
    d.points.forEach(function (p) {
      const vrai = p._v3dJonction || p;
      let genre = null;
      if (_estPassage(vrai)) genre = "passage";
      else if (_estDanger(vrai)) genre = "danger";
      else if (SU && typeof SU.estUneSortie === "function" && SU.estUneSortie(vrai)) genre = "sortie";
      pois.push({ x: p.x / sc, z: p.y / sc, genre: genre || "autre", p: vrai });
    });
    // Les POI ordinaires d'abord : passages, dangers et sorties sont dessinés par-dessus.
    pois.sort(function (a, b) { return (a.genre === "autre" ? 0 : 1) - (b.genre === "autre" ? 0 : 1); });
    e.mcDonnees = { formes: formes, pois: pois };
    if (e.mc) e.mc.fondSale = true;
  }

  // Itinéraire du niveau (_itiDuNiveau : morceaux avec leurs abscisses en px) et ses marqueurs, en mètres.
  function _itiMiniCarte(morceaux) {
    const e = _e, sc = e.sc, road = _itineraire(), marques = [];
    const auNiveau = function (n) { return e.niveau === null || n === e.niveau; };
    if (road) {
      (Array.isArray(road.raccords) ? road.raccords : []).forEach(function (r) {
        if (!r || r.role !== "etape" || !r.vers || !Number.isFinite(r.vers.x)) return;
        if (auNiveau(_niveauPointIti(road, r.vers.x, r.vers.y))) {
          marques.push({ x: r.vers.x / sc, z: r.vers.y / sc, genre: "etape" });
        }
      });
      const pts = road.points.filter(function (q) { return q && Number.isFinite(q.x) && Number.isFinite(q.y); });
      const fin = pts[pts.length - 1], defaut = Number.isInteger(road.level) ? road.level : 0;
      if (fin && auNiveau(Number.isInteger(fin.level) ? fin.level : defaut)) {
        marques.push({ x: fin.x / sc, z: fin.y / sc, genre: "arrivee" });
      }
    }
    e.mcIti = { morceaux: (morceaux || []).map(function (r) {
      const pts = [], abs = [];
      r.points.forEach(function (q, i) {
        if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) return;
        pts.push(q.x / sc, q.y / sc);
        abs.push(r.abscisses ? r.abscisses[i] : 0);
      });
      return { pts: pts, abs: abs };
    }), marques: marques };
    if (e.mc) e.mc.sale = true;
  }

  // Point (m) de l'itinéraire du niveau à l'abscisse `s` (px depuis le début du trajet), null hors des morceaux.
  function _pointItiMiniCarte(s) {
    const it = _e.mcIti;
    if (!it || !Number.isFinite(s)) return null;
    for (let k = 0; k < it.morceaux.length; k++) {
      const m = it.morceaux[k], a = m.abs;
      for (let i = 0; i + 1 < a.length; i++) {
        if (s < a[i] || s > a[i + 1]) continue;
        const u = a[i + 1] > a[i] ? (s - a[i]) / (a[i + 1] - a[i]) : 0;
        return { x: m.pts[2 * i] + (m.pts[2 * i + 2] - m.pts[2 * i]) * u,
          z: m.pts[2 * i + 1] + (m.pts[2 * i + 3] - m.pts[2 * i + 1]) * u };
      }
    }
    return null;
  }

  function _iconeMiniCarte(p) {
    let url = null;
    try {
      url = typeof window.getIconUrlForPoint === "function" ? window.getIconUrlForPoint(p) : null;
    } catch (err) { url = null; }
    if (!url) return null;
    let img = _iconesMiniCarte.get(url);
    if (!img) {
      img = new Image();
      img.decoding = "async";
      // Arrivée après le dessin du fond : il est refait à la prochaine mise à jour.
      img.onload = function () { if (_e && _e.mc) _e.mc.fondSale = true; };
      img.src = url;
      _iconesMiniCarte.set(url, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  function _rayonMontre() { return _rayonMiniCarte * (_e.mc.grande ? MINI_CARTE.grande : 1); }

  // Matrice monde (m) → pixels d'un canvas de côté `cote`, centré sur (cx, cz), nord réel en haut, `k` px / m.
  function _matriceMiniCarte(cx, cz, k, cote) {
    const n = -(Number(_e.nord) || 0) * Math.PI / 180, a = k * Math.cos(n), b = k * Math.sin(n);
    return [a, b, -b, a, cote / 2 - cx * a + cz * b, cote / 2 - cx * b - cz * a];
  }

  // Fond de la fenêtre autour de la place : zones, structures, tracés (en mètres), puis POI droits (en pixels).
  function _dessinerFondMiniCarte() {
    const e = _e, m = e.mc, t0 = performance.now(), D = e.mcDonnees || { formes: [], pois: [] };
    const k = m.taille / (2 * _rayonMontre());
    const cote = Math.min(MINI_CARTE.fondMax, Math.ceil(m.taille * MINI_CARTE.fenetre));
    if (m.fond.width !== cote) { m.fond.width = cote; m.fond.height = cote; }
    const cx = e.pos.x / e.sc, cz = e.pos.y / e.sc, M = _matriceMiniCarte(cx, cz, k, cote), ctx = m.fondCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cote, cote);
    // Emprise de la fenêtre tournée : son cercle circonscrit, en mètres.
    const r = cote / 2 / k * Math.SQRT2;
    const styles = new Map();
    const style = function (cat, cle) {
      const c = cat + "|" + cle;
      if (!styles.has(c)) {
        styles.set(c, typeof window.ktaResolveStyle === "function" ? window.ktaResolveStyle(cat, cle, { flat: true })
          : null);
      }
      return styles.get(c) || {};
    };
    const trait = Math.max(MINI_CARTE.traitM, MINI_CARTE.traitPx * m.densite / k);
    ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    let n = 0;
    // Niveaux voisins d'abord, en contour estompé (dessous en tirets) : le niveau actif se lit par-dessus.
    const jv = _jetonsSombres();
    D.formes.forEach(function (f) {
      if (!f.voisin || f.x1 < cx - r || f.x0 > cx + r || f.z1 < cz - r || f.z0 > cz + r) return;
      const p = f.pts;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      if (f.ferme) ctx.closePath();
      ctx.globalAlpha = MINI_CARTE.voisinAlpha;
      ctx.strokeStyle = f.voisin === "dessus" ? jv.interaction : jv.neutre;
      ctx.lineWidth = trait * 0.6;
      ctx.setLineDash(f.voisin === "dessous" ? [trait * 1.5, trait * 1.5] : []);
      ctx.stroke();
      n++;
    });
    ctx.setLineDash([]);
    // Ordre de la carte : zones, puis structures, puis tracés par-dessus.
    ["zones", "structures", "traces"].forEach(function (cat) {
      D.formes.forEach(function (f) {
        if (f.voisin || f.cat !== cat || f.x1 < cx - r || f.x0 > cx + r || f.z1 < cz - r || f.z0 > cz + r) return;
        const s = style(cat, f.cle), p = f.pts;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
        if (f.ferme) {
          ctx.closePath();
          ctx.globalAlpha = Number.isFinite(s.fillOpacity) ? s.fillOpacity : 0.8;
          ctx.fillStyle = s.fillColor || s.color || "#888888";
          ctx.fill();
        } else {
          ctx.globalAlpha = Number.isFinite(s.opacity) ? s.opacity : 1;
          ctx.strokeStyle = s.color || s.fillColor || "#888888";
          ctx.lineWidth = cat === "traces" ? trait : trait * 0.6;
          ctx.stroke();
        }
        n++;
      });
    });
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const j = _jetonsSombres(), rp = MINI_CARTE.poiPx * m.densite;
    const bords = { passage: _couleurJonction(j), danger: j.erreur, sortie: j.ok, autre: j.neutre };
    D.pois.forEach(function (q) {
      const u = M[0] * q.x + M[2] * q.z + M[4], v = M[1] * q.x + M[3] * q.z + M[5];
      if (u < -rp || v < -rp || u > cote + rp || v > cote + rp) return;
      ctx.beginPath(); ctx.arc(u, v, rp, 0, Math.PI * 2);
      ctx.fillStyle = j.fond; ctx.fill();
      ctx.lineWidth = Math.max(1, 1.5 * m.densite); ctx.strokeStyle = bords[q.genre]; ctx.stroke();
      const img = _iconeMiniCarte(q.p);
      if (img) {
        try { ctx.drawImage(img, u - rp * 0.7, v - rp * 0.7, rp * 1.4, rp * 1.4); } catch (err) { /* illisible */ }
      }
      if (q.genre === "passage") {
        // ↕ dans une pastille au coin : le passage vers un autre niveau (même marque que le panneau, _panneau).
        const bx = u + rp * 0.8, by = v - rp * 0.8, br = rp * 0.55;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = bords.passage; ctx.fill();
        ctx.fillStyle = j.fond; ctx.font = "700 " + Math.round(br * 1.6) + "px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("↕", bx, by + 1);
      }
      n++;
    });
    m.f = { x: cx, z: cz, k: k, cote: cote, nord: Number(e.nord) || 0, demi: cote / 2 / k, objets: n };
    m.fondSale = false;
    m.fonds++;
    m.msFond = performance.now() - t0;
    m.msFondMax = Math.max(m.msFondMax, m.msFond);
  }

  // Mise à jour du médaillon, depuis _image : rien si masquée, trop tôt ou si rien n'a bougé.
  function _majMiniCarte(ts) {
    const e = _e, m = e.mc;
    if (!m || m.el.hidden || e.perdu) return;
    if (ts - m.t < MINI_CARTE.ms) return;
    const P = window.KtaPresences, pv = P && typeof P.version === "function" ? P.version() : null;
    if (pv !== m.presences) { m.presences = pv; m.sale = true; }
    // Taille du médaillon (CSS, agrandi ou non, réduit par la place qui reste) : canvas à la densité de l'écran.
    const css = m.el.clientWidth, densite = Math.min(MINI_CARTE.densite, window.devicePixelRatio || 1);
    const taille = Math.round(css * densite);
    if (!taille) return;
    if (taille !== m.taille) {
      m.taille = taille; m.densite = densite; m.cv.width = taille; m.cv.height = taille;
      m.fondSale = true; m.sale = true;
    }
    const x = e.pos.x / e.sc, z = e.pos.y / e.sc;
    const dc = Math.abs(((e.cap - m.cap + 540) % 360) - 180);
    const bouge = !(Math.hypot(x - m.x, z - m.z) < MINI_CARTE.bouge) || !(dc < BRUIT_CAP);
    if (!bouge && !m.sale && !m.fondSale) return;
    const t0 = performance.now();
    m.t = ts;
    const R = _rayonMontre(), k = taille / (2 * R), f = m.f;
    // Fond à refaire : signalé, nord ou échelle changés (pas pendant un pincement : le fond est mis à l'échelle), ou
    // place trop près du bord de la fenêtre pour y tenir le disque montré.
    if (!f || m.fondSale || f.nord !== (Number(e.nord) || 0) || (!m.pince && Math.abs(f.k / k - 1) > 0.01) ||
        Math.hypot(x - f.x, z - f.z) > f.demi - R * Math.SQRT2) {
      _dessinerFondMiniCarte();
    }
    _peindreMiniCarte(x, z, k);
    m.x = x; m.z = z; m.cap = e.cap; m.sale = false;
    m.majs++;
    m.msMaj = performance.now() - t0;
    m.msMajMax = Math.max(m.msMajMax, m.msMaj);
    m.msMajSomme += m.msMaj;
    m.dernieres.push(m.msMaj);
    if (m.dernieres.length > 30) m.dernieres.shift();
  }

  function _peindreMiniCarte(x, z, k) {
    const e = _e, m = e.mc, ctx = m.ctx, S = m.taille, f = m.f, j = _jetonsSombres(), d = m.densite;
    const ruban = _couleursIti().hexRuban;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.clip();
    ctx.globalAlpha = 0.9; ctx.fillStyle = j.fond; ctx.fillRect(0, 0, S, S); ctx.globalAlpha = 1;
    // Fond posé sous la place : son point (x, z) au centre, mis à l'échelle si le rayon a changé depuis.
    const Mf = _matriceMiniCarte(f.x, f.z, f.k, f.cote), s = k / f.k;
    const u = Mf[0] * x + Mf[2] * z + Mf[4], v = Mf[1] * x + Mf[3] * z + Mf[5];
    ctx.setTransform(s, 0, 0, s, S / 2 - u * s, S / 2 - v * s);
    ctx.drawImage(m.fond, 0, 0);
    const M = _matriceMiniCarte(x, z, k, S);
    ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
    // Itinéraire : ruban de la couleur de celui de la scène, liseré sombre (lisible sur un tracé de même teinte).
    const it = e.mcIti;
    if (it && it.morceaux.length) {
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      [[j.fond, 4], [ruban, 2.2]].forEach(function (c) {
        ctx.strokeStyle = c[0];
        ctx.lineWidth = c[1] * d / k;
        ctx.beginPath();
        it.morceaux.forEach(function (mo) {
          const p = mo.pts;
          for (let i = 0; i + 1 < p.length; i += 2) {
            if (i === 0) ctx.moveTo(p[i], p[i + 1]); else ctx.lineTo(p[i], p[i + 1]);
          }
        });
        ctx.stroke();
      });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const rond = function (qx, qz, r, fond, bord, lw) {
      const px = M[0] * qx + M[2] * qz + M[4], py = M[1] * qx + M[3] * qz + M[5];
      ctx.beginPath(); ctx.arc(px, py, r * d, 0, Math.PI * 2);
      if (fond) { ctx.fillStyle = fond; ctx.fill(); }
      if (bord) { ctx.lineWidth = lw * d; ctx.strokeStyle = bord; ctx.stroke(); }
      return [px, py];
    };
    if (it) {
      it.marques.forEach(function (q) {
        const p = rond(q.x, q.z, q.genre === "arrivee" ? 6 : 4.5, ruban, j.fond, 1.5);
        if (q.genre === "arrivee") {
          ctx.fillStyle = j.fond; ctx.font = "700 " + Math.round(8 * d) + "px system-ui, -apple-system, sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("⚑", p[0], p[1] + 0.5);
        }
      });
      // Prochaine consigne du guidage (le point que visent les chevrons) : anneau doré.
      const c = _pointItiMiniCarte(e.mcCible);
      if (c) rond(c.x, c.z, 6, null, j.accent, 2.5);
    }
    // Membres d'une extension au niveau affiché (place en direct, rien sans extension).
    const P = window.KtaPresences;
    if (P && typeof P.liste === "function") {
      let liste = [];
      try { liste = P.liste() || []; } catch (err) { liste = []; }
      liste.forEach(function (p) {
        if (typeof P.personneMasquee === "function" && P.personneMasquee(p.id)) return;
        if (e.niveau !== null && Number.isInteger(p.niveau) && p.niveau !== e.niveau) return;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        const col = p.couleur || (typeof P.couleurDe === "function" ? P.couleurDe(p.id) : j.interaction);
        rond(p.x / e.sc, p.y / e.sc, 4.5, col, j.fond, 1.5);
      });
    }
    // Place : cône de vue puis flèche, tournés du cap RÉEL (cap plan − nord, comme la rose).
    const reel = ((e.cap - (Number(e.nord) || 0)) % 360 + 360) % 360;
    ctx.translate(S / 2, S / 2);
    ctx.rotate(reel * Math.PI / 180);
    const cone = MINI_CARTE.cone * Math.PI / 180, rc = Math.min(S * 0.32, 48 * d);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rc, -Math.PI / 2 - cone, -Math.PI / 2 + cone); ctx.closePath();
    ctx.globalAlpha = 0.22; ctx.fillStyle = j.accent; ctx.fill(); ctx.globalAlpha = 1;
    const L = 10 * d;
    ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(L * 0.7, L * 0.75); ctx.lineTo(0, L * 0.35);
    ctx.lineTo(-L * 0.7, L * 0.75); ctx.closePath();
    ctx.fillStyle = j.accent; ctx.fill();
    ctx.lineWidth = 1.5 * d; ctx.strokeStyle = j.fond; ctx.stroke();
    ctx.restore();
    m.fleche = reel;
  }

  // Gestes sur le médaillon : un toucher bref l'agrandit ou le referme, deux doigts règlent le rayon, la molette
  // aussi. ⚠️ contrat : rien n'atteint la scène, le joystick ni les gestes de la vue (propagation arrêtée, touch-action
  // none) ; un glisser d'un doigt ne fait rien (le plan reste centré sur la place).
  function _brancherMiniCarte(on) {
    const e = _e, m = e.mc, el = m.el;
    const stop = function (ev) { ev.stopPropagation(); };
    const ecart = function () {
      const it = m.pinces.values(), p = it.next().value, q = it.next().value;
      return Math.hypot(q.x - p.x, q.y - p.y);
    };
    on(el, "pointerdown", function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      m.appui = performance.now();
      m.tape = m.pinces.size ? null : { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: ev.timeStamp };
      m.pinces.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      try { el.setPointerCapture(ev.pointerId); } catch (err) { /* pointeur synthétique ou déjà relâché */ }
      if (m.pinces.size === 2) m.pince = { d0: ecart(), r0: _rayonMiniCarte };
    });
    on(el, "pointermove", function (ev) {
      ev.stopPropagation();
      const p = m.pinces.get(ev.pointerId);
      if (!p) return;
      p.x = ev.clientX; p.y = ev.clientY;
      if (m.tape && Math.hypot(ev.clientX - m.tape.x, ev.clientY - m.tape.y) > TAPE.bouge) m.tape = null;
      if (m.pince && m.pinces.size >= 2) {
        const d = ecart();
        if (d > 1) _reglerRayonMiniCarte(m.pince.r0 * m.pince.d0 / d);
      }
    });
    const lever = function (ev) {
      ev.stopPropagation();
      if (!m.pinces.delete(ev.pointerId)) return;
      const t = m.tape;
      if (ev.type === "pointerup" && t && t.id === ev.pointerId && ev.timeStamp - t.t < TAPE.ms) _agrandirMiniCarte();
      m.tape = null;
      if (m.pinces.size < 2 && m.pince) { m.pince = null; m.sale = true; }
    };
    on(el, "pointerup", lever);
    on(el, "pointercancel", lever);
    // Entrée / Espace (le navigateur n'envoie qu'un click) ; le click qui suit un toucher est ignoré (déjà joué).
    on(el, "click", function (ev) {
      ev.stopPropagation();
      if (performance.now() - m.appui < APPUI_CLIC) return;
      _agrandirMiniCarte();
    });
    on(el, "wheel", function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      _reglerRayonMiniCarte(_rayonMiniCarte * (ev.deltaY > 0 ? 1.15 : 1 / 1.15));
    }, { passive: false });
    ["touchstart", "touchmove", "contextmenu", "dblclick"].forEach(function (t) { on(el, t, stop); });
  }

  function _libererMiniCarte() {
    const m = _e && _e.mc;
    if (!m) return;
    // 🩸 iOS ne rend la mémoire d'un canvas qu'à sa remise à 0 × 0, pas quand il quitte le document.
    m.fond.width = m.fond.height = 0;
    m.cv.width = m.cv.height = 0;
  }

  function _etatMiniCarte() {
    const e = _e, m = e.mc;
    if (!m) return null;
    const r = m.el.getBoundingClientRect(), fm = e.mcDonnees ? e.mcDonnees.formes : [];
    return { montree: !m.el.hidden, voulue: _miniCarteVoulue(), grande: m.grande, rayon: _rayonMiniCarte,
      rayonMontre: _rayonMontre(), nordFond: m.f ? m.f.nord : null, fleche: +m.fleche.toFixed(1),
      fonds: m.fonds, majs: m.majs, objets: m.f ? m.f.objets : 0, coteFond: m.f ? m.f.cote : 0, taille: m.taille,
      msFond: +m.msFond.toFixed(2), msFondMax: +m.msFondMax.toFixed(2), msMaj: +m.msMaj.toFixed(2),
      msMajMax: +m.msMajMax.toFixed(2), msMajMoy: m.majs ? +(m.msMajSomme / m.majs).toFixed(3) : 0,
      msDernieres: m.dernieres.map(function (v) { return +v.toFixed(2); }),
      pois: e.mcDonnees ? e.mcDonnees.pois.map(function (q) { return q.genre; }) : [],
      formes: fm.filter(function (f) { return !f.voisin; }).length,
      voisins: fm.filter(function (f) { return f.voisin; }).map(function (f) { return f.voisin; }),
      iti: e.mcIti ? { morceaux: e.mcIti.morceaux.length, marques: e.mcIti.marques.length,
        cible: !!_pointItiMiniCarte(e.mcCible) } : null,
      boite: { x: r.left, y: r.top, w: r.width, h: r.height } };
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

  // Fiches des structures, zones et tracés au toucher (config.js > getVue3DFichesObjets), lu à chaque toucher.
  function _fichesObjets() {
    return typeof window.getVue3DFichesObjets !== "function" || window.getVue3DFichesObjets() === true;
  }
  function _appliquerFichesObjets() {
    const e = _e, oui = _fichesObjets();
    if (e.boutonFiches) e.boutonFiches.setAttribute("aria-pressed", oui ? "true" : "false");
    return oui;
  }
  function _basculerFichesObjets() {
    if (!_e) return null;
    if (typeof window.setVue3DFichesObjets === "function") window.setVue3DFichesObjets(!_fichesObjets());
    return _appliquerFichesObjets();
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
  // Lignes au sol montrées (config.js > getVue3DLignesSol, montrées par défaut). ⚠️ contrat : 3D seulement ; les
  // tracés restent dans les filtres ≡, sur la carte 2D, sur la mini-carte, dans les tubes des galeries et dans le pas.
  // L'itinéraire (ruban, chevrons) n'est jamais masqué par cette option.
  function _lignesSol() { return _regLignesSol.lire(); }

  function _basculerLignesSol() {
    const e = _e;
    if (!e) return null;
    const oui = !_lignesSol();
    _regLignesSol.ecrire(oui);
    if (e.boutonLignesSol) e.boutonLignesSol.setAttribute("aria-pressed", oui ? "true" : "false");
    if (e.tuiles) _refaireTuiles();
    _majRonds();
    e.sale = true;
    return oui;
  }

  function _basculerTextures() {
    const e = _e;
    if (!e) return null;
    const oui = !_texturesActives();
    if (typeof window.setVue3DTextures === "function") window.setVue3DTextures(oui);
    e.textures = oui;
    if (e.mats) { _grainSol(e.mats, oui); e.sale = true; }
    if (e.tuiles) _refaireTuiles();
    _appliquerTextures();
    return oui;
  }

  // Pastille du mode, hors de la tuile. ⚠️ contrat (décision produit) : aucun repère sur ⚙️, même quand un réglage
  // n'est pas celui par défaut (le ≡ garde le sien : un filtre actif cache des objets).
  function _majRepere() {
    const e = _e;
    if (!e || !e.boutonReglages) return;
    const titre = _t("vue3d.reglages");
    e.boutonReglages.title = titre;
    e.boutonReglages.setAttribute("aria-label", titre);
    if (e.indicMode) {
      const suivi = e.mode === "suivi", txt = _t(suivi ? "vue3d.etatSuivi" : "vue3d.etatLibre");
      e.indicMode.innerHTML = _ico(suivi ? "navigation" : "joystick");
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

  // Hauteur de galerie d'un niveau (null : plan à un niveau), défaut sans config.js.
  function _hauteurDuNiveau(niveau) {
    const v = typeof window.getNiveauVertical === "function" ? window.getNiveauVertical(niveau).hauteurM : null;
    return v > 0 ? v : HAUTEUR_DEFAUT;
  }

  // Niveau changé (ou hauteur réglée ailleurs, ⛏️) : la scène prend la hauteur de son niveau avant d'être refaite.
  function _prendreHauteurDuNiveau() {
    const e = _e, h = _hauteurDuNiveau(e.niveau);
    if (h === e.hauteur) return;
    e.hauteur = h;
    e.oeil = _oeil(h);
    e.chevSig = null;
    if (e.boutonHauteur) _majHauteur();
  }

  function _oeil(h) { return Math.min(OEIL, Math.max(0.4, h * 0.8)); }

  // (décision produit) Plan multi-niveau : ⛏️ montre la hauteur du niveau sans la régler. Elle se règle par niveau
  // dans Réglages (profondeurNiveaux.js) : la changer ici recalculerait les pentes des jonctions qui y arrivent.
  // reglerHauteur (API des checkups) reste ouverte : elle écrit la même préférence que Réglages.
  function _hauteurFigee() { return (window.APP_CONFIG || {}).multiLevel === true; }

  function _majHauteur() {
    const e = _e, txt = typeof window.formatDistance === "function" ? window.formatDistance(e.hauteur, 1)
      : e.hauteur.toFixed(1) + " m";
    // Icône de l'outil Volume exploité, dont c'est le même chiffre (↕ dit déjà « passage entre niveaux » en 2D).
    if (e.boutonHauteur) {
      _poserIcone(e.boutonHauteur, "pickaxe", txt);
      const fige = _hauteurFigee(), titre = _t(fige ? "vue3d.hauteurNiveaux" : "vue3d.hauteur");
      e.boutonHauteur.disabled = fige;
      e.boutonHauteur.title = titre;
      e.boutonHauteur.setAttribute("aria-label", titre);
      if (fige && e.reglageHauteur && !e.reglageHauteur.hidden) _basculerReglageHauteur();
    }
    if (e.hauteurValeur) e.hauteurValeur.textContent = txt;
    if (e.hauteurMoins) e.hauteurMoins.disabled = e.hauteur <= HAUTEUR_REGLAGE.min;
    if (e.hauteurPlus) e.hauteurPlus.disabled = e.hauteur >= HAUTEUR_REGLAGE.max;
  }

  function _basculerReglageHauteur() {
    const e = _e, r = e.reglageHauteur;
    if (!r || (r.hidden && _hauteurFigee())) return;   // multi-niveau : se referme, ne s'ouvre pas
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
    if (typeof window.setHauteurNiveau === "function") window.setHauteurNiveau(e.niveau, v);
    if (v !== e.hauteur) {
      e.hauteur = v;
      e.oeil = _oeil(v);
      // Galeries inclinées : leur hauteur de départ (et leur dénivelé sans sols) suit celle du niveau.
      e.pentes = _pentesDuNiveau(e.niveau, e.jonctions || []);
      e.volPassages = (e.volPassages || []).filter(function (q) {
        if (q.genre === "pente") _libererVolume(q);
        return q.genre !== "pente";
      }).concat(_volumesPentes());
      _refaireTuiles();
      _majMarqueursIti();   // étapes et 🏁 posées sur un volume : elles suivent sa hauteur
      _majItiPentes();
      e.chevSig = null;
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

  // Touche tapée dans un champ de la fiche (note, niveau) ?
  function _champFiche(ev) {
    return !!(ev.target && ev.target.closest && ev.target.closest(".kta-v3d-fiche textarea, .kta-v3d-fiche select"));
  }

  // Raccourci de la carte (shortcuts.js : E M Z S T P L B R) que la vue ne traite pas : arrêté, sinon l'édition, la
  // légende ou la recherche s'ouvrent derrière la vue. « ? » (aide-mémoire, avec Maj), un modificateur ou un champ
  // de saisie passent : shortcuts.js les ignore déjà, et le champ garde ses écouteurs.
  // 🩸 stopPropagation en capture sur document : un écouteur de document en phase de bouillonnement ne reçoit plus
  // ces lettres non plus. Un add-on qui veut une lettre de la carte l'écoute sur window en capture (mkmg : R).
  function _raccourciCarte(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return false;
    const t = ev.target, tag = t && t.tagName ? t.tagName.toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return false;
    const S = window.KtaShortcuts, k = (ev.key || "").toUpperCase();
    return !!S && typeof S.listMapping === "function" && S.listMapping().some(function (m) { return m.key === k; });
  }

  // Tab reste dans la vue (fenêtre modale) : du dernier bouton on revient au premier, et inversement.
  function _tabulation(ev) {
    const e = _e, champs = e.ov.querySelectorAll("button, input, textarea, select");
    const liste = Array.prototype.filter.call(champs, function (b) {
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

  // Bouton qui agit d'un coup (au pointerdown, ou au click venu du clavier) : bascules de la tuile, − / +, zoom,
  // inclinaison, passages. Rend false pour un bouton de déplacement (maintenu) ou inconnu. `ev` absent : clavier.
  function _agirBouton(a, b, ev) {
    const e = _e;
    if (a === "vue") { basculerVue(); return true; }
    if (a === "boussole") { _basculerBoussole(); return true; }
    if (a === "miniCarte") { _basculerMiniCarte(); return true; }
    if (a === "guidage") { _basculerGuidage(); return true; }
    if (a === "fichesObjets") { _basculerFichesObjets(); return true; }
    if (a === "textures") { _basculerTextures(); return true; }
    if (a === "lignesSol") { _basculerLignesSol(); return true; }
    if (a === "rendu") { basculerRendu(); return true; }
    if (a === "hauteur") { _basculerReglageHauteur(); return true; }
    if (a === "hauteurMoins" || a === "hauteurPlus") {
      if (ev) ev.preventDefault();
      const pas = (a === "hauteurPlus" ? e.hauteur : e.hauteur - 0.1) >= HAUTEUR_PAS_FIN ? 0.5 : 0.1;
      reglerHauteur(e.hauteur + (a === "hauteurPlus" ? pas : -pas));
      return true;
    }
    if (a === "niveauEditionHaut" || a === "niveauEditionBas") {
      niveauEdition(a === "niveauEditionHaut" ? "haut" : "bas");
      return true;
    }
    if (a === "niveauHaut" || a === "niveauBas") { changerNiveau(a === "niveauHaut" ? "haut" : "bas"); return true; }
    if (a === "niveau") {
      _allerNiveau(e.passageCibles && e.passageCibles.liste[Number(b.dataset.indice)]);
      return true;
    }
    if (a === "suivre") { basculerSuivi(); return true; }
    if (a === "inclPlus" || a === "inclMoins") {
      if (ev) ev.preventDefault();
      incliner(a === "inclPlus" ? INCLINAISON.pas * 2 : -INCLINAISON.pas * 2);
      return true;
    }
    if (a === "zoomPlus" || a === "zoomMoins") {
      if (ev) ev.preventDefault();
      zoomer(a === "zoomPlus" ? 1 / (RECUL.pas * RECUL.pas) : RECUL.pas * RECUL.pas);
      return true;
    }
    if (a === "pleinJour") { reglerPleinJour(!_lampeEnVigueur().jour); return true; }
    if (a === "limiter") { limiterPortee(!_limitee()); return true; }
    if (a === "niveauxVus") { reglerNiveauxVus(b.dataset.niveauxVus); return true; }
    if (a === "estomper") { reglerEstomper(); return true; }
    return false;
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
      else if (a === "ficheVoir") _voirSurCarte();
      else if (a === "outil") { ev.preventDefault(); _ouvrirOutil(b.dataset.groupe, b); }
      else if (a === "planSol") { ev.preventDefault(); _basculerPlanSol(); }
      else if (a === "recherche") { ev.preventDefault(); _ouvrirRecherche(); }
      else if (a === "outilsPlier") {
        ev.preventDefault();
        _plierOutils(!_e.dessin.barre.classList.contains("kta-v3d-outils-plie"), true);
      } else if (a === "tracker") { ev.preventDefault(); _ouvrirTracker(); }
      else if (a === "ajusterSuppr") { ev.preventDefault(); _ajusterSupprimer(); }
      else if (a === "ajusterInserer") { ev.preventDefault(); _ajusterInserer(); }
      else if (a === "ajusterCouper") { ev.preventDefault(); _ajusterCouper(); }
      else if (a === "place") surPlace();
      else if (a === "guidAction") _actionGuidage(b.dataset.guidAction);
      else if (a === "addons") { ev.preventDefault(); _choisirAddon(); }
      // Entrée / Espace sur un bouton qui agit au pointerdown (bascules de la tuile, − / +, passages) : le navigateur
      // n'envoie qu'un click. 🩸 Un toucher envoie pointerdown PUIS click : ce click-là est ignoré (même bouton,
      // pointerdown récent), sinon la bascule jouerait deux fois.
      else if (a && !(e.appui && e.appui.b === b && performance.now() - e.appui.t < APPUI_CLIC)) {
        _agirBouton(a, b, null);
      }
      // Action de la fiche qui mène ailleurs (déjà jouée par utils.js > _ktaPopupAction, en capture) : la fiche se
      // ferme, comme la bulle de la carte.
      const act = !a && ev.target.closest && ev.target.closest(".kta-v3d-fiche [data-kta-act]");
      if (act && ["ici", "aller", "etape"].indexOf(act.dataset.ktaAct) >= 0) _fermerFiche();
    });
    on(e.ov, "pointerdown", function (ev) {
      const b = ev.target.closest && ev.target.closest("[data-v3d]");
      if (!b) return;
      const a = b.dataset.v3d;
      e.appui = { b: b, t: performance.now() };
      if (a === "fermer" || a === "filtres" || a === "urgence" || a === "ficheFermer" || a === "reglages" ||
        a === "ficheVoir" || a === "outil" || a === "planSol" || a === "recherche" || a === "place" ||
        a === "guidAction" || a === "ajusterSuppr" || a === "ajusterInserer" || a === "ajusterCouper" ||
        a === "addons" ||
        a === "outilsPlier" || a === "tracker") return;
      // Au doigt, + / − et inclinaison attendent le click : un doigt de pincement posé dessus n'agit pas (_brancher,
      // geste de la scène).
      if (ev.pointerType === "touch" && /^(zoom|incl)(Plus|Moins)$/.test(a)) { e.appui = null; return; }
      if (_agirBouton(a, b, ev)) return;
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
    // 🗑️ d'un ajustement ouvert : le toucher suivant hors de lui le retire ; sur la scène, il ne fait rien d'autre
    // (sauf un appui long sur un sommet : appuiScene).
    on(e.ov, "pointerdown", function (ev) {
      if (!e.ajusteMenu || e.ajusteMenu.b.contains(ev.target)) return;
      _ajusterFermerMenu();
      if (ev.target === e.cv) e.ajusteAvale = ev.pointerId;
    }, true);
    // Panneau d'un groupe de dessin ouvert : le toucher qui le ferme ne pose aucun sommet (_poserSommet). Posé avant
    // l'écouteur du panneau (interface.js > _onDocClickFlyout, qui le retire aussitôt) : il le voit encore ouvert.
    on(document, "pointerdown", function (ev) {
      const fly = typeof window.ktaOutilsOuverts === "function" && window.ktaOutilsOuverts();
      const dans = ev.target && ev.target.closest && ev.target.closest(".kta-group-flyout, .kta-v3d-outils");
      if (fly && !dans && e.dessin) e.dessin.avaleJusqua = performance.now() + DESSIN_AVALER;
    }, true);
    if (e.stickZone) _brancherStick(on);
    if (e.mc) _brancherMiniCarte(on);
    on(e.ov, "pointerout", function (ev) { if (ev.target.dataset && ev.target.dataset.v3d) relacher(); });
    on(e.curseurPortee, "input", function () { reglerPortee(e.curseurPortee.value); });
    on(e.curseurLampe, "input", function () { reglerLampe(e.curseurLampe.value); });
    on(e.curseurFaisceau, "input", function () { reglerFaisceau(e.curseurFaisceau.value); });
    // Glisser sur la scène : à hauteur d'yeux, un doigt tourne (horizontal) et lève / baisse les yeux (vertical). En
    // vue plongeante, comme une carte : un doigt (la souris) déplace le point visé (_panner) au-delà de
    // TAPE.bouge px ; clic droit ou Ctrl + glisser à la souris = cap. Deux doigts, comme la carte 2D : pincer = zoom
    // (écarter = plus près), tourner = cap (le décor suit les doigts), les deux ensemble ; glisser ensemble à la
    // verticale = inclinaison seule (vers le haut = plus rasante). Le geste est tranché une fois (deux.mode) : « incl »
    // si le milieu a bougé de GESTE_SEUIL px plus que l'écart et l'arc, sinon « pince » dès que l'écart a bougé de
    // GESTE_SEUIL px ou que l'angle a franchi CAMERA_LIBRE.rot ; la rotation s'engage sans saut (comme
    // mapBearing.js > _gesteSuivre) puis suit les doigts. En suivi, le cap reste celui de l'appareil.
    // 🩸 La référence (écart, angle, milieu) est reprise à chaque changement du nombre de doigts : un doigt levé puis
    // reposé, ou un 3e doigt, ne fait jamais sauter la vue.
    // 🩸 Un doigt posé sur une commande de la vue (+ / −, colonne d'outils, zone du joystick…) pendant qu'un autre est
    // sur la scène rejoint le geste de la scène : il n'était pas compté (le pincement devenait un glisser d'un doigt)
    // et + / − zoomaient d'un coup au milieu d'un dézoom. Même chose pour le doigt posé AVANT sur une commande, quand
    // le 2e arrive sur la scène (adopter) ; d'où + / − et inclinaison qui agissent au click au doigt (un pincement
    // n'en produit pas), au pointerdown à la souris.
    const GESTE_SEUIL = 12;
    // Deux doigts : en deçà de `immobile` px depuis sa pose, un doigt n'a pas bougé ; un doigt seul tranche le geste
    // à `seul` px (l'autre resté à sa pose).
    const DEUX_DOIGTS = { immobile: 4, seul: 40 };
    const _ecartPose = function (a, b) {
      if (!a || !b) return { x: 0, y: 0, l: 0 };
      return { x: b.x - a.x, y: b.y - a.y, l: Math.hypot(b.x - a.x, b.y - a.y) };
    };
    let glisse = null, deux = null;
    const doigts = new Map();
    // Doigts posés sur une commande de la vue (pointerId → { x, y, b }), candidats à rejoindre un geste de la scène.
    const surCommande = new Map();
    // Toucher bref et immobile (< 8 px, < 0,5 s) : un panneau de POI jonction ? (_toucher).
    let tape = null;
    const reprendre = function () {
      glisse = null;
      deux = null;
      if (doigts.size !== 2) return;
      const it = doigts.values(), p = it.next().value, q = it.next().value;
      deux = { mode: null, rot: false, d0: Math.hypot(q.x - p.x, q.y - p.y), y0: (p.y + q.y) / 2,
        a0: Math.atan2(q.y - p.y, q.x - p.x), pose: new Map() };
      doigts.forEach(function (v, id) { deux.pose.set(id, { x: v.x, y: v.y }); });
    };
    // Commande que le doigt d'un geste peut traverser : tout ce qui est dans la vue sauf la saisie (curseurs de la
    // tuile, champs de la fiche), la fiche et le ＋ / 🗑️ d'un ajustement.
    const traversable = function (t) {
      if (!t || t === e.cv || !e.ov.contains(t) || !t.closest) return false;
      if (t.closest("input, select, textarea, label, .kta-v3d-fiche, .kta-ajuster-boutons")) return false;
      return !(e.tuileReglages && e.tuileReglages.contains(t));
    };
    const adopter = function (id, p) {
      if (e.stick && e.stick.id === id) {
        if (e.stick.bouge) return;   // le joystick marche déjà : il garde son doigt
        _lacherStick();
      }
      if (p.b) e.appui = { b: p.b, t: performance.now() };   // son click éventuel n'agira pas
      try { e.cv.setPointerCapture(id); } catch (err) { /* pointeur synthétique ou déjà relâché */ }
      doigts.set(id, { x: p.x, y: p.y });
    };
    // 🩸 Doigt fantôme : iOS perd parfois le lâcher d'un doigt (geste du système, appli repliée) ; resté compté, le
    // doigt suivant passait pour le 2e d'un pincement (un seul doigt zoomait). Un toucher `isPrimary` est le premier
    // d'une série, aucun autre doigt n'est posé : tout ce qui reste compté est périmé.
    const purgerFantomes = function (ev) {
      if (ev.pointerType !== "touch" || !ev.isPrimary || (!doigts.size && !surCommande.size)) return;
      doigts.clear();
      surCommande.clear();
      reprendre();
    };
    const appuiScene = function (ev) {
      purgerFantomes(ev);
      if (ev.pointerType === "touch" && e.vue === "plongee" && surCommande.size) {
        surCommande.forEach(function (p, id) { if (id !== ev.pointerId) adopter(id, p); });
        surCommande.clear();
      }
      tape = doigts.size === 0 ? { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: ev.timeStamp } : null;
      doigts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      reprendre();
      if (doigts.size === 1) {
        glisse = { x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY, parti: false,
          cap: ev.pointerType === "mouse" && (ev.button === 2 || ev.ctrlKey) };
      }
      try { e.cv.setPointerCapture(ev.pointerId); } catch (err) { /* pointeur déjà relâché */ }
      // Ajustement (_ajusterAppui) : un seul pointeur, bouton principal, vue d'édition ; un 2e doigt l'annule.
      // 🩸 Le toucher qui referme ＋ / 🗑️ est avalé (ni fiche, ni sommet posé), mais pas l'appui long : posé sur un
      // sommet, il l'ajuste. Une souris tenue immobile ouvre ce menu à coup sûr (moins de GLISSE_PX), et l'appui
      // suivant sur la pastille agrandie, avalé, partait en pan au lieu de la saisir.
      const avale = e.ajusteAvale === ev.pointerId;
      if (avale) { e.ajusteAvale = null; tape = null; }
      if (e.ajuste) _ajusterAnnuler();
      else if (doigts.size === 1 && e.vue === "plongee" && glisse && !glisse.cap &&
        (ev.pointerType !== "mouse" || ev.button === 0)) _ajusterAppui(ev);
    };
    on(e.cv, "pointerdown", appuiScene);
    // Capture sur la vue : passe avant le bouton, le joystick et l'écouteur des boutons (_agirBouton).
    on(e.ov, "pointerdown", function (ev) {
      if (ev.pointerType !== "touch" || e.vue !== "plongee" || !traversable(ev.target)) return;
      purgerFantomes(ev);
      if (doigts.size) {
        ev.stopPropagation();
        ev.preventDefault();
        appuiScene(ev);
        return;
      }
      surCommande.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, b: ev.target.closest("[data-v3d]") });
    }, true);
    on(window, "pointermove", function (ev) {
      const p = surCommande.get(ev.pointerId);
      if (p) { p.x = ev.clientX; p.y = ev.clientY; }
    }, true);
    // Fin lue sur window : un doigt de la scène dont la capture a échoué lève ailleurs que sur le canevas ; resté
    // compté, chaque doigt suivant passerait pour le 2e d'un pincement.
    const quitterCommande = function (ev) {
      surCommande.delete(ev.pointerId);
      if (ev.target !== e.cv && doigts.delete(ev.pointerId)) reprendre();
    };
    on(window, "pointerup", quitterCommande, true);
    on(window, "pointercancel", quitterCommande, true);
    on(e.cv, "pointermove", function (ev) {
      if (e.ajuste && _ajusterBouge(ev)) return;
      if (doigts.size >= 2 && doigts.has(ev.pointerId)) {
        const it = doigts.values(), a0 = it.next().value, b0 = it.next().value;
        const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), y0 = (a0.y + b0.y) / 2;
        const t0 = Math.atan2(b0.y - a0.y, b0.x - a0.x);
        doigts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (e.vue !== "plongee" || !deux) return;
        const it1 = doigts.values(), a1 = it1.next().value, b1 = it1.next().value;
        const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y), ym = (a1.y + b1.y) / 2;
        const t1 = Math.atan2(b1.y - a1.y, b1.x - a1.x);
        const norm = function (r) { const v = r * 180 / Math.PI; return ((v + 540) % 360) - 180; };
        // Doigts tournés dans le sens des aiguilles : le décor tourne avec eux, le cap de la vue recule d'autant.
        const tourner = function (deg) {
          const v = Math.max(-CAMERA_LIBRE.pasCap, Math.min(CAMERA_LIBRE.pasCap, deg));
          if (v && e.mode !== "suivi") { e.cap = (e.cap - v + 360) % 360; e.sale = true; }
        };
        const zoomerPas = function (f) {
          if (f > 0 && Number.isFinite(f)) zoomer(Math.max(1 / CAMERA_LIBRE.pasZoom, Math.min(CAMERA_LIBRE.pasZoom, f)));
        };
        // Depuis la pose : écart, milieu, angle et arc parcouru (px). 🩸 Les doigts arrivent l'un après l'autre (un
        // événement par doigt) : un seul doigt bougé de 8 px tourne déjà la paire de 15° à 30 px d'écart.
        const dD = d1 - deux.d0, dY = ym - deux.y0, aT = norm(t1 - deux.a0);
        const arc = Math.abs(aT) * Math.PI / 180 * d1 / 2;
        if (!deux.mode) {
          // 🩸 Scène lourde (multi-niveau) : les mouvements sont livrés moins souvent, un doigt arrive avec 20 à 40 px
          // d'avance sur l'autre, encore lu à sa pose ; tranché là, un glisser vertical à deux doigts ressemblait à un
          // doigt qui tourne autour de l'autre (rotation, zoom). On attend que les deux aient bougé
          // (DEUX_DOIGTS.immobile), sauf un doigt seul qui a parcouru DEUX_DOIGTS.seul px (il tourne autour de l'autre).
          const ids = Array.from(doigts.keys()).slice(0, 2);
          const va = _ecartPose(deux.pose.get(ids[0]), doigts.get(ids[0]));
          const vb = _ecartPose(deux.pose.get(ids[1]), doigts.get(ids[1]));
          const lents = Math.min(va.l, vb.l), vifs = Math.max(va.l, vb.l);
          if (lents < DEUX_DOIGTS.immobile && vifs < DEUX_DOIGTS.seul) return;
          // Les deux montent ou descendent ensemble, chacun plus vertical qu'horizontal : inclinaison.
          const ensemble = lents >= DEUX_DOIGTS.immobile && va.y * vb.y > 0 &&
            Math.abs(va.y) > Math.abs(va.x) && Math.abs(vb.y) > Math.abs(vb.x);
          const tourne = !ensemble && Math.abs(aT) >= CAMERA_LIBRE.rot && arc >= CAMERA_LIBRE.arc;
          if (ensemble && Math.abs(dY) > GESTE_SEUIL && Math.abs(dY) > Math.abs(dD)) {
            deux.mode = "incl";
            incliner(dY * 0.15);
          } else if (!tourne && Math.abs(dY) > GESTE_SEUIL && Math.abs(dY) > Math.abs(dD) && Math.abs(dY) > 1.5 * arc) {
            deux.mode = "incl";
            incliner(dY * 0.15);
          } else if (tourne || Math.abs(dD) > GESTE_SEUIL) {
            deux.mode = "pince";
            deux.rot = tourne;
            // L'écart parcouru avant de trancher est rattrapé : le décor reste sous les doigts.
            if (deux.d0 > 1 && d1 > 1) zoomerPas(deux.d0 / d1);
          }
          return;
        }
        if (deux.mode === "incl") { if (ym !== y0) incliner((ym - y0) * 0.15); return; }
        if (d0 > 1 && d1 > 1) zoomerPas(d0 / d1);
        if (deux.rot) tourner(norm(t1 - t0));
        else if (Math.abs(aT) >= CAMERA_LIBRE.rotPince && arc >= CAMERA_LIBRE.arc) deux.rot = true;
        return;
      }
      if (!glisse) return;
      if (e.vue === "plongee") {
        // Même seuil que le toucher bref (TAPE) : en deçà c'est un tap, au-delà un déplacement de la caméra.
        if (!glisse.parti && Math.hypot(ev.clientX - glisse.x0, ev.clientY - glisse.y0) < TAPE.bouge) return;
        glisse.parti = true;
        if (glisse.cap) {
          if (e.mode !== "suivi") e.cap = (e.cap + (ev.clientX - glisse.x) * 0.25 + 360) % 360;
        } else {
          _panner(glisse.x, glisse.y, ev.clientX, ev.clientY);
        }
        glisse.x = ev.clientX; glisse.y = ev.clientY;
        e.sale = true;
        return;
      }
      const dx = ev.clientX - glisse.x, dy = ev.clientY - glisse.y;
      glisse.x = ev.clientX; glisse.y = ev.clientY;
      // 🩸 En suivi, le cap est celui de l'appareil : glisser ne règle que le regard haut/bas. Tourner au doigt
      // quittait le suivi au moindre toucher (un tap bouge toujours d'un pixel ou deux).
      if (dx && e.mode !== "suivi") e.cap = (e.cap + dx * 0.25 + 360) % 360;
      e.tangage = Math.max(-1, Math.min(1, e.tangage - dy * 0.004));
      e.sale = true;
    });
    const lever = function (ev) {
      const ajuste = ev.type === "pointerup" ? _ajusterLacher(ev)
        : !!(e.ajuste && e.ajuste.id === ev.pointerId && _ajusterAnnuler());
      if (doigts.delete(ev.pointerId)) reprendre();
      if (ev.type === "pointerup" && !ajuste) {
        const bouge = tape ? Math.hypot(ev.clientX - tape.x, ev.clientY - tape.y) : 0;
        const duree = tape ? ev.timeStamp - tape.t : 0;
        if (tape && tape.id === ev.pointerId && doigts.size === 0 && bouge < TAPE.bouge && duree < TAPE.ms) {
          // Caméra déplacée depuis la dernière image (glisser, pincer) : posée avant le rayon du toucher.
          if (e.sale) _placerCamera();
          // 🩸 Point d'APPUI, pas de lâcher : un doigt roule de quelques px en se levant (jusqu'à 6 px mesurés, 0,2 m
          // posé à côté en vue dézoomée) ; la caméra n'a pas bougé (moins de TAPE.bouge px).
          _toucher(tape.x, tape.y);
        } else {
          _refusDessin(!tape ? "un autre pointeur était déjà posé sur la scène"
            : doigts.size ? "un autre pointeur est encore posé"
              : bouge >= TAPE.bouge ? "pointeur déplacé de " + Math.round(bouge) + " px (≥ " + TAPE.bouge + ")"
                : "appui tenu " + Math.round(duree) + " ms (≥ " + TAPE.ms + ")");
        }
      }
      tape = null;
    };
    on(e.cv, "pointerup", lever);
    on(e.cv, "pointercancel", lever);
    // Ajustement en cours quand l'appli se replie ou perd la main : annulé sans rien écrire (son lâcher ne viendra
    // pas ; même règle que la carte, ajusterSommets.js).
    on(window, "blur", function () { _ajusterAnnuler(); });
    on(document, "visibilitychange", function () { if (document.hidden) _ajusterAnnuler(); });
    // Molette (PC), vue plongeante, comme une carte : zoom (vers l'avant = plus près), d'un cran par 100 px de
    // défilement (pavé tactile : en continu) ; Maj + molette : inclinaison (vers soi = plus verticale).
    // 🩸 Avec Maj, Chrome et Safari font défiler à l'horizontale : le défilement arrive en deltaX.
    on(e.cv, "wheel", function (ev) {
      if (e.ajuste) _ajusterAnnuler();
      if (e.vue !== "plongee") return;
      ev.preventDefault();
      const k = ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 400 : 1;
      if (ev.shiftKey) {
        const d = ev.deltaY || ev.deltaX;
        if (d) incliner(d < 0 ? INCLINAISON.pas : -INCLINAISON.pas);
        return;
      }
      const crans = Math.max(-3, Math.min(3, ev.deltaY * k / 100));
      if (crans) zoomer(Math.pow(RECUL.pas, crans));
    }, { passive: false });
    on(window, "kta:northOffsetChange", function () { _lireNord(); });
    on(window, "kta:zoomBoutonsChange", _majBoutonsIncl);
    on(window, "kta:avantChangementPlan", function () { _fermerPourPlan(); });
    on(window, "mktm:liaisons-changees", function () { _majPortails(); });
    // Itinéraire tracé, remplacé ou effacé pendant la vue (🚨, fiche, guidage) : scène refaite à l'image suivante,
    // bandeau et chevrons relus aussitôt.
    on(window, "kta:itineraireChange", function () { e.itiChange = true; e.guidageForce = true; e.apS = undefined; });
    // Ronds d'intersection redessinés par la carte (option, filtres, tracés) : refaits à l'image suivante.
    on(window, "kta:intersectionsChange", function () { e.rondsChange = true; });
    on(window, "kta:distanceTotaleChange", function () { e.distTotChange = true; });
    // Données du plan peut-être changées (session, calques, légende) : relues après la rafale (_majDonnees).
    on(window, "kta:donneesPlanChange", function () {
      const d = e.donnees, t = performance.now();
      d.signaux++;
      if (!d.signal) d.premier = t;
      d.signal = t;
    });
    on(e.cv, "contextmenu", function (ev) { ev.preventDefault(); });
    // « Sélection multiple » de la fenêtre Convertir (ouverte depuis la fiche d'un objet) se joue sur la carte : la
    // vue se ferme avant que la fenêtre ne passe la main (convertirObjet.js), sinon la carte resterait dessous.
    on(document, "click", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest("#kta-convert-multi")) fermer();
    }, true);
    // Clavier : capturé pendant que la vue est ouverte (les raccourcis de la carte ne partent pas dessous,
    // _raccourciCarte).
    // Une fenêtre de l'app par-dessus la vue (≡ Filtres, Aide, Sortie d'urgence, confirmation) garde ses touches :
    // Échap la ferme, elle, et les flèches ne déplacent pas la scène dessous.
    on(document, "keydown", function (ev) {
      if (_recouverte()) return;
      // Saisie dans la fiche (note, niveau) : ses touches restent les siennes (ni pas, ni raccourci de la carte).
      if (_champFiche(ev) && ev.key !== "Escape" && ev.key !== "Tab") { ev.stopPropagation(); return; }
      if (ev.key === "Escape") {
        ev.stopPropagation(); ev.preventDefault();
        // Un ajustement en cours ou son menu passent avant tout le reste, puis l'insertion de sommets ouverte.
        const ajuste = _ajusterAnnuler(), A = _ajusteur();
        if (_ajusterFermerMenu() || ajuste) return;
        if (A && A.terminerInsertion()) return;
        // Échap ferme d'abord la tuile des réglages (et la hauteur qu'elle montre), éteint l'outil de dessin armé,
        // ferme une fiche, puis la vue.
        if (e.tuileReglages && !e.tuileReglages.hidden) { _basculerReglages(false); return; }
        if (e.reglageHauteur && !e.reglageHauteur.hidden) { _basculerReglageHauteur(); return; }
        if (_dessinActif()) { _desarmerDessin(); return; }
        if (_fermerFiche()) return;
        fermer();
        return;
      }
      if (ev.key === "Tab") { _tabulation(ev); return; }
      // Ctrl / Cmd + Z, Y : l'annulation de la carte (historyManager.js, écouteur de document), pas le pas avant de Z.
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && /^[zy]$/i.test(ev.key || "")) return;
      // Curseurs de la tuile au clavier : leurs touches restent les leurs (ni pas, ni inclinaison, ni raccourci de la
      // carte dessous).
      const champ = ev.target === e.curseurPortee || ev.target === e.curseurLampe || ev.target === e.curseurFaisceau;
      if (champ && /^(Arrow|Page|Home$|End$)/.test(ev.key)) { ev.stopPropagation(); return; }
      if (e.vue === "plongee" && TOUCHES_ZOOM[ev.key]) {
        ev.stopPropagation(); ev.preventDefault();
        zoomer(TOUCHES_ZOOM[ev.key] > 0 ? 1 / RECUL.pas : RECUL.pas);
        return;
      }
      if (ev.code === TOUCHE_VUE) { ev.stopPropagation(); basculerVue(); return; }
      if (TOUCHES_INCLINAISON[ev.key]) {
        ev.stopPropagation(); ev.preventDefault();
        incliner(TOUCHES_INCLINAISON[ev.key] * INCLINAISON.pas);
        return;
      }
      if (ev.key === "Shift") e.touches.Shift = true;
      const a = TOUCHES[ev.code];
      if (!a) { if (_raccourciCarte(ev)) ev.stopPropagation(); return; }
      ev.stopPropagation(); ev.preventDefault();
      if (!ev.repeat) _codeBas(a === "ar");
      e.touches[a] = true;
    }, true);
    on(document, "keyup", function (ev) {
      if (_champFiche(ev)) return;
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
    // Recherche (🔍, Ctrl/Cmd+K) : le résultat choisi va à la vue, pas à la carte dessous (allerA).
    if (window.SearchPoints && typeof window.SearchPoints.prendreChoix === "function") {
      e.rendreRecherche = window.SearchPoints.prendreChoix(_choixRecherche);
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
      e.marqueursIti = null; e.ronds = null; e.distTot = null; e.geoMarqueur = null; e.itiPentes = null;
      if (e.dessin) {   // aperçu et plan au sol refaits à l'image suivante (même règle : rien de l'ancien contexte)
        e.dessin.apercu = null; e.dessin.etiquettes = []; e.dessin.apSig = null;
        e.dessin.sol = e.dessin.sol ? { jeton: e.dessin.sol.jeton + 1 } : null;
      }
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
        m: 0, ang: 0, d: 0, fortDepuis: 0, t: ev.timeStamp, bouge: false, bas: false, ailleurs: false,
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
      const tape = ev.type === "pointerup" && !st.bouge && st.d < TAPE.bouge && ev.timeStamp - st.t < TAPE.ms;
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

  // ⚠️ contrat : un code lance l'add-on dont le manifeste le déclare (addons/<nom>/addon.json, lu par
  // js/ktaAddons.js), chargé à la première fois (script classique, même origine, précaché par sw.js). L'add-on
  // s'inscrit dans window.KtaAddons[<nom>] = { lancer() } ; c'est lui qui décide s'il démarre (refus, confirmation)
  // puis se greffe (greffer). Un code répété pendant la lecture du manifeste ou le chargement ne lance qu'une fois.
  // Un add-on visible éteint dans Configuration › Add-ons ne se lance ni par code ni par 🎮 (KtaRegistreAddons.actif).
  const _addonsEnCours = {};
  function _lancerManifeste(cle, trouver) {
    const R = window.KtaRegistreAddons;
    if (!R || _addonsEnCours[cle]) return;
    _addonsEnCours[cle] = true;
    trouver(R).then(function (m) {
      return m && R.actif(m) ? R.charger(m).then(function (ok) { return ok ? m : null; }) : null;
    }).then(function (m) {
      _addonsEnCours[cle] = false;
      const x = m && window.KtaAddons && window.KtaAddons[m.nom];
      if (x && typeof x.lancer === "function" && _e) x.lancer();
    }, function () { _addonsEnCours[cle] = false; });
  }

  function _lancerAddon(code) {
    _lancerManifeste("code:" + code, function (R) { return R.parCode(code); });
  }

  function _addonsVisibles(R) {
    return R.liste().then(function (ms) { return ms.filter(function (m) { return !m.secret && R.actif(m); }); });
  }

  function _majBoutonAddons() {
    const R = window.KtaRegistreAddons, e = _e;
    if (!R || !e || !e.boutonAddons) return;
    _addonsVisibles(R).then(function (vis) { if (_e === e) e.boutonAddons.hidden = !vis.length; });
  }

  // 🎮 : un seul add-on visible se lance tout de suite, plusieurs passent par un choix (boutons radio de ktaConfirm).
  // Rien pendant une greffe (une à la fois).
  function _choisirAddon() {
    const R = window.KtaRegistreAddons, e = _e;
    if (!R || !e || e.greffe) return;
    _basculerReglages(false);
    _addonsVisibles(R).then(function (vis) {
      if (!vis.length || _e !== e) return null;
      if (vis.length === 1) return vis[0];
      const choix = { valeur: vis[0].nom, options: vis.map(function (m) {
        return { valeur: m.nom, titre: R.titre(m) };
      }) };
      return window.ktaConfirm("", { titre: window.ktaEsc(_t("vue3d.addons")),
        okLabel: window.ktaEsc(_t("vue3d.addonsLancer")), choix: choix }).then(function (oui) {
        return oui ? vis.filter(function (m) { return m.nom === choix.valeur; })[0] || null : null;
      });
    }).then(function (m) {
      if (m) _lancerManifeste("nom:" + m.nom, function () { return Promise.resolve(m); });
    });
  }

  // ── Greffe : prise NEUTRE pour un add-on (addons/<nom>/), rien sans greffon ──────────────────────────────
  // ⚠️ contrat : KtaVue3D.greffer(g) → fonction qui retire la greffe, ou null (vue fermée, greffe déjà posée).
  // Une greffe à la fois, qui vit avec la vue ouverte. g = { nom, scene(ctx, raison), surImage(ctx, dt),
  // demonter(ctx, raison) }, tous facultatifs :
  //   scene : appelé à la greffe ("greffe"), après chaque scène refaite ("refaite" : niveau, rendu, hauteur, filtres,
  //     itinéraire, données du plan changées pendant la vue) et après une perte du contexte WebGL ("reprise" : ctx.groupe est NEUF, les objets d'avant sont
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
  // court = pas rapide en cours ; miniCarte = médaillon montré en haut à droite (le greffon y libère la place).
  // regler({ traces, itineraire, guidage, course, avatar, commandes, plongee, fiches }) :
  // false masque, pour la greffe seulement, les tracés au sol (les tubes des galeries restent), l'itinéraire de l'app
  // (ruban, étapes, 🏁), son guidage (bandeau, chevrons), la silhouette dorée de la vue plongeante, le joystick et le
  // pavé, ou interdit le pas rapide, la vue plongeante (retour à hauteur d'yeux) ou les fiches au toucher (ni POI,
  // ni objet, ni nom de membre : le toucher est au greffon, une fiche ouverte se ferme) ; levé au retrait. Les
  // filtres de la carte n'en savent rien. Deux facteurs (nombre de 0 à 1, 1 = normal) : lampe = force et portée de la
  // lampe frontale (vue à hauteur d'yeux), vitesse = pas au pavé, au clavier et au joystick.
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
    _appliquerGreffeReglages();   // sans effet tant que la greffe ne fige rien (ctx.regler({ reglagesFiges }))
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
      get miniCarte() { return !!(_e.mc && !_e.mc.el.hidden); },
      sale: function () { if (_e) _e.sale = true; },
      regler: function (r) {
        if (!_e || _e.greffe !== gr || !r) return;
        const change = {};
        ["traces", "itineraire", "guidage", "course", "avatar", "commandes", "plongee", "fiches",
          "miniCarte"].forEach(function (k) {
          if ((r[k] === true || r[k] === false) && _permisGreffe(k) !== r[k]) { gr.reglage[k] = r[k]; change[k] = true; }
        });
        ["lampe", "vitesse"].forEach(function (k) {
          if (typeof r[k] === "number" && Number.isFinite(r[k])) gr.reglage[k] = Math.max(0, Math.min(1, r[k]));
        });
        if (typeof r.lampe === "number") _lampeGreffe();
        if ((r.reglagesFiges === true || r.reglagesFiges === false) && r.reglagesFiges !== _fige()) {
          gr.reglage.reglagesFiges = r.reglagesFiges;
          _appliquerGreffeReglages();
        }
        // Scène refaite seulement si ce qu'elle dessine change (la course ne coûte rien).
        if (change.traces || change.itineraire) _e.filtresChanges = true;
        if (change.guidage || change.itineraire) { _e.guidageForce = true; _e.apS = undefined; }
        if (change.avatar) _e.avatar.visible = _e.vue === "plongee" && _permisGreffe("avatar");
        if (change.commandes) _montrerCommandes(_permisGreffe("commandes"));
        if (change.plongee) _permettrePlongee(_permisGreffe("plongee"));
        if (change.fiches && !_permisGreffe("fiches")) _fermerFiche();
        if (change.miniCarte) _appliquerMiniCarte();
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
      // Dans une galerie inclinée, sa règle : un corps entre ses parois (_pas).
      libre: function (x, y) {
        if (!_e) return false;
        const q = _surPente(x / _e.sc, y / _e.sc, 0);
        if (q) return q.lat <= q.demi - RAYON_CORPS + 1e-9;
        return !_coince(x, y) && !_volumeContenant(x / _e.sc, y / _e.sc) && _rayonsBloques(x, y) === 0;
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

  // Vue plongeante permise ou non (greffe : regler({ plongee: false }), ex. un jeu où voir d'en haut serait
  // tricher) : bouton ✏️ grisé, basculement refusé, et retour à hauteur d'yeux si l'on y était.
  function _permettrePlongee(oui) {
    const e = _e;
    if (!e) return;
    if (e.boutonVue) e.boutonVue.disabled = !oui;
    if (!oui && e.vue === "plongee") { e.vue = "yeux"; _appliquerVue(); }
  }

  // Facteur de la greffe (ctx.regler : lampe, vitesse) ; 1 sans greffe ou sans réglage.
  function _facteurGreffe(k) {
    const gr = _e && _e.greffe, v = gr && gr.reglage[k];
    return typeof v === "number" ? v : 1;
  }

  // Lampe frontale : réglages ⚙️ en vigueur (_lampeEnVigueur : intensité, faisceau) multipliés par le facteur de la
  // greffe ; force et portée baissent ensemble (au-delà, noir : l'ambiance de nuit est à 0,04). Portée comptée sur la
  // portée réglée (e.distance) : elle y revient au retrait de la greffe.
  // 🩸 Refaite avec la scène (reprise du contexte) : réappliquée par _monterScene.
  function _lampeGreffe() {
    const e = _e;
    if (!e || !e.lampe) return;
    const k = _facteurGreffe("lampe"), l = _lampeEnVigueur(), m = l.courbe;
    e.lampe.intensity = LAMPE.force * m.force * k;
    e.lampe.decay = m.decay;
    e.lampe.distance = e.distance * m.coupure * Math.max(LAMPE.porteeMin, k);
    e.lampe.angle = l.cone.angle;
    e.lampe.penumbra = l.cone.penombre;
    if (e.halo) e.halo.intensity = LAMPE.halo * m.halo * Math.max(0.35, k);
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
    if (gr.reglage.plongee === false) _permettrePlongee(true);
    if (gr.reglage.miniCarte === false) _appliquerMiniCarte();
    _appliquerGreffeReglages();   // portée et lampe retenues rendues telles quelles
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
    _chargerPolicePlaques();
    return Promise.all([_chargerThree(), _chargerCss()]).catch(function (err) {
      console.warn("[Vue3D] three.js introuvable :", err && err.message);
      _alerte("vue3d.chargementImpossible");
      return null;
    }).then(function (charges) {
      if (!charges) return false;
      if (_e) return true;
      const sc = _echelle();
      const hauteur = _hauteurDuNiveau(_niveauCourant());
      const pos = o.depart ||
        (typeof window.getTrackingPosition === "function" ? window.getTrackingPosition() : null) ||
        { x: window.PLAN_CONFIG.plan.imageWidth / 2, y: window.PLAN_CONFIG.plan.imageHeight / 2 };
      const cap = o.depart && Number.isFinite(o.depart.cap) ? o.depart.cap
        : (typeof window.getPlanRelHeading === "function" ? Number(window.getPlanRelHeading()) || 0 : 0);
      _e = {
        sc: sc, hauteur: hauteur, oeil: _oeil(hauteur),
        distance: o.distanceVue > 0 ? o.distanceVue : _porteeVoulue(), tuilesActives: o.tuiles !== false,
        recul: RECUL.defaut, lampeVoulue: _lampeVoulue(),
        porteeVoulue: o.distanceVue > 0 ? o.distanceVue : _porteeVoulue(),
        limiter: _limiterVoulu(), diag: 0, niveauxVus: _niveauxVusVoulu(), voisins: [], matsV: null, msVoisins: 0,
        construitesImage: 0,
        porteeTout: !(o.distanceVue > 0) && typeof window.getVue3DPorteeTout === "function" &&
          window.getVue3DPorteeTout() === true,
        pos: { x: pos.x, y: pos.y }, cap: cap, tangage: 0, vue: "yeux",
        mode: o.depart || !_trackerActif() ? "libre" : "suivi",
        touches: {}, ecouteurs: [], tuiles: new Map(), couleurs: new Map(), sale: true, images: 0, butees: 0,
        msIndex: 0, msTuiles: 0, compteurN: 0, compteurT0: 0, w: 0, h: 0, aBouge: false, perdu: false,
        msPerdu: 0, reprises: 0, minuterie: null, inclinaison: INCLINAISON.defaut, nord: 0, nordCalibre: false,
        roseAngle: Number.NaN, rendu: "structures", galerie: null, passages: [], passageSig: null, passageCibles: null,
        volPassages: [], geste: null, dy: 0, fondu: null, fonduOp: 0, bandeauNiveau: null, bandeauNiveauFin: 0,
        niveauLibre: null, actifVu: null, changementsNiveau: 0, poiMasques: 0,
        pentes: [], jonctions: [], pentesFranchies: 0, itiPentes: null, nItiPentes: 0,
        zonesDecoupees: {}, rideaux: [], facesRemblais: 0, facesEboulis: 0, rubans: {}, liseres: {},
        filtresChanges: false, reindexations: 0, itiRefaits: 0, msIti: 0, compteIti: 0,
        donnees: { empreinte: null, signal: 0, premier: 0, signaux: 0, verifs: 0, refaites: 0, degagees: 0, ms: 0,
          msEmpreinte: 0 },
        virage: false, desabonner: null, sousHaut: null, degagements: 0, sortie: null,
        itiChange: false, guidageT: 0, guidageForce: true,
        apS: undefined, bandeauCle: null, bandeauEtat: { visible: false }, chevrons: null, chevSig: null,
        chevRoad: null, chevPts: null, nChevrons: 0, fiche: null, publiee: null, publications: 0,
        publicationDite: false, libreBouge: false,
        commandes: _commandesVoulues(o.commandes), stick: null,
        recalcul: { enCours: false, depuis: 0, dernier: null, n: 0, echecs: 0, ms: null, raison: null },
        stickLibres: 0, toucheNom: null, itiChevrons: 0, nbMarqueurs: { etapes: 0, arrivee: false }, listeRonds: [],
        rondsChange: false, distTot: null, distTotChange: false, listeDistTot: null, greffe: null, codeBas: { n: 0, t0: 0 }, codesBas: 0,
        retourFocus: o.retourFocus || document.activeElement || null,
        attenteReprise: o.attenteReprise > 0 ? o.attenteReprise : ATTENTE_REPRISE
      };
      // 🩸 Ouverte en libre sur la place du tracker, la vue prend aussi son niveau : un « Je suis ici » sur un POI
      // du −1 visible depuis le 0 laisse le niveau actif de la carte au 0, et la scène du 0 entourerait le tracker.
      // Tenu comme après un passage 🪜 (_niveauCourant). Tracker jamais recalé : le niveau affiché, comme avant.
      const etatTr = typeof window.getTrackingPositionEtat === "function" ? window.getTrackingPositionEtat() : null;
      const nivTr = typeof window.getTrackerLevel === "function" ? window.getTrackerLevel() : null;
      if (!o.depart && _e.mode === "libre" && window.APP_CONFIG.multiLevel === true && etatTr && etatTr.confirmee &&
          Number.isInteger(nivTr)) {
        _e.niveauLibre = nivTr;
        _e.actifVu = Number.isInteger(window.APP_CONFIG.activeLevel) ? window.APP_CONFIG.activeLevel : 0;
      }
      // Départ à un niveau donné (`depart.niveau`) : tenu comme après un passage 🪜, carte inchangée.
      if (o.depart && Number.isInteger(o.depart.niveau) && window.APP_CONFIG.multiLevel === true) {
        _e.niveauLibre = o.depart.niveau;
        _e.actifVu = Number.isInteger(window.APP_CONFIG.activeLevel) ? window.APP_CONFIG.activeLevel : 0;
      }
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
      const tE = performance.now();
      _e.donnees.empreinte = _empreinteDonnees();
      _e.donnees.msEmpreinte = performance.now() - tE;
      // En suivi, la place est celle du tracker ; en libre, dégagée aussi d'une structure dessinée (_coince).
      if (_e.mode === "libre") _degager(true);
      _lireEdition();
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
    clearTimeout(e.minuterieEdition);
    e.ecouteurs.forEach(function (x) { x[0].removeEventListener(x[1], x[2], x[3]); });
    if (e.desabonner) e.desabonner();
    if (e.rendreRecherche) e.rendreRecherche();
    // Place libre retirée : l'équipe revoit la position du tracker (ou le partage tel qu'avant la 3D).
    if (e.publiee) { e.publiee = null; _prisePresence(null); }
    _quitterDessin();
    _fermerFiche();
    _libererMiniCarte();
    document.documentElement.classList.remove("kta-vue3d-ouverte");
    document.documentElement.style.removeProperty("--kta-v3d-sous-haut");
    if (e.renderer) {
      e.tuiles.forEach(_libererTuile);
      (e.volPassages || []).forEach(_libererVolume);
      (e.voisins || []).forEach(_libererVoisin);
      if (e.matsV) {
        Object.keys(e.matsV).forEach(function (c) {
          Object.keys(e.matsV[c]).forEach(function (k) { e.matsV[c][k].dispose(); });
        });
      }
      if (e.matsPente) { e.matsPente.sol.dispose(); e.matsPente.plafond.dispose(); }
      if (e.matsTrous) Object.keys(e.matsTrous).forEach(function (k) { e.matsTrous[k].dispose(); });
      if (e.matsEstompes) e.matsEstompes.forEach(function (m) { m.dispose(); });
      if (e.texCiel) e.texCiel.dispose();
      if (e.icones) e.icones.forEach(function (t) { t.dispose(); });
      if (e.plaques) e.plaques.forEach(function (t) { t.tex.dispose(); t.mat.dispose(); });
      _libererChevrons();
      _viderGroupe(e.marqueursIti);
      _viderGroupe(e.itiPentes);
      if (e.ronds) e.ronds.geometry.dispose();
      if (e.distTot) e.distTot.geometry.dispose();
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
      [e.texLampeMembre, e.geoFaisceau, e.matFaisceau].forEach(function (o) { if (o) o.dispose(); });
      (e.lampesEquipe || []).forEach(function (l) { l.dispose(); });
      if (e.lampe) e.lampe.dispose();
      e.renderer.dispose();
      const gl = e.renderer.getContext();
      if (!gl.isContextLost()) e.renderer.forceContextLoss();
      _dernierGl = gl;
    }
    if (e.ov && e.ov.parentNode) e.ov.parentNode.removeChild(e.ov);
    _e = null;
    // 📏 compte de nouveau tous les niveaux sur la carte (niveauVue → undefined).
    if (typeof window.ktaDistanceTotaleRafraichir === "function") window.ktaDistanceTotaleRafraichir();
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
    // ⚠️ contrat : une place survolée (vue d'édition) dans un obstacle est dégagée avant « Je suis ici ? » et avant de
    // placer la carte : jamais un tracker recalé dans un pilier.
    if (e.mode === "libre" && e.libreBouge) _degager(true);
    const pos = { x: e.pos.x, y: e.pos.y }, niveau = e.niveau, sc = e.sc, bouge = e.aBouge;
    const suivi = e.mode === "suivi", retour = e.retourFocus;
    _retenirEdition(true);
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
      // ⚠️ contrat (décision produit) : un recalage venu de la balade 3D est un SAUT (ancre `tp`) : ni validation, ni
      // distance estimée, la sortie n'en devient pas « terrain » au Carnet (journal.js > _classer). Hook inchangé.
      window.recalerTrackerSurPoint(pos.x, pos.y, niveau === null ? undefined : niveau, { teleport: true });
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
    if (!_e || (_e.vue !== "plongee" && !_permisGreffe("plongee"))) return;
    _e.vue = _e.vue === "plongee" ? "yeux" : "plongee";
    _appliquerVue();
    _retenirEdition(true);
  }

  // ⚠️ contrat (décision produit) : vue d'édition, zoom et inclinaison retenus par plan sur cet appareil
  // (config.js > get/setPlanEditionVue3D) ; jamais la place de la caméra libre (on rouvre sur sa place) ni un outil
  // armé. Ouverte en vue d'édition, tracker en marche compris (la caméra suit alors le tracker). Une greffe qui
  // interdit la vue d'édition ouvre à hauteur d'yeux (_permettrePlongee) et n'écrit rien : le réglage reste intact.
  function _lireEdition() {
    const e = _e, v = typeof window.getPlanEditionVue3D === "function" ? window.getPlanEditionVue3D() : null;
    if (!v) return;
    if (Number.isFinite(v.recul)) e.recul = Math.max(RECUL.min, Math.min(_reculMax(), v.recul));
    if (Number.isFinite(v.inclinaison)) {
      e.inclinaison = Math.max(INCLINAISON.min, Math.min(INCLINAISON.max, v.inclinaison));
    }
    if (v.on && _permisGreffe("plongee")) e.vue = "plongee";
  }

  // `tout de suite` : bascule et fermeture ; sinon après 400 ms sans changement (molette, pincement).
  function _retenirEdition(toutDeSuite) {
    const e = _e;
    if (!e || typeof window.setPlanEditionVue3D !== "function") return;
    clearTimeout(e.minuterieEdition);
    const ecrire = function () {
      if (_e !== e || !_permisGreffe("plongee")) return;
      window.setPlanEditionVue3D(null, { on: e.vue === "plongee", recul: e.recul, inclinaison: e.inclinaison });
    };
    if (toutDeSuite) ecrire(); else e.minuterieEdition = setTimeout(ecrire, 400);
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

  function avancer(m) { if (!_e) return false; _passerEnLibre(); _rattacher(); return _pas(m, _e.cap); }

  function tourner(deg) { if (!_e) return; _passerEnLibre(); _e.cap = (_e.cap + deg + 360) % 360; _e.sale = true; }

  // `o.profilIti` : ajoute le profil de l'itinéraire (_profilIti), coûteux : jamais lu image par image.
  function etat(o) {
    if (!_e) {
      return { ouvert: false, contexteLibere: _dernierGl ? _dernierGl.isContextLost() : null,
        fermeture: _derniereFermeture };
    }
    const e = _e, info = e.renderer.info, lv = _lampeEnVigueur();
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
      lampe: e.lampe ? +(e.lampe.intensity / (LAMPE.force * lv.courbe.force)).toFixed(2) : null,
      eclairage: { voulue: Object.assign({}, e.lampeVoulue), porteeVoulue: e.porteeVoulue,
        active: { intensite: lv.intensite, faisceau: lv.faisceau, jour: lv.jour },
        intensite: e.lampe ? +e.lampe.intensity.toFixed(2) : null,
        portee: e.lampe ? +e.lampe.distance.toFixed(2) : null, decay: e.lampe ? e.lampe.decay : null,
        angle: e.lampe ? +e.lampe.angle.toFixed(4) : null, penombre: e.lampe ? e.lampe.penumbra : null,
        halo: e.halo ? +e.halo.intensity.toFixed(3) : null, ambiance: e.ambiance ? e.ambiance.intensity : null,
        soleil: e.soleil ? { intensite: e.soleil.intensity, direction: e.soleil.position.clone().normalize().toArray()
          .map(function (v) { return +v.toFixed(3); }) } : null,
        fond: e.scene ? "#" + e.scene.background.getHexString() : null,
        brouillard: e.scene ? "#" + e.scene.fog.color.getHexString() : null,
        curseurs: [[e.curseurLampe, e.lampeValeur], [e.curseurFaisceau, e.faisceauValeur]].map(function (q) {
          const c = q[0];
          return c ? { id: c.id, valeur: Number(c.value), min: Number(c.min), max: Number(c.max), grise: c.disabled,
            texte: q[1].textContent, valuetext: c.getAttribute("aria-valuetext"),
            libelle: !!document.querySelector('label[for="' + c.id + '"]') } : null;
        }),
        jour: e.boutonJour ? { presse: e.boutonJour.getAttribute("aria-pressed"), grise: e.boutonJour.disabled }
          : null },
      portee: { distance: e.distance, rayon: +_rayonScene().toFixed(2), rayonVue: +_rayonVue().toFixed(2),
        recul: +e.recul.toFixed(3), limitee: _limitee(), tout: !_limitee() && !!e.porteeTout, diag: e.diag,
        reculMax: _reculMax(), near: e.camera ? e.camera.near : null,
        limiter: e.boutonLimiter ? { presse: e.boutonLimiter.getAttribute("aria-pressed"),
          grise: e.boutonLimiter.disabled, titre: e.boutonLimiter.title } : null,
        brume: e.scene ? [+e.scene.fog.near.toFixed(2), +e.scene.fog.far.toFixed(2)] : null,
        far: e.camera ? +e.camera.far.toFixed(2) : null, sol: e.sol ? +e.sol.scale.x.toFixed(2) : null,
        curseur: e.curseurPortee ? { valeur: Number(e.curseurPortee.value), min: Number(e.curseurPortee.min),
          grise: e.curseurPortee.disabled,
          max: Number(e.curseurPortee.max), texte: e.porteeValeur.textContent } : null,
        tuiles: _ecartTuiles(), zoomVisible: !!e.boutonsIncl && !e.boutonsIncl.hidden,
        zoomPlusGrise: !!e.zoomPlus && e.zoomPlus.disabled, zoomMoinsGrise: !!e.zoomMoins && e.zoomMoins.disabled },
      aBouge: e.aBouge, rapide: !!e.rapide, suiviDispo: !!e.suiviDispo, vue: e.vue, mode: e.mode,
      inclinaison: e.inclinaison,
      boussole: { angle: e.roseAngle, nord: e.nord, calibre: e.nordCalibre,
        libelle: e.boussole ? e.boussole.getAttribute("aria-label") : "",
        inclinaisonVisible: !!e.boutonsIncl && !e.boutonsIncl.hidden },
      niveau: e.niveau, niveauLibre: Number.isInteger(e.niveauLibre) ? e.niveauLibre : null,
      reindexations: e.reindexations, itiRefaits: e.itiRefaits, msIti: +e.msIti.toFixed(1),
      donnees: { signaux: e.donnees.signaux, verifs: e.donnees.verifs, refaites: e.donnees.refaites,
        degagees: e.donnees.degagees, attente: !!e.donnees.signal, ms: +e.donnees.ms.toFixed(1),
        msEmpreinte: +e.donnees.msEmpreinte.toFixed(2) },
      changementsNiveau: e.changementsNiveau, hauteur: e.hauteur, oeil: e.oeil, distance: e.distance,
      degagements: e.degagements,
      reglageHauteur: { visible: !!e.reglageHauteur && !e.reglageHauteur.hidden,
        bouton: _texteIco(e.boutonHauteur),
        valeur: e.hauteurValeur ? e.hauteurValeur.textContent : "" },
      rendu: e.rendu, poiMasques: e.poiMasques, zonesDecoupees: e.zonesDecoupees, rideaux: e.rideaux.slice(),
      facesRemblais: e.facesRemblais, facesEboulis: e.facesEboulis, rubans: Object.assign({}, e.rubans),
      liseres: Object.assign({}, e.liseres),
      zonesTube: e.zonesTube, poiTube: e.poiTube, halos: e.halos,
      equipe: Object.assign({ membres: 0, membres3d: 0, reperes: 0, itineraires: 0 }, e.nbEquipe || {}),
      membres: e.equipe ? e.equipe.children.filter(function (o) { return o.userData.famille === "membre"; })
        .map(function (o) { return { x: o.position.x, z: o.position.z, vue3d: !!o.userData.vue3d }; }) : [],
      presence: { publiee: e.publiee ? Object.assign({}, e.publiee) : null, publications: e.publications },
      // Lampes des membres : une par silhouette (_lampeMembre), lumières réelles allumées (_majLampesMembres).
      lampesMembres: (e.lampesMembres || []).map(function (m) {
        const w = m.sprite.getWorldPosition(new THREE.Vector3());
        return { x: +m.g.position.x.toFixed(2), z: +m.g.position.z.toFixed(2), y: +w.y.toFixed(2), cap: m.cap,
          visible: m.sprite.visible, faisceau: !!m.faisceau && m.faisceau.visible,
          opacite: +m.sprite.material.opacity.toFixed(2), fog: m.sprite.material.fog,
          depthTest: m.sprite.material.depthTest, px: +m.px.toFixed(1), d: +m.d.toFixed(2), ecran: _ecran(w),
          lumiere: (e.lampesActives || []).indexOf(m) >= 0 };
      }),
      lumieresEquipe: e.lampesEquipe ? { nombre: e.lampesEquipe.length,
        allumees: e.lampesEquipe.filter(function (l) { return l.intensity > 0; }).length } : null,
      avatarEnfants: e.avatar ? e.avatar.children.length : 0,
      brouillard: e.scene ? { near: +e.scene.fog.near.toFixed(2), far: +e.scene.fog.far.toFixed(2) } : null,
      filtres: { panneauOuvert: !!(window.FilterPanel && window.FilterPanel.isVisible()),
        pastille: !!e.boutonFiltres && e.boutonFiltres.classList.contains("kta-filter-ctrl-actif") },
      recouverte: _recouverte(),
      passage: { visible: !!e.boiteNiveaux && !e.boiteNiveaux.hidden,
        haut: e.passageCibles && e.passageCibles.haut ? e.passageCibles.haut.niveau : null,
        bas: e.passageCibles && e.passageCibles.bas ? e.passageCibles.bas.niveau : null,
        liste: e.passageCibles ? e.passageCibles.liste.map(function (c) { return c.niveau; }) : [] },
      boutonRendu: _texteIco(e.boutonRendu),
      bandeau: Object.assign({ affiche: !!e.bandeau && !e.bandeau.hidden }, e.bandeauEtat),
      chevrons: e.nChevrons, chevronsVisibles: !!e.chevrons && !!e.chevrons.parent,
      recalcul: { enCours: e.recalcul.enCours, n: e.recalcul.n, echecs: e.recalcul.echecs, ms: e.recalcul.ms,
        raison: e.recalcul.raison, ecartM: e.ecartLibre === null || e.ecartLibre === undefined ? null :
          (Number.isFinite(e.ecartLibre) ? +e.ecartLibre.toFixed(2) : -1) },
      dessin: _etatDessin(),
      fichesObjets: { voulu: _fichesObjets(), bouton: e.boutonFiches ? e.boutonFiches.getAttribute("aria-pressed") : null },
      // Dernier « Y aller en 3D » (allerA) et 🔍 de la rangée du haut montré ou non.
      recherche: Object.assign({ haut: !!(e.boutonRechercheHaut && !e.boutonRechercheHaut.hidden),
        preneur: !!e.rendreRecherche }, e.recherche || { allees: 0 }),
      fiche: e.fiche && e.fiche.objet ? { famille: e.fiche.famille, uid: e.fiche.objet.uid || null,
        type: e.fiche.objet.type, session: e.fiche.session, registre: e.fiche.registre,
        note: !!e.fiche.boite.querySelector(".kta-note-popup-textarea"),
        supprimer: !!e.fiche.boite.querySelector(".kta-note-popup-supprimer"),
        voir: !!e.fiche.boite.querySelector('[data-v3d="ficheVoir"]'),
        focus: e.fiche.boite.contains(document.activeElement) } :
        e.fiche ? { nom: String(e.fiche.point.nom || ""), x: e.fiche.point.x, y: e.fiche.point.y,
        passages: Array.prototype.map.call(e.fiche.boite.querySelectorAll("[data-v3d-passage]"), function (b) {
          return b.textContent;
        }) } : null,
      volumes: (e.volPassages || []).map(function (v) {
        return Object.assign({ genre: v.genre, tag: v.tag || null, forme: v.forme || null, moyen: v.moyen || null,
          sol: !!v.sol, plafond: !!v.plafond, ciel: !!v.ciel, grille: !!v.grille, echelons: !!v.echelons,
          passage: !!v.passage, monte: v.monte === undefined ? null : v.monte, construit: !!v.obj, x: v.x, y: v.y,
          bouche: v.genre === "poi" ? [[-v.a, -v.b], [v.a, -v.b], [v.a, v.b], [-v.a, v.b]].map(function (q) {
            return _repere(v)(q[0], q[1]);
          }) : null,
          pente: v.p ? { dY: +v.p.dY.toFixed(3), tOuvert: +v.p.tOuvert.toFixed(3), autre: v.p.autre } : null,
          paroisPente: v.paroisPente || null },
          v.stats || {});
      }),
      voisins: _etatVoisins(),
      // Galeries inclinées du niveau et celle sous la place (_surPente) : t, s (m), sol (dy, m).
      pentes: (e.pentes || []).map(function (p) {
        return { autre: p.autre, dY: +p.dY.toFixed(3), hA: p.hA, hB: p.hB, tot: +p.tot.toFixed(3),
          tOuvert: +p.tOuvert.toFixed(3), sansSols: p.sansSols, demiA: +p.demiA.toFixed(3), demiB: +p.demiB.toFixed(3),
          raccordA: p.raccordA, raccordB: p.raccordB };
      }),
      pente: (function () {
        const q = _surPente(e.pos.x / e.sc, e.pos.y / e.sc, 0);
        return { sur: !!q, t: q ? +q.t.toFixed(4) : null, s: q ? +q.s.toFixed(3) : null, dy: q ? +q.dy.toFixed(3) : 0,
          plafond: q ? +q.plafond.toFixed(3) : null, autre: q ? q.p.autre : null, zone: !!(q && q.zone),
          franchies: e.pentesFranchies,
          itineraire: e.nItiPentes };
      })(),
      geste: e.geste ? { sens: e.geste.sens, t: Math.round(e.geste.t), bascule: e.geste.fait } : null,
      cameraY: +e.camera.position.y.toFixed(3), ramper: +(e.ramper || 0).toFixed(3),
      plaques: e.plaques ? { n: e.plaques.size, octets: Array.from(e.plaques.values()).reduce(function (s, t) {
        return s + t.octets;
      }, 0), noms: Array.from(e.plaques.values()).map(function (t) { return t.nom; }),
      bodoni: Array.from(e.plaques.values()).filter(function (t) { return t.bodoni; }).length,
      police: _police.etat } : null,
      fondu: +(e.fonduOp || 0).toFixed(2),
      fonduPresent: !!e.fondu && !!e.fondu.parentNode && !e.fondu.hidden,
      bandeauNiveau: e.bandeauNiveau && !e.bandeauNiveau.hidden ? e.bandeauNiveau.textContent : null,
      pos: { x: e.pos.x, y: e.pos.y }, cap: e.cap, butees: e.butees, images: e.images,
      niveauEdition: e.boiteNiveauEdition ? { visible: !e.boiteNiveauEdition.hidden,
        texte: e.niveauEditionValeur.textContent, haut: !e.niveauEditionHaut.disabled,
        bas: !e.niveauEditionBas.disabled } : null,
      camera: { vise: e.vise ? { x: e.vise.x, z: e.vise.z } : null, centre: Object.assign({}, _centreScene()),
        visee: Object.assign({}, _viseeCamera()), place: !!e.boutonPlace && !e.boutonPlace.hidden,
        edition: !!e.ov && e.ov.classList.contains("kta-v3d-edition") },
      mesure: e.bandeauMesure ? { affiche: !e.bandeauMesure.hidden,
        lignes: Array.prototype.map.call(e.bandeauMesure.children, function (l) { return l.textContent; }) } : null,
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
          icone: !!sp.userData.poi.icone, masque: !!sp.userData.poi.masque, lie: !!sp.userData.poi.lie,
          passage: !!sp.userData.poi.passage,
          boite: sp.userData.poi.ecran ? ["x", "y", "w", "h"].map(function (c) {
            return +sp.userData.poi.ecran[c].toFixed(1);
          }) : null,
          largeurEcran: +_largeurEcran(sp).toFixed(3),
          lettrePx: +(_largeurEcran(sp) * (sp.userData.ratio || 0) * (e.camera.aspect || 1) * (sp.userData.lettre || 0) *
            (e.cv.clientHeight || 0)).toFixed(1) };
      }),
      desencombre: e.desencombre ? Object.assign({}, e.desencombre) : null,
      murDecale: e.mats.murs.polygonOffset === true,
      // Recul en profondeur du sol (SOL_RECULE) et des matériaux posés dessus, plans de la caméra (checkup § 45).
      profondeur: (function () {
        const d = function (m) {
          return { decale: m.polygonOffset === true, facteur: m.polygonOffsetFactor, unites: m.polygonOffsetUnits };
        };
        const sol = [e.mats.sol, e.mats.solGalerie].concat(["haut", "bas"].reduce(function (l, k) {
          return e.matsV && e.matsV[k] ? l.concat([e.matsV[k].sol, e.matsV[k].solGalerie]) : l;
        }, [])).map(d);
        const zones = ["transp", "hachSol", "opaque", "eauGalerie", "rubans"].map(function (k) {
          const m = e.mats[k];
          return { mat: k, recule: m.polygonOffset === true && (m.polygonOffsetFactor > 0 || m.polygonOffsetUnits > 0) };
        });
        return { near: e.camera.near, far: e.camera.far, sol: sol, zones: zones, maniereSol: _maniereSol(),
          solMat: { transparent: e.sol.material.transparent, opacite: e.sol.material.opacity,
            couleur: e.sol.material.colorWrite, profondeur: e.sol.material.depthWrite, ordre: e.sol.renderOrder } };
      })(),
      commandes: e.commandes, pave: !!e.pave && e.pave.isConnected,
      stick: e.stickZone ? _etatStick() : null, toucheNom: e.toucheNom, codesBas: e.codesBas,
      greffe: e.greffe ? { nom: e.greffe.nom, appels: Object.assign({}, e.greffe.appels),
        objets: e.greffe.groupe.children.length, dansScene: e.greffe.groupe.parent === e.scene,
        hud: e.greffe.hud.isConnected, reglage: Object.assign({}, e.greffe.reglage) } : null,
      reglages: { ouvert: !!e.tuileReglages && !e.tuileReglages.hidden,
        repere: !!e.boutonReglages && e.boutonReglages.classList.contains("kta-v3d-modifie"),
        indic: _texteIco(e.indicMode), boussole: !!e.boussole && !e.boussole.hidden,
        guidage: _guidageMontre() },
      miniCarte: _etatMiniCarte(),
      itineraire: Object.assign({ largeurVoulue: LARGEUR_ITI, lisereVoulu: ITI.lisere, couleur: _couleursIti().hexRuban,
        couleurLisere: _couleursIti().hexLisere, couleurChevrons: _couleursIti().hexLisere, chevrons: e.itiChevrons },
      e.nbMarqueurs, _mesureIti(!!(o && o.profilIti))),
      ronds: e.listeRonds.map(function (r) { return Object.assign({}, r); }),
      distanceTotale: e.listeDistTot ? Object.assign({ dansScene: !!(e.distTot && e.distTot.parent === e.scene),
        largeur: SURLIGNE.larg, y: SURLIGNE.y,
        emprise: e.distTot ? (e.distTot.geometry.computeBoundingBox(), {
          x0: +e.distTot.geometry.boundingBox.min.x.toFixed(3), x1: +e.distTot.geometry.boundingBox.max.x.toFixed(3),
          z0: +e.distTot.geometry.boundingBox.min.z.toFixed(3), z1: +e.distTot.geometry.boundingBox.max.z.toFixed(3),
          y1: +e.distTot.geometry.boundingBox.max.y.toFixed(3) }) : null }, e.listeDistTot) : null,
      triangles: info.render.triangles, appels: info.render.calls,
      geometries: info.memory.geometries, textures: info.memory.textures,
      msOuverture: Math.round(e.msOuverture || 0), msIndex: Math.round(e.msIndex), msTuiles: Math.round(e.msTuiles),
      msFaces: +(e.msFaces || 0).toFixed(2), facesStructures: e.facesStructures || 0
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

  // Ruban de l'itinéraire tel que construit (checkup), lu dans la géométrie des tuiles construites (m) : largeur
  // médiane de la bande claire et du liseré, nombre de bandes claires et leur longueur totale, chevrons de sens
  // (nombre, centres [x, z], composante de la pointe sur +x du premier). Hauteur des bandes : sol seulement.
  function _mesureIti(profil) {
    const ruban = [], lisere = [], chev = [], centres = [];
    let bandes = 0, longueur = 0, pointeX = null;
    _e.tuiles.forEach(function (t) {
      if (!t.obj) return;
      t.obj.children.forEach(function (m) {
        if (m.userData.famille !== "itineraire" || !m.geometry) return;
        const p = m.geometry.attributes.position.array;
        for (let q = 0; q + 17 < p.length; q += 18) {
          const d = function (i, j) { return Math.hypot(p[q + 3 * i] - p[q + 3 * j], p[q + 3 * i + 2] - p[q + 3 * j + 2]); };
          const l = [d(0, 1), d(1, 2), d(0, 2)].sort(function (a, b) { return a - b; }), y = p[q + 1];
          if (Math.abs(y - ITI.y - ITI.dy) < 1e-4) chev.push(q);
          else if (Math.abs(y - ITI.y) < 1e-4) { ruban.push(l[0]); bandes++; longueur += l[1]; }
          else if (Math.abs(y - ITI.y + 0.005) < 1e-4) lisere.push(l[0]);
        }
        // Chevron = deux quadrilatères consécutifs : centre = moyenne de leurs 12 sommets ; pointe = sommet commun.
        for (let k = 0; k + 1 < chev.length; k += 2) {
          let x = 0, z = 0;
          for (let i = 0; i < 6; i++) {
            x += (p[chev[k] + 3 * i] + p[chev[k + 1] + 3 * i]) / 12;
            z += (p[chev[k] + 3 * i + 2] + p[chev[k + 1] + 3 * i + 2]) / 12;
          }
          if (pointeX === null) pointeX = +((p[chev[k]] + p[chev[k + 1]]) / 2 - x).toFixed(3);
          centres.push([+x.toFixed(3), +z.toFixed(3)]);
        }
        chev.length = 0;
      });
    });
    const med = function (t) {
      if (!t.length) return null;
      t.sort(function (a, b) { return a - b; });
      return +t[t.length >> 1].toFixed(3);
    };
    return Object.assign({ ruban: med(ruban), lisere: med(lisere), bandes: bandes, longueurRuban: +longueur.toFixed(3),
      chevronsGeo: centres.length, chevronsXZ: centres, pointeX: pointeX }, profil ? _profilIti() : null);
  }

  // Profil de l'itinéraire construit (checkup : par-dessus les volumes) : un quadrilatère par entrée
  // [x, z, yMin, yMax, clair] (m, centre ; clair = bande du ruban, sinon liseré), chevrons [x, z, y], étapes
  // [x, z, y], et la plus haute bande des rubans des tracés (rubansYMax).
  function _profilIti() {
    const e = _e, cols = _couleursIti(), rouge = Math.round(cols.ruban.r * 255), profil = [], rubansY = [];
    const quads = function (m, f) {
      const p = m.geometry.attributes.position.array, c = m.geometry.attributes.color.array;
      for (let q = 0; q + 17 < p.length; q += 18) {
        let x = 0, z = 0, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < 6; i++) {
          x += p[q + 3 * i] / 6; z += p[q + 3 * i + 2] / 6;
          y0 = Math.min(y0, p[q + 3 * i + 1]); y1 = Math.max(y1, p[q + 3 * i + 1]);
        }
        f(+x.toFixed(3), +z.toFixed(3), +y0.toFixed(3), +y1.toFixed(3), c[q] === rouge);
      }
    };
    e.tuiles.forEach(function (t) {
      if (!t.obj) return;
      t.obj.children.forEach(function (m) {
        if (!m.geometry) return;
        if (m.userData.famille === "itineraire") {
          quads(m, function (x, z, y0, y1, clair) { profil.push([x, z, y0, y1, clair ? 1 : 0]); });
        } else if (m.userData.famille === "rubans") {
          quads(m, function (x, z, y0, y1) { rubansY.push(y1); });
        }
      });
    });
    const chevronsY = [];
    if (e.chevrons && e.chevrons.geometry) quads(e.chevrons, function (x, z, y0) { chevronsY.push([x, z, y0]); });
    const etapesY = [];
    if (e.marqueursIti) {
      e.marqueursIti.children.forEach(function (g) {
        if (g.userData.famille === "etape") etapesY.push([+g.position.x.toFixed(3), +g.position.z.toFixed(3),
          +g.position.y.toFixed(3)]);
      });
    }
    return { profil: profil, chevronsY: chevronsY, etapesY: etapesY,
      rubansYMax: rubansY.length ? Math.max.apply(null, rubansY) : null };
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
      paroi: e.mats.paroi, paroiUnie: e.mats.paroiUnie, remblais: e.mats.remblais, eboulis: e.mats.eboulis, porte: e.mats.porte };
    const r = { actives: _texturesActives(), bouton: !!e.boutonTextures && e.boutonTextures.getAttribute("aria-pressed"),
      uvParMetre: { roche: 1 / ROCHE.m, parpaing: 1 / PARPAING.m, pierre: 1 / PIERRE.m, remblais: 1 / REMBLAIS.m,
        eboulis: 1 / EBOULIS.m,
        moellons: { h: 1 / (MOELLON.l * MOELLONS_MOTIF.l), v: 1 / (MOELLON.h * MOELLONS_MOTIF.h) } },
      maillages: {}, couleurs: {}, teintes: {}, aretes: [], ms: Math.round(e.msTextures || 0), msParoi: Math.round(e.msParoi || 0),
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
    ["roche", "parpaing", "paroi", "remblais", "eboulis", "porte"].forEach(function (k) {
      const m = mats[k];
      if (!m) return;
      r.materiaux[k] = { pente: m.normalMap ? pente(m.normalMap.image) : 0, carte: m.map.image.width + "x" + m.map.image.height, normale: !!m.normalMap,
        relief: m.normalMap ? m.normalMap.image.width : 0,
        mipmaps: m.map.generateMipmaps && (!m.normalMap || m.normalMap.generateMipmaps),
        anisotropie: m.map.anisotropy, couleursSommets: m.vertexColors, recule: m.polygonOffset,
        lits: lits(m.map.image) };
    });
    r.materiaux.paroi.pierre = !!e.texPierre && e.mats.paroi.map === e.texPierre.couleur;
    // Sol et plafond (🧱 coupé : noirs, sans carte).
    r.sols = {};
    ["sol", "plafond", "solGalerie", "plafondGalerie"].forEach(function (k) {
      const m = e.mats[k];
      r.sols[k] = { carte: !!m.map, couleur: "#" + m.color.getHexString() };
    });
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
        // Couleurs des sommets : `couleurs` des maillages unis, `teintes` des texturés qui en tiennent compte (roche).
        if (!uv || me.material.vertexColors) {
          const c = g.attributes.color.array, table = uv ? r.teintes : r.couleurs;
          const vus = table[nom] || (table[nom] = []);
          for (let i = 0; i < c.length; i += 3) {
            const hex = "#" + [c[i], c[i + 1], c[i + 2]].map(function (v) { return v.toString(16).padStart(2, "0"); }).join("");
            if (vus.indexOf(hex) < 0) vus.push(hex);
          }
          if (!uv) return;
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
    _gererVoisins(true);
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
    raccourcis: raccourcis,
    panner: panner, surPlace: surPlace, niveauEdition: niveauEdition,
    basculerSuivi: basculerSuivi, basculerRendu: basculerRendu, changerNiveau: changerNiveau, parois: parois,
    textures: textures, basculerTextures: function () { return _basculerTextures(); },
    avancer: avancer, tourner: tourner, suivre: suivre, placer: placer, reglerHauteur: reglerHauteur,
    reglerPortee: reglerPortee, reglerLampe: reglerLampe, reglerFaisceau: reglerFaisceau,
    reglerPleinJour: reglerPleinJour, limiterPortee: limiterPortee, zoomer: zoomer, reglerNiveauxVus: reglerNiveauxVus,
    reglerEstomper: reglerEstomper, altitude: altitude, entremeles: entremeles, rayon: rayon,
    origineItineraire: origineItineraire, placerSurTracker: placerSurTracker, trackerRecale: trackerRecale,
    charge: function () { return !!THREE; },
    greffer: greffer,
    viser: viser,
    allerA: allerA,
    // Niveau de la scène : undefined vue fermée, null plan à un niveau. Lu par 📏 et ⛏️ (groupe 📐) : la mesure
    // compte le niveau de la vue, pas forcément le niveau actif de la carte (passage 🪜, suivi).
    niveauVue: function () { return _e ? _e.niveau : undefined; },
    // Dernier objet montré sur la carte par « Voir sur la carte » (checkup) : { famille, uid, centre, fiche, at }.
    derniereMontre: function () {
      return _derniereMontre ? { famille: _derniereMontre.famille, uid: _derniereMontre.uid,
        centre: _derniereMontre.centre, fiche: _derniereMontre.fiche,
        surbrillance: !!(_derniereMontre.trait && _derniereMontre.trait._map), at: _derniereMontre.at } : null;
    },
    // Passages avec ou sans geste (fondu, descente) : false = bascule immédiate (mesures, checkup).
    gesteAnime: function (oui) { if (oui !== undefined) _gesteAnime = oui !== false; return _gesteAnime; }
  };
})();
