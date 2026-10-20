# Audit d'interface « Impeccable » — PC et téléphone, sombre et clair (v1, 20/10/2026)

> Phase 1 seulement : constats et propositions. **Aucun fichier de l'app n'est modifié** (`js/`, `css/`,
> `index.html`, `sw.js`, `lang/`).
>
> **Grille** : la skill communautaire « Impeccable » de Paul Bakaus (Apache 2.0), version 4.7.0. Elle a été lue
> hors dépôt comme des données, jamais installée. Sont utilisés : `SKILL.md`, ses commandes `audit` et
> `critique`, et ses références `craft-floor`, `operate`, `typeset`, `colorize`, `layout`, `animate`, plus le
> catalogue des règles de son détecteur. Le mode Impeccable retenu est **Operate** (outil de terrain) pour la
> carte, les panneaux et les réglages, **Read** pour la Documentation et l'Aide.
>
> **Mode dégradé** : la commande `critique` veut deux évaluations isolées et son détecteur automatique. Ce
> détecteur est un binaire téléchargé ; il n'a **pas été lancé** (code externe non vérifié). Ses règles ont été
> appliquées à la main, à partir de leur description. Une seule personne a mené l'évaluation (pas de
> double regard).
>
> **Matière** : version auditée v2.18.0, `Karma_dev` à `7de78cf9`, servie en local avec la CSP de production.
> Captures Playwright faites avec Edge en mode headless, en 1280×800 et 390×844 (tactile émulé), thèmes sombre et
> clair. Sur chaque écran, mesure dans le DOM de chaque texte visible : sa couleur, son fond effectif (couches
> semi-transparentes composées) et son ratio WCAG. 1 486 textes mesurés, 98 écartés car posés sur une image ou
> un dégradé. Le relevé fictif n'est pas dans l'index local : les écrans « carte » ont été pris sur le premier
> plan proposé. Captures et mesures restent hors dépôt, et ce rapport ne cite rien de ce plan.

## Résumé

- **Le thème clair est la source de presque tous les échecs de contraste**, et la cause est systémique. Le
  thème sombre n'a pas de jetons. Le thème clair est posé par-dessus avec **1 419 sélecteurs**
  `.kta-theme-light`, dont 38 qui ciblent le texte des attributs `style=` (`[style*="color:#8892a4"]`). Il faut
  y ajouter 1 256 attributs `style="…"` écrits par le JS, 2 056 `!important` et 403 couleurs hexadécimales
  distinctes. Chaque nouvel écran oublie une couleur. Mesuré : « ← Retour » de la sous-fiche d'Aide et bouton
  du sommaire de la Documentation à **1,15–1,16:1**, compteurs de la barre de la carte à **2,21:1**.
- **La charte sombre tient** : texte principal 13,65:1, secondaire 10,59:1, accent 10,09:1, interaction 7,88:1
  sur `#1a1f2e`. Les échecs en sombre viennent de **gris hors charte** (`#6c7689`, `#6a7488`, `#5a6478`,
  `#4a5468`, `#3a4256`, entre 1,64:1 et 3,59:1), souvent sur des textes de 10,5 à 11 px.
- **Les toasts n'ont pas de type « succès »**, et chaque toast **efface le précédent**. Une confirmation qui doit
  rester visible part en `warn`, donc avec ⚠️ et un liseré doré. Une erreur suivie d'un autre toast disparaît
  aussitôt. Mesuré : trois toasts émis à la suite, seul le dernier est resté.
- **Le corps du texte est petit, et son échelle typographique compte 30 tailles.** 14 % des textes rendus font
  moins de 12 px, 66 font 10,5 px ou moins. La Documentation pose 105 à 145 caractères par ligne à 1280 px, et
  jusqu'à 218 à 1920 px (Impeccable : 65–75).
- **Le splash coûte 3,9 à 5,9 s avant son fondu**, parce que la durée minimale de 3,5 s ne démarre qu'après
  l'exécution des 133 scripts. Le splash clair existe alors que la doc le dit « resté sombre », et ses textes de
  coin échouent (1,66 à 2,87:1).
- **Score Impeccable (commande `audit`) : 10/20, « Acceptable »** (le barème le décrit comme « travail
  significatif »). Thème 1/4, Accessibilité 2/4, Perf 2/4, Intégrité 2/4, Responsive 3/4.

## Score Impeccable

