# Architecture MyKTAMap — Vue carte (modale, widget HOME, fond sous le plan)

> 🏷️ **Nom côté utilisateur : « Vue carte »** (en « Map view », es « Vista mapa ») : boutons, titres, case de
> Configuration, aides et guides. Le code garde ses noms (`osmView.js`, `window.OsmView`, clés `osm.*` /
> `osm_home.*`, `myktamap_osm_view_opt_in`). La case de consentement nomme toujours les tiers contactés
> (« Vue carte (OpenStreetMap et IGN) », puis les deux domaines) : le mot « carte » ne doit pas les cacher.

> 🌍 **v1.90.2 — L'OPT-IN DEVIENT UN OPT-OUT.** Décision KARMA : *« active le mode OSM par défaut, dans 99 %
> des cas ce mode est utilisé »*. `myktamap_osm_view_opt_in` est **tri-état** et c'est tout l'intérêt :
> `"1"` accepté → ON · `"0"` **refusé explicitement → OFF, jamais réécrasé** · absent → **ON** (le changement).
>
> 🩸 **Ce n'est pas un réglage d'affichage.** Le widget du HOME monte une carte Leaflet dont le fond vient de
> `tile.openstreetmap.org` : actif par défaut, **l'accueil contacte un tiers au chargement, sans clic**, pour
> qui possède au moins un plan géoréférencé. Avec les fonds IGN (seulement si l'utilisateur les choisit, § Fonds de
> carte), ce sont les seules requêtes sortantes de l'app. Elles ne transportent **aucune donnée de plan** —
> seulement les coordonnées des tuiles regardées.
>
> 🚨 **`isOptedIn` est DUPLIQUÉ** : `osmView.js` (modale) et `osmHomePreview.js` (widget). Les faire diverger
> donne un widget affiché sans bouton dans la modale, ou l'inverse. `check-osm-defaut.js` **exécute les deux**
> sur les 4 états de la clé et refuse qu'ils répondent différemment.
>
> 📣 **Le défaut s'annonce** : tant que la clé est absente, `_afficherBandeauDefaut` pose un bandeau dans le
> widget ; le valider écrit `"1"` — l'implicite devient explicite. ⚠️ C'est une **notification**, pas un
> consentement préalable : les premières tuiles sont déjà demandées quand il s'affiche. Assumé, et écrit tel
> quel dans `NETWORK_AUDIT`.
>
> 🩸 **`_listGeorefPlans` NE VOIT QUE CE QUI A ÉTÉ OUVERT.** Elle lit le géoréf à deux endroits : le
> localStorage (saisie manuelle) et `p.georef` du registre — mais ce dernier n'est écrit qu'au **chargement**
> du plan (`main.js > _propagerGeorefVersKmzExport`). Un plan jamais ouvert peut donc être parfaitement calibré
> dans son propre `plan-config.json` et rester invisible. Le message d'état distingue désormais **trois**
> situations (v1.90.2, remarque KARMA) : bibliothèque vide · des plans mais aucun jamais ouvert · des plans
> ouverts et aucun calé — ce dernier annonçant en plus le **nombre de plans jamais ouverts**, dont la
> calibration est *inconnue*, pas absente.
>
> ⚠️ **On ne va pas la chercher pour le savoir** : il faudrait ouvrir chaque ZIP, ou demander au réseau le
> `plan-config.json` de chaque plan serveur — autant de requêtes que de plans, au chargement de l'accueil, pour
> un widget que l'utilisateur n'a peut-être pas regardé. On dit la vérité sur ce qu'on sait.
>
> 🚨 **Les clés de ces messages sont construites dynamiquement** (`"osm_home." + cle + ".title"`) :
> `check-i18n` ne peut pas les voir. `check-osm-defaut.js` §7 **exécute** le rendu sur les trois scénarios et
> confronte les clés demandées aux trois dictionnaires — sans quoi une faute de frappe sortirait un libellé
> humanisé en production, sans un mot.
>
> 🔒 **Restent prioritaires sur le défaut** : incognito, hors-ligne réel, aucun plan
> géoréférencé — testés dans `mount()` **après** l'opt-in, et le garde-fou tient cet ordre.

> Référence détaillée de la Vue carte. Lue à la demande.
> Sections : fonds de carte (`fondsCarte.js`) · fond sous le plan (`fondOsmPlan.js`) · §1 vision · §2 modale `osmView.js` · §3 widget `osmHomePreview.js` · §4 sécurité · §5 pièges connus · §6 extension · §7 synergie Mode Secours · §8 cache OSM offline

---

## 🗺️ Fonds de carte : OpenStreetMap, IGN aérien, IGN plan (`js/fondsCarte.js`)

**Une seule table** (`window.KtaFondsCarte`) porte, pour chaque fond, son URL de tuile, son zoom max, son attribution
et s'il se garde hors ligne. Aucune autre URL de tuile n'est écrite dans `osmView.js`, `fondOsmPlan.js`,
`osmTilesCache.js`, `osmHomePreview.js` ni `secoursMode.js`. Chargée par `index.html` avant `osmTilesCache.js`, précachée par `sw.js`.

| id | Couche | URL | Zoom max | Attribution | Hors ligne |
|---|---|---|---|---|---|
| `osm` (défaut) | OpenStreetMap | `tile.openstreetmap.org/{z}/{x}/{y}.png` | 19 | « © OpenStreetMap » (lien copyright) | oui (`OsmTilesCache`) |
| `ign-aerien` | `ORTHOIMAGERY.ORTHOPHOTOS`, JPEG | WMTS `data.geopf.fr`, `TILEMATRIXSET=PM` | 19 | « © IGN – Géoplateforme » (lien cartes.gouv.fr) | non |
| `ign-plan` | `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`, PNG | idem | 19 | idem | non |

- **Choix de l'appareil**, partagé par les vues : `localStorage` `myktamap_fond_carte_v1` (lecture et écriture en
  try/catch ; écriture refusée → le choix vaut pour la page). `KtaFondsCarte.choisir(id)` émet `kta:fondCarteChange`
  `{ id }` : la Vue carte et le widget de l'accueil remplacent leur couche, le fond sous le plan se redessine sans être
  rallumé. Non exporté avec le profil (réglage d'appareil).
- **Sélecteurs** (aucun bouton de plus, place au téléphone), tous sur le même choix : liste `#kta-osm-fond` dans le
  premier bandeau de la Vue carte et `#ktaOsmFiltersFond` en tête de la fenêtre « Plans & filtres de la carte » (≡ du
  widget de l'accueil), un seul gabarit `KtaFondsCarte.htmlSelecteur(id)` relié par `brancherSelecteur(select)` ;
  liste `[data-fond-osm='fond']` dans le panneau du bouton carte du plan (`htmlOptions()`, sa propre mise en page).
  ⚠️ Un sélecteur marqué `data-kta-fond-choix` suit seul un changement venu d'ailleurs (`fondsCarte.js`, écouteur
  de `kta:fondCarteChange`). Le Mode Secours **suit** le dernier choix, sans réglage propre (décision produit).
- **Zooms** : le GetCapabilities de `data.geopf.fr` annonce les deux couches IGN sur la grille `PM_0_19` (zooms 0 à 19) ;
  `PM` est servi aussi. Au-delà, la tuile 19 est agrandie (`maxNativeZoom`, ou le plafond du fond sous le plan).
- **Hors couverture** : l'IGN répond 404 hors de ses données (mesuré une fois, à la main, en pleine mer). Une seule
  règle, sans polygone de couverture à tenir à jour : **chaque tuile IGN en erreur est remplacée par la tuile OSM**
  (`KtaFondsCarte.creerCouche` pour Leaflet, `fondOsmPlan.js > _imageOsm` pour le canvas), et le crédit OSM
  s'ajoute au premier remplacement (§ Crédit des données ci-dessous). Une image refusée par la CSP tombe dans la même règle : un serveur dont la
  CSP n'autorise pas encore `data.geopf.fr` montre de l'OSM sous l'étiquette IGN, avec les deux attributions.
- 🔒 **Hors ligne = OSM seul** : `osmTilesCache.js` n'enregistre que des tuiles OSM (URL de la table, fond `osm`) ;
  `sw.js` sort tôt pour `data.geopf.fr` (pas de `respondWith` : ni `CACHE_NAME`, ni cache IDB) ; fond IGN choisi,
  « 💾 Sauvegarder hors-ligne » (Vue carte, widget de l'accueil) et « Enregistrer hors ligne » (fond sous le plan) sont
  grisés, raison
  écrite (`fondscarte.horsLigne.osmSeul`, `fondosm.cache.indispo.fond`). Hors ligne avec un fond IGN, les tuiles
  OSM enregistrées s'affichent (le repli tuile par tuile y mène tout seul).
- 🔒 **Consentement** : la case « Vue carte » couvre tous les fonds ; décochée ou en incognito, aucune requête IGN
  (les portes sont celles des vues, la table n'émet rien). Textes : `home.privacy.osmToggle`, `home.netdoc.verify3`,
  `verify4`, `osm.open.optInConfirm`, `netaudit.whitelist.ign`, `NETWORK_AUDIT.md`.
- **CSP** : `img-src … https://data.geopf.fr` (`docker/nginx-docker.conf`, `docs/nginx-myktamap.conf`,
  `docs/nginx-csp-config.conf`) ; pas dans `connect-src` (le service worker ne la récupère pas). Le serveur public
  porte sa propre CSP hors de ce dépôt : sans la même ligne, le repli ci-dessus s'applique.
- **Widget de l'accueil** (`osmHomePreview.js > _poserFond`) : `creerCouche(courant().id)`, remplacée à chaque
  `kta:fondCarteChange` sans remonter le widget ; hors ligne, couche OSM directe (elle lit le cache « Save Offline »).
  Pas de contrôle d'attribution Leaflet : le pied (`_majPied`) écrit le domaine contacté (`osm_home.footer.tiles`,
  paramètre `{domaine}`) et l'attribution du fond, plus celle d'OSM et son domaine dès le premier remplacement d'une
  tuile IGN (lu à `tileload`, `ktaReplis`). Fond IGN : 💾 en `aria-disabled` + `.kta-osm-home-indispo` (bordure
  pointillée), **touchable** : le toucher affiche la raison (`fondscarte.horsLigne.osmSeul`, toast d'avertissement) au
  lieu d'enregistrer, la raison se lit donc aussi au téléphone ; stats du cache en `--kta-texte-3`, même raison au
  survol.
- **Mode Secours** : sa carte est la fenêtre Vue carte (bouton 🌍 du scénario, capture du briefing), qui suit le fond.
  Le repli hors écran de la capture (`secoursMode.js > _captureOsmCanvasForBriefing`, Vue carte indisponible) prend
  `_idFondBriefing()` : 🔒 **sans la case Vue carte ou en incognito, `null` : aucune couche de tuiles, aucune requête**
  (ni OSM ni IGN), la capture garde le cadre du plan, son nom et les équipes sur fond blanc ; hors ligne, OSM (tuiles
  enregistrées) ; sinon le fond de l'appareil, `creerCouche(id, { crossOrigin: "anonymous" })`. Carte de quelques
  secondes : pas d'écoute de `kta:fondCarteChange`. html2canvas (`useCORS`, `allowTaint: false`) relit les tuiles en
  CORS ; l'IGN répond `Access-Control-Allow-Origin: *`. Seul le fond change, la palette du Secours reste la sienne.
  Sous l'image du PDF, une ligne `secours.surf.fondCredit` cite le fond capturé (lu dans le contrôle d'attribution de
  la Vue carte capturée, ou dans la table pour le repli, plus OSM après un remplacement) ; aucune sans tuile.

### Crédit des données

- **Visible sur deux cartes seulement** : la fenêtre Vue carte et le fond sous le plan. `css/style.css` masque
  `.leaflet-control-attribution` partout (plan seul, 3D, mini-cartes, briefing) ; `KtaFondsCarte.montrerCredits(map,
  actif)` pose la classe `kta-credits-carte` sur le conteneur de la carte (le contrôle redevient visible) et retire le
  préfixe « Leaflet » (`setPrefix(false)`). Petit, en coin bas à droite, fond `--kta-fond` voilé à 90 %, texte
  `--kta-texte-3`, liens `--kta-texte-2` : ≥ 4,5:1 sur une tuile blanche comme noire (mesuré 5,87:1 en sombre,
  4,64:1 en clair). Sur le plan, le contrôle est fixé au-dessus de la barre d'état (`#map` descend sous elle).
- **Texte** : l'option `attribution` de la couche (« © OpenStreetMap » ou « © IGN – Géoplateforme »). Fond IGN :
  le crédit OSM s'ajoute tant qu'au moins une tuile remplacée est gardée par la couche (compte à la pose, décompte au
  `tileunload`), puis se retire. Fond sous le plan : il reste jusqu'au changement de fond ou à l'extinction (les tuiles
  OSM sont peintes dans les canvas, rien ne dit quand la dernière quitte l'écran), et hors ligne.
- **Case « Masquer les crédits des cartes »** (Configuration de l'accueil › Affichage, `#loaderCreditsCartesCb`,
  `homeConfig.js > _initCreditsCartesHome`) : décochée par défaut ; `KtaFondsCarte.masquerCredits(bool)` écrit
  `myktamap_credits_cartes_masques_v1` ("1"/"0", try/catch), pose `html.kta-credits-masques` (effet immédiat sur les
  cartes ouvertes, appliqué au chargement du module) et émet `kta:creditsCartesChange`. Réglage d'appareil, non exporté.
- Le widget de l'accueil garde sa ligne de pied (domaine contacté + crédit), que la case ne masque pas : elle dit
  aussi quel domaine la carte contacte.

🛡️ `scripts/smoke/checkup-fonds-carte.js` (Vue carte V1-V8, crédits V1-V3b et P1-P5, case des crédits K1-K4, widget de
l'accueil A1-A4, briefing Secours S1-S2 et son crédit, case décochée et incognito A5/S3-S4 : zéro requête de tuile,
téléphone 390 px sombre et clair M1-M5 : crédit lisible sans recouvrir de bouton, bouton de sauvegarde grisé lisible),
`checkup-fond-osm.js` F8 et F13 (fond sous le plan) : tuiles
OSM et IGN fabriquées par le harnais, aucune requête réelle. `scripts/check-plan-offline.js` §9 : `sw.js` n'intercepte
pas `data.geopf.fr`.

---

## 🗺️ Fond de carte sous le plan (mode plan, `js/fondOsmPlan.js`)

En mode plan, le bouton carte de la barre du haut (`#kta-refonte-counter-osm`, `refonteInterface.js`) n'ouvre **plus**
la fenêtre Vue carte (décision produit) : il ouvre un petit panneau ancré sous lui (classes `.kta-group-flyout`, mode
ancré, sans fond assombri) avec cinq commandes. Le panneau se ferme (✕, Échap, toucher dehors) sans éteindre le fond.

| Commande | Effet |
|---|---|
| Interrupteur « Fond sous le plan » | `FondOsmPlan.allumer()` / `eteindre()` : couche du fond choisi dans la carte du plan, bouton du haut en état actif (`.kta-fond-osm-actif`), crédit du fond dans le contrôle d'attribution de la carte (§ Crédit des données ; plus « © OpenStreetMap » après un remplacement d'une tuile IGN ou hors ligne) |
| Fond | liste des fonds de la table (§ Fonds de carte) ; changer redessine la couche allumée (images oubliées, génération suivante) sans l'éteindre |
| Transparence du plan (0 → 100 %, 50 % au premier usage) | opacité de l'**image du plan** seulement : `tilePane` (tuiles V2) et overlays du fond (`_ktaBaseLayers` : rendu direct et repli V2 ; `_baseTiles` : tuiles V1), **multipliée** par le curseur d'opacité de l'image principale des filtres ≡ (`FondOsmPlan.facteurPlan` lu par `tiling.js > ktaAppliquerOpacitePlanDeBase`, seule à poser l'opacité ; `rendering-leaflet.md` § Opacité des images du plan). Le fond OSM reste opaque. Éteint : le curseur des filtres seul. **Retenue par plan** (décision produit) : localStorage `myktamap_fond_osm_v1_<planId>` ("0" à "100", lecture et écriture en try/catch), purgée et transférée avec les données du plan (`planRegistry.js > purgeAssociatedData`, `transferAssociatedData` → `FondOsmPlan.retirer` / `transferer`), exportée avec le profil (`profileExportImport.js > PER_PLAN_PREFIXES`) |
| Ma position | un `getCurrentPosition` (jamais `watchPosition`, fix de moins de 10 s accepté), mêmes garde-fous que la fenêtre (§4) : refus hors de `OsmView.getPlanGpsBbox().pad(0.5)`, bloqué en incognito, rien de persisté ni d'envoyé. Point (`.kta-fond-osm-moi`) et cercle de précision posés sur le plan par `KmzExport.gpsToPlan`, en mémoire jusqu'au plan suivant |
| Enregistrer hors ligne | l'emprise du plan (`OsmView.getPlanGpsBbox`) dans le cache « Save Offline » partagé, par le code du bouton 💾 : `OsmTilesCache.cacheTilesForBbox(bbox, z)` (seule implémentation, `cacheVisibleTiles` y passe aussi), `z = OsmTilesCache.zoomPourBbox(bbox, 18)` = le zoom le plus fin où l'emprise tient sur z − 1, z, z + 1 sous le plafond de 200 tuiles. Grisée, raison écrite dans la commande, si OSM est coupé, en incognito, avec un fond IGN (« OSM seulement », raison complète au survol) ou hors ligne (relu aux événements `online` / `offline`). Progression « fait / total » dans la commande, fin par un toast (compte des tuiles, déjà là, échecs, plafond) ; prévient la fenêtre Vue carte (`recheckOfflineCache`) |

**Rendu.** Une `L.GridLayer` en canvas (`CoucheFondOsm`), pane `ktaFondOsm` z-index 150, sous `tilePane` (200). Pour
chaque tuile de la carte du plan : les 3 coins (pixel projeté → `map.unproject` → pixel image → `KmzExport.planToGps`
du calage `buildTransformCalib`, donc similitude 2 points ou affine 3 points, modèle local ou historique) donnent
l'affine Mercator → canvas ; les 1 à 4 tuiles OSM qui couvrent la tuile (davantage si le plan est très tourné par
rapport au nord) sont dessinées par `setTransform` + `drawImage`. Pas de seconde carte synchronisée. Zoom OSM : celui
dont un pixel vaut un pixel CSS de la tuile (arrondi), plafonné à 19 ; au-delà, la tuile 19 est agrandie (flou assumé,
aucune requête). Le calage est relu à chaque allumage (un géoréf saisi dans les Réglages vaut tout de suite).

