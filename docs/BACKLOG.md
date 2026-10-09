# 📋 Backlog & dettes — MyKTAMap

> Fichier de travail KARMA ↔ Claude. **Ce n'est pas un journal** (ça, c'est `README.md`) : ici on ne garde que ce qui est **ouvert**. Une entrée soldée est **supprimée**, pas barrée — son histoire vit dans le journal et les commits.
>
> **Dernier ménage : 07/10/2026** (précédent : 06/10/2026). Tout ce qui était soldé est sorti (y compris les « corrections d'inventaire ») ;
> ce qui a été abandonné volontairement est dans **🚫 Enterré**. Les versions antérieures de ce fichier restent
> lisibles dans l'historique Git (`git log -p docs/BACKLOG.md`).

## ⚠️ Règle de vérification (à lire avant d'utiliser ce fichier)

Le 01/08/2026, un inventaire de dettes sourcé depuis la doc s'est révélé **faux à 30 %** : 3 dettes sur 10 étaient déjà payées. Cause : les docs du repo sont des **logs append-only** où une entrée ancienne pose une limitation qu'une entrée ultérieure lève, sans renvoi entre les deux — y compris les en-têtes de modules `js/`.

**Donc chaque entrée ici porte son niveau de preuve** :

| Tag | Sens |
|---|---|
| ✅ **vérifié** | confirmé dans le CODE à la date indiquée |
| ⚠️ **doc seule** | lu dans une doc, **jamais recoupé au code** — à vérifier avant d'agir |
| 🔬 **hypothèse** | piste identifiée, non testée en runtime |

**Avant de traiter une entrée** : `grep` le symbole dans `js/`, vérifier le chargement dans `index.html` et la présence dans `sw.js > ASSETS_TO_CACHE`. Puis mettre le tag à jour.

**La règle vaut dans les DEUX SENS** (ajouté le 31/08/2026, après récidive) : une entrée qui traîne alors qu'elle est **soldée** coûte aussi cher qu'une dette ignorée — elle fait recommander un chantier déjà fait (cas réel du 31/08 : « la vague 3 du résolveur de styles », terminée depuis v1.76.0, reproposée parce que sa section n'avait jamais été reclose). Quand un lot tombe, **reclore la section le jour même** : ni « 🔜 vagues suivantes » orphelin, ni tableau de suivi laissé ouvert. Le seul état stable de ce fichier est *ouvert*.

---

## 📱 À tester sur appareil — le harnais ne sait pas le faire

- **M2 — Lockout temporisé** (PIN `pinLock.js` + gate `unlockGate.js`, codé le 13/09) : 5 codes faux → compte à
  rebours → retour automatique du pavé. Base de temps = horloge de l'appareil (`security-legal.md` §36.3).
- **B5 — Stockage saturé** (livré le 13/09) : bandeau persistant + bouton 💾 Exporter tant que la sauvegarde
  échoue. Non reproductible au harnais (quota) : saturer le stockage d'un téléphone de test.
- **Mode Secours v1.98.24 sur iPhone** : « Suivre mon parcours » démarre le suivi (permission des capteurs iOS
  demandée dans le geste) ; valider une étape recale la position (question au-delà de 30 m) ; écran XL avec un long
  itinéraire ; champ « Retour impératif » (sélecteur d'heure natif).
- ⚠️ **Toujours tester APRÈS un bump** : le service worker ne change de cache qu'au bump de `CACHE_NAME`. Entre deux
  commits, un téléphone qui a déjà chargé l'app garde l'ancien JS — c'est ce qui a fait voir à KARMA un « tourner à
  gauche » déjà corrigé (27/09/2026).
- La validation **iOS/Safari** d'un changement de rendu vit dans `docs/RELEASE_GATE.md`, pas ici.

## 🔎 Performance sur relevé lourd — mesuré le 26/09/2026, gardé

Mesures sur un vrai plan tuilé (16332×13820, 864 tuiles au niveau 0, 912 tracés).

- 🟡 **Export image : le fond est retéléchargé** (image de 42 Mo) alors que 30 Mo de tuiles sont déjà sur l’appareil.
- 🟡 **Pendant un déplacement, des éléments n'apparaissent qu'au relâcher — case « 👁️ Ne rendre que les éléments
  visibles » décochée** (constaté le 05/10/2026, pas une régression : comportement présent avant v2.9.0). Deux causes
  indépendantes de la case : (1) les tracés et zones sont en **canvas** (`map.js` `preferCanvas: true`) — Leaflet ne les
  dessine que sur l'écran + 10 % et redessine à la fin du geste ; (2) **tuiles** de l'image posées seulement près de
  l'écran (`tiling.js`, v1.98.23). La case n'ajoute donc presque rien de visible, d'où la question de sa **pertinence**.
  Pistes : marge du renderer élargie (`L.canvas({ padding: 0.5 })`) et des tuiles, à mesurer sur relevé lourd
  (mémoire, fluidité) ; puis garder, fusionner dans ULTRA, ou retirer la case. **À trancher par KARMA.**

## 🪧 Guidage de l'itinéraire — ce qui reste (29/09/2026)

Décisions : `docs/ETUDE_GUIDAGE.md` ; archi : `docs/architecture/tracking.md` §Guidage.

- 🟡 **Poids des jonctions de niveau sur un plan distant** (vu le 01/10/2026 en branchant le guidage
  inter-plans) : `pathfinder.js > _poidsSegment` lit l'échelle ET les profondeurs de niveau du plan OUVERT
  (`APP_CONFIG.scale`, `getProfondeurNiveau`). L'étape d'un itinéraire inter-plans calculée sur un autre plan
  multi-niveau pèse donc ses jonctions avec les profondeurs du mauvais plan → choix de chemin légèrement
  faussé. Les carrefours, eux, reçoivent déjà l'échelle du plan cible (`opts.echelle`). ✅ vérifié (code lu).

## 🚑 Mode Secours — la refonte qui reste (audit du 29/09/2026)

Rapport : [`docs/audits/2026-09-29_audit-secours-v1.md`](audits/2026-09-29_audit-secours-v1.md). Un commit par
case, un bump par vague. **Toucher `secoursMode.js` = migrer ses `alert()`/`confirm()` au passage** (cf. 📋 Popups
natives).

- 🟡 **Sortie d'urgence 🚨 classique : sortie coupée par une zone inaccessible** (vu le 06/10/2026 en livrant les options
  brancard) : le moteur cale la sortie sur la galerie restante la plus proche, le chemin s'arrête court. L'écart compte
  désormais dans la distance, mais sans alerte : une sortie à 75 m d'écart peut encore passer devant. En brancard, l'écart
  > 10 m est signalé. À trancher : même alerte en mode classique (un POI de sortie peut aussi être loin d'une galerie
  sur un plan peu tracé). ✅ vérifié (bac `check-guidage` §12). **S**
- **Si un exercice le demande** : préparer le parcours de la phase 2 pendant la phase 1 (option 6:b écartée pour l'instant) **L**.
- **Lot C (plus tard)** : C1 découpage auto en secteurs + parcours de balayage (après B3) **L** · C2 gabarit brancard
  (modèle des tracés + Générateur) **L** · C3 rôle par personne en **liste fermée**, jamais créable — seulement si des
  exercices le réclament **M**.
- 🔬 **Deux interventions simultanées sur un même plan** (noté en cadrant l'ouverture depuis l'accueil, 03/10) : non vérifié.

⚠️ **Côté DATA (KARMA seul)** : taguer les vrais accès du plan et leur état (un seul accès ouvert tagué, aucun
`entree_plan`) ; donner un niveau aux POI d'accès et aux 47 tracés qui n'en ont pas ; ajouter un 3ᵉ point de calage
GPS (l'erreur d'un calage à 2 points n'est pas mesurable). Le moins cher des correctifs, et le seul qu'aucun code ne
remplace.

## 🎨 Thème et langues — reliquats des audits du 29/09/2026

- **À trancher (KARMA)** — gris charte `#8892a4` des libellés des cartes Secours en **sombre** : contraste 3,8–4,1
  (< 4,5). Garder, ou passer ces libellés en `#a8b3c8`. Couleur de la charte → pas de changement sans accord.
- **FR en dur hors des modules audités** — tri complet de `js/` fait le 09/10/2026 (détecteur de l'historique Git +
  passe sur les gabarits multi-lignes, qu'il ne voyait pas) : le reste visible est migré (calibrage d'échelle, logs de
  débogage, messages de chargement, import des favoris). Reste, assumé : la page d'admin `confadmin.html` (100 % FR,
  ne charge pas les dicos), les motifs de config invalide de `ktaExtensions.js` (lus par l'admin d'instance), les
  `Error` techniques et les fallbacks FR derrière une clé. **Au fil de l'eau** pour ce qui serait encore passé.
- 🟡 Étiquette de la carte OSM du briefing Secours toujours sombre (`secoursMode.js`, inline) — lisible dans les deux
  thèmes, cosmétique.

## 📋 Popups natives et presse-papier — au fil de l'eau (recompté le 29/09/2026)

Politique arrêtée : **pas de sweep massif**, on migre quand on touche le module. Nouveaux usages : les helpers
obligatoires.

- **`alert()` / `confirm()` natifs** : ~175 `alert()` et ~37 `confirm()` dans `js/` (grep brut, commentaires
  compris), hors charte et hors du réglage de notifications. `window.ktaConfirm` (utils.js, Promise + charte) est
  déjà utilisé par 13 fichiers. `secoursMode.js` reste le premier contributeur : le plus d'effet, le plus de risque.
  ⚠️ `ktaConfirm` est **asynchrone** : le code qui suit un `if (!confirm(...)) return;` doit passer en `.then()`.
- **Copies locales du presse-papier** : `window.ktaCopierTexte(txt)` (utils.js, v1.97.10) existe ; une dizaine de
  fichiers gardent leur propre `navigator.clipboard` (`debug`, `homeConfig`, `interfaceDocs`, `lostMode`,
  `memInspector`, `osmCoords`, `refonteInterface`, `secoursMode`, `sessionReport`, `statsGlobales`). Chaque site a
  son propre retour visuel (toast, texte in situ, `alert`) : **un par un**, en vérifiant le retour. ⚠️ `memInspector`
  et `debug` servent au diagnostic : les casser rendrait un rapport de crash incopiable.

## 🎨 Harmoniser les icônes par défaut — gardé de côté, non prioritaire

Demande KARMA du 26/09 : unifier les icônes par défaut (« avoir des trucs vecto telles que portail, ou entrée
plan »). Mis de côté le 29/09, sans arbitrage. Si on le rouvre, trois faits mesurés à ne pas repayer :

- **Le 🌀 vs `portail.png`** : le même objet a deux visages — PNG sur la carte, la légende, les filtres, la Vue OSM
  et les exports ; emoji 🌀 dans les liaisons, la popup de création, « Mes liaisons », l'itinéraire inter-plan et le
  filtre OSM du HOME.
- 🔴 **Verrou avant toute vectorisation** : `kmzExport.js` écrit le blob dans `files/icons/<tag>.png` **sans
  regarder son type** → un SVG part sous un nom `.png` et Google Earth ne l'affiche pas, sans message. Rasteriser
  d'abord (~15 lignes).
- 🔴 **Piège de migration** : `utils.js` fait gagner `PLAN_CONFIG.icons[tag]` **avant** le catalogue. Les plans
  déployés déclarent `icon/pa.png` → un catalogue passé en `.svg` n'apparaîtrait sur **aucun** plan existant.

⚠️ **Côté DATA (KARMA seul)** : les `plan-config.json` générés avant v1.97.9 gardent une valeur fautive pour
`entree_plan` et n'ont pas `iconsEmbarquees`. L'app les rattrape à l'ouverture, mais les 21 sondes 404 restent :
**régénérer chaque plan** est le seul nettoyage.

## 🔒 Affichage de données d'autres comptes — XSS et CSP (04/10/2026)

Contexte : sur une **installation reliée** (synchro), l'app affiche des noms et des notes écrits par d'autres comptes ;
avant, toute donnée affichée venait de l'utilisateur lui-même. La CSP servie accepte `script-src 'unsafe-inline'`.
Analyse complète côté installation : dépôt pro, `docs/SECURITE.md`. myktamap.fr n'est pas concerné tant qu'il n'a pas de
synchro (un plan ZIP importé reste une donnée choisie par l'utilisateur, mais le même audit le couvre).

- ⚪ **Un seul `window.ktaEsc`** au lieu des copies locales d'échappement (cosmétique, au fil de l'eau). Le XSS est
  corrigé et gardé par `scripts/check-xss.js` (06/10/2026).
- 🟠 **`script-src` sans `'unsafe-inline'` — reste la BASCULE** : l'app n'a plus de script inline (07/10/2026, gardé par
  `check-csp-inline`), la politique stricte est servie en Report-Only et EN VIGUEUR dans le smoke. Reste, avec une
  release : changer la directive dans `docker/nginx-docker.conf`, les modèles `docs/nginx-*.conf` et **la config nginx
  de dev/prod sur le VPS (KARMA)**, retirer la ligne Report-Only. `security-legal.md` §40.7.1. **S.**

## 🔒 Réseau et 🧰 Configuration — reliquats (03/10/2026)

- 🔬 Pastille hors-ligne : coût de `SwInspector.etat()` sur un vieux téléphone non mesuré (3-7 ms sur PC) ; états orange
  (hors réseau) et thème clair non testés en navigateur ; la progression avance par paquets de 10.
- ⚪ Un vieil export de profil réécrit la clé `myktamap_network_paranoia_v1` (inerte) ; purge possible en 1 ligne si gênant.

## 📚 Guide utilisateur — reliquats de l'audit du 03/10/2026

Rapport : [`docs/audits/2026-10-03_audit-guide-utilisateur-v1.md`](audits/2026-10-03_audit-guide-utilisateur-v1.md) (lots L0-L5 appliqués).

- 🟠 **Commande vocale : français seulement** — `voiceCommand.js` force `fr-FR` et ses motifs sont en français ; les guides EN/ES le disent désormais. À trancher : la traduire ou l'annoncer comme telle dans l'interface. ✅ vérifié (code lu).
- 🟠 **🚨 sert à trois outils** (Sortie d'urgence, Mode urgence — Affichage XL, Mode Secours) et deux libellés disent « Mode urgence » : premier facteur de confusion sous stress, la doc seule ne le lève pas (décision d'UI).
- 🟡 **Nom de département dans le code et les docs internes** : l'aide et les docs utilisateur sont neutralisées (audit de l'aide, 03/10/2026), mais le nom du département des relevés réels reste dans des commentaires `js/`, des contrôles `scripts/`, le journal `README.md`, `docs/architecture/` et le placeholder de `confadmin.html`. À trancher : neutraliser partout (mécanique, mais les contrôles et le journal sont concernés) ou l'accepter hors documentation utilisateur.
- ⚪ **Mot de passe d'installation oublié** : seul l'effacement des données du site lève le verrou (le démarrage attend le mot de passe, `main.js`). Ne concerne plus que les installations qui publient un mot de passe (le code communautaire en dur est supprimé depuis le 04/10/2026). Pas de voie de secours dans l'app — décision de produit, à confirmer.
- ⚪ Non vérifiés, repris tels quels : chiffres de stockage par appareil (~50 Mo Safari, ~1 Go installée), chemin d'installation Chrome Android.

## 📝 Stratégie doc — à trancher par KARMA

Une source / trois rendus (guide utilisateur, Aide intégrée, contexte IA) + garde-fou pré-commit sur les libellés
cités (§6.7 de `docs/audits/2026-09-13_audit-ergonomie-v1.md` (archivé : tag Git `archive-docs-2026-09-30`)). Depuis, `check-doc-langues.js` (v1.98.0) aligne
déjà les trois langues du guide ; il ne relie pas le guide à l'Aide intégrée.

## 💡 Pistes de features

| Piste | Valeur | État |
|---|---|---|
| **Import VisualTopo (`.tro`)** | la cible **spéléo** de `CLAUDE.md` n'a aucun format topo lisible | gardé — à lancer |
| **Puits inter-étage** (KARMA, 30/09) | un puits qui relie deux niveaux n'existe que comme **tracé** « jonction » 🪜 (`{type:"jonction", fromLevel, toLevel}`, `multilevel-pathfinding.md` §26.5) — invisible en tant que point. POI spéciale, **icône dédiée**, visible sur ses **deux** niveaux, qui porte (ou crée) la jonction pour l'itinéraire — même logique qu'un **portail** (lié à deux plans). Ajout du tag : skill `.claude/skills/add-icon-tag` | gardé — à cadrer |
| **ConfAdmin : adresse de contact de l'installation** (KARMA, 04/10) | `contact@myktamap.fr` est écrit en dur dans l'app (`index.html` ×2, `lang/{fr,en,es}.json` ×3 chacun) et dans le guide ×3. Une installation indépendante doit pouvoir afficher **son** adresse : champ dans ConfAdmin → `index.json > config`, lu au rendu, repli sur `contact@myktamap.fr`. À trancher : quelles mentions suivent (contact de l'installation) et lesquelles restent (crédit de l'auteur, licence, `NETWORK_AUDIT` qui décrit myktamap.fr) | à cadrer |
| **Export de profil en flux** | `showSaveFilePicker` + `generateInternalStream` (Chrome/Edge desktop) pour réduire le pic RAM de `generateAsync` sur les très gros exports | gardé — si un cas réel le demande |

**VisualTopo** — l'app ne lit **aucun** format de topographie (ni VisualTopo, ni Therion, ni Compass, ni Survex ;
`FORMATS_ACCEPTES = ".geojson,.json,.kml,.kmz"`). Le socle existe : `sigImport.js` (parsers, écran de
correspondance) et `GpxImport.genererCanvasVierge` (plan sans image de fond). Un `.tro` est du texte tabulé
(départ, arrivée, longueur, azimut, pente) : trigonométrie simple → points + polylignes. ⚠️ **À confirmer avant
de coder** : que VisualTopo soit bien le format le plus répandu chez les cataphiles et spéléos français —
*[Supposition]* de Claude.

## 🧹 Code mort — ce qui reste (audits du 09/08 et du 05/10/2026, archivés)

> Ce qui est ouvert (🟡), ce qui ne doit jamais être supprimé (📌) et les deux leçons qui protègent le prochain
> nettoyage. ⚠️ Les numéros de ligne ont dérivé : les re-vérifier avant d'agir.

**⚠️ Correctif d'inventaire** : sur 76 paires de sélecteurs CSS dupliqués signalées le 09/08, **8 seulement sont
intégralement mortes** — le reste est du *layering volontaire* (override **partiel**). Toute suppression de
jumelle se vérifie **propriété par propriété**, et tout retrait se fait **sélecteur par sélecteur**, jamais par
plage de lignes (`.kta-perf-titre` et `.kta-loader-perf-hint`, vivants, étaient entrelacés dans des blocs morts).

**🩸 Leçon du faux fix (révoqué en v1.77.0)** : `_revokeTilesBlobUrls()` d'`osmHomePreview` était « jamais appelé
malgré son commentaire », donc branché — à tort : il révoquait les URLs du plan A **encore affiché** au chargement
d'un plan B. **« Jamais appelé » ≠ « à appeler ». Vérifier le DESIGN avant de brancher un cleanup.**

### 🟡 À vérifier avant de toucher
- Fragments de sélecteurs morts dans des groupes vivants (supprimer la ligne du sélecteur, pas le bloc) : `.kta-btn-action`, `.plan-card` ×4, `.kta-modal-btn-*`, `.kta-mesure-distance`, `.drag-over`, `.kta-rd-total-pill`, `style-secours.css` — contrôle runtime (`querySelectorAll(...).length === 0`)
- `kta-toast-error/info` : classes **concaténées** (`"kta-toast-" + type`) — NON supprimables sans inventaire des `type`
- `planBlob` (`createConf.js`) : écrit, jamais lu — vérifier qu'aucune révocation d'URL n'a été oubliée avant de le retirer
- JS : événement `kta:imgLayerCalibChange` (0 listener — extension volontaire ?), ~13 exports d'API publique jamais consommés (API = contrat, gain faible risque non nul)

### 📌 Mort documenté — gardé exprès, ne pas supprimer sans arbitrage KARMA
`_renderMultiLevelSection`/`_bindMultiLevelToggle` (interfaceConfig, rétro-compat v1.7.3) · `_proHashShort`/`_proSourceLabel` · dispatch `mktm:secours-scenario-mutated` (point d'extension pro) · `__ktaStyleCanon` (diagnostic) · `PERF_MODE_SIZE_BYTES` (alias rétro-compat) · `__MKTM_PRO_LICENSE__` (contrat d'en-tête) · branche mono-alerte d'alertChecker (**garde-fou réseau légitime** : une instance auto-hébergée peut servir l'ancien format) · `ktaCouperModesOutils` (console/debug)