| # | Dimension | Score | Constat principal |
|---|---|---|---|
| 1 | Accessibilité | 2 | Sombre conforme AA pour la charte. Clair : 14 couples en échec, jusqu'à 1,15:1. Cibles de 19×19 px (croix des toasts) |
| 2 | Performance | 2 | `css/style.css` de 634 Ko bloque le rendu. 133 scripts (5,7 Mo) avant le chrono du splash |
| 3 | Thème | 1 | Jetons pour le clair seulement. Le clair repose sur 1 419 surcharges et 38 sélecteurs sur `style=` |
| 4 | Responsive | 3 | Tout tient en 390 px. Rails à 36 px, compteurs de la barre à 36×24 |
| 5 | Intégrité | 2 | Identité forte (rose des vents, doré, sombre). Mais le bouton primaire change de couleur selon le thème, et l'échelle compte 30 tailles |
| | **Total** | **10/20** | **Acceptable** |

Positif [Certain] : le focus clavier est visible sur 52 des 55 arrêts testés (Tab ×25 sur le HOME, ×30 sur la
carte). Aucune erreur de page sur les 4 parcours. Les panneaux d'outils sont lisibles et bien rangés sur
téléphone. Le thème sombre est un choix juste pour la scène d'usage (sous terre, à la frontale) : c'est la règle
même d'Impeccable (« choisir clair ou sombre selon la scène, pas selon la catégorie »).

---

## Élevé

**E1 — Thème clair : des couleurs du sombre restent dans les écrans** · [Certain] (mesuré)
- Écran : Aide → une fiche (PC et téléphone). Le bouton « ← Retour » (`#kta-aide-back`) est en `#c8d0e0` sur
  `#e7dec8`, soit **1,16:1**. Documentation : le bouton du sommaire (`#kta-readme-toc-toggle`) mesure **1,15:1**
  au repos et **1,16:1** actif (doré `#f4c542` sur `#e7d9b5`). Filtres : le statut `#kta-fp-status` est en
  `#8892a4` sur `#e5dcc5`, soit **2,30:1**.
- Règle Impeccable : contraste du texte ≥ 4,5:1 (`craft-floor` › Verify) ; dans `colorize`, le thème sombre se
  conçoit et ne s'inverse pas mécaniquement.
- Cause : ces boutons reçoivent leur couleur sombre en dur, et aucune surcharge claire ne les a rattrapés. C'est
  le mécanisme décrit en E5.
- Proposition : à court terme, ajouter les trois surcharges manquantes. Le vrai correctif est E5.

**E2 — Thème clair : les barres du haut et du bas de la carte sont peu lisibles** · [Certain] (mesuré)
- Écran : carte, barre d'en-tête et barre d'état, en clair, PC et téléphone. Mesures : icônes des compteurs
  `#989181` sur `#e1d8c1` à **2,21:1**, icônes de statistiques `#7c7669` à **3,18:1**. Le texte secondaire
  `#6b6354` sur le fond de barre `#c9b88f` ne fait que **3,03:1** (calculé).
- Règle Impeccable : contraste ≥ 4,5:1 ; une icône qui porte une information ≥ 3:1 (`colorize` › Contrast).
- Proposition : sur les barres, passer le texte secondaire en `#4a4438` (4,94:1 sur `#c9b88f`) et les icônes en
  `#6b5a3a` (4,70:1 sur `#e1d8c1`). Voir la section Charte.