- 🩸 **Précision float32** : au zoom 19, une coordonnée Mercator vaut ~1e8 px, au-delà de ce que la matrice du canvas
  garde ; tout est posé relatif au coin de la tuile. Mesuré : point du plan sur son pixel OSM à 0,23 px au zoom max,
  à plat comme tourné de 35°.
- 🩸 **Liserés** : chaque canvas déborde d'un pixel CSS à droite et en bas avec son vrai contenu (`COTE = 257`), et
  chaque tuile OSM reçoit une bande d'un demi-pixel sur sa dernière colonne et sa dernière ligne. Sans eux, sous
  rotation, l'anticrénelage laissait voir le fond de la carte entre deux tuiles. Étirer la tuile entière l'aurait
  décalée (0,67 px mesurés au lieu de 0,23).
- 🩸 **`minZoom: -20`** : une `GridLayer` vaut `minZoom: 0` par défaut, or la carte du plan descend sous zéro : sans
  lui, aucune tuile au dézoom.
- **Canvas en pixels CSS**, sans facteur d'écran, comme une couche de tuiles Leaflet ordinaire et la fenêtre Vue carte.
- **Plan orienté** : le pane est créé dans `map._ktaRotatePane` s'il existe (sinon dans le map-pane, que
  `mapBearing.js` déplace dans le sien). La couche s'inscrit dans `map._ktaGrillesSousRotation` : à chaque angle, la
  rotation de la carte du plan relance `_update` de ces seules grilles (pas un parcours de tous les calques), et le
  patch `_installerPatchGrilles` (désormais posé pour toutes les cartes, `rot.grilles` vrai partout) élargit leur zone
  au rectangle tourné.
- **Images** : fond IGN, d'abord la tuile IGN si le réseau est permis (en erreur : la suite d'OSM, compteur
  `replis`) ; puis le cache « Save Offline » (`OsmTilesCache.getCachedTile`, URL `blob:` révoquée après
  décodage), puis le réseau OSM seulement si en ligne, OSM autorisé et hors incognito ; 48 images décodées gardées (LRU),
  un échec n'est pas gardé. 🩸 Sans réseau permis, une tuile absente à son zoom est prise dans une tuile enregistrée
  jusqu'à 6 zooms plus large (morceau agrandi, `drawImage` sur un rectangle source) : « Enregistrer hors ligne » ne
  garde que 3 zooms, le fond serait vide à tous les autres. Éteindre coupe les images en vol (`src = ""`), vide le cache, remet chaque canvas à 0 × 0
  (`tileunload` : iOS ne rend sa mémoire qu'ainsi).

**Gates.** Bouton grisé (`.kta-fond-osm-indispo`, bordure pointillée, raison en `title` et en toast au toucher) sans
géoréf effectif (`OsmView.getGeorefEffectif`, même cascade que la fenêtre, §2.2). Allumer est refusé avec un message
si OSM est coupé (`OsmView.isOptedIn`, `ktaAlerte`) ou en incognito (toast) ; couper OSM pendant que le fond est
affiché l'éteint (`kta:osmOptInChange`). Hors ligne : un toast à l'allumage, une phrase d'état en tête du panneau
(`fondosm.horsLigne`, ou `fondscarte.horsLigne.fondIgn` avec un fond IGN ; `.kta-tx-warn`, relue aux événements
`online` / `offline` sans rouvrir), tuiles OSM enregistrées seulement.

**À chaque plan ouvert** (décision produit) : interrupteur éteint (`mktm:plan-ferme`, `mktm:plan-pret`, et le polling
2 s du bouton détecte une carte remplacée), point « Ma position » effacé ; la transparence, elle, reprend la valeur
retenue pour ce plan.

**Hors périmètre** : les exports PNG / PDF / KMZ redessinent depuis les données (`exporter.js`, `kmzExport.js`), le
fond n'y entre pas ; la vue 3D ne le montre pas. Le Mode Secours ouvre toujours la fenêtre Vue carte (bouton 🌍 du
scénario, capture du briefing PDF).

🛡️ `scripts/smoke/checkup-fond-osm.js` (tuiles OSM synthétiques, calage fictif prêté en mémoire au relevé fictif).
Mesure (iPhone émulé, processeur ÷4, relevé fictif rendu en V2 par un tuilage prêté, glissés et zoom scriptés) :
57 images/s fond éteint, 49 allumé ; tourné de 30° : 48 éteint, 32 allumé ; 8 canvas (2 Mo) à plat, 16 (4 Mo)
tournée, 33 à 48 images OSM décodées (~8 à 12 Mo) ; tout rendu à l'extinction. ⚠️ Non mesuré sur un vrai téléphone.

---

## 🌐 Le widget du HOME et les plans SERVEUR (v1.89.0)

🩸 **Jusqu'ici, le widget ne rendait RIEN pour un plan servi.** `_loadPlanDataForPreview` passait **exclusivement** par le ZIP — `PlanRegistry.getHandle()` (FS Access) ou `getBlob()` (IndexedDB) — qu'un plan serveur n'a **ni l'un ni l'autre**. Symptôme en console : `[OsmHomePreview] ZIP non récupérable pour planId=server_… (FS handle absent + IDB blob purgé)`. **Ce n'était pas une régression** : ce module n'avait aucun chemin HTTP.

`_loadPlanDataServeur(plan)` produit la **même** sortie `{ config, dataLayers, tilesOverview, iconUrls }`, en HTTP :

- le `plan-config.json` passe par **`resolveServerPaths`**, exactement comme au chargement réel — sinon l'aperçu et le mode plan divergeraient sur les mêmes fichiers ;
- les tuiles sont demandées à la racine **SONDÉE** (`ktaResoudreRacineTuiles`, `tiling.js`) : la deviner ici rejouerait le bug de la v1.88.3 ;
- les icônes sont déjà des URLs utilisables après résolution — **rien à extraire** ;
- 🛟 **aucune blob URL n'est créée** côté serveur : rien à révoquer, donc rien à fuir, contrairement à la voie ZIP qui doit gérer son cycle de vie (cf `_iconBlobUrls`).

🛡️ Vérifié par `scripts/check-tiling.js` §18, qui **exécute** le chargeur dans un `vm` avec `fetch` stubé et contrôle que la branche serveur est prise **avant** la voie ZIP.

---

## 1. Vision

La **Vue carte** projette les plans MyKTAMap géoréférencés sur OpenStreetMap (EPSG:3857), avec leur image plan en transparence, leurs POI, tracés, zones et structures par-dessus. Deux modules complémentaires :

| Module | Fichier | Contexte | API publique |
|---|---|---|---|
| **Modale full-screen** | `js/osmView.js` | Plan chargé, ouverte par le Mode Secours (le bouton carte du plan pose le fond sous le plan) | `window.OsmView = { open, close, isAvailable, isOptedIn, setOptedIn, getPlanGpsBbox, getGeorefEffectif, recheckOfflineCache }` |
| **Fond sous le plan** | `js/fondOsmPlan.js` | Mode plan, bouton carte du haut | `window.FondOsmPlan` (section ci-dessus) |
| **Widget HOME** | `js/osmHomePreview.js` (~900 l) | HOME (aucun plan chargé) | `window.OsmHomePreview = { mount, refresh, selectPlan, openFullScreen }` |

**Lib externe vendored** : `lib/leaflet-imageoverlay-rotated.js` (BSD 2-clause) — rend une image comme parallélogramme via 3 coins (CSS `transform: matrix(…)`). Utilisé pour projeter les tuiles plan en pixel space CRS.Simple vers EPSG:3857 OSM via `KmzExport.buildTransform + planToGps`.

---

## 2. Modale `osmView.js` (v1.39.0 → v1.40.12)

### 2.1 Activation & gates (v1.39.0)

3 garde-fous strict avant l'ouverture de la modale :

```
open()
  ├─ _hasGeoref() ?          (cascade source 1 → 2, cf §2.2)
  ├─ _isV2Plan() ?           (anti-crash mobile v1.39.10)
  ├─ _isIncognitoOn() ?
  ├─ _isOnline() ?           (navigator.onLine + ping fiable)
  ├─ isOptedIn() ?           (LS myktamap_osm_view_opt_in)
  └─ _pingThenOpen()         (window._pingInternet 5s timeout)
```

Si pas opt-in : `confirm()` natif explicite avec mention du domaine `tile.openstreetmap.org` + setter LS après accept.

### 2.2 Géoréférencement : format, cascade, modèle de calage

**Format** (`plan-config.json > plan.georef`, et la copie `localStorage["myktamap_kmz_calib_<planId>"]`) :
`{ pointA, pointB, pointC?, modele? }`, chaque point `{ x, y, lat, lng }` à plat (pixels image, y vers le bas ;
WGS84), `pointB.estimated: true` pour un B déduit (`config.js > ktaEstimerPointB`).

```
_getEffectiveGeoref()   (osmView.js, donc fond OSM et Vue carte ; secoursMode.js suit le même ordre)
  1. PLAN_CONFIG.plan.georef          (embarqué ZIP, OU calage des Réglages remis en mémoire)
  2. KmzExport.getCalibration(planId) (LS myktamap_kmz_calib_<planId>)
```

