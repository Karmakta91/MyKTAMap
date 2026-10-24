# 🔥 Smoke navigateur (Playwright)

Le garde-fou qui **clique** — né après 3 erreurs runtime en une semaine
(`ReferenceError saved`, modale invisible par classe CSS fantôme,
`tilesOverlay` hors portée) que les garde-fous logiques ne peuvent pas voir.

## Lancer

```bash
cd scripts/smoke
npm install          # 1re fois : télécharge Chromium (~130 Mo)
npm run smoke
```

Sert le repo en local (port 8123, ou `SMOKE_PORT` pour deux copies de travail en même temps), boote l'app dans Chromium headless,
passe les gates (mdp communautaire, CGU, tutoriel, alerte, proposition PIN
— pré-seedés en localStorage), puis :

1. **Boot HOME** — en-tête + liste des plans peuplée
2. **⚙️ Configuration** — section Mode Développeur présente, fermeture propre
3. **📊 Éditeur de données** — accueil + modale « Recaler des données sur un autre scan » **avec dimensions réelles** (une modale « présente mais invisible » est un échec)
4. **Chargement de `Relevé fictif de test`** (`data/test`, servi tel quel — plan **multi-niveau** depuis la refonte de `data/` par KARMA, donc l'étape traverse aussi le M-LVL)
5. **⚙️ Réglages carte** — la section géoref se construit (bouton Estimer B)
6. **≡ Légende**
7. **📊 Modale Session + section 📔 Carnet** — boutons 🚶/🖥️ de classement (le clic bascule bien la cible), bouton 🧭 « Affiner le tracé » **présent ET grisé** (aucun « Je suis ici » posé dans le scénario : un bouton actif ici signalerait un compteur de tronçons faux)
8. **❓ Aide intégrée** — hub peuplé (≥ 10 lignes : une modale vide serait « visible » donc verte au seul test de dimensions), **classes de typographie réellement servies** (`kta-aide-note` doit calculer 12px — sinon le bloc CSS n'est pas déployé et le texte perd taille et couleur *sans aucune erreur console*), ouverture d'une sous-modale de section

> Les étapes 7 et 8 sont nées de trous constatés : ces deux écrans n'étaient
> traversés par AUCUNE étape. L'Aide avait alors ~1 700 lignes de HTML en dur
> (migrées dans les dicos `lang/` en v1.80.0) et a encaissé coup sur coup une
> régression de langue (elle sortait en français pour les hispanophones) et
> trois défauts de structure — invisibles ici tant que le harnais ne l'ouvrait
> pas.

**Échec (exit 1) sur** : toute erreur console, toute `pageerror`, tout
`[I18n] Clé manquante`, tout 404 non listé dans le bruit toléré, toute
modale invisible, tout overlay résiduel.

Le bruit toléré (liste courte et justifiée dans `smoke.js`) : `version.json`
/ `ping.html` / `live-config` (update-checker hors-ligne), `favicon`,
`Licence-pro.json` (sonde pro : 404 = instance community, nominal).

## Checkups ciblés (même dossier, lancés à la main)

Le smoke boote **en français** et en **grande fenêtre** : deux angles morts
structurels. Ces scripts les couvrent, chacun sur un axe précis.

| Script | Axe couvert |
|---|---|
| `node checkup-langues.js` | parcours d'un utilisateur **espagnol** : Documentation et Aide en espagnol, aucun drapeau résiduel sur l'Aide, aucun titre de section resté en français |
| `node checkup-panneaux-geometrie.js` | **Panneaux d'outils** du mode plan (Tracés, Zones, Structures, Favoris) sur 4 formats (portrait, 2 paysages, PC) × centré/ancré, liste de 22 boutons : entre la barre du haut et le footer, dernier bouton atteignable, fond + croix 36 px en centré, fermer en touchant la carte n'ajoute aucun sommet, boutons de zoom empilés |
| `node checkup-home-scroll.js` | HOME en **petite fenêtre PC** (6 configs, 1280→1920 × 500→768) : le contenu déborde, mais la **molette** scrolle et le footer se rejoint |
| `node checkup-guidage.js` | **Guidage de l'itinéraire** en **taille téléphone** (390×844) : bandeau sous l'en-tête et entre les colonnes de boutons, raccord en pointillé, feuille de route, avancée le long du trajet sans fausse alerte, écart, écran XL, urgence sans croix. Captures dans `$GUID_SHOTS` (défaut : dossier temporaire) |
| `node checkup-tableur-session.js` | **Éditeur de données → session** sur le relevé fictif (multi-niveau) : session sans champ `level`, colonne « level » présente en liste ; type et niveau d'un tracé, d'une zone, d'une structure (« Appliquer à la session ») et tags + niveau d'un POI, tous par « Appliquer à la session » ; type inconnu refusé (ligne et type nommés, rien d'écrit) ; ⏪ annule chaque application en un geste ; fichier ancien : seule la cellule modifiée s'applique (tracé et POI) ; objet supprimé depuis l'export : ligne non touchée ignorée, ligne modifiée réajoutée |
| `node checkup-niveau-objet.js` | **Niveau d'un objet** sur le relevé fictif (multi-niveau) : liste « Niveau » de la fiche d'un tracé, d'une zone, d'une structure et du formulaire d'un POI ; niveau masqué (objet retiré, toast, vue inchangée) ; niveau actuel hors liste proposé ; pas de liste pendant un dessin ni à l'ajout ; ⏪ / ⏩ ; signature du graphe de navigation ; persistance au rechargement |
| `node checkup-filtres-niveaux.js` | **≡ Filtres › Niveaux** sur le relevé fictif (multi-niveau) : clic réel sur chaque bouton « Niveau actif (dessin) », sombre et clair → seul le bouton cliqué porte la classe et le fond doré ; case « 🖼️ Afficher le plan de base » (automatique : suit le niveau 0 ; décochée avec 0 visible → fond masqué et pastille ≡ ; cochée avec 0 masqué → fond visible ; « Tout afficher » → automatique ; plan à un seul niveau : dans « Calques image »), gardée au rechargement, ancienne session `garderFond` migrée ; rendu direct, V1 et V2 (`PLAN_V2_ZIP` = chemin d'un ZIP tuilé hors dépôt, sinon état factice) ; **point masqué inerte** (point de session et point d'un calque : tag décoché, niveau masqué, calque décoché puis recoché, marqueur masqué avant son `addTo`) : son icône ne prend plus le pointeur, aucun clic n'ouvre sa fiche, il redevient cliquable au réaffichage |
| `node checkup-jonction-fiche.js` | **Fiche d'une jonction** sur le relevé fictif (multi-niveau) : titre, pas de Convertir, deux niveaux identiques refusés dans la fiche, niveaux changés puis ⏪ / ⏩ (une entrée), filtre et ronds d'extrémité qui suivent, itinéraire qui emprunte la jonction seulement avec les bons niveaux, note, suppression (trace) puis ⏪, pas de fiche pendant un dessin, lecture seule ; **🗑️ Effacer la session depuis 📊 Détails** : confirmation de l'app, annuler, trois choix d'un plan partagé (prise simulée) ; N en attente → 3 choix, 0 → 2, rien de présélectionné ; plan ☁️ en lecture seule aux deux entrées : « Rien à effacer : ce plan vient du serveur » |
| `node checkup-poi-jonction.js` | **POI entre niveaux** (jes / jpe / jps) sur le relevé fictif (multi-niveau), galeries fabriquées au lancement : formulaire (bloc « Niveaux desservis » selon le tag, niveau du point figé), raccords proposés dans le rayon (5 m à l'échelle du plan, 50 px sans), galerie hors rayon non proposée, rien de validé d'office ; `niveaux` + `accroches` + uid sur le point ; fiche : raccords dessinés seulement fiche ouverte ; filtre : visible sur chacun de ses niveaux ; itinéraire 0 → −1 par la fenêtre de l'app : forfait (81 m), profondeurs saisies (67 m), consigne « par l'échelle », `jps` exclu puis emprunté avec la case corde ; sortie d'urgence : `peo` multi-niveaux proposé, `jpe` jamais ; KMZ : le passage dans le dossier de chacun de ses niveaux, réimporté une seule fois avec ses niveaux. `PJ_SHOTS=<dossier>` : captures |
| `node checkup-toasts.js` | **Toasts** sur PC 1280 et téléphone 390, sombre et clair : 3 et 5 toasts d'affilée (empilés, le plus récent en bas, 3 visibles, une erreur part en dernier), types info / succès / warn / erreur (icône, liseré ≥ 3:1, texte ≥ 4,5:1), « Essentielles » et « Silence », Échap, au premier plan sur la carte du relevé fictif ; « J'accepte » des CGU inactif mesuré (≥ 3:1) et sa consigne. Captures dans `$TOASTS_SHOTS` (défaut : dossier temporaire) |
| `node checkup-aide-telephone.js` | **Fiche d'Aide sur téléphone** (390 portrait et 844×390 tactile) : la fiche remplace le hub (un voile, une croix), « ← Retour » lisible (≥ 4,5:1) rend le hub à la même position de défilement, Échap revient au hub puis ferme ; PC 1280 : sous-fenêtre inchangée, Retour lisible au repos et survolé. **Mouvement réduit** : les indicateurs de chargement pulsent, le reste est coupé |
| `node checkup-ouvertures-enchainees.js` | **Ouvertures de plan enchaînées** : le relevé fictif ouvert 10 fois en repassant par l'écran de chargement à un moment varié, puis 10 fois sans attendre la carte (`OUV_N` pour un autre nombre) : carte prête à chaque fois, dernière carte vivante, **aucune erreur de page** (la minuterie de fin de zoom d'une carte démontée jetait `_leaflet_pos`) |
| `node checkup-pdf-plafond.js` | **PDF plafonné par l'appareil** : navigateur présenté comme un iPhone (plafond 16,7 Mpx), relevé fictif, PDF « Haute définition » : toast d'avertissement qui donne la taille produite (sous le plafond, arrondi des côtés compris) et la qualité demandée ; « Brouillon » sous le plafond : aucun toast |
| `node checkup-rails-toucher.js` | **Rails latéraux de la carte au doigt** : téléphone 390 et 844 × 390 tactiles, PC 1280 souris, relevé fictif. Marque inchangée (36 px ; 30 en paysage bas), zone de toucher sondée au pixel : 44 px de large au doigt en portrait, aucune zone plus haute que son bouton (pas de voisin mordu), souris et paysage bas = marque. `RAILS_SHOTS=<dossier>` : captures, dont les bords des rails en gros plan |
| `node checkup-pastille-horsligne.js` | **Pastille « hors-ligne » de l'accueil** (téléphone 390) : coût de `SwInspector.etat()` au processeur normal, ×4 et ×6 (médiane, p90, tâches longues ; `OFF_N` appels par palier), puis, sombre et clair, états vert, rouge (📥 dans l'en-tête), orange hors réseau et orange « récupération », contraste du point ≥ 3:1. `OFF_SHOTS=<dossier>` : captures du pied de page |
| `node checkup-dossier-hors-ligne.js` | **« 📥 Tout garder hors ligne » d'un dossier** (plans serveur fictifs servis par interception, ETag par version) : manquant récupéré, à jour sauté, version plus récente mise à jour, plan ZIP de l'index, plan local « déjà là », introuvable en échec avec sa raison, bilan et toast ; 2e passe sans aucun téléchargement ; ⏹ Arrêter ; confirmation au-delà de 200 Mo (Annuler : rien ne part) ; données mobiles simulées ; arrière-plan + réseau coupé pendant un plan → reprise sans retélécharger. `DHL_SHOTS=<dossier>` : captures |
| `node checkup-repositionner.js` | **Repositionner un POI** à la souris : le clic sur « Repositionner » arme le mode sans déplacer le point (il prenait ce clic pour la position), puis le clic sur la carte y pose le POI et termine le mode |
| `node checkup-splash.js` | **Splash de démarrage** en téléphone 390 et PC 1280 : image finale complète (38 galeries, pictos, rose), fermeture seulement quand l'accueil est affiché (accueil lent / rapide), clic et Échap, seconde ouverture rejouée en entier, plafond 12 s, mouvement réduit, coût au démarrage processeur ×4. `SPLASH_SHOTS=<dossier>` : captures |
| `node checkup-osm-empilement.js` | **Vue OSM** sur le relevé fictif, auquel le checkup prête un tuilage V2 (tuiles en `data:` dans `RUNTIME_ASSETS`) et un calage fictif : à chaque cran de molette, après 🖼️ Plan décoché / recoché et à la réouverture, toutes les tuiles dans le pane `ktaOsmTuiles` (sous les marqueurs), un seul niveau à l'écran, case décochée respectée à la réouverture, et **au pixel** les icônes opaques identiques avec et sans tuiles, aux échelles d'affichage 1, 1,25, 1,5 et 2 (`OSM_ECHELLES=1,1.5` pour en choisir), une fois chaque marqueur à sa position calculée |
| `node checkup-osm-taille-icones.js` | **Réglage « 📐 Adapter la taille des icônes au zoom » sur les cartes OSM** (relevé fictif, tuilage et calage prêtés, + 1 500 POI synthétiques) : Vue OSM et carte de l'accueil, taille mesurée = base × loi du mode plan (px écran par px de plan, bornée [0,5 ; 2], plancher propre aux cartes OSM) à quatre zooms, taille de base réglage coupé, bascule à chaud dans les deux sens, échelle du mode plan intacte ; temps de zoom réglage actif / coupé (`OSM_PAS=6` pour une mesure plus longue) |
| `node checkup-osm-legende.js` | **Légende du plan en lecture seule depuis les cartes OSM** (relevé fictif, tuilage et calage prêtés, un second plan = le même relevé sous un autre id) : légende identique à la ≡ Légende du mode plan (couleur choisie, zone et icône `cust-…`) depuis la Vue OSM, l'accueil plan chargé et l'accueil après redémarrage ; aucun contrôle de modification, avertissement qui nomme le plan à deux plans, légende au premier plan (plein écran compris), Échap qui ne ferme qu'elle, 390 px sans débordement (`CAPTURES=<dossier>` : captures sombre / clair / mobile) |
| `node checkup-recalage-scan.js` | **Recaler des données sur un autre scan** sur le relevé fictif, jeux fictifs fabriqués au lancement (points de session + leur version passée par une similitude connue, 3 homonymes aberrants, un tracé, une zone) : accueil sans plan = résolutions seules ; par les noms = écart ≈ 0, aberrants écartés, fichier téléchargé qui retombe sur le plan ; aperçu ajouté puis retiré à la fermeture ; 4 repères cliqués dont un faux signalé seul ; proportions divergentes refusées. `RECAL_SHOTS=<dossier>` : captures |
| `node checkup-export-sig.js` | **Exports SIG** (relevé fictif + calque fabriqué, calage de test tourné à 3 points) : tuiles GeoTIFF (Image) et GeoJSON (Export externe) du lanceur ; GeoTIFF scan seul en Lambert 93 et scan + dessins en WGS84 relus par `tiffGeoref.js` (dimensions annoncées, tuiles, Deflate, EPSG, 3 coins et A / B / C à < 1 m, couleur d'une structure personnalisée absente puis présente) ; réimport du GeoTIFF Lambert 93 tourné (`TiffGeoref.lire` : A, B, C posés, 4 coins à < 1 m) ; plan non calé : Télécharger grisé et expliqué ; GeoJSON = KMZ famille par famille avec les mêmes cases, `crs` en Lambert 93, aucun en WGS84. `SIG_PLAN_ZIP=<archive>` : mesures (taille, durée, mémoire) sur un vrai plan, chiffres seulement ; `SIG_SORTIE=<dossier>` : fichiers produits (pour `gdalinfo`) |
| `node checkup-exports-structures.js` | **Ce que les exports emportent** (relevé fictif + calque fabriqué : 5 structures intégrées, structure personnalisée en ligne et en polygone, type brut sans légende, idem tracés / zones, un point par tag du catalogue, sans tag, tag inconnu, icône de plan en SVG et chemin mort) : KMZ par la fenêtre d'export (Placemarks par famille, ligne personnalisée en `LineString` à la couleur de la légende, une icône PNG non vide et distincte par tag) ; carte : chaque point du catalogue porte son icône ; image (pipeline PNG / PDF) : couleur au pixel sur les structures personnalisées et dans la légende ; ≡ Légende : « Point sans tag » = `icon/default.png`, une ligne traduite par tag du catalogue ; ≡ Filtres : une pastille de couleur par type, aucun ✨ en double |

> ⚠️ `checkup-home-scroll.js` **abandonne** au lieu de conclure si un overlay
> couvre encore la page. Le splash reste ~4 s puis est *retiré du DOM* — et
> comme il est en `position:fixed`, son `offsetParent` vaut `null`, donc
> l'attendre par ce biais réussit **trop tôt**. La modale « Accès hors-ligne »
> s'ouvre en plus dès que le service worker est bloqué. Les deux figent
> `scrollHeight` et interceptent la molette : c'est ce qui avait fait croire à
> un bug de scroll du HOME (dette D-home-mini, classée sans suite le 02/09).

## Quand le lancer

Marche du **RELEASE_GATE** (avant chaque release) — pas en pre-commit
(quelques dizaines de secondes par run). Un ajout d'écran dans l'app mérite
son étape ici.