**E3 — Les toasts mentent sur leur type et s'écrasent entre eux** · [Certain] (code lu + mesuré)
- `js/oomGuard.js > _renderToast` supprime le toast affiché avant de poser le suivant. L'icône ne connaît que
  `error` / `info` / « le reste = ⚠️ ». Il n'existe aucun type succès. Les confirmations qui doivent survivre au
  mode silencieux passent donc en `warn` : `tableEditor.js` (« msgOk »), `interfaceImportExport.js` (fin
  d'import), `sessionPersist.js` (filtres restaurés). Elles s'affichent avec ⚠️ et un liseré doré.
  Mesuré : trois toasts émis à la suite (avertissement, erreur, succès), seul le dernier est resté à l'écran,
  avec ⚠️.
- Règles : Nielsen n°1 (visibilité de l'état) et n°9 (récupération d'erreur) de la commande `critique` ;
  `operate` › Color (« vocabulaire d'états standardisé : succès, avertissement, erreur, info »).
- Proposition : ajouter un type `ok` (icône ✓, liseré `#6ee287`, 10,08:1 en sombre). Un toast d'erreur ne doit
  pas être remplacé par un toast de rang inférieur : on le met en file, ou on empile deux toasts au maximum.
  Garde-fou à prévoir : `check-notifs.js` existe déjà, il pourrait refuser un message de réussite émis en
  `warn`.

**E4 — Thème sombre : textes de pied de page et descriptions sous AA** · [Certain] (mesuré)
- HOME, crédits et contact du pied : `#6c7689` sur `#1a1f2e` à **3,59:1**, en 10,5–11 px. Version du pied
  (`#loaderCopyrightVersion`) : `#6a7488` sur `#1f2332` à **3,31:1**. Export, description du sens de conversion
  (`.kta-conv-sens-desc`) : `#6a7283` sur `#232836` à **3,05:1**, en 11 px. Popup d'un POI, bouton « copier les
  coordonnées » : `#7292d0` sur `#252e43` à **4,37:1**, en 13 px.
- Ces gris ne sont pas dans la charte. Dans le code : `#5a6478` ×13, `#6a7488` ×9, `#4a5468` ×6, `#3a4256` ×9
  (qui fait **1,64:1** sur la surface, s'il sert de texte).
- Règle : contraste ≥ 4,5:1, et « sur une surface colorée, teinter le texte secondaire depuis la teinte, jamais
  un gris lavé ».
- Proposition : ramener tous ces gris au gris secondaire de la charte (voir la section Charte).

**E5 — Le thème clair n'a pas de système, seulement des surcharges** · [Certain] (comptage)
- Les jetons `--kta-light-*` existent (`css/style.css`, bloc des variables du thème clair). Le sombre n'en a
  **aucun** : ses couleurs sont écrites en dur, dans le CSS et dans 1 256 attributs `style="…"` du JS. Le clair
  les rattrape une à une : 1 419 sélecteurs, dont 38 lisent le texte même de l'attribut `style`
  (`[style*="rgba(140,180,255"]`). Changer un espace dans une couleur inline suffit à casser la surcharge, sans
  aucune erreur.
- Règle Impeccable, `audit` › Theming : « couleurs codées en dur, mode sombre cassé, jetons incohérents ». Score
  1/4.
- Proposition, en lot séparé : jetons sémantiques communs aux deux thèmes (`--kta-surface`, `--kta-texte`,
  `--kta-texte-2`, `--kta-texte-3`, `--kta-accent`, `--kta-accent-texte`, `--kta-interaction`, états). Le clair
  redéfinit les jetons au lieu de surcharger les règles. On commence par les composants qui portent le plus de
  surcharges (modales, toasts, popups, barres). Un garde-fou du type `check-style-canon.js` empêcherait
  ensuite le retour d'une couleur en dur dans `style=`. Coût : lourd (plusieurs lots), mais c'est ce qui ferme
  E1 et E2 pour de bon.

## Moyen

**M1 — Échelle typographique à 30 tailles, corps trop petit** · [Certain] (comptage + DOM)
- Dans le code : 12 px ×366, 13 px ×317, 11 px ×198, 14 px ×127, 11,5 px ×107, 12,5 px ×80, 10 px ×43, 10,5 px
  ×23… soit 30 valeurs distinctes. Dans le rendu : sur 1 486 textes, 205 (14 %) font moins de 12 px, dont 66 à
  10,5 px ou moins (9 px ×4).
- Règles Impeccable : `tiny-text` (corps < 12 px), `undersized-ui-text` (texte interactif < 11 px), `typeset` (en
  mode Operate, une échelle fixe au rapport 1,125–1,2 ; ici 11 / 11,5 / 12 / 12,5 / 13 se suivent à moins de
  5 %, ce qui fait du bruit, pas une hiérarchie).
- Proposition : une échelle de 6 rôles, par exemple 11 (méta, jamais pour une action) / 12,5 (libellé) /
  14 (corps des panneaux) / 15 (corps de lecture : Documentation, Aide, CGU) / 18 (titre de fenêtre) / 24
  (titre d'écran). Les 30 valeurs s'y ramènent. Un plancher de 11 px pour tout texte cliquable.

**M2 — Lignes trop longues dans la Documentation** · [Certain] (mesuré)
- Paragraphes en 14 px dans une colonne de 908 px à 1280, de 1 503 px à 1920 : 105–145 puis 128–218 caractères
  par ligne.
- Règles Impeccable : `line-length` (> 80 caractères), `typeset` (45–75 en mode Read).
- Proposition : `max-width: 72ch` sur le corps de la Documentation et des fiches d'Aide (le sommaire garde sa
  colonne). Corps à 15 px, interligne 1,6 (déjà 1,7).

**M3 — Le bouton primaire change de couleur selon le thème** · [Certain] (CSS lu + captures)
- `.kta-btn-primary` est bleu `#1f6feb` en sombre et doré `--kta-light-accent` en clair. Sur les captures, les
  actions principales suivent ce schéma : « Charger ce plan », « Télécharger », « Nouveau scénario », « Activer
  le mode présentation ». Les titres de fenêtre sont bleu
  interaction `#8cb4ff`, les titres de section des Réglages et des Filtres sont dorés, l'onglet actif est doré.
  Un même rôle prend deux couleurs, et une même couleur sert deux rôles.
- Règles : `operate` › Color (« l'accent sert l'action principale, la sélection et l'état, pas la
  décoration ») ; Impeccable `audit` › Implementation integrity (dérive du système).
- Proposition, à trancher par KARMA : un rôle, une couleur, dans les deux thèmes. Par exemple action principale
  = doré (texte `#1a1f2e` sur `#f4c542`, 10,09:1, identique dans les deux thèmes), interaction / lien = bleu,
  titres en texte principal. Voir « Ce qu'on écarte » pour la variante qui garde le bleu.

**M4 — Cibles tactiles sur téléphone** · [Certain] (mesuré en 390×844)
- Sous 24 px (plancher WCAG 2.5.8) : croix des toasts 19×19, bouton « copier les coordonnées » de la popup
  22×17, flèche du sommaire de la Documentation 18×22, liens du sommaire 22 px de haut (×44), bouton « Lire le
  texte intégral » des CGU 17 px de haut.
- Sous 44 px (seuil d'Impeccable) : rails latéraux 36×36, boutons d'en-tête 44×34 et 49×32, compteurs 36×24,
  bascule de la barre d'état 40×36. Sur PC, les croix des fenêtres font 19×23, celle du Mode Secours 16×20.
- Règle : `audit` › Responsive, « touch targets < 44×44 » ; `layout` (« garder la cible utilisable même si la
  marque est petite »).
- Proposition : garder la densité visuelle mais agrandir la zone de toucher (pseudo-élément `::after`, `inset:
  -6px`) sous `@media (pointer: coarse)`. L'audit du 16/10 relevait déjà l'absence de toute règle
  `pointer: coarse`. Croix et boutons de copie à 32 px minimum.

**M5 — Splash : attente plus longue que nécessaire, et doc en retard sur le code** · [Certain] (mesuré)
- `js/main.js > _splashStart` lance le chrono de 3,5 s après l'exécution de tous les scripts, pas à la
  navigation. Mesuré en profil téléphone : fondu à 3,9–4,2 s en local, à 5,1–5,9 s avec le CPU ralenti 4×.
  Retrait complet à 4,4–6,6 s. Ce temps de chargement ne se cache donc pas sous l'animation : il s'y ajoute.
- `js/themeManager.js` (en-tête) et `docs/architecture/ui.md` (§53, « Volontairement non couverts ») disent
  tous deux que le splash « reste sombre ». Or `css/style.css` lui donne un fond beige en clair (bloc commenté
  « Splash de chargement d'un plan », qui vise en fait le splash de démarrage). Dans ce splash clair :
  version `#b8860b` à **1,66–2,02:1**, détail de licence `#8a8270` à **2,87:1**, crédit en coin `#c15f3f` à
  **2,35:1** (fonds estimés aux points du dégradé).
- `index.html` dit « 4 s minimum », la constante vaut 3 500 ms.
- Règle : `operate` › Motion (« pas de chorégraphie de chargement : le produit charge vers une tâche ») ;
  `animate` (« un long retour ressemble à de la latence »).
- Proposition : mesurer la durée minimale depuis `performance.now()` (le début de la navigation). Trancher
  sombre ou clair, puis aligner la doc ou le CSS. Voir la section Splash.

**M6 — Réglages : la hiérarchie met en avant une action rare** · [Probable] (captures)
- Le plus gros élément de la fenêtre est le bouton bleu plein « Activer le mode présentation », placé en tête de
  la colonne de gauche. Les titres de groupe sont de petites capitales de 12 px, dorées ou bleues : ils pèsent
  moins que les cases à cocher qu'ils annoncent.
- Règle : `layout` › squint test (« au flou, on doit encore voir le primaire, le secondaire et les groupes ») ;
  `typeset` › Hiérarchie.
- Proposition : le mode présentation devient une ligne comme les autres. Titres de groupe en 14 px, gras, texte
  principal, sans capitales. La pastille de portée (« tous les plans » / « ce plan ») garde son rôle : c'est la
  meilleure idée de l'écran.

**M7 — Thème clair : cartes imbriquées sur le HOME** · [Certain] (captures)
- En clair, « Mes plans », « Vue OSM », « Ajouter un plan » et « Outils » sont des cartes posées dans une
  colonne-carte (bordure et ombre deux fois). En sombre, la même structure s'affiche à plat. La structure change
  donc avec le thème.
- Règle Impeccable : `nested-cards` (« des cartes dans des cartes : toujours faux »).
- Proposition : en clair, une seule enveloppe, la colonne ou la carte, pas les deux, comme en sombre.

## Faible

**F1 — Lueurs colorées sans décalage** · [Certain] (comptage)
86 `text-shadow: 0 0 …` / `drop-shadow(0 0 …)` / `box-shadow: 0 0 …` dorés, bleus ou rouges. Au splash : titre,
version, signature, arc. Ailleurs : badges, titre de l'affichage XL. Règle `dark-glow`. Proposition : les garder
là où elles portent un état (POI sélectionné, urgence), et les retirer des textes statiques.

**F2 — Liserés latéraux épais** · [Certain] (comptage)
74 `border-left` de 2 à 9 px : toasts (3 px), encadrés des CGU, titres de la Documentation. Règle `side-tab`.
Proposition : sur les toasts, le liseré double l'icône, on peut le garder (voir « Ce qu'on écarte »). Sur les
encadrés des CGU et les titres de la Documentation, il est décoratif : un fond teinté suffit.

**F3 — Petite étiquette au-dessus du titre** · [Certain] (capture)
« BIENVENUE » en petites capitales au-dessus de « Mon profil » sur le HOME. C'est la seule règle qu'Impeccable
pose en interdiction absolue (`kicker-above-heading`). Proposition : la supprimer, ou l'intégrer au titre
(« Bienvenue, Touriste »).

**F4 — Mouvement réduit : coupure globale** · [Certain] (CSS lu)
`css/style.css` (bloc « Accessibilité : prefers-reduced-motion ») ramène toute animation à 0,01 ms. Au splash,
l'arc de chargement s'arrête : l'utilisateur n'a plus aucun signe que l'app travaille. Règle `audit` › Motion
sensitivity (« une coupure globale à 0,01 ms détruit un retour utile »). Proposition : en mouvement réduit,
remplacer la rotation de l'arc par une pulsation d'opacité lente. Le reste peut garder la coupure.

**F5 — Focus clavier invisible sur 3 arrêts du HOME** · [Certain] (mesuré)
Champ « Chercher un point dans tous mes plans », barre du profil, filtre « Filtrer par nom ». Ni contour ni
ombre au focus. Proposition : la règle `:focus-visible` existante, étendue aux champs `input` du HOME et aux
`div` focalisables.

**F6 — Aide sur téléphone : une fenêtre sur une fenêtre** · [Certain] (capture)
La fiche s'ouvre en sous-fenêtre au-dessus du hub : deux voiles, deux croix, et le « ← Retour » illisible en
clair (E1). Règle `operate` › Constraints (« la modale comme premier réflexe »). Proposition : sur téléphone, la
fiche remplace le contenu du hub, avec le Retour en tête.

**F7 — Boutons désactivés à peine visibles** · [Certain] (mesuré)
« J'accepte » des CGU, tant que la case n'est pas cochée : 2,37:1 en sombre, 2,16:1 en clair. WCAG exempte les
commandes inactives. Mais c'est la première décision de l'utilisateur, et le bouton se lit à peine comme un
bouton. Proposition : texte désactivé ≥ 3:1, ou une phrase « Cochez la case pour continuer ».

---

## Charte : changements proposés et gain mesuré

Rien n'est changé dans cette phase. Ratios WCAG 2.x calculés sur les couleurs exactes (`#rrggbb`).

**Ce qui ne bouge pas** (déjà conforme, aucun gain possible ou utile) : fonds `#1a1f2e` et `#0a0d18`, texte
`#e8eaf0` (13,65 / 16,11), `#c8d0e0` (10,59), accent `#f4c542` (10,09 sur la surface, texte `#1a1f2e` posé
dessus 10,09), interaction `#8cb4ff` (7,88 / 9,31), en thème sombre.

| Couleur | Rôle | Avant (pire fond courant) | Après | Gain |
|---|---|---|---|---|
| `#8892a4` → **`#98a1b3`** (sombre) | texte tertiaire / méta | 5,23 sur `#1a1f2e`, **4,12** sur `#2a3145`, 4,67 sur `#232838` | 6,32 / **4,98** / 5,64 | +21 % ; passe AA sur toutes les surfaces élevées |
| `#6c7689`, `#6a7488`, `#5a6478`, `#4a5468`, `#3a4256` → **le tertiaire ci-dessus** (sombre) | gris hors charte | **3,59 / 3,49 / 2,76 / 2,16 / 1,64** sur `#1a1f2e` | 6,32 | de +76 % à +285 % ; 5 couleurs en moins |
| `#8a8270` → **`#6e6656`** (clair, `--kta-light-text-dim`) | texte tertiaire | **3,13** sur `#f0e8d8`, **3,60** sur `#fdf8eb` | 4,66 / 5,36 | +49 % ; passe AA |
| `#6b6354` → **`#5f5848`** (clair, `--kta-light-text-muted`) | texte secondaire | **4,35** sur `#e5dcc5`, 4,87 sur `#f0e8d8`, **3,03** sur `#c9b88f` | 5,17 / 5,79 / 3,61 | +19 % ; passe AA hors barres |
| sur les barres claires (`#c9b88f`) : → **`#4a4438`** | texte secondaire des barres | **3,03** | 4,94 | +63 % |
| icônes des barres claires `#989181` / `#7c7669` → **`#6b5a3a`** | compteurs, statistiques | **2,21 / 3,18** sur `#e1d8c1` | 4,70 | +113 % / +48 % |
| `#b8860b` (et `#d9a82e`) en **texte** → **`#7a5a00`** (`--kta-light-accent-text`, existe déjà) | accent en texte clair | **3,07** sur `#fdf8eb`, **2,67** sur `#f0e8d8`, **1,66** au splash | 6,02 / 5,24 / 4,67 sur `#e5dcc5` | ×2 environ ; jeton déjà défini, juste sous-utilisé |
| contour de focus clair `#b8860b` → **`#7a5a00`** | focus (élément non textuel, seuil 3:1) | **2,38** sur `#e5dcc5`, 2,67 sur `#f0e8d8` | 4,67 / 5,24 | passe 3:1 partout |
| `#1f6feb` → **`#1a5fd6`** (si le bleu reste primaire, cf. M3) | fond du bouton primaire sombre | blanc dessus **4,63** | 5,75 | +24 % de marge (4,63 passe de justesse) |

**Interdits à écrire dans la charte** (ce sont des fuites, pas des couleurs à corriger) : `#f4c542` en texte sur
fond clair (1,53:1), `#8cb4ff` sur fond clair (1,96:1), `#c8d0e0` sur fond clair (1,15:1).

Gain d'ensemble [Probable] : on reprend les 66 échecs mesurés, couple par couple. Appliqués, ces remplacements
en ferment 43. Les 23 restants : 10 fuites du sombre vers le clair (E1, dont le gris `#6c7689` de la signature de
la Documentation en clair), 8 boutons désactivés (F7), 4 occurrences du bouton « copier les coordonnées » de la
popup (`#7292d0` / `#4e72b0`, à passer en `#8cb4ff` en sombre et en `#2563eb` en clair, 4,87:1) et 1 lien du
sommaire.

## Ce qu'Impeccable propose et qu'on écarte

| Règle Impeccable | Pourquoi on l'écarte ici |
|---|---|
| Police d'affichage auto-hébergée au lieu de la police système (`craft-floor` › Refuse) | Le mode Operate autorise la police système. Une police en plus pèse sur le premier chargement hors-ligne et sur le précache. On ne la retient que pour le seul titre du splash, en option (direction B) |
| Emoji au lieu d'un jeu d'icônes dessinées | Usage de fait dans toute l'app : boutons, aide, dicos `lang/`. Les remplacer, c'est refondre l'interface. Le défaut est réel : le rendu change d'un système à l'autre (Windows, Android, iOS). **À trancher par KARMA**, pas dans ce lot |
| Pas d'oscillation ni d'élasticité (`bounce-easing`) | `splashLogoIn` imite une boussole qui se calibre : le mouvement a un sens, ce que `animate` admet (« incarner le monde choisi »). La courbe signature `cubic-bezier(0.45, 0.05, 0.55, 0.95)` est protégée (`ui.md` §83.5) |
| La modale n'est pas le premier réflexe | Sur une carte plein écran, la modale est le choix assumé (échelle de z-index de la charte). On n'en retient que F6, sur téléphone |
| Cibles de 44 px partout | Sur la carte, les rails à 36 px protègent la surface utile. On agrandit la zone de toucher sans agrandir la marque (M4) |
| Corps à 16 px minimum | En Operate, Impeccable admet un corps plus dense. On fixe un plancher à 11 px et un corps à 14–15 px (M1) |
| Liseré latéral des toasts (`side-tab`) | Sur un toast, il code le type à la périphérie de l'œil, utile en sortie. On le garde, mais avec le bon type (E3) |
| Coupure globale du mouvement réduit | On la garde : c'est simple et conforme à WCAG 2.3.3. Seule exception proposée : l'arc du splash (F4) |

---

## Splash : état actuel et directions de refonte

**Ce qu'il est** [Certain] (`index.html` › `#splashOverlay`, `css/style.css` › bloc « Splash screen »,
`js/main.js` › `_splashStart` / `_splashEnd`)
- Structure : un voile fixe plein écran (z-index 9999), fond `radial-gradient` de `#0a0d18` à `#03050a`
  (« tunnel »). Au centre, `#splashBox`, large de 460 px au plus :
  - la rose des vents `icon/compass.svg` (3,3 Ko, 180 px ; 130 px sous 480 px de large, 90 px en paysage bas),
    entourée d'un arc SVG doré qui tourne ;
  - le titre « MyKTAMap » (36 px, gras, `letter-spacing` 0,08em, doré, lueur) ;
  - la devise en capitales (14 px, `#8892a4`, `letter-spacing` 0,18em).
- Coins : crédit « Conçu avec Claude » (glyphe ✦ couleur argile) en haut à gauche, numéro de version en
  `Courier New` doré en haut à droite. En bas : pilule de licence (variante community / pro par classe),
  crédits des librairies avec emoji en bas à gauche, signature `icon/karma.png` (1,8 Ko) en bas à droite.
- Animation : la rose entre en 3,5 s (`splashLogoIn` : tour complet en tournant de 0,55 à 1,05 d'échelle, puis
  oscillations amorties de 35°, 15°, 7°, 3° et 1° jusqu'au nord). L'arc tourne en boucle (1,5 s, linéaire). Le
  titre se révèle de gauche à droite par `clip-path` (départ à 0,45 s), la devise ensuite (départ à 0,9 s, sur
  1,3 s). Coins et licence
  apparaissent en fondu de 1,2 s à 2,2 s. La signature se dévoile lettre à lettre (5 paliers, de 0,8 à 2,2 s).
  Tous les textes finissent à 2,2 s, la rose à 3,5 s.
- Durée : 3,5 s au minimum, comptées après l'exécution des scripts, puis fondu de 0,4 s et retrait du DOM.
  Mesuré : premier affichage à 0,2–0,5 s ; fondu à 3,9–5,9 s selon la puissance (M5).
- Thème clair : fond beige `#f0e8d8` vers `#c9b88f`, titre `#8b5a00` (M5 pour les contrastes).

**Contraintes de toute refonte** : aucun script inline (CSP `script-src 'self'`). Aucune ressource tierce
(`font-src 'self'`, `img-src 'self' data: blob:`). Tout fichier ajouté entre dans `sw.js > ASSETS_TO_CACHE`. Les
textes de `#splashBox` finissent avant ~1,5 s de délai (`ui.md` §83.5). La courbe signature reste. Le splash
n'affiche jamais « -pro ». Le premier affichage reste sous les 634 Ko de `css/style.css` : tout CSS du splash
qui doit peindre tôt passe en tête de ce fichier, ou dans un petit fichier chargé avant lui.

**Correctifs communs aux trois directions** (de toute façon) :
- Chrono depuis la navigation. Le splash absorbe alors le chargement au lieu de s'y ajouter : de 0,4 à 2 s de
  gagnées selon l'appareil.
- Un seul thème, tranché, et la doc alignée.
- Crédits des librairies en texte, sans emoji (rendu qui varie selon le système).
- Le crédit en coin, la version et la signature à au moins 4,5:1 dans le thème retenu.

**Direction A — « La galerie qui se dessine »** (recommandée)
- Idée : trois à cinq tracés de galerie génériques, inventés et non issus d'un relevé, se dessinent du bord vers
  la rose (`stroke-dashoffset`), en doré à 25 % d'opacité, puis la rose « trouve son nord » comme aujourd'hui.
  Le trait est la signature du produit : c'est littéralement ce qu'on fait dans l'app.
- Moyens : un SVG local d'environ 2–4 Ko (dans `index.html` ou un fichier `icon/` précaché), animé en CSS
  seulement, durée 1,2 s, terminé avant les textes.
- Coût : `stroke-dashoffset` repeint les tracés à chaque image, mais 5 chemins fins restent négligeables, y
  compris sur un téléphone modeste [Probable, à mesurer au profil CPU ×4]. Aucun effet sur la CSP. Mouvement
  réduit : les tracés apparaissent dessinés d'un coup.
- Risque : un tracé ressemble à un plan réel. On le dessine abstrait (courbes douces), sans nom ni échelle.

**Direction B — « Courbes de niveau »**
- Idée : un fond très discret de courbes de niveau, en SVG statique à 6–8 % d'opacité, qui s'éclaire depuis le
  centre (un calque déjà masqué dont seule l'opacité s'anime). Le titre « MyKTAMap » passe dans une police
  d'affichage auto-hébergée (woff2 réduit aux 8 glyphes du mot, environ 4–8 Ko).
- Coût : un SVG d'environ 3–5 Ko et une police d'environ 6 Ko à précacher. L'animation reste sur le
  compositeur (opacité seule), donc la moins chère des trois. Une `mask-image` animée serait à proscrire : elle
  repeint tout l'écran à chaque image.
- Risque : la règle `codex-grid-background` (motif décoratif en fond). Elle admet les surfaces de carte et de
  mesure. Ici le motif appartient au monde du produit, mais il doit rester à peine visible.

**Direction C — « Faisceau de frontale »**
- Idée : l'arc de chargement devient un cône de lumière (`conic-gradient` doré à 10–12 %) qui balaie
  lentement, avec la rose au centre. C'est l'image du cataphile qui éclaire la galerie.
- Moyens : le dégradé est posé sur un élément qu'on fait tourner par `transform` (compositeur), jamais en animant
  le dégradé lui-même (qui repeindrait l'écran à chaque image).
- Coût : léger si l'on respecte la règle ci-dessus ; un calque plein écran en plus.
- Risque : c'est la plus proche des tics « halo / spotlight » qu'Impeccable signale (`radial-spotlight-glow`).
  À ne garder que si le faisceau lit comme une lumière (bord net, opacité faible), pas comme un nuage.

**Recommandation** : A, avec les correctifs communs. Elle ajoute une idée graphique forte et propre au produit,
pour le moindre coût, et ne demande ni police ni calque plein écran.

---

## Action KARMA

1. **Jeton Sonar.** L'API du SonarQube local répond, mais demande un jeton (HTTP 401 sur `api/issues/search` et
   `api/components/show`). Les problèmes de contraste et d'accessibilité vus par Sonar ne sont donc pas
   intégrés ici. Fournir un jeton de lecture à la session, ou exporter la liste des problèmes.
2. **Relevé fictif absent de l'index local.** Les écrans de la carte ont été pris sur le premier plan de
   l'index. Ces captures contiennent donc des données réelles. Elles sont restées hors dépôt, dans le dossier
   temporaire de la session : à supprimer après lecture.
3. **Trancher** : la couleur du bouton primaire (M3), le thème du splash (M5), la direction du splash (A, B ou
   C), les emoji ou des icônes dessinées (« Ce qu'on écarte »), et l'ouverture du lot E5 (jetons).

## Non vérifié

- La fiche d'un tracé (le clic simulé n'a rien ouvert), la barrière par mot de passe communautaire (seules les
  CGU sont apparues), le tutoriel, et le Mode Secours avec un scénario ouvert (seul l'état vide a été vu).
- Les vrais appareils : iOS / Safari, Android Chrome. Ici, seulement Edge headless avec tactile émulé ; pas de
  paysage.
- Le zoom texte à 200 %, la simulation des déficiences de la vision des couleurs, l'anglais et l'espagnol.
- Le détecteur automatique d'Impeccable (non lancé, cf. en-tête) et le SonarQube (jeton).
- Les ratios sur image ou dégradé (98 textes : étiquettes de carte, splash). Ceux du splash clair sont calculés
  sur des fonds estimés.