---

## 🔍 Qualité de code (SonarQube) — ce qui reste (09/10/2026)

> Sonar tourne en local (Docker) et juge le **nouveau code** à la porte de release (marche 1ter,
> `scripts/release/sonar-scan.ps1`). Ce qui suit est ouvert ; le reste est dans `docs/RELEASE_GATE.md`.

- 🟠 **Sonar en CI par un runner auto-hébergé — à trancher par KARMA.** Un runner GitHub hébergé ne joint pas le
  serveur local ; un runner installé sur le poste de KARMA, oui. Coût : il exécute le code de **chaque push** avec
  les droits du compte Windows (compte de service limité recommandé), un poste éteint laisse le job en attente,
  et c'est un service de plus à tenir à jour. Si oui : job `sonar` **séparé et non bloquant** dans `ci.yml`
  (`runs-on: self-hosted`), secret `SONAR_TOKEN` côté GitHub — repris par la session CI. Si non : la marche 1ter
  suffit (une analyse par release).
- ⚪ **Faux positifs « Bug » à marquer « Accepté » dans Sonar (KARMA, interface web)** — corrigés le 09/10 :
  les 14 autres. Restent, voulus : `mdParser.js:107` ×2 (caractères de contrôle = balises internes des blocs de
  code), `css/style.css` ×2 (`height: 44px` = repli avant `calc(… env(safe-area-inset-top))`), `index.html`
  barre de profil (clavier géré en JS, `homeProfile.js` — la CSP interdit l'attribut inline que Sonar réclame).
  Liste : `http://localhost:9000/project/issues?id=MyKTAMap&types=BUG`.
- ⚪ **Jetons Sonar** : expiration vers le **06/01/2027** (90 jours) — au-delà, `sonar-scan.ps1` sort en code 1
  et `merge-main.ps1` demande `DEROGE`. Régénérer un *Project Analysis Token* et le ranger dans `SONAR_TOKEN`.

## 🚦 CI/CD — ce qui reste (audit du 08/10/2026, soldé et archivé sous `archive-docs-2026-10-09`)

> Socle en place : garde-fous rejoués sur GitHub à chaque push (`ci.yml`), merge refusé sans CI verte
> (`merge-main.ps1`), image Docker conditionnée à la CI, Dependabot, `lib/VERSIONS.md`. Détail :
> `docs/architecture/infra-versioning.md` §29bis. Pistes non prioritaires :

- ⚪ **Smoke Playwright en CI**, lancé à la main (`workflow_dispatch`) : la marche 2 de la porte reste manuelle.
- ⚪ **Tableau de bord des garde-fous** : nombre, durée du pre-commit, tendance d'une version à l'autre.
- ⚪ **Scripts de déploiement versionnés** dans un dépôt privé dédié (aujourd'hui un seul poste les détient) —
  à trancher par KARMA.
- ⚪ **Protection de branche réelle** (GitHub Pro, ~4 $/mois) si d'autres comptes obtiennent un accès en écriture :
  le contrôle de `merge-main.ps1` ne protège que ce qui passe par le script.

## 🔴 Dettes ouvertes

> Rangées par **qui doit agir**. Une dette « bloquée sur KARMA » n'attend pas du code — elle attend une mesure sur
> sa machine, parce que le harnais ne sait pas la reproduire. Les entrées « aucune action » ne sont **pas** des
> dettes : ce sont des décisions déjà prises, gardées ici pour qu'on ne les re-signale pas comme des trous.

| # | Sujet | État | Qui débloque |
|---|---|---|---|
| **D-light-icons** | Thème clair PC : émojis hors cadre à zoom 100 % | 🔬 non reproduit au harnais | **KARMA** — capture DevTools |
| **D3** | Toggle « Mes annotations » ne masque pas les roads | 🔬 mécanisme corroboré, non reproduit | **KARMA** — un `hasLayer()` sur un plan réel |
| **D-guidage-instable** | `check-guidage.js` a sorti « ⚠️ 1 echec(s) » une fois au pre-commit (09/10, juste après les tests d'itinéraire Secours brancard / accès barrés), puis vert sur 2 relances sans changement | 🔬 non reproduit — possible concurrence avec une autre session | personne — s'il revient, garder la sortie complète du hook |
| **D-confirm** | `confirm()` natifs hors charte | 📋 au fil de l'eau — cf. **📋 Popups natives** | personne |
| **D0** | Magnétisme : rayon non plafonné en unités plan | ⚪ décision prise (v1.74.0) + désaccord consigné | aucune action |
| **D7** | Duplication ~2 fonctions (pickers géoréf ↔ tracker) | ⚪ seuil explicite non atteint | aucune action |

### 🟠 Bloquées sur KARMA — une mesure à faire, pas de code

*Les deux sont **non reproductibles au harnais Playwright**. Les rouvrir sans mesure fraîche, c'est répéter le faux
fix de la v1.77.0.*

#### D-light-icons — 🎨 Thème clair PC : les émojis sortent du cadre à zoom 100 %, OK à 90 % — noté 09/08/2026

🔬 **hypothèse** — chez KARMA (Chrome FullHD, thème clair, wallpaper actif), les émojis en tête des boutons/titres de la colonne Actions (📦 Ajouter un plan, 🧰 Outils, 📔 Mon carnet, 🌀 Mes liaisons…) s'affichent **détachés du texte, à cheval sur le bord gauche** de leur conteneur. Disparaît à **zoom 90 %**. **NON REPRODUIT au harnais** malgré : clair + wallpaper simulé + 1920×937 + 1536×750 @ deviceScaleFactor 1.25. CSS servi sur dev **bit-à-bit identique** au repo. Pistes : extension navigateur injectant du CSS sur les sites clairs (test navigation privée pas fait), rendu Segoe UI Emoji à échelle fractionnaire (scaling Windows 125 %), largeur réelle de la colonne au moment du bug. Cosmétique, contournement connu (zoom 90 %) — à reprendre avec une capture DevTools (Computed de `text-indent`/`display` sur un bouton touché).

#### D3 — 🗺️ Toggle « Mes annotations » ne masque pas les polylines roads

🔬 **hypothèse — mécanisme corroboré par le code le 31/08.** `road.js` fait `return window.layerEditor || window.map` : si `layerEditor` n'existe pas encore au moment de l'`addTo`, la road part sur la **map** — et le toggle, qui n'agit que sur `layerEditor`, **ne la reprendra jamais**. **Avant tout code** : sur un plan réel, un tracé récalcitrant → `window.layerEditor.hasLayer(<layer>)`. S'il renvoie `false`, le mécanisme est confirmé et le fix est court.

### ⚪ Aucune action — décisions arrêtées, gardées pour mémoire

*Chacune a déjà été re-signalée à tort au moins une fois. **Ne rien coder ici sans un fait nouveau.***

| # | Sujet | Pourquoi on ne fait rien |
|---|---|---|
| D7 | Duplication ~2 fonctions pickers géoréf ↔ picker départ tracker (⚠️ doc seule, `tracking.md`) | Seuil explicite : mutualiser **si une 3ᵉ cible apparaît** |

#### D0 — 🧲 Magnétisme C5 : rayon non plafonné en unités plan ✅ vérifié 01/08

**Symptôme constaté par KARMA** : magnétisme actif + cercles d'intersection actifs → un cercle apparaît alors que les deux tracés ne se touchent pas. **Deux causes** : (1) les cercles ne signalent pas un contact — la règle 2 de `_calculerIntersectionsRoads` pose un cercle sur une *extrémité* à moins de 8 px plan d'un segment voisin (intentionnel, rattrape les T-jonctions) ; (2) le rayon d'accrochage est en **pixels écran** (14) : à z = −3, 14 px écran = **112 unités plan**.

**Décision KARMA (01/08)** : pas de plafond ; `showRoadIntersections` à `false` par défaut (fait en v1.74.0).

> ⚠️ **Désaccord consigné (Claude)** : masquer les cercles supprime le *signal*, pas la *cause*. Dézoomé, le point reste déplacé jusqu'à ~100 unités plan de l'endroit cliqué, et ça se répercute sur le graphe d'itinéraire. Correctif : `Math.min(tolÉcran, ~15 unités plan)` d'une ligne dans `road.js > _snapSurSommetProche`. **À reconsidérer si un tracé fait au magnétisme dézoomé se révèle déformé.**

## 🚫 Enterré volontairement — ne pas repayer

| Sujet | Statut |
|---|---|
| **Podomètre / mode poche** | Enterré le 29/09 : **infaisable en l'état**. Le podomètre du téléphone est inaccessible depuis une page web (aucune plateforme), Web Bluetooth n'existe pas sur iOS, et le vrai obstacle en poche est le **cap**, pas le comptage. Étude : `docs/ETUDE_PODOMETRE.md` (archivé : tag Git `archive-docs-2026-09-30`) |
| **Plein écran iPhone** | 2 tentatives (v1.9.2, v1.71.0), 2 rollbacks. Un commentaire d'`index.html` **interdit une 3ᵉ tentative** sans diagnostic précis sur appareil |
| **QR Share Secours (Phase 4)** | Densité QR v35+ illisible par les scanners. Remplacé par l'import consolidé v1.26 (réellement fonctionnel entre deux appareils depuis le correctif A1 du 29/09) |
| **Traversée de portail en Vue OSM** | Arbitré 01/08 : le mode OSM n'a ni position courante ni plan « où tu es » |
| **Mode terrain (L1) et point rapide (L2)** | Écartés le 14/09 : l'écran et la pose de point conviennent |
| **Import Shapefile** | Enterré le 29/09 : QGIS exporte en GeoJSON, que l'app lit |
| **Journal des notifications (cloche)** | Enterré le 29/09 |
| **Dossier « 🌐 Serveur » automatique** (Mes plans) | Enterré le 29/09 |
| **Atlas : tri de `--lister`, seuil de pertinence, mesure Vue OSM à 20 plans** | Enterré le 29/09. l'outil `decouper-atlas.js` a servi puis été retiré (07/10/2026, historique Git) ; les mesures de la campagne Gironde sont dans l'historique Git de ce fichier |
| **Test de l'import SIG sur de vrais exports QGIS** | Enterré le 29/09 (le harnais couvre parsers, CRS, Lambert 93) |
| **Transparence des plans issus d'un scan** | Enterré le 29/09 : un JPEG n'a pas d'alpha ; l'opacité compense, c'est accepté |
| **Plan orienté : indicateur de Nord, contre-rotation des tooltips, inertie du pan** | « Bien comme ça pour le moment » (KARMA, 29/09) |
| **Guidage : voix / vibration, validation terrain chiffrée des seuils** | Enterré le 29/09 |
| **Briefing pompiers : pas de capture OSM sans accord OSM** | Laissé en l'état le 30/09 (accord OSM activé par défaut, rarement coupé). Sans accord, la capture charge quand même les tuiles `tile.openstreetmap.org` |
| **Créer un tag depuis l'éditeur de point « comme ➕ Nouveau type… »** | Laissé le 09/10/2026 (KARMA) : on crée déjà un tag depuis l'éditeur de point (« ➕ Créer un nouveau tag… »), ça suffit — l'alignement sur la boîte « ➕ Nouveau type… » (libellé, icône, entrée de légende) n'est pas repris |