(décision produit) **Le calage saisi dans l'app GAGNE sur celui embarqué dans le plan**, pour tous les
consommateurs, tout de suite et au rechargement :
- **Saisie** (Réglages › Enregistrer, Recaler, modale Export externe) : `KmzExport.appliquerCalageUtilisateur`
  écrit le localStorage, `PLAN_CONFIG.plan.georef` **en mémoire** (plan ouvert) et l'entrée du registre qui
  porte un géoréf (accueil), puis émet `kta:georefChange { planId }`. Le fond OSM allumé recalcule sa
  transformation et se redessine sans être rallumé (`fondOsmPlan.js > _surCalage`, « Ma position » posée avec
  l'ancien calage retirée) ; `osmView.js` oublie sa projection mémorisée (emprise de « Ma position » et
  d'« Enregistrer hors ligne »).
- **Chargement** (`main.js > _propagerGeorefVersKmzExport`) : localStorage vide → rempli depuis `plan.georef`
  (objet ENTIER) ; calage local valide (A, B et C dans le plan, transformation calculable) et différent →
  il remplace `plan.georef` en mémoire (le ZIP n'est pas réécrit) ; calage local périmé (point hors du plan :
  canvas d'une autre génération) → remplacé par `plan.georef`.
- **« Mettre à jour le plan »** (`createConf.js > _georefReglagesPourMaj`, mêmes règles) : le calage des Réglages
  remplace celui du ZIP dans le formulaire du Générateur, donc dans le plan-config produit ; le Générateur le dit.
- Les autres consommateurs (exports KMZ / GPX, recherche, urgence, widget HOME) lisent le localStorage d'abord.
- ⚠️ **Limite voulue** : un plan régénéré AILLEURS avec un meilleur calage ne remplace pas, sur un appareil, un
  calage déjà saisi dans les Réglages (« Effacer » dans les Réglages pour revenir à celui du plan). La fenêtre
  Réglages › Géoréférencement le dit (`config.georef.noteGagne`). Garde-fou : `checkup-georef-reglages.js`.

**Modèle de calage** (`KmzExport.buildTransform`, seule source des conversions degrés ⇄ mètres de l'app) :

| `modele` | Repère | Écrit par |
|---|---|---|
| `"local"` | **plan tangent** à l'ellipsoïde GRS80 au barycentre des points de calage (aller ECEF, retour de Bowring) : exact pour un relevé en vraies distances, < 0,35 m aux coins d'un GeoTIFF Lambert 93 de 6 km | tout nouveau calage : Générateur (saisie, import GeoTIFF), Réglages, modale KMZ, import SIG / GPX vierge |
| absent | mètres équirectangulaires à constantes fixes (`EQUI_HISTORIQUE` : 111 320 · cos, 110 540) — jusqu'à 20 m d'écart aux coins sur 6 km | plans calés avant le modèle local, import KMZ |

- ⚠️ **Sans `modele`, le calcul est figé bit à bit** (valeurs gelées dans `scripts/check-calage-projection.js`) :
  aucun plan déjà calé ne bouge. Une autre valeur que `"local"` retombe aussi sur le modèle historique.
- **Réenregistrer le même calage historique** (mêmes points, `KmzExport.memesPoints`) le garde historique :
  `KmzExport.modeleSaisie(ancien, nouveau)` rend `null` dans ce seul cas, `"local"` sinon. Générateur
  (`_plannerGeorefCharge`), Réglages et modale KMZ passent par lui.
- **Recalage** : Réglages > Géoréférencement affiche `precisionCalage` (« ± X aux coins » : écart au modèle exact
  pour un calage historique, d³ / 2R² pour le local) et, pour un calage historique, « Recaler en projection
  exacte » : la confirmation annonce `ecartRecalage` (déplacement max aux 4 coins), puis le calage passe en
  `"local"` par `appliquerCalageUtilisateur` (localStorage, registre, `PLAN_CONFIG` **en mémoire** ; le ZIP
  n'est pas réécrit).
  Le Générateur affiche la même ligne sous ses champs (`createConf.js > _plannerMajPrecision`), au modèle que le
  calage aura en générant ; « approchée » y renvoie aux Réglages pour recaler.
- 🩸 **Propagation** : mêmes points des deux côtés, modèles différents → le `"local"` gagne dans les deux sens
  (`main.js > _accorderModeleCalage`). Sans ça, un plan recalé repasserait au modèle historique pour la Vue carte
  et le Secours (qui lisent `PLAN_CONFIG` d'abord), et un plan régénéré garderait l'ancien calage local.
- (décision produit) **L'import KMZ** (`kmzImport.js`) garde le modèle historique : un `LatLonBox` KML est
  linéaire en degrés par définition. Le `plan.georef` qu'il pose n'a pas de `modele`.
- Le Lambert 93 exact (mémoriser l'EPSG d'un GeoTIFF et caler dans ce CRS) n'est pas fait : `docs/BACKLOG.md`.
  Mesures et options écartées : `docs/ETUDE_CALAGE_PROJECTION.md`.

**📐 Point C optionnel** : `pointC {x,y,lat,lng}` → **affine 6 DOF** (échelles X/Y indépendantes + cisaillement,
résolue exactement sur les 3 correspondances par Cramer, dans le repère du modèle). Sans C : similitude 2 points.
C quasi colinéaire avec A-B (2×aire < `MIN_PLAN_DISTANCE²·0.05`) → repli 2 points + `degenereC: true` (les UIs
de saisie refusent franchement, le moteur replie silencieusement pour un C venu d'un ZIP). **Tous les
consommateurs passent par `buildTransformCalib(calibOuGeoref)`**, qui transmet `modele` ; `gpxImport` et
`sigImport` appellent `buildTransform` en direct (calage synthétique sur l'emprise) avec `MODELE_LOCAL`.
⚠️ `metresParPixel`/`rotation` restent dérivés de A/B même en affine (affichage d'échelle = approximation
assumée). ⚠️ La modale KMZ de sessionExporter n'édite que A/B : `_kmzLireCalib` **fusionne le pointC et le modèle
stockés** avant `appliquerCalageUtilisateur`, sinon chaque save KMZ écraserait l'affine. Limite documentée user : corrige une
déformation GLOBALE, pas les erreurs locales morceau par morceau d'un assemblage.

### 2.3 Tuiles V2 + niveau adaptatif + viewport culling (v1.39.10-11)

**v1.39.10 fix crash mobile** : avant, on chargeait l'image complète du plan via `L.imageOverlay.rotated(baseImage, ...)` → OOM iPhone PWA. Depuis v1.39.10, modale **réservée aux plans V2 tuilés** (gate `_isV2Plan()`).

**v1.39.11 niveau adaptatif** :

| Helper | Rôle |
|---|---|
| `_choisirNiveauBaseline(tiling, planW, planH)` | Au boot : choisit niveau le plus zoomé tel que `cols × rows ≤ 20` (~20 MB décodé safe mobile) |
| `_baselineOsmZoom = osmMap.getBoundsZoom(_planBbox)` | Calc 1 fois |
| `_targetLevelForZoom(osmZoom, tiling)` | Mapping dynamique : `delta = osmZoom - baselineOsmZoom`, `targetZ = baseLevel + delta`, clamp `[minNativeZoom, maxNativeZoom]` |
| `_tileIntersectsBounds(tl, tr, bl, mapBounds)` | AABB check + 10% pad pour pré-charger les bordures |
| `_tilesByPath` | `path → {overlay, tl, tr, bl}` pour cull rapide |

Listener `zoomend/moveend` → `_renderLevel(targetZ)` qui swap niveau si changé OU add/remove tuiles cullées sinon.

🩸 **Retirer une tuile = la retirer de `_planLayer`** (`_retirerTuile`), jamais `overlay.remove()` seul : la tuile
restait dans le groupe (et rien n'était retiré case 🖼️ Plan décochée), et recocher Plan reposait toutes les tuiles
déjà vues, tous niveaux superposés (217 tuiles de 4 niveaux au lieu de 12). `_planLayer` n'est ajouté à la carte
que si la case est cochée : elle garde son état d'une ouverture à l'autre. Garde-fou :
`scripts/smoke/checkup-osm-empilement.js` (avec, au pixel, « POI au-dessus des tuiles » à chaque cran de zoom).

**Pattern viewport culling AABB** : 4e coin reconstruit par parallélogramme (`br = tr + bl - tl`), test `mapBounds.intersects(tileBbox)`. Pad 10% évite flash au pan rapide.

### 2.4 Layers data (v1.39.12 → v1.39.16)

5 layers indépendants (chacun toggleable dans le bandeau) :

| Layer | State | Sources | Filtres |
|---|---|---|---|
| `_planLayer` (tuiles V2) | `_planTilesVisible` (v1.40.12) | Tuiles `RUNTIME_ASSETS[path]` | — |
| `_poiLayer` | `_poiVisible` | `getEditorPoints` + `getAllEmbeddedPoints` | `FilterPanel.tags` + `activeLevel` |
| `_trackerLayer` | `_trackerVisible` | `getTrackingTimeline` + polling 1s | Niveau timeline complète (pas filtré) |
| `_roadLayer` | `_roadVisible` | `getRoads` + `getAllEmbeddedRoads` (exclut iti) | `FilterPanel.roadTypes` + level |
| `_itiLayer` | `_itiVisible` | `getRoads.find(r => r.type === "itinerary")` | — (singleton iti) |
| `_zoneLayer` | `_zoneVisible` | `getZones` + `getAllEmbeddedZones` | `FilterPanel.zoneTypes` + level |
| `_structLayer` | `_structVisible` | `getStructures` + `getAllEmbeddedStructures` | `FilterPanel.structTypes` + level |

Tracker : polling 1s (`setInterval` clearé dans `close()`), no-op si tracker pas actif (CPU économe).

### 2.5 Multi-LVL (v1.39.16)

| Helper | Rôle |
|---|---|
| `_visibleLevels: Set<number>\|null` | null = mono fallback `activeLevel` (v1.39.12 compat) ; Set non-vide = union |
| `_isLevelAllowed(item)` | Cascade : pas M-LVL → tout passe / Set non-vide → membership / sinon fallback `activeLevel` |
| `_initVisibleLevels()` | Au boot : initialise à `{activeLevel}` (= mode mono strict par défaut) |
| `_toggleLevel(level)` | Toggle in/out du Set + `_refreshLevelFilteredLayers()` |
| `_renderLevelsBar()` | UI chips `N0/N1/…` ligne 2 du bandeau (visible si `multiLevel === true`) |
| `_refreshLevelFilteredLayers()` | Re-render 5 layers level-aware (POI/Roads/Iti/Zones/Structures). Tracker exclu |

### 2.6 UI bandeau (v1.40.12)

Ligne 1 : `🎚️ Opacité slider · 🎯 Plan · 📡 Tracker · 🖼️ Plan · 📍 POI · 📡 Tracé · 🛣️ Routes · 🧭 Iti · 🌐 Zones · 🏗️ Struct`

Ligne 2 (M-LVL) : `🏗️ Niveaux affichés : [N0] [N1] [N2] …`

Ligne 1 porte aussi `📏` (mesure), `🎯` (coordonnées de surface) et **`🗺️ Légende`** (légende du plan en cours,
lecture seule : §12).

---

## 3. Widget HOME `osmHomePreview.js` (v1.40.0 → v1.40.16)

### 3.1 Layout HOME (v1.40.0)

PC ≥ 1024px : grille 3 colonnes `2fr 3fr 2fr` (Plans | OSM | Actions). Mobile : pile verticale.

Si opt-in OSM OFF (v1.40.1) : colonne `.loader-col-osm` masquée (`display:none`) + `.loader-grid` reçoit class `kta-no-osm` → grid PC retombe sur `3fr 2fr` (ancien layout 2 cols).

### 3.2 Cas dégénérés (v1.40.0-1)

| Cas | Rendu |
|---|---|
| Pas opt-in OSM | Colonne masquée (v1.40.1) |
| Hors-ligne (`navigator.onLine === false`) | Placeholder "📴 Hors-ligne" |
| Aucun plan georef | Placeholder pédagogique "📍 Aucun plan géoréférencé" avec marche à suivre |
| Plan georef présent | Widget complet (cf §3.3) |

`_listGeorefPlans()` scan `PlanRegistry.getAll()` + check `KmzExport.getCalibration(planId)`. Tri lastOpened desc. **Limitation** : plan avec georef embedded mais jamais chargé en map mode → absent (LS pas propagée).

### 3.3 Extraction ZIP partielle (v1.40.4 → v1.40.16)

Pipeline async à la sélection du plan (cache RAM `_planDataCache[planId]`) :

```
_loadPlanDataForPreview(planId)
  ├─ _getPlanZipFile(planId)
  │   ├─ PlanRegistry.getHandle(planId) + ensureHandlePermission → File (FS Access)
  │   └─ PlanRegistry.getBlob(planId) (IDB blob, mobile fallback)
  ├─ JSZip.loadAsync(file)
  ├─ Extract plan-config.json → parse
  ├─ Pour chaque config.dataLayers[i] :
  │   └─ Extract dataLayers[i].file (cascade 4 chemins fallback)
  │       → { points (json.data\|editorPoints\|points), roads, zones, structures }
  ├─ 🆕 v1.40.6 _extractV2TilesOverview(zip, config)
  │   └─ Niveau adaptatif (cf §3.4)
  ├─ 🆕 v1.40.16 _extractIcons(zip, config)
  │   └─ Approche hybride ZIP custom + URLs app (cf §3.5)
  └─ Return { config, dataLayers, tilesOverview, iconUrls }
```

### 3.4 Tuiles V2 widget HOME (v1.40.6 → v1.40.11)

`_chooseTileLevelForHome(tiling, planW, planH)` :

```js
const MAX_TILES_HOME = 80;  // v1.40.11 (12 → 40 → 80)
for (let z = maxNativeZoom; z >= minNativeZoom; z--) {
  const scale = Math.pow(2, -z);
  const cols = Math.ceil(Math.ceil(planW / scale) / tileSize);
  const rows = Math.ceil(Math.ceil(planH / scale) / tileSize);
  if (cols * rows <= MAX_TILES_HOME) return z;
}
return tiling.minNativeZoom;  // fallback safety pour plans extrêmes
```

**Résultats par taille plan** :

| Plan | Niveau v1.40.11 | Tuiles | RAM décodée |
|---|---|---|---|
| 4K (relevé réel) | z=0 natif | 40 | 40 MB |
| 8K | z=-1 | 40 | 40 MB |
| 12K | z=-2 | 24 | 24 MB |
| 16K | z=-2 | 64 | 64 MB |
| 32K+ | minNative | ≤80 | ≤80 MB |

~~**Pas de viewport culling dynamique** dans le widget~~ → **obsolète depuis v1.77.0**, voir §3.4bis.

Render : `L.imageOverlay.rotated(url, tl, tr, bl, { interactive: false, opacity: 1, pane: <pane du plan>_tuiles })` — **l'opacité est portée par le sous-calque `_tuiles` du plan** (`_paneTuiles`, enfant du pane du plan, `zIndex -1` = sous ses tracés), jamais par la tuile : vue d'ensemble et tuiles nettes (hi-res) s'y superposent sans s'additionner (avant : ~75 % dans la zone visible à 50 %, retour KARMA 08/10/2026). Vue carte modale : même règle, pane `ktaOsmTuiles` (z 350) ; `_renderLevel` porte un jeton (un rendu dépassé pendant l'extraction ne pose rien). Garde-fou : `check-tiling.js` §19. Pattern identique à `osmView.js > _renderTilesV2OnOsm` (convention CRS.Simple `pxTop = planH - k * tileSize * scale`).

### 3.4bis Tuiles HI-RES au zoom (v1.77.0)

Bug KARMA : « un plan X est très flou si je zoome [au HOME], alors qu'il est lisible en mode OSM plan ». Cause : le widget n'avait QUE le niveau baseline (≤80 tuiles, très réduit sur un gros plan), là où la modale swape de niveau au `zoomend`.

Mécanisme (bloc `TUILES HI-RES` de `osmHomePreview.js`) :
- `zoomend/moveend` → débounce 300 ms → `_majTuilesHiRes()` (garde anti-réentrance `_hiResBusy` + re-planification).
- Par plan de la pile (`_stackOrder` ∪ principal) : niveau cible = le plus grossier dont la largeur (`planW/2^-z`) couvre la **largeur écran du plan** (coins bas projetés via `latLngToContainerPoint`). Si le baseline suffit → hi-res retiré.
- Culling : seules les tuiles intersectant `getBounds().pad(0.15)` sont extraites, budget `HIRES_BUDGET_TUILES = 60`/plan — dépassé → un cran plus grossier.
- Extraction depuis le **handle JSZip gardé dans `_planDataCache[planId].zip`** (lazy : central directory seul, RAM négligeable) — pas de re-parse du ZIP.
- Rendu AU-DESSUS du baseline (même pane par plan, `_zIndexPour(planId)+1`) → jamais de trou pendant le chargement ; le baseline reste le filet.
- Pan à niveau constant : **delta** (tuiles communes réutilisées, sorties révoquées). Swap de niveau / plan retiré / carte recréée : `_retirerHiRes` révoque tout. Garde anti-race : la carte capturée avant les `await` doit être la même à la pose de l'état.
- Opacité/visibilité : `_setPlanOpacity`, `_setOpaciteExtra` et `_appliquerVisibilites` pilotent aussi les groupes hi-res.

**Blob URLs — deux régimes distincts** (réparation v1.77.0 d'un faux fix de l'audit code-mort du 09/08) :
- *baseline* : vivent avec `_planDataCache`, **jamais révoquées en session** (design v1.71.0 — re-ajout d'un plan gratuit, cache borne l'extraction à 1×/plan). La révocation ajoutée par l'audit cassait le multi-plans (charger B révoquait les URLs de A encore affiché).
- *hi-res* : éphémères, révoquées à chaque swap/sortie/refresh.

**Slider opacité** : `_setPlanOpacity(v)` / `_setOpaciteExtra` / `_appliquerOpaciteHiRes` posent l'opacité sur le sous-calque du plan (`_opaciteTuilesPlan`) ; repli tuile par tuile seulement sans pane.

### 3.5 Icônes POI — Approche hybride (v1.40.13 → v1.40.16)

**Diagnostic v1.40.15** révéla que les chemins type `lib/leaflet/images/marker-icon.png` et `icon/house.png` dans `config.icons` sont des **URLs relatives vers les icônes de l'app** (servies par le serveur web, cachées par le SW MyKTAMap), **PAS** des fichiers stockés dans le ZIP. Le générateur n'inclut dans le ZIP que les icônes **custom uploadées** par l'user (cf `createConf.js:2770 iconFolder.file(name, ...)`).

**Pattern hybride v1.40.16** :

```js
async function _resolveIcon(tag, path) {
  // 1. Tentative extraction ZIP (icône custom user)
  let entry = zip.file(path) || zip.file(path.replace(/^\.?\//, ""));
  if (!entry && path.includes("/")) {
    entry = zip.file("icon/" + path.split("/").pop());
  }
  if (entry) {
    iconUrls[tag] = URL.createObjectURL(await entry.async("blob"));
    _iconBlobUrls.push(iconUrls[tag]);
    return;
  }
  // 2. Fallback URL relative app : browser résout vers <origin>/<path>
  //    → servi par SW MyKTAMap, cache hit instant
  iconUrls[tag] = path.replace(/^\.\//, "");
}
```

Cohérent avec `getIconUrlForPoint` (`utils.js:38`) qui fait pareil pour la map principale.

### 3.6 Couleurs roads natives (v1.40.13)

`ROAD_STYLES_DATA_HOME` aligné sur `utils.js > ROAD_STYLES_DATA` :

| Type | Couleur |
|---|---|
| principal | `#00ff00` vert |
| secondaire | `#b000ff` violet |
| chemin | `#ffff00` jaune |
| jonction | `#ff4ecb` rose |

Cascade **v1.77.0** (bug KARMA « galerie principale reste verte en OSM », puis « OSM PLAN OK mais pas OSM HOME ») — deux mécanismes DIFFÉRENTS selon la vue :

**Modale `osmView`** (session live chargée) — le canon passe avant les tables locales :
```js
explicit (r.color) → ktaResolveStyle(cat, type, {flat:true})  // override légende live
                   → table locale → findCustomEntry → "#8892a4"
```

**Widget HOME `osmHomePreview`** — PAS ktaResolveStyle : le canon applique l'état LIVE de `LegendCustomization`, qui au HOME est soit **vide** (boot froid = le cas normal, on est au HOME avant de charger un plan), soit celui du **dernier plan chargé** (faux pour les autres plans de la pile). Résolution **PAR PLAN** (bloc `OVERRIDES DE LÉGENDE PAR PLAN`) :
- `_legendeDe(planId)` : lit le slot SessionPersist du plan (`localStorage myktamap_session_v1_<id>` → `payload.customLegend`, auto-savé ~1,5 s en mode plan) puis le `customLegend` du plan-config du ZIP (double-lecture `plan.customLegend`/racine comme `loadPlanState`). Cache RAM par planId, invalidé à chaque `mount()`.
- Cascade : explicit → `colors["<cat>.<type>"]` du slot (session > plan) → table locale (défauts canon) → `customEntries` du slot → `findCustomEntry` live (dernier recours) → gris.
- Zones : bordure = `borders[...]` explicite sinon dérivée via `window.ktaAssombrir(fill, 0.62)` (helper du canon exposé v1.77.0 — même relation visuelle que le mode plan). Structures : couleurs seules, les variantes locales gardent leurs weight/fillOpacity allégés.

**Structures** : `STRUCT_STYLES_HOME` variant LIGHT (weight/fillOpacity allégés) aligné sur `structures.js > STRUCTURE_STYLES`. Adaptatif polyline (fronts) ou polygon (mur/pilier).

### 3.7 Sub-layers + filtres catégorie (v1.40.12)

Refactor `_renderDataLayersOnMiniMap` pour répartir POI/Roads/Zones/Structures dans des sub-layerGroups indépendants (`_poiSubLayer`, `_roadsSubLayer`, `_zonesSubLayer`, `_structSubLayer`). Parent `_dataLayer = L.layerGroup()`.

5 toggles dans la 2e ligne du bandeau (`.kta-osm-home-toggles`) : `🖼️ Plan · 📍 POI · 🛣️ Routes · 🌐 Zones · 🏗️ Struct`. Default ON.

Helpers `_toggleTiles`, `_togglePoi`, `_toggleRoads`, `_toggleZones`, `_toggleStructures` → `add/removeLayer` sur le sub-group correspondant.

### 3.8 Plein écran inline (v1.40.2)

`openFullScreen()` toggle classe `.kta-osm-home-fullscreen-active` sur `#ktaOsmHomeBox` → `position: fixed; inset: 0; z-index: 9999`. Bind/unbind keydown Escape. `setTimeout(map.invalidateSize, 100)` après transition pour que Leaflet recalcule.

**Pas de bascule en map mode** (v1.40.0-1 essayaient ça via sessionStorage + simulation clic → cassé car sélecteurs HTML faux). Choix v1.40.2 : juste agrandir le widget en overlay, l'user reste sur HOME.

### 3.9 Cache RAM

Structure `_planDataCache[planId]` :
```
{
  config:        plan-config.json parsed,
  dataLayers:    [{name, visible, points, roads, zones, structures}],
  tilesOverview: {tiles: [{col, k, url}], planW, planH, z, scale, tileSize},
  iconUrls:      {tag: url}  // mélange blob URLs (custom ZIP) + URLs relatives (app)
}
```

Trackers de cleanup :
- `_tilesBlobUrls[]` — blob URLs des tuiles V2
- `_iconBlobUrls[]` — blob URLs des icônes custom ZIP

Cache cleared au unload page (RAM-only, pas de LS). Re-sélection plan déjà vu = instant.

---

## 4. Sécurité & privacy

| Aspect | Comportement |
|---|---|
| Opt-in | LS `myktamap_osm_view_opt_in`, tri-état : absent → ON (défaut depuis v1.90.2), `"0"` = refus jamais réécrasé. **Seul interrupteur du seul tiers contacté** — il n'existe pas de « mode hors-ligne strict » (retiré : il ne coupait que le préchargement des tuiles) |
| Pas opt-in | Modale : alert pédagogique / Widget HOME : colonne masquée |
| Incognito | `IncognitoMode.isActive()` — Modale : toast warn / Widget HOME : `_renderIncognito` |
| Hors-ligne navigator | Both : message "📴 Hors-ligne" |
| Tiles OSM | Uniquement `tile.openstreetmap.org/{z}/{x}/{y}.png` (attribution OSM) |
| Aucun cookie ou tracking | `crossOrigin: true` mais pas de credentials |
| `kta:osmOptInChange` event | Listener dans osmHomePreview pour refresh widget si toggle change pendant la session |
| **Bouton « 📍 Moi » (v1.40.18)** | `navigator.geolocation.getCurrentPosition` — 1 fix ponctuel à la demande user, JAMAIS `watchPosition`. Permission OS demandée à la demande (pas au boot). Marker + cercle accuracy en RAM only — JAMAIS persistés en LS/IDB/cookie, JAMAIS envoyés réseau. Reset au close modale + au refresh widget. Présent dans osmView (`_showMyGpsPositionOsm` + state `_myGpsMarker` / `_myGpsAccuracyCircle`) et dans osmHomePreview (`_showMyGpsPositionHome` + state `_myGpsMarkerHome` / `_myGpsAccuracyCircleHome`). |
| **Gating incognito** | Widget HOME : helper `_isIncognitoOn` (parité modale) + renderer `_renderIncognito` appelé AVANT `_renderOffline` au `mount()`. Bouton GPS : désactivé visuellement (`disabled` attribute) au build modale si incognito au moment du `open()` + early return runtime dans `_showMyGpsPositionOsm` / `_showMyGpsPositionHome` (toast warn) pour le cas où l'user passe en incognito PENDANT que la modale est ouverte. `check-osm-defaut.js` §5 bis **exécute** la garde avec le vrai module incognito. `navigator.onLine === false` ne bloque PAS le GPS (le GPS device marche sans Internet). |
| **Header Permissions-Policy requis (v1.40.20)** | ⚠️ Pour que `navigator.geolocation.getCurrentPosition` fonctionne, le header serveur DOIT autoriser `geolocation=(self)`. Le default Nginx restrictif `geolocation=()` (en place v1.0 → v1.40.19) rejette l'API AVANT le prompt OS avec `crbug.com/414348233`. Configs mises à jour : `docs/nginx-csp-config.conf` (prod, ligne 141) + `docker/nginx-docker.conf` (self-host Docker, ligne 116). Cohérent avec `microphone=(self)` qui existait déjà pour la commande vocale E1. Déploiement prod = manuel par KARMA (FTP / redémarrage Nginx). |
| **Garde-fou GPS hors champ plan (v1.40.21)** | Helpers `_getPlanGpsBbox()` (modale) / `_getPlanGpsBboxHome()` (widget) : projettent les 4 coins du plan via `_proj` + dims `imageWidth/Height` → `L.latLngBounds`. Au moment du fix GPS reçu, on étend la bbox via `bounds.pad(0.5)` (+50% chaque côté, marge généreuse) puis check `padded.contains([lat, lng])`. Si hors → toast warn avec distance Haversine au centre + console log + **pas de marker affiché** (privacy : aucune trace visuelle si user à des km du plan supposé). Si bbox impossible à calculer (dims manquantes, georef absente) → fallback safe : on autorise (= comportement v1.40.18-20 préservé). Marge `0.5` choisie pour être permissive : un fix à la frontière du plan reste accepté, seul un vrai "ailleurs" (autre ville, autre pays) déclenche le refus. |
| **Popups POI cliquables widget HOME (v1.40.22)** | Fix CSS `overflow: hidden` → `overflow: visible` sur `.kta-osm-home-content` qui clippait silencieusement les popups Leaflet. Bouton `bindPopup` enrichi : `autoPan: true` + `autoPanPaddingTopLeft: L.point(20, 60)` + `maxWidth: 240` + `className: "kta-osm-popup"` pour activer auto-pan + clamp largeur + style charte. Idem modale OsmView (className + autoPan + maxWidth: 280). |
| **Style popup POI charte dark (v1.40.22)** | Nouvelle classe CSS `.leaflet-popup.kta-osm-popup` (~60 lignes dans `style.css`) qui override le default Leaflet (fond blanc) pour appliquer la charte sombre : fond `#1a1f2e`, bordure `rgba(244, 197, 66, 0.35)` accent jaune, box-shadow soft, border-radius 8px, nom POI en `#f4c542`, close button discret. Variant `body.kta-theme-light` : fond `--kta-light-bg-elevated` + accent or sombre `#8b6a14`. Appliqué partout via le `className` passé au `bindPopup` (modale + widget HOME). |
| **Modale Vue carte élargie WQHD/4K (v1.40.22)** | `max-width: 1200px → 1800px` + `height: 90vh → 92vh` côté `_buildModal()` osmView.js ligne 1028. En WQHD (2560×1440) la modale passe de 47% → 70% de la largeur écran. En 4K (3840) elle reste plafonnée à 1800px (le `width: 96vw` ne s'applique plus) — acceptable car 1800px reste large. Pas de breakpoint mobile à toucher (`96vw` gère). |
| **Suppression markers calibrage A/B widget HOME (v1.40.24)** | `_renderGeorefMarkers()` ne rend plus les 2 circle markers (vert/rouge) + la polyline pointillée jaune (`dashArray: "6 4"`) entre A et B qui chargaient visuellement la mini-carte. Le `_markerLayer` est conservé (layerGroup vide) pour compat. Le `fitBounds` initial est désormais calculé directement via `L.latLngBounds([llA, llB])` au lieu de `_markerLayer.getBounds()` — résultat identique, juste sans rendu visuel. Côté modale OsmView : RAS, aucun marker georef n'y était jamais rendu (le plan apparaît via les tuiles V2 / image overlay directement). |
| **Popup POI description prééminente (v1.40.25)** | KARMA : popup affichait le `tag` (genre "default") au lieu de la `description` du POI. Refonte HTML popup (modale + widget HOME, cohérence stricte) : ligne 2 = `description` si présente (sinon fallback `tag`), ligne 3 mini = `🏷️ tag` réduit en `opacity: 0.75` + `font-size: 10.5px` + `color: #8892a4` pour debug. Niveau M-LVL toujours en suffixe ligne 2. `max-width: 260px` ajouté pour les descriptions longues. Modale auparavant ignorait totalement `p.description` (oubli initial v1.39.12). |
| **Filtre tag local (v1.40.17)** | Chips ligne 3 bandeau modale (`_osmLocalTagFilter: Set\|null`) + ligne 3 bandeau widget (`_homeTagFilter: Set\|null`). AND avec FilterPanel global côté modale. Reset au close modale. Indépendants entre les 2 modules par design. |
| **POI cliquables widget HOME (v1.40.17)** | Markers POI passés en `interactive: true` + `bindPopup(nom + tag + level + description)`. Parité avec modale OsmView qui avait déjà ce comportement. |

---

## 5. Pièges connus & conventions

⚠️ **`asset.url` partagé** : pour les tuiles V2 modale, `RUNTIME_ASSETS[path].url` est créé dans `osmView.js` MAIS partagé avec `tiling.js` (map principale). **NE PAS revoke** au `close()` de la modale OSM — casserait la map principale. Documenté en commentaire dans `_resolveTileUrl`.

⚠️ **Plans V1 (non tuilés)** : v1.39.10 a ajouté un gate strict — modale Vue carte réservée aux plans V2. Plan V1 → alert pédagogique. Widget HOME : skip tuiles V2 mais affiche POI/Roads/data via georef.

⚠️ **Plans très grands (32K+)** : fallback `minNativeZoom` accepté (= flou résiduel). Au-delà de MAX_TILES_HOME (80) ou MAX_TILES_BASELINE (20), pas de meilleur niveau possible.

⚠️ **`config.icons` paths sont des URLs app** : `"icon/house.png"` n'est PAS dans le ZIP, c'est une URL relative vers `<origin>/icon/house.png`. Le générateur n'inclut dans le ZIP que les icônes **custom** uploadées par l'user. v1.40.16 gère ça via approche hybride (cf §3.5).

⚠️ **Auto-mount widget** : `osmHomePreview.js` auto-mount au DOMContentLoaded + listener `kta:osmOptInChange` pour refresh. Si user toggle opt-in via Configuration → widget réapparaît/disparaît auto.

⚠️ **Cache RAM widget** : `_planDataCache[planId]` ne LRU pas. Acceptable car typiquement <10 plans georef par user. Si fuite RAM observée → ajouter cap LRU 5 plans + revoke blob URLs des plans évincés.

⚠️ **Constantes `STRUCT_STYLES_OSM` (modale) et `STRUCT_STYLES_HOME` (widget)** : dérivées de `structures.js > STRUCTURE_STYLES`. Si tu modifies STRUCTURE_STYLES, sync les 2 constantes ici.

⚠️ **Constants `ITI_*` (modale)** : `ITI_COLOR = "#00d4ff"`, `ITI_WEIGHT = 5`, `ITI_DASHARRAY = "10 6"` alignées sur `road.js:56 > ROAD_TYPES.itinerary`. Sync si changement là-bas.

⚠️ **TAGS_BUILTIN_HOME (widget)** : aligné sur `map.js > TAGS_BUILTIN` (20 tags cataphile). Sync si TAGS_BUILTIN change.

⚠️ **ROAD_STYLES_DATA_HOME (widget)** : aligné sur `utils.js > ROAD_STYLES_DATA` (4 types). Sync si ROAD_STYLES_DATA change.

⚠️ **Format JSON data layers** : `json.data` ou `json.editorPoints` pour POI (NOT `json.points`). Cf v1.40.5 bug fix.

⚠️ **`MAX_TILES_BASELINE` modale (20) vs `MAX_TILES_HOME` widget (80)** : modale fait swap dynamique au zoom → 20 au boot, monte vers z=0 si user zoom. Widget a carte fixe → besoin de monter direct à z=0 pour la même netteté.

---

## 6. Pour étendre

**Ajouter un toggle catégorie au widget HOME** :
1. Ajouter sub-layerGroup dans le state (e.g. `_newCatSubLayer`)
2. Helper toggle `_toggleNewCat(visible)` (pattern existing)
3. Ajout sub-layer dans `_renderDataLayersOnMiniMap` selon `_showNewCat`
4. Ajout `_renderToggle("ktaOsmHomeShowNewCat", "emoji", "Label", _showNewCat, "title")` dans `.kta-osm-home-toggles`
5. Bind dans `_bindToggle("ktaOsmHomeShowNewCat", _toggleNewCat)`

**Ajouter une catégorie à la modale OsmView** :
1. State `_newCatVisible = true`, helpers `_toggle…`
2. Layer `_newCatLayer = L.layerGroup().addTo(_osmMap)` dans `_renderMap`
3. Rendu `_renderNewCat()` (pattern POI/Roads)
4. Refresh hook : ajouter dans `_refreshLevelFilteredLayers()` si level-aware
5. Toggle UI dans le bandeau

**Étendre `TAGS_BUILTIN_HOME` ou supporter un nouveau tag** :
1. Ajouter dans `map.js > TAGS_BUILTIN` (= source de vérité)
2. Sync `osmHomePreview.js > TAGS_BUILTIN_HOME`
3. S'assurer que `icon/<tag>.png` existe dans `sw.js > ASSETS_TO_CACHE` pour la cache PWA

---

## 7. Synergie Mode Secours × Vue carte (v1.41.0+)

### 7.1 API publique étendue

```js
window.OsmView = {
  open, close, isAvailable, isOptedIn, setOptedIn,
  // 🆕 v1.41.0 (B+C) — helper exposé pour briefing pompiers PDF
  getPlanGpsBbox: _getPlanGpsBbox    // retourne L.latLngBounds | null
}
```

### 7.2 Lazy build de la projection (v1.41.2)

Avant v1.41.2, `_getPlanGpsBbox()` retournait `null` si `_proj` n'était pas initialisé (= modale jamais ouverte). Fix : si `_proj` null, appelle `_buildProjection()` à la volée.

```js
function _getPlanGpsBbox() {
  let proj = _proj;
  if (!proj || typeof proj.planToLatLng !== "function") {
    proj = _buildProjection();  // 🆕 lazy : pure, lit PLAN_CONFIG.osmGeoref
    if (!proj) return null;
  }
  // ... calcul bbox depuis 4 coins du plan via proj.planToLatLng
}
```

`_buildProjection()` est **pur** (lit `_getEffectiveGeoref()` + `KmzExport.buildTransform`) → safe à appeler hors UI context. Le cache `_proj` reste utilisé en premier (perf identique pour ouvertures suivantes).

**Cas d'usage** : `genererBriefingPompiersPDF(scenarioId)` (Mode Secours) appelle `OsmView.getPlanGpsBbox()` pour récupérer la bbox + centre afin de générer les liens cliquables OSM/Google Maps dans le PDF — sans avoir besoin que l'utilisateur ait ouvert la modale OSM au préalable.

### 7.3 Fix chips tags Vue carte (v1.41.3 → 41.4)

**Bug racine** : `_enumerateOsmTags()` itérait sur `window._dataLayersByPlan[planId]` qui **n'est défini nulle part** dans l'app (jamais peuplé). Conséquence : seuls ~3 tags de la session étaient comptés, les POI des calques data étaient ignorés.

**Fix** (v1.41.4) : utiliser `window.getAllEmbeddedPoints()` (API officielle, même source que `_collectVisiblePoi` pour le rendu markers OSM).

```js
function _enumerateOsmTags() {
  const counts = {};
  // Session + POI principaux
  if (typeof window.getEditorPoints === "function") {
    for (const p of (window.getEditorPoints() || [])) {
      if (!p || typeof p.x !== "number") continue;
      const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  // 🆕 v1.41.4 — Data layers via API officielle (avant : _dataLayersByPlan inexistant)
  if (typeof window.getAllEmbeddedPoints === "function") {
    for (const p of (window.getAllEmbeddedPoints() || [])) {
      if (!p || typeof p.x !== "number") continue;
      const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}
```

**Pas de filtre `_isLevelAllowed`** (v1.41.3) : la liste des chips reflète TOUS les tags du plan peu importe le M-LVL actif (cohérent avec `osmHomePreview._collectAvailableTags`). Le filtre par level reste appliqué au RENDU des markers via `_renderPoi`.

⚠️ **Pattern à retenir** : avant d'utiliser un global suspect, faire `grep -r "<symbol>"` pour valider qu'il est bien défini quelque part. Sinon = mort-vivant qui passe inaperçu pendant des versions.

### 7.4 Nouveau tag built-in `entree_plan` (v1.41.0 D)

Voir `add-icon-tag` skill pour les 7 sites à toucher. Particularité : icône SVG vectorielle inline (`data:image/svg+xml;utf8,...`) au lieu d'un fichier PNG → pas besoin d'ajouter à `sw.js > ASSETS_TO_CACHE`. Catégorie « 🚨 Secours » ajoutée dans `GROUPES` (interfaceLegende × 2) + `GROUPES_ICONES` (exporter).

---

## 8. Cache OSM offline (v1.43.0)

### 8.1 Vue d'ensemble

Permet à l'utilisateur de **précharger les tuiles `tile.openstreetmap.org`** correspondant à la vue actuelle, afin de garder la Vue carte consultable **hors-ligne** (typique : descente en cata, terrain sans réseau). Disponible dans 3 contextes UI partageant le **même store IndexedDB** :

| Contexte | Bouton UI | Module |
|---|---|---|
| Modale Vue carte (plan georef, ouverte par le Mode Secours) | Bandeau « 💾 Cacher offline » | `osmView.js` |
| Widget Vue carte HOME | Bandeau compact « 💾 » | `osmHomePreview.js` |
| Mode Secours (icône 🌍) | Hérite modale Vue carte (même bouton) | `secoursMode.js` → `OsmView.open` |
| Fond OSM sous le plan (mode plan) | « Enregistrer hors ligne » du panneau (emprise du plan) ; il **lit** ce cache, et hors ligne ne lit que lui | `fondOsmPlan.js` |

### 8.2 Architecture modules

```
js/osmTilesCache.js (NOUVEAU, ~280 lignes)
  ├─ IDB : "myktamap_osm_tiles" (DB v1) > store "tiles" { key: "z/x/y", blob: Blob, addedAt: ISO }
  ├─ API : init() / cacheVisibleTiles(map, opts) / getCachedTile(z,x,y) / hasCachedTile /
  │        getStats() / hasCacheForBbox(bbox, zoom) / clear() / enumerateTilesForBbox(bbox, zoom)
  ├─ Helpers : _lat2tileY / _lng2tileX (slippy tilenames OSM convention)
  └─ Constantes : MAX_TILES_PER_CACHE = 200 (politique OSM)

sw.js (modifié)
  └─ fetch handler : si URL match tile.openstreetmap.org/{z}/{x}/{y}.png
     ├─ _osmTilesCacheLookup(z,x,y) → ouvre IDB local, retourne Blob ou null
     ├─ hit → new Response(blob, {200, Content-Type:image/png, X-OSM-Cache:hit})
     └─ miss → fetch réseau normal (fallback offline = 504)

js/osmView.js (modifié)
  ├─ Bouton bandeau "#kta-osm-cache-btn" + span stats "#kta-osm-cache-stats"
  ├─ _runCacheOsmTiles(btn) → cacheVisibleTiles(_osmMap, {onProgress})
  ├─ _refreshOsmCacheStats() → affiche stats dans bandeau
  ├─ _planHasCachedTiles (bool sync) + _recheckCachedForCurrentPlan() (async)
  ├─ _isOnlineOrCached() = _isOnline() OR _planHasCachedTiles
  └─ isAvailable() utilise _isOnlineOrCached → autorise ouverture offline si cache présent
  Exposé : window.OsmView.recheckOfflineCache

js/osmHomePreview.js (modifié)
  ├─ Bouton "#ktaOsmHomeCacheBtn" + span "#ktaOsmHomeCacheStats" dans footer
  ├─ _runCacheTilesHome() / _refreshCacheStatsHome()
  └─ Après cache → notifie OsmView.recheckOfflineCache() (sync gate offline modale)

index.html : <script src="js/osmTilesCache.js" defer> AVANT osmView.js / osmHomePreview.js
sw.js > ASSETS_TO_CACHE : ./js/osmTilesCache.js
```

### 8.3 API `window.OsmTilesCache`

```js
window.OsmTilesCache = {
  init,                    // Promise<IDBDatabase> — idempotent
  cacheVisibleTiles,       // (map, {onProgress, zoomDelta=1}) → Promise<{cached, skipped, total}>
  cacheTilesForBbox,       // (bbox, zoom, {onProgress}) : même chose sur une bbox (seule implémentation)
  zoomPourBbox,            // (bbox, zMax) → zoom le plus fin où la bbox tient sur 3 zooms sous 200 tuiles
  getCachedTile,           // (z, x, y) → Promise<Blob|null>
  hasCachedTile,           // (z, x, y) → Promise<boolean>
  getStats,                // () → Promise<{count, sizeBytes, oldest, newest}>
  hasCacheForBbox,         // (bbox: L.LatLngBounds, zoom: number) → Promise<boolean>
  clear,                   // () → Promise<void>
  enumerateTilesForBbox    // (bbox, zoom) → Array<{z, x, y}> (utilitaire, sync)
}
```

**`cacheVisibleTiles(map, opts)`** : itère sur 3 niveaux de zoom (`zoomActuel - 1`, `zoomActuel`, `zoomActuel + 1`), énumère les tuiles couvrant `map.getBounds()`, plafonne à `MAX_TILES_PER_CACHE = 200` (politique OSM tile usage). Pour chaque tuile : skip si déjà en IDB, sinon `fetch()` puis `idb.put({key, blob, addedAt})`. Progress callback à chaque tuile pour mettre à jour le bouton.

### 8.4 Service Worker — interception transparente

Le SW intercepte les requêtes `tile.openstreetmap.org/{z}/{x}/{y}.png` **avant** qu'elles ne partent sur le réseau :

```js
// sw.js : fetch handler
if (/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png/.test(url)) {
  const [, z, x, y] = url.match(...);
  const cachedBlob = await _osmTilesCacheLookup(z, x, y);
  if (cachedBlob) {
    return new Response(cachedBlob, {
      status: 200,
      headers: { "Content-Type": "image/png", "X-OSM-Cache": "hit" }
    });
  }
  return fetch(event.request);  // offline = 504 natif Leaflet
}
```

Bénéfices :
- **Zéro modification Leaflet** : `L.tileLayer` continue de demander `tile.openstreetmap.org/...` comme avant
- **Transparence offline** : si la tuile est en IDB → servie instantanément ; sinon réseau ; sinon 504 (placeholder Leaflet)
- **Header `X-OSM-Cache: hit`** pour debug DevTools

### 8.5 Gate offline (autoriser ouverture sans réseau)

Avant v1.43.0, `OsmView.isAvailable()` bloquait l'ouverture si `navigator.onLine === false`. Désormais :

```js
async function _isOnlineOrCached() {
  if (_isOnline()) return true;
  // Hors-ligne : tente d'ouvrir si on a déjà des tuiles cachées pour ce plan
  return _planHasCachedTiles;
}
```

`_planHasCachedTiles` est un **bool synchrone** (state local) recalculé par `_recheckCachedForCurrentPlan()` qui appelle `hasCacheForBbox(planBbox, baselineZoom)`. Lancé :
- Au chargement d'un plan georef
- Après chaque clic « 💾 Cacher offline » (modale ou widget HOME)
- Sur demande externe via `window.OsmView.recheckOfflineCache()`

Pattern **sync gate + async refresh** : permet à `isAvailable()` de rester synchrone pour les callers (notamment widget HOME et Mode Secours), tout en restant cohérent avec l'état IDB.

### 8.6 Privacy & politique OSM

| Aspect | Comportement |
|---|---|
| Surface réseau | Aucune nouvelle URL — uniquement les `GET https://tile.openstreetmap.org/{z}/{x}/{y}.png` existants, juste pré-déclenchés au moment du clic « Cacher » |
| Cache local | 100% client (IndexedDB local), jamais transmis ni synchronisé |
| Politique OSM | `MAX_TILES_PER_CACHE = 200` par clic + 3 niveaux de zoom seulement (actuel ±1) = bulk-download raisonnable, conforme à l'esprit du [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) |
| Cookies / tracking | Idem que sans cache : `crossOrigin: true` mais pas de credentials |
| Opt-in refusé / Incognito | Le bouton « Cacher » vit dans la carte Vue carte : sans opt-in ou en incognito, la carte ne s'ouvre pas, donc aucun préchargement possible |

### 8.7 Pièges & conventions

⚠️ **Ordre de chargement** : `osmTilesCache.js` DOIT être chargé AVANT `osmView.js` et `osmHomePreview.js` dans `index.html` (sinon `window.OsmTilesCache` undefined au boot de la modale/widget).

⚠️ **Service Worker activation** : après mise à jour du SW (`CACHE_NAME` bumpé), l'utilisateur DOIT rafraîchir/relancer la PWA pour que le nouveau fetch handler (interception OSM) soit actif. Avant ça, le cache IDB se remplit normalement mais les tuiles ne sont pas servies depuis l'IDB.

⚠️ **Slippy tilenames OSM** : convention `z/x/y` avec `y` top-down ([wiki OSM](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames)). Helpers `_lat2tileY` / `_lng2tileX` collés sur cette convention. Si on étend à d'autres providers (Mapbox, MapTiler…), vérifier leur convention de tile y (certains utilisent TMS bottom-up).

⚠️ **Pas de TTL / LRU** sur le cache IDB v1.43.0 — l'user gère manuellement via bouton « Vider cache » futur (ou via DevTools). Acceptable car volume borné par `MAX_TILES_PER_CACHE = 200` par clic et l'user choisit explicitement quoi cacher.

⚠️ **`hasCacheForBbox` est approximatif** : il vérifie que la bbox est couverte au zoom baseline (= au moment où l'utilisateur a cliqué « Cacher »). Si l'user a caché à un zoom différent de la bbox du plan, le gate peut renvoyer faux négatif → l'ouverture offline est refusée alors que des tuiles existent. Compromis acceptable car simple à debug ("tu n'as pas caché ce plan"). **→ Levé en v1.43.6 via mode any-zoom (cf §8.8)**.

### 8.8 Évolution v1.43.1 → v1.43.8 — fixes & robustesse

Suite à la sortie de v1.43.0, 8 patches successifs ont consolidé la feature (gates, UX, SW robustness, faux-négatifs offline). Récap :

| Version | Sujet | Cause racine | Fix |
|---|---|---|---|
| **v1.43.1** | Gate offline async | `_isOnlineOrCached()` lisait `_planHasCachedTiles` au boot AVANT que `_recheckCachedForCurrentPlan()` ne se soit résolu → flag stale → ouverture refusée même avec cache présent | `open()` rendu async + `await _recheckCachedForCurrentPlan()` JIT juste avant le gate (recheck systématique au moment du clic, plus de course IDB) |
| **v1.43.2** | Refresh immédiat bouton 🌍 | Toggle opt-in OSM via Configuration mettait à jour le LS, mais le bouton Vue carte dans la map mode ne s'actualisait qu'au polling 2s suivant → ressentait laggy | Dispatch event `kta:osmOptInChange` chaque fois que `setOptedIn()` mute le flag + listener côté `main.js` qui appelle `_refreshOsmButton()` → refresh < 16ms |
| **v1.43.3** | Widget HOME — overlay « plan non caché » | Le widget HOME affichait OSM même si l'utilisateur n'avait jamais caché le plan sélectionné → en mode avion = tuiles cassées sans feedback | Ajout flag `_anyCachePresent` + overlay pédagogique « 📴 Plan non caché — clique 💾 pour télécharger » via `hasCacheForBbox(bboxA↔B)`. **Cache global partagé** : un plan A caché côté modale OSM est automatiquement détecté par le widget HOME (et inversement) |
| **v1.43.4** | UX position bouton | Bouton « 💾 » au milieu du bandeau, peu visible | Repositionnement juste après « 📍 Moi » (groupe d'actions utilisateur) |
| **v1.43.5** | SW robustesse | Pertes réseau intermittentes au moment de l'install du SW → certains assets critiques de l'app shell loupés silencieusement → boot cassé hors-ligne ensuite | Ajout `CRITICAL_APP_SHELL` (sous-ensemble obligatoire) + helper `_cacheWithRetry` (3 essais avec backoff) au moment de l'install + **self-heal au `activate`** : si un asset critique manque, on retente avant d'autoriser le SW à servir |
| **v1.43.6** | `hasCacheForBbox` any-zoom | Le hardcode `zoom=14` faisait des faux-négatifs : si l'user avait caché à zoom 12 ou 16 (selon `getBoundsZoom`), `hasCacheForBbox` cherchait à 14 et renvoyait false → gate offline refusait l'ouverture | Signature étendue `hasCacheForBbox(bbox, zoom?)` : si zoom omis, on scanne 10→18 sur le **centre de la bbox** et on renvoie true au premier hit. Levée du compromis §8.7 |
| **v1.43.7** | Bypass `_pingThenOpen` | En mode avion, `_pingThenOpen()` (timeout 5s vers `ping.html`) affichait le toast « Internet ne répond pas » avant l'ouverture, alors qu'on a explicitement un cache local exploitable | Si `_planHasCachedTiles === true` → bypass complet du ping, on ouvre direct. Cohérent avec la sémantique « cache présent = autorisé même offline » |
| **v1.43.8** | UX i18n label | « Cacher offline » = jargon FR ambigü (verbe « cacher » au sens dissimuler) | Renommage en **« Save Offline »** (terme international compris partout, partagé avec la convention Google Maps / OSM Editor) |

### 8.9 Garanties d'isolation cache global

KARMA : *« si je cache Paris depuis la modale, et que j'ouvre Lyon depuis le widget HOME, est-ce que je risque de voir les tuiles parisiennes ? »*. Réponse : **non**, voici pourquoi.

**Le store IDB est GLOBAL (un seul store `tiles`)** :
- Pas de partitionnement par `planId`
- Une seule DB `myktamap_osm_tiles` partagée entre modale, widget HOME, Mode Secours

**MAIS l'isolation est NATURELLE via l'indexation `z/x/y` géographique** :

```
Clé IDB = "z/x/y" (slippy tilenames OSM, EPSG:3857)
  ├─ Plan Paris (lat ~48.85, lng ~2.35) → tuiles z=14, x∈[8290..8294], y∈[5635..5639]
  ├─ Plan Lyon  (lat ~45.75, lng ~4.85) → tuiles z=14, x∈[8388..8392], y∈[5817..5821]
  └─ Plan NYC   (lat ~40.71, lng ~-74)  → tuiles z=14, x∈[4824..4828], y∈[6157..6161]

→ Clés disjointes par construction (positions géographiques différentes)
→ Aucune collision possible, aucune fuite cross-plan
```

**Bénéfices concrets** :
- ✅ **Dédup automatique** si 2 plans overlap géographiquement (e.g. deux plans dans Paris) → 1 seule copie de la tuile partagée
- ✅ **Cacher depuis modale OSM = visible depuis widget Home** (et vice-versa) — c'est ce que KARMA voulait, et c'est ce qui rend la feature « universelle » (peu importe d'où l'user déclenche le cache, ça profite à tous les contextes Vue carte)
- ✅ **Pas de gestion de "qui possède quoi"** côté code : chaque plan demande ses tuiles via `hasCacheForBbox(planBbox)`, et la réponse dépend uniquement de la couverture géographique réelle

**Limite** : pas de mécanisme « purge tuiles d'un plan spécifique » (volontaire — on purge tout via `clear()` ou rien). Si un user veut nettoyer les tuiles parisiennes après avoir supprimé son plan Paris, il faut « Vider le cache » global. Acceptable car les tuiles OSM sont publiques (pas de risque privacy) et borné (200 max par clic).


## 🔎 Mode OSM — lot 1 : recherche locale + sémantique « mode » (v1.70.0)

> Topo « 2 projets » KARMA 30/07/2026 : **OSM prioritaire** (gain user direct), mode serveur community ensuite. Décisions : recherche **locale-only** (« pas de sortie internet ») · avertissements perf plutôt que cap dur (2:b) · widget HOME conservé tel quel (3:a).

**Constat qui a réduit le lot** : le fullscreen du widget (`osmHomePreview.openFullScreen`) EST déjà un mode plein écran, et `_loadPlanDataForPreview` lit déjà les données d'un plan **non chargé**. Lot 1 livré dans `osmHomePreview.js` (pas de nouveau module) :

- **Recherche** (`#ktaOsmHomeSearch`, visible uniquement via `.kta-osm-home-fullscreen-active`) : plans géoréférencés + leurs POI. Index **paresseux** à la première saisie ; extraction **séquentielle** des ZIP (un `Promise.all` sur N JSZip = pic RAM mobile) ; cache RAM `_planDataCache` partagé avec le rendu. Un POI est projeté via le georef de **SON** plan — jamais celui du plan sélectionné. Résultat → `selectPlan` + `flyTo` (retries bornés : la carte se recrée après un selectPlan) + circleMarker doré + popup.
- **Avertissement perf** : `_avertirPerfModeOsm()` — 1× (LS `myktamap_osm_mode_warn_v1`). Le seuil « > 3 plans » du lot 2 passera par la même fonction.
- **⛶** : mêmes clés i18n, valeurs retitrées « Ouvrir le mode OSM ».

**⚠️ Pièges** :
- Le champ des dataLayers extraits est **`points`** (pas `pois` — 1er bug de ce lot, attrapé au grep).
- `_listGeorefPlans()` ne voit que les calibs **localStorage** (`KmzExport.getCalibration`) : un plan dont le georef n'est QUE dans le ZIP (jamais ouvert) est invisible du mode OSM — limitation existante du widget, assumée au lot 1.
- z-index des résultats : 1000 (au-dessus des panes Leaflet ~700).

**Feuille de route** : lot 2 (v1.71) = multi-plans images + gestionnaire de calques (visibilité / opacité / ordre par glisser) + avertissement > 3 plans · lot 3 (v1.72) = croisement de données (collecteurs tracés/zones réutilisables depuis `_loadPlanDataForPreview`) + liaisons portails dessinées entre plans.


## 🗂️ Mode OSM — lot 2 : multi-plans (v1.71.0)

**Pile** : `_stackOrder` (index 0 = au-dessus, principal INCLUS) · `_extraLayers[planId]` = {tiles, data, poi, roads, zones, struct} · `_extraOpacity`. zIndex = `200 + rang×5`, posé à la création des overlays et via `setZIndex` au réordonnancement (pas de re-render). RAM-only.

**Refactor pivot** : `_renderTilesInto(groupe, tilesData, georef, opacité, zIndex)` + `_renderDataLayersOnMiniMap(data, georef, cible?)` — les rendus du principal et des plans ajoutés partagent LE MÊME code (les 33 refs internes sont aliasées `dataL/poiL/...`). ⚠️ Toute évolution du rendu data doit rester compatible avec les DEUX chemins (module vs cible).

**Règles** :
- Le plan sélectionné (dropdown) = **principal** : fitBounds, slider bandeau, ◉ dans le panneau, non retirable. `selectPlan` le REMPLACE à la même position de pile ; sélectionner un plan déjà ajouté le retire d'abord de la pile extra (ses couches renaissent dans les groupes module).
- **Visibilité à 2 niveaux** (retour KARMA en cours de lot) : les cases du bandeau restent des **masters globaux**, et chaque ligne du panneau porte **5 chips par plan** (🖼️📍🛣️🌐🏛️). Visibilité effective = global ET par-plan, appliquée par **`_appliquerVisibilites()`** — applicateur UNIQUE appelé par les toggles globaux, les chips, et après chaque rendu (le bloc `if (_showPoi) dataL.addLayer(...)` de fin de rendu est ensuite corrigé par l'applicateur). ⚠️ Ne jamais re-manipuler les sous-groupes directement dans un toggle : tout passe par l'applicateur.
- ⚠️ Clé i18n du chip tuiles = `osm_home.toggle.plan.label` (PAS `.tiles.` — piège vécu).
- **Gestion en MODALE dédiée** (2e retour KARMA, remplace le panneau flottant puis la pastille) : bouton **≡** du bandeau → modale « 🎚️ Plans & filtres OSM » (pattern ≡ Filtres du mode plan, `z-index 100001` au-dessus du fullscreen). `_renderMultiPanel()` cible les ids DANS la modale (gardes d'existence) — le contenu reste vivant pendant qu'elle est ouverte. ⚠️ Escape : handler en **capture + stopPropagation**, sinon l'Escape fermerait AUSSI le mode OSM (handler fullscreen en phase bulle sur `document`).
- **Modale ≡ enrichie (4e retour KARMA)** : 3 sections — **Affichage** (5 chips globaux libellés, ex-checkboxes du bandeau), **🏷️ Tags** (chips agrégés sur TOUTE la pile via `_planDataCache`, clic → `_reRenderDataTous()` = re-render data du principal ET des extras + `_appliquerVisibilites`), **🗂️ Plans** (pile). Le **wrapper collapsible du widget est SUPPRIMÉ** (opacité bandeau, 5 checkboxes, chips tags, bouton 🔼 + ses binds — l'oubli d'un bind aurait fait un TypeError) ; `_renderTagChips` supprimée (conteneur disparu). La carte du widget gagne toute la hauteur libérée. ⚠️ Clés i18n `osm_home.opacity.*`, `osm_home.tagfilter.title`, `osm_home.controls.*` : vérifier l'orphelinage avant toute purge (osmView modale en partage certaines).
- **Recherche dans la LIGNE DE TITRE « 🌍 Vue carte »** (3e retour KARMA) : le nœud `#ktaOsmHomeSearch` est rendu dans le contenu puis **déplacé** dans `.loader-section-head` (listeners conservés, ancien exemplaire purgé à chaque re-render) → visible en mode réduit ET en mode OSM. Input compact 30 px en réduit, 36 px en fullscreen.
- Opacité **par plan** ; la ligne du principal et le slider bandeau sont synchronisés dans les deux sens.
- Blob URLs des tuiles : JAMAIS révoquées au retrait (elles vivent dans `_planDataCache`, partagées avec un éventuel usage principal) — re-ajout gratuit.
- Garde anti-race : `_extraLayers[planId] !== g` après l'extraction ZIP async → abandon silencieux.
- Avertissement `> 3` plans : 1× par session (`_warnedMulti`), même canal toast que le warn d'ouverture.

**🧅 Panes par plan (v1.72.2)** : l'ordre de pile vit sur des **panes Leaflet dédiés** (`ktaOsmPlan_<id>`, zIndex 200+rang×5 posé sur le pane) — c'est la SEULE façon d'ordonner images ET vecteurs ensemble (les zIndex d'imageOverlay n'ordonnent que les images ; les L.Path ignorent `pane`, il faut leur donner un **`renderer: L.svg({pane})`** dédié). ⚠️ À la recréation de `_mapInstance`, `_panesParPlan` DOIT être vidé (les panes appartiennent à la carte détruite). ⚠️ Le principal doit être semé dans `_stackOrder` dès le rendu initial (chemin `_renderWidget` qui ne passe pas par `selectPlan`) — sinon pas de ligne ◉ ni d'opacité ni de tags pour lui.

**👁️ Datalayers `visible: false` (fix v1.73.1)** : `_renderDataLayersOnMiniMap` **ne skippe plus** les calques marqués non visibles (`if (!layer.visible) continue` supprimé — il sautait le calque ENTIER, tracés et zones compris). Raison : `layer.visible` est un défaut d'affichage du **MODE PLAN**, retoggable là-bas via ⊞ Calques ; la Vue carte n'ayant aucun toggle par calque, le skip = **zéro voie d'affichage**. L'affichage est désormais gouverné par les filtres existants (chips catégories globales + par plan, tags). Effet assumé : un calque volontairement masqué par défaut apparaît en Vue carte. `layer.visible` reste **parsé** (si des toggles par calque arrivent un jour dans la modale ≡). ⚠️ La modale OSM du **mode plan** n'est pas concernée : elle lit les calques vivants de la carte, pas le plan-config.

### 🏷️ Ajout de la pile PAR ÉTIQUETTE DE PLAN (v1.84.0)

**Le trou comblé** : `plan.tags` existait depuis la v1.78.0 (registre, saisi depuis la bibliothèque, normalisé par `PlanRegistry.setTags` — 12 × 24 car.), la pile multi-plans depuis la v1.71.0. **Aucun lien** : `_listGeorefPlans` ne rapatriait même pas `tags`, et le seul chemin d'ajout était le `<select>` unitaire. Un atlas départemental découpé en vingt plans se montait donc en vingt gestes.

**UI** — modale 🎚️ Plans & filtres, section `#ktaOsmMultiTagsSect` / `#ktaOsmMultiTags`, **au-dessus** du `<select>` (qui reste). Un chip par étiquette portée par **≥ 2** plans géoréférencés, libellé + compteur `dans/total`. Rendu par `_renderMultiTags()`, appelée depuis `_renderMultiPanel()` — **point de rendu unique** : tout ce qui modifie la pile passe déjà par là.

⚠️ **Homonymie dans la même modale** : la section « 🏷️ Filtrer par tag » (`#ktaOsmFiltersTags`, `_renderModalTags`) filtre les **POI à l'intérieur** des plans affichés ; celle-ci choisit **quels plans** sont affichés. Deux notions, deux mots identiques — d'où l'intitulé explicite « étiquette de plan » (`osm_mode.multi.tagsTitre`).

**Les trois règles non évidentes**

| Règle | Pourquoi |
|---|---|
| Regroupement **insensible à la casse** (`_etiquettesDesPlans`, clé minuscule → `{libelle, ids}`) | `setTags` dédoublonne les étiquettes **d'un** plan, jamais **entre** plans. « Secteur » + « SECTEUR » = deux chips montrant chacun la moitié de leurs plans. Ne se voit que si on a tapé les deux orthographes |
| Chip masqué à **1 seul plan** | Le `<select>` juste en dessous fait déjà ce travail ; vingt chips à un plan noieraient les deux qui servent |
| Clic **asymétrique** (`_basculerEtiquettePlans`) : ajoute les **manquants**, ne retire que si **tous** présents | Ré-ajouter un plan déjà monté le dupliquerait dans `_stackOrder`. Et sans le retrait groupé, vingt plans se défont en vingt clics sur des ✕ |

**Charge — deux garde-fous, PAS une mesure.** ⚠️ La pile n'a **jamais** été éprouvée à 5/10/20 plans réels : c'est une dette ouverte de la v1.84.0, à lever sur le terrain (un plan issu d'un atlas porte couramment 5 000 objets).

1. `_ajouterPlansOsm` **confirme avant** si le lot fait ≥ 2 plans **et** ferait dépasser 3 dans la pile — le seuil est **celui de `_avertirMultiSiBesoin`** (arbitrage KARMA 2:b), pas un nombre inventé. Cet avertissement-là prévient *après* coup : sur un lot, ça veut dire une fois les vingt plans montés, donc trop tard pour renoncer.
2. `_ajouterPlanOsm` est **coupé en deux** : `_monterPlanOsm` (synchrone — pousse dans `_stackOrder`, crée les `layerGroup`) et `_chargerDataPlanOsm` (asynchrone — `_loadPlanDataForPreview`, donc **extraction ZIP**). Un lot monte tout, rend **une** fois, puis enchaîne les chargements **en série** (`montes.reduce(...)`). Vingt extractions lancées ensemble figeraient l'onglet. Symétrique au retrait : `_demonterPlanOsm` (sans rendu) + `_retirerPlansOsm` (rendu unique).

**Protection du principal** : `_retirerPlansOsm` saute `_selectedPlanId`. Sans ça, la ceinture v1.72.2 de `_renderMultiPanel` le remettrait dans la pile au rendu suivant — état incohérent entre le chip (« 0/12 ») et la carte. Le chip retombe donc à `1/12` après un retrait groupé, ce qui est la vérité.

**Garde-fou** : `scripts/check-osm-etiquettes.js` (pré-commit **bloquant**), code **extrait** de `osmHomePreview.js` — 12 assertions de logique + 6 de câblage (le `tags` transporté, le conteneur, l'appel de rendu, la confirmation, la protection du principal, le `reduce` en série).

**Reste au lot 3 (v1.72)** : croisement fin (filtres par plan ?, popups enrichis cross-plan), liaisons portails dessinées entre plans sur OSM.

---

## 🏷️ Icônes POI en Vue carte : une seule source (v1.81.0)

**Le bug.** En Vue carte plein écran, un point portant le tag **`portail`** (l'icône
vortex des liaisons inter-plans) s'affichait comme un **petit rond jaune de rayon 4**
au lieu de son icône. Idem pour **`entree_plan`** — dont le commentaire d'origine dit
pourtant « Vue carte × Mode Secours ». Découvert par KARMA le 02/09/2026 en testant
D5 : les icônes manquantes l'empêchaient de repérer ses portails sur la carte.

**Pourquoi.** `js/osmHomePreview.js` dessine des plans qui **ne sont pas chargés** —
il lit leur ZIP — sur un HOME affiché **avant** tout plan. Il ne peut donc pas passer
par `window._iconMap`, qui est le résolveur du plan **courant**. Il en gardait donc une
copie locale, `TAGS_BUILTIN_HOME`, avec ce commentaire :

> « Cohérence stricte avec map.js — si `TAGS_BUILTIN` change là-bas, sync ici. »

La sync a été oubliée **deux fois** : `entree_plan` (v1.41.0) et `portail` (v1.59.0).
Quand un tag est inconnu, `_extractIcons` ne résout rien et le rendu tombe sur le
`circleMarker` de secours. Le module le **savait** et l'écrivait —
`⚠️ Tags POI sans icône : portail(N)` — mais en `console.log`, dégradé depuis
`console.warn` en v1.40.15 : noyé dans le bruit, et invisible du smoke qui ne
surveille que les erreurs.

**Le piège qui a fait durer le bug.** `window._ktaBuiltinIconUrls` existait déjà
(v1.76.0), mais l'affectation vivait **à l'intérieur de `creerIcones()`** : la globale
n'apparaissait donc qu'**après le chargement d'un plan**. Sur le HOME, elle était
`undefined`. La consommer telle quelle aurait donné un bug **intermittent** — icônes
correctes si l'utilisateur avait déjà ouvert un plan dans la session, absentes sinon.
C'est pire qu'une copie franche.

**Le fix.** `TAGS_BUILTIN` est remontée au **top-level** de `js/map.js` et exposée
immédiatement ; `osmHomePreview` lit `window._ktaBuiltinIconUrls || TAGS_BUILTIN_HOME`.
La copie locale subsiste en **filet de secours** (si `map.js` n'était pas chargé) et
n'est plus la source.

**Verrou.** `scripts/check-icon-catalog.js` (pré-commit **bloquant**, falsifié 4×)
confronte les deux tables **dans les deux sens**, vérifie que le HOME lit bien la
globale, et que celle-ci est exposée **au top-level** (une ligne à la colonne 0 =
hors de toute fonction — c'est tout l'enjeu). *Un commentaire « sync ici » n'a rien
empêché pendant deux versions ; un test, si.*

⚠️ **Ce qui est prouvé** : la globale est disponible sur le HOME avec ses 22 tags
alors que `_iconMap` est encore vide (donc `creerIcones` n'a pas tourné), le fichier
`icon/portail.png` existe et est précaché, et le smoke reste vert. **Ce qui ne l'est
pas** : le rendu de l'icône sur un vrai point portail d'un plan géoréférencé — à
valider par KARMA, c'est ce qui débloque le test de D5.

---

## 📐 Écart de calage des liaisons (D5, v1.81.0)

**L'objection qui a façonné la feature.** Le premier jet dessinait une polyligne
entre les deux bouts de chaque portail. KARMA a relevé le défaut le 02/09 : *deux
portails correctement calés se superposent déjà*. La ligne est alors de longueur
nulle et le calque **ne montre rien** dans le cas nominal — l'utilisateur ne sait
même pas s'il fonctionne. Ce n'est donc pas un calque de contenu, c'est un
**détecteur d'erreur de calage** : sa seule valeur est le cas raté.

**Ce qui est livré** (arbitrage du 03/09 — contrôle qualité *et* affichage dans
🌀 Mes liaisons) :

| Où | Quoi |
|---|---|
| `InterPlanLinks.ecartCalage(link)` | le calcul, **fonction unique** |
| 🌀 **Mes liaisons** (HOME) | un badge `📐 Écart de calage : N m` par ligne |
| **Vue carte** → 🎚️ Filtres → chip 🌀 | liste classée **du pire au meilleur**, clic = `fitBounds` sur les deux bouts |
| **Vue carte** (calque) | la polyligne dorée + les deux bouts, en complément |

**Le calcul.** Les deux bouts d'un portail désignent le même endroit physique vu
depuis deux plans. Projetés en GPS via le géoréf de **leur** plan respectif, ils
devraient tomber au même point ; la distance qui les sépare mesure la qualité du
calage. C'est la seule mesure de ce genre que l'app puisse produire — il faut
**deux** géoréfs pour la révéler.

`ecartCalage` retourne **`null`, jamais `0`**, quand la mesure est impossible
(plan absent, pas de géoréf) : `0` voudrait dire « calage parfait », le contraire
de « je ne sais pas ». Dans 🌀 Mes liaisons, une liaison non mesurable n'affiche
**rien** — ni tiret ni « n/a » : la grande majorité des plans n'étant pas
géoréférencée, une colonne vide partout ferait croire à un défaut.

**Aucun seuil de couleur, volontairement.** 20 m d'écart, c'est énorme sur une
petite carrière et négligeable sur un réseau de 5 km. Colorer reviendrait à juger
à la place de l'utilisateur avec un seuil qui ignore son échelle. On donne le
chiffre, il tranche.

**Contrainte.** La liste OSM ne compte que les liaisons dont les **deux** plans
sont affichés dans la pile *et* géoréférencés — un écart qu'on ne peut pas montrer
sur la carte devant soi n'aide personne ; celui-là se lit dans 🌀 Mes liaisons.

⚠️ **État de validation au 03/09.** `ecartCalage` et le badge de 🌀 Mes liaisons
sont **prouvés au harnais** : sur deux plans calés à 33 m l'un de l'autre, l'API
renvoie 33 m et le badge l'affiche ; une liaison dont un plan n'a pas de géoréf
renvoie `null` et n'affiche rien. La **liste de la Vue carte n'a PAS pu être
exécutée** : le mode plein écran exige des plans réellement chargeables (ZIP), que
le harnais ne sait pas fabriquer — le bouton 🎚️ n'existe qu'une fois ce mode
ouvert. À valider sur un vrai jeu de plans géoréférencés.

---

## 📝 Le travail de session en Vue carte (v1.81.0)

**Le symptôme, remonté par KARMA le 03/09** : « je ne vois pas mes points en OSM
HOME ». Ils étaient créés **en session**. `_loadPlanDataForPreview` ne lit que le
**ZIP** (plan-config + dataLayers) : tout ce qui n'a pas été exporté restait
invisible.

**Ce qui rendait la situation intenable** : la **recherche cross-plan les trouvait
déjà** — `InterPlanLinks.collectPointsForPlan` lit la session depuis toujours.
Une carte qui n'affiche pas ce que la recherche renvoie est indéfendable. Le
module lisait d'ailleurs *déjà* la session pour les **couleurs de légende**
(`payload.customLegend`) : il allait chercher les couleurs, pas les objets qui les
portent.

**Le correctif.** Un **calque virtuel** bâti sur `SessionPersist.getSaved(planId)`
— API qui existait déjà, aucune fonction nouvelle. Le payload porte exactement les
4 familles que la Vue carte sait rendre (`editorPoints`, `roads`, `zones`,
`structures`), aux mêmes noms de champs : aucune conversion.

🩸 **Pourquoi la lecture se fait au RENDU et non à l'extraction du ZIP** :
`_planDataCache` **n'est jamais invalidé** — il vit toute la durée de la page. Y
ranger la session la figerait au premier affichage : on édite en mode plan, on
revient au HOME, on voit l'état d'avant. La lecture au rendu coûte un `getItem` +
un `JSON.parse` par plan affiché, négligeable devant l'extraction ZIP, et elle est
toujours fraîche.

**Les trois consommateurs passent par `_tousCalques(data, planId)`** — le rendu,
les chips de filtre par tag, et l'index de recherche du HOME. En oublier un
donnerait un point affiché dont le tag manque aux chips : **masqué dès qu'un
filtre est posé**, sans que rien ne l'explique.

**Choix d'affichage** (arbitrage KARMA : les 4 familles, et un calque identifiable) :

- chip global **📝 Session**, **ON par défaut** — le masquer par défaut ferait
  chercher l'utilisateur exactement comme aujourd'hui ;
- posé **hors de `_CATS`**, comme le chip 🌀 : la session n'est pas une catégorie
  d'objets mais une **origine de données**, transversale aux 4 familles ;
- le popup d'un POI de session porte « 📝 Session en cours — pas encore dans le
  plan ». *La Vue carte montre l'état **enregistré** des plans ; y mêler du travail
  non exporté sans le nommer créerait une confusion pire que son absence.*

**Limites connues** :

- `getSaved` **rejette un payload dont la `version` diffère** de celle de
  `sessionPersist.js` (1 aujourd'hui). Une vieille session ne s'affichera pas —
  cohérent avec le reste de l'app, mais silencieux.
- Si le ZIP d'un plan est irrécupérable, `_renderDataLayersOnMiniMap` n'est pas
  appelé du tout : **sa session ne s'affiche pas non plus**. Le plan n'ayant ni
  fond ni tuiles, l'afficher seul n'aurait pas de sens.
- Pas de déduplication avec les dataLayers. Session et calques du plan sont deux
  ensembles distincts ; le seul recouvrement possible vient d'un export « baked »
  qui a figé la session dans le ZIP. `collectPointsForPlan` vit déjà avec ce cas
  sans dédupliquer — on reste cohérent plutôt que d'inventer une règle ici.

⚠️ **État de validation au 03/09.** `SessionPersist.getSaved` renvoie bien les 4
familles au harnais (2 points, 1 tracé, 1 zone, 1 structure lus), les 4 clés i18n
résolvent en fr/en/es, le smoke est vert et les 308 contrôles des garde-fous
passent. **Le rendu n'a PAS pu être exécuté** : le widget OSM reste bloqué sur
« ⏳ Préparation… » en headless — il lui faut une connectivité réelle pour les
tuiles. C'est une limite du harnais, pas du correctif : **aucune** partie de la
Vue carte n'est testable automatiquement aujourd'hui. À valider sur l'appareil.

---

## 8. Le géoréf a TROIS sources, et le HOME n'en lisait qu'une (v1.82.0)

| Source | Contenu | Lue par la modale (`osmView`) | Lue par le widget HOME |
|---|---|---|---|
| `PLAN_CONFIG.plan.georef` | géoréf embarqué dans le ZIP | ✅ depuis v1.39.2 | ❌ *impossible* — aucun plan chargé au HOME |
| `KmzExport.getCalibration(id)` | saisie utilisateur (localStorage) | ✅ depuis v1.39.2 | ✅ |
| `PlanRegistry` → `plan.georef` | **🆕 v1.82.0** — déposé au chargement | — | ✅ second recours |

🩸 **Le même défaut avait été trouvé et corrigé d'un seul côté.** `osmView.js`
a gagné sa cascade à deux sources en v1.39.2 (« je vois pas l'icône »). Le
widget du HOME ne l'a jamais reçue, et son en-tête érigeait le manque en
**« limitation acceptable »** : l'utilisateur n'avait qu'à saisir sa géoréf une
fois en mode plan.

C'était défendable tant qu'une géoréf se saisissait à la main. **L'import SIG
l'a rendu faux** : il produit des plans calés *par construction*, dont personne
n'a de raison de ressaisir les points — et c'étaient précisément ceux qui
manquaient à la liste (signalé par KARMA : « les plans issus de SIG
n'apparaissent pas dans la liste vue carte »).

**Correction.** Le HOME ne peut pas lire `PLAN_CONFIG`. Le registre, lui, il le
lit déjà : `main.js > _propagerGeorefVersKmzExport` y dépose donc le géoréf du
plan à son chargement, et `_listGeorefPlans` s'en sert en second recours.

Priorité inchangée : **le localStorage d'abord**. Il porte la voix de
l'utilisateur ; le registre ne porte que la donnée propre du plan.

⚠️ **Ce qui reste hors d'atteinte** : un plan enregistré sans avoir jamais été
chargé. En pratique un ZIP importé est chargé dans la foulée, donc le cas se
limite aux plans serveur déclarés dans `data/index.json` — qui pourraient
porter leur géoréf dans cette déclaration si le besoin se présente.

---

## 9. Mesurer en Vue carte — distance + surface (v1.83.0)

Bouton 📏 dans la barre du widget HOME. Clics successifs = sommets ; segment
étiqueté à sa longueur, total et surface dans un bandeau flottant ; ↩ retire le
dernier point, 🗑️ vide, ✕ quitte.

🩸 **`measure.js` n'est pas réutilisable — et c'est une bonne nouvelle.** Le
module du mode plan (442 lignes) est bâti sur `convertCoord` et
`APP_CONFIG.scale` : il travaille en **pixels d'un plan**, divisés par une
échelle calibrée. En Vue carte il n'y a pas *un* plan (il y en a plusieurs
empilés, chacun avec la sienne) et il n'y a **pas besoin d'échelle** : les
coordonnées sont déjà des latitudes et des longitudes.

> Une mesure faite ici est donc **structurellement plus fiable qu'en mode plan** :
> elle ne dépend d'aucun calibrage. C'est exactement la source du bug vécu sur le
> relevé SIG — 480 m annoncés contre 1 644 réels, parce que l'échelle du plan
> était fausse. Ici, la question ne se pose pas.

| Grandeur | Méthode | Précision |
|---|---|---|
| **Distance** | `L.latLng.distanceTo` — géodésique (Haversine, rayon moyen IUGG) | exacte au mètre sur nos ordres de grandeur |
| **Surface** | projection **équirectangulaire locale** centrée sur le barycentre, longitude corrigée par `cos(latitude)`, puis **formule du lacet** | < 1 % sur quelques kilomètres |

On ne prétend pas mieux sur la surface : une surface géodésique exacte
demanderait une projection équivalente, et la précision gagnée serait très
inférieure à celle d'un tracé fait à la main.

**Prouvé contre des valeurs connues**, pas contre lui-même : 1° de latitude
≈ 111,2 km, 1° de longitude à 45°N ≈ 78,6 km, un carré de 0,01° à 45°N.
7 cas dans `check-api-surface.js`, avec un `distanceTo` de référence
**indépendant du code testé**. Falsifiés : retirer la correction `cos(lat)` fait
tomber la surface, retirer la valeur absolue fait tomber le sens de parcours.

*C'est la leçon de l'import SIG — 34 tests verts qui ne prouvaient que la
cohérence du code avec ses propres suppositions.*

---

## 10. Largeur des fronts : la Vue carte applique la loi du mode plan

KARMA : « en mode OSM c'était pas mal, mais on peut faire aussi bien qu'en mode
plan, ça reste encore limite ».

🩸 **Ce qui tenait lieu de solution était un accident.** Le commentaire posé en
v1.82.0 le disait déjà : le rendu convenait parce que le repli des types
personnalisés tombe sur le gabarit « mur » (`weight: 2`). Consigné dans `docs/IDEES.md`
plutôt que corrigé à l'aveugle — demander le `weight` au canon aurait ramené
10 px et refait l'aplat.

### Une loi, trois consommateurs

La loi est désormais formulée sur la seule grandeur que les trois partagent :
des **pixels rendus par mètre de terrain**.

| Contexte | px/m |
|---|---|
| Écran, mode plan | `APP_CONFIG.scale × 2^zoom` |
| Export PNG/PDF | `APP_CONFIG.scale × résolution` |
| **Vue carte** | `1 / résolution Web Mercator` |

Les deux premiers passent par une échelle de plan ; **la Vue carte n'en a pas** —
elle travaille en lat/lng. D'où `window.ktaPxParMetreOsm(map)`, qui calcule la
résolution Web Mercator du moment.

⚠️ **La latitude compte autant que le zoom** : `156543,034 × cos(lat) / 2^zoom`.
Un même zoom couvre ~40 % de moins au nord de la France qu'à l'équateur. La
calculer, plutôt que de tabler sur des paliers de zoom réglés à la main, est ce
qui rend la largeur juste **partout** et pas seulement là où on a réglé.

### Ce que ça change, chiffré (45°N)

| Zoom | m/px | Avant | Après |
|---|---|---|---|
| 15 | 3,38 | 6 px | **1 px** |
| 16 | 1,69 | 6 px | **1 px** |
| 17 | 0,84 | 6 px | **1,8 px** |
| 18 | 0,42 | 6 px | **3,5 px** |
| 19 | 0,21 | 6 px | **7,1 px** |

Le `6` fixe était juste à **un seul** niveau de zoom. Il est six fois trop large
là où la carrière tient dans l'écran — précisément là où l'aplat se forme.

### Mise en œuvre

Fronts à la loi, tracés à 0,6 × la loi (plancher 1 px), **contours des piliers et
murs** affinés comme en mode plan : `structures.js > ktaBordSurfacePourLargeur`
(le quart d'un front, jamais plus que le trait d'origine, plancher 0,5 px). Un
contour fixe de 1 ou 2 px, sur des centaines de piliers vus de haut, fait un aplat
noir. Les zones gardent leur trait.

**Arc de soutènement** : bleu rayé de rouge comme en mode plan (sinon on le confond
avec le mur en ligne), à la loi des arcs (0,6 × front, plancher 2 px, comme
`structures.js > ktaLargeurRayePourRatio`). Modale : `ktaPolylineStructure` peint les
rayures sur le canvas. Widget : panes SVG, donc une seconde polyligne rouge en tirets
par-dessus (classes `kta-osm-arc` / `kta-osm-arc-rayures`, tirets recalculés avec
l'épaisseur). `checkup-largeur-osm-home.js` le vérifie sur les deux cartes.

- **Modale** (`osmView.js > _majLargeurFrontsOsm`) : renderer canvas. On **mute
  `options.weight` en place** (relu à chaque frame), puis une repeinture **non
  clippée** (`_redrawBounds = null` avant `_redraw()`, cf. `gotchas.md`).
- **Widget de l'accueil** (`osmHomePreview.js > _majLargeurFrontsHome`) : chaque
  plan est dessiné par le renderer **SVG** de son pane (`_panePour`). 🩸 Le SVG ne
  relit le style qu'à `setStyle` : un `weight` muté en place n'y change rien (la
  loi est restée inerte ainsi, fronts figés à 4 px, plan illisible de haut). D'où
  `setStyle`, seulement quand la valeur change. 🩸 Elle vise les sous-groupes
  (`_structSubLayer`, `_roadsSubLayer`, `g.struct`, `g.roads`), pas
  `_dataLayer` / `g.data`, qui ne contiennent que des groupes.

Reposée au `zoomend` et après **chaque re-rendu** (recréer les layers remet le
`weight` du gabarit) — dans le widget, après le rendu de TOUS les plans de la
pile, principal **et empilés**. Garde-fou : `scripts/smoke/checkup-largeur-osm-home.js`.

Les deux cartes multiplient fronts, tracés, murs en ligne et arcs par le réglage
d'appareil « Épaisseur des traits » (`KtaEpaisseurTraits.ecran`, `ui.md`), contours
des piliers exclus, et se repeignent à `kta:epaisseurTraitsChange` ; la Vue carte y soumet aussi
son itinéraire (5 px × facteur, hors loi du zoom, `_majLargeurItiOsm`).

🛡️ **Prouvé, et le test lui-même a été corrigé après falsification** : il ne
comparait les deux chemins qu'à **une seule densité**, si bien qu'une copie ayant
dérivé sur les **bornes** (plafond à 12 px au lieu de 14) passait au travers. Il
balaie désormais 8 densités, bornes comprises — et la dérive tombe.

## 11. Taille des icônes au zoom : le réglage 📐 vaut aussi pour les cartes OSM

Le réglage global « 📐 Adapter la taille des icônes au zoom » (`APP_CONFIG.scaledMarkers`, défaut actif) s'applique
à la **Vue carte** et à la **carte OSM de l'accueil** (plan principal et plans empilés), avec **la même loi** qu'en
mode plan et un **plancher propre** :

    échelle = pixels écran par pixel de PLAN, bornée [plancher ; 2]      (map.js > ktaEchelleMarqueurs)
    plancher : ×0,25 en mode plan · ×0,5 sur les cartes OSM (window.KTA_ECHELLE_PLANCHER_OSM)

| Contexte | pixels écran par pixel de plan |
|---|---|
| Mode plan (CRS.Simple) | `2^zoom` |
| Cartes OSM | mesuré à travers le calage : `ktaPxEcranParPxPlanOsm(carte, proj)` projette deux pas de 100 px du plan (`proj.planToLatLng`, puis `carte.project` au zoom courant) |

Pourquoi cette loi plutôt qu'un zoom relatif au zoom de calage ou les px/m des fronts : elle garde à l'icône **la
même taille par rapport au dessin du plan** qu'en mode plan, au même grossissement, sans dépendre de l'échelle
métrique du plan (absente ou fausse sur un plan non mesuré) ni d'un « zoom de référence » arbitraire. Latitude et
Web Mercator sont pris en compte par `project`.

**Plancher ×0,5 en OSM (décision produit).** La vue d'ensemble d'un plan détaillé est la vue courante d'une carte
OSM ; au plancher du mode plan (×0,25) les icônes y tombaient à 6,5 px (Vue carte) et 6 px (accueil), illisibles.
Au plus petit : **13 px en Vue carte, 12 px à l'accueil**. Le plancher est un paramètre de `ktaEchelleMarqueurs`,
pas une seconde loi ; plafond ×2 commun.

**Mise en œuvre.**
- Icône choisie **au rendu** par `map.js > ktaIconeOsm(url, taille, tag)` : réglage actif → `L.divIcon` +
  `<img class="kta-marker-img">` (même CSS que le mode plan) ; coupé → `L.icon` nu (26 px Vue carte, 24 px accueil).
- Variable `--kta-marker-scale` posée sur le **conteneur** de la Vue carte (`osmView.js > _majTailleIconesOsm`) et
  sur le **pane de chaque plan** à l'accueil (`osmHomePreview.js > _majTailleIconesHome`, projection gardée dans
  `_panesParPlan[id].proj`) : deux plans empilés n'ont pas la même résolution. 🩸 Jamais sur le body : c'est celle
  du mode plan, resté dessous ; le conteneur de l'accueil est remis à 1 pour ne pas en hériter.
- Recalculée sur `zoom` et `zoomend`, écrite seulement quand la valeur change.
- Réglage basculé dans ⚙️ Configuration de l'accueil : `window.ktaMajTailleIconesOsm` → événement
  `kta:tailleIconesChange` → **re-rendu des POI** des cartes ouvertes (pas de rechargement).

🩸 **Pourquoi pas une seule forme d'icône pour basculer sans re-rendu.** Mesuré sur la Vue carte avec 1 521 marqueurs
(relevé fictif + 1 500 POI synthétiques, Chromium, médianes sur 24 crans) : un divIcon laissé à l'échelle 1, ou une
taille en `calc()` sur l'`<img>`, alourdissent **tous** les zooms (+10 à +30 ms) même quand la taille ne change pas.
Avec le `L.icon` nu, le réglage coupé coûte ce qu'il coûtait avant.

**Coût du réglage actif** (même mesure) : zoom animé ≈ 385 → 415 ms, zoom sans animation ≈ 40 → 65 ms. C'est le
redimensionnement des 1 500 images à chaque cran, le même mécanisme qu'en mode plan.

🛡️ `scripts/smoke/checkup-osm-taille-icones.js` : taille mesurée = base × loi à quatre zooms (plancher OSM compris),
taille de base réglage coupé, bascule à chaud dans les deux sens, échelle du mode plan intacte, temps de zoom
(`OSM_PAS` pour allonger la mesure).

## 12. Légende du plan en lecture seule (les deux cartes OSM)

Bouton **`🗺️ Légende`** dans la barre de la Vue carte, **`🗺️`** dans le bandeau de la carte de l'accueil (petite carte
et plein écran ; `≡` y est déjà « Plans & filtres »). Les deux ouvrent la **même** légende que la ≡ Légende du mode
plan — libellés, masquages, couleurs choisies, types `cust-…`, icônes — sans rien de modifiable (décision produit) :
ni ✏️ Modifier, ni bandeau des types orphelins (son « ➕ Lier » écrit dans la légende). Pas de ligne d'explication
(décision produit) : l'absence de ✏️ suffit.

- **Un seul rendu** : `interfaceLegende.js > _ktaLegendeCorps(source, {lectureSeule})`, appelé par la ≡ Légende
  (`afficherLegende`) et par `window.ktaLegendeLectureSeule(opts)`. Couleurs par `ktaResolveStyle`, libellés et
  entrées par `LegendCustomization` : aucune table locale.
- **Source** = ce qu'il faut savoir d'un plan : `icons`, URL d'un tag, liste des tags, `multiLevel`.
  `_sourcePlanCharge()` lit l'état live (PLAN_CONFIG, `_iconMap`, APP_CONFIG) ; `_sourcePlanDonnees(d)` lit ce que
  l'accueil a déjà extrait (`_planDataCache[id].config` / `.iconUrls`) — **jamais de rechargement du plan**.
- **Plan non chargé** : `LegendCustomization.lireAvecEtats(session, plan, fn)` substitue ses deux états (slot de
  session puis `customLegend` du plan-config, lus par `osmHomePreview.js > _legendeDe`) le temps du rendu
  **synchrone**, persistance suspendue, restauration en `finally`. ⚠️ `fn` ne doit rien faire d'asynchrone.
- **Quel plan à l'accueil** (`_planDeLaLegende`) : le plan **chargé** derrière l'accueil s'il est sur la carte (carte
  Leaflet vivante + `_currentLoadedPlanId` dans la pile) → état live ; sinon le plan de la pile **ouvert le plus
  récemment** (`lastOpened` du registre), à défaut le principal. Cas « aucun plan chargé » (démarrage à froid) :
  c'est le plan dont l'utilisateur a vu la légende en dernier, et celui dont le slot de session est le plus frais.
- **Plusieurs plans sur la carte** : avertissement en tête, « Légende de <plan> ; les autres plans affichés ont la
  leur. » (nom posé par `textContent`).
- **Empilement** : la modale prend `z-index 100001` (rang des sous-modales), au-dessus de la Vue carte (99999) et du
  plein écran de l'accueil (9999). **Échap** en capture + `stopPropagation` : il ferme la légende, pas la carte.
- 🛡️ `scripts/smoke/checkup-osm-legende.js` : bouton présent sur les deux cartes, légende identique à celle du
  mode plan (couleur choisie et zone `cust-…` comprises) depuis la Vue carte, l'accueil avec le plan chargé et
  l'accueil après redémarrage (plan non chargé), aucun contrôle de modification, avertissement à deux plans,
  légende au premier plan, Échap.

## 13. Tourner les cartes OSM (rotation manuelle)

Les deux cartes OSM, la **fenêtre** Vue carte et le **widget de l'accueil**, tournent comme le plan 2D, **à la main
seulement** (décision produit) : deux doigts au-delà de 15° d'angle entre eux, Maj + molette au PC, bouton nord
(classe `.kta-nord-local`, coin bas gauche de SA carte) pour redresser. Aucun cap, aucun plan orienté.

- **Même mécanique que le plan** : chaque module crée une fois `MapBearing.creerRotationManuelle({ carte,
  apresRotation })` (cf `tracking.md` §Rotation manuelle, « Une instance par carte ») et la rattache à chaque nouvelle
  carte (`osmView.js > _brancherRotation`, `osmHomePreview.js > _brancherRotation`). Mêmes seuils, même pan refait à
  la main, même patch des gestes, lu **par carte** (`map._ktaRotation`). Une instance par module : les deux cartes
  tournent indépendamment.
- **Remise à 0** : la carte démontée est redressée APRÈS `map.remove()` (carte rendue nulle) : avant, la restitution
  du padding du canvas lui redemandait un dessin orphelin (TypeError au rAF suivant) et le drag sauvegardé serait
  rendu à la carte suivante. Fenêtre : rouvre nord en haut. Widget : chaque carte recréée (retour à l'accueil,
  langue, réglages, `refresh`) repart nord en haut ; choisir un autre plan dans la liste (`selectPlan`) garde l'angle,
  la carte est la même (décision : un angle gardé d'une ouverture à l'autre surprendrait sur une carte
  géographique, un angle effacé par un simple changement de plan aussi).
- **Tuiles OSM** : une `GridLayer` ne demande que les tuiles du rectangle droit de l'écran, coins blancs une fois
  tourné. Pour une carte rattachée (pas celle du plan), `mapBearing.js > _installerPatchGrilles` élargit sa zone à la
  boîte englobante du rectangle tourné, et l'instance relance `_update` des grilles à chaque angle (aucun
  `moveend` ne vient).
- **Tuiles du plan calé** : fenêtre, le culling de `_renderLevel` lit `_zoneVue(pad)` = `zoneVisible` de la rotation
  (4 coins dé-tournés), à plat `getBounds()` au bit près ; `_apresRotation` relance le rendu (au plus toutes les
  120 ms). Widget : la vue d'ensemble couvre tout le plan (rien à faire) ; les tuiles hi-res (`_majHiResPlan`) lisent
  la même `_zoneVue`, et `apresRotation` = `_onCarteBougeHiRes` (débounce 300 ms).
- **Panes** : tout pane créé après le pane de rotation est **adopté** dans le pane qui tourne au premier angle posé
  (`ktaOsmTuiles` de la fenêtre, `ktaOsmPlan_<id>` du widget et leurs sous-calques `_tuiles`, qui suivent leur
  parent). Un pane de plan créé alors que le widget est DÉJÀ tourné (plan ajouté par ≡) est adopté tout de suite
  (`_panePour` appelle `reappliquer`), sinon il resterait droit jusqu'au prochain déplacement.
- **Gestes du widget dans une page qui défile** : rien de changé pour un doigt. Leaflet pose `touch-action: none` sur
  la carte (drag actif) : un doigt déplace la carte, la page défile quand le doigt est posé hors du widget. Pendant
  une rotation, le drag Leaflet est coupé et `.kta-bearing-lock` garde `touch-action: none` : deux doigts sur le
  widget ne font ni défiler ni zoomer la page.
- **Outils** : la mesure (`osmMesure.js`) et le relevé de coordonnées (`osmCoords.js`) restent utilisables sous
  rotation (ils lisent `e.latlng`, juste grâce au patch) ; le libellé de segment est contre-tourné
  (`.kta-bearing-on .kta-osm-mes-seg span`), les bulles des POI aussi (règles communes du plan). Les **tooltips**
  (couche Mode Secours de la fenêtre, au survol) tournent avec la carte, comme sur le plan (limite connue,
  `tracking.md`).
- 🛡️ `scripts/smoke/checkup-osm-rotation.js` : widget en contexte téléphone (un doigt inchangé avec contre-essai de
  défilement, geste CDP 8° rien / 50° suit sans défiler ni zoomer la page, coins à 45° pour les tuiles OSM et celles
  du plan avec contre-essais, bulle droite, Maj + molette, nord, angle gardé au changement de plan, carte recréée
  droite et tournable) ; fenêtre (geste, coins, toucher et mesure sous rotation, Maj + molette, nord, réouverture) ;
  carte du plan et minicartes jamais tournées. ⚠️ Non vérifié sur un vrai téléphone.

## 🗂️ Pile de plans du widget HOME : une seule règle de promotion (14/09/2026)

Bug KARMA : *« je charge A, retour home → A ; je charge B, retour home → B, mais A reste dans la liste et refuse le ✕ »*.

- `_stackOrder` (osmHomePreview.js) est une variable de **module** : elle survit au remontage du DOM. Le re-mount au retour home (`mount(preferId)` → `_renderWidget`, v1.90.12) ne faisait qu'`unshift` le nouveau principal ; seul `selectPlan` retirait l'ancien. → A restait en fantôme, sans couches (la carte est détruite au re-mount).
- Le ✕ passe par `_demonterPlanOsm`, qui refusait tout id sans `_extraLayers[id]` — un ex-principal n'en a jamais eu. → inamovible.
- **Règle unique** `_remplacerPrincipalDansPile(pile, prev, next)` (pure) : nouveau absent → prend la place de l'ancien principal (ou passe au-dessus s'il n'y en avait pas) ; nouveau déjà présent → l'ancien sort. Appelée par `_renderWidget` **et** `selectPlan`. Toute future promotion doit passer par elle.
- `_demonterPlanOsm` retire une ligne fantôme de la pile (sauf le principal courant) et rend `true`.
- `_initMiniMap`, quand elle détruit la carte, purge `_extraLayers` et sort ces ids de la pile : les plans ajoutés par « + » appartenaient à la carte morte et ne se ré-affichaient plus (fantômes silencieux). Effet assumé : après un aller-retour dans un plan, la pile se réduit au plan quitté ; `_extraOpacity` est gardé pour un re-ajout.
- 🛡️ `scripts/check-osm-pile.js` **exécute** la règle et le démontage extraits du fichier (leçon v1.90.15 : un grep valide un fantôme).

## Diagnostic : une icône paraît sous les tuiles du plan

Non reproduit au harnais (plan réel, Chrome et WebKit, échelles 1 à 3, `scripts/smoke/checkup-osm-empilement.js`).
Sur l'écran où le défaut se voit, Vue carte ouverte, coller dans la console (F12) — chiffres seulement, aucune donnée
de plan :

```js
(()=>{const c=document.getElementById("kta-osm-map"),p=c.querySelector(".leaflet-ktaOsmTuiles-pane"),m=c.querySelector(".leaflet-marker-pane"),t=c.querySelectorAll("img.leaflet-image-layer"),k=[...m.querySelectorAll(".leaflet-marker-icon")].slice(0,50);let n=0;k.forEach(e=>{const r=e.getBoundingClientRect(),s=document.elementsFromPoint(r.left+r.width/2,r.top+r.height/2);if(s[0]!==e&&s.indexOf(e)>s.findIndex(x=>x.classList&&x.classList.contains("leaflet-image-layer")))n++});return {dpr:devicePixelRatio,ua:navigator.userAgent,tuiles:t.length,horsPane:[...t].filter(i=>i.parentElement!==p).length,paneTuiles:getComputedStyle(p).zIndex+"/"+getComputedStyle(p).opacity,paneMarqueurs:getComputedStyle(m).zIndex,couvertsHitTest:n+"/"+k.length}})()
```

Lecture : `couvertsHitTest` > 0 → défaut dans la page (CSS, réglage, état) ; 0 alors que le défaut se voit → défaut
de dessin du navigateur ou du GPU (joindre `chrome://gpu` et une capture). `horsPane` > 0 → tuiles posées hors du
pane `ktaOsmTuiles` (opacité et ordre perdus).

