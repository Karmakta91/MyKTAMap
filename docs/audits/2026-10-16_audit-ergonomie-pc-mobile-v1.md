# Audit ergonomique PC ↔ mobile — mode plan (v1, 16/10/2026)

> Lecture du code, plus des mesures Playwright sur le serveur local (390×844 et 360×640 en portrait, 844×390 et
> 640×360 en paysage, 1366×800 sur PC ; FR, EN, ES ; pref `panneauxAncres` OFF puis ON). Scripts et captures
> hors dépôt. Aucun code modifié. Le HOME n'est pas audité.
>
> **État au 17/10/2026** — faits : QW1, QW4, QW5, M1, M2, M3 (habillage centré), G2 (`checkup-panneaux-geometrie.js`). Ouverts : QW2, QW3, QW6-QW10, M4, M5, G1.

## Résumé

- **Le bug « Fermer la structure en cours inatteignable » (v1.82) est toujours là**, sur PC comme sur mobile, et
  le centrage par défaut (v1.85.1) ne l'a pas réglé. Le panneau d'outils (z-index 1050) passe **sous** la barre du
  haut et sous le footer (z-index 1200). Sa hauteur maximale ne compte ni ces deux barres ni son propre padding.
  En paysage, « ✅ Fermer la structure en cours » et « 🧹 Effacer » sont cachés sous le footer **sans aucun scroll
  possible**. En portrait, c'est la même chose dès que la liste s'allonge (plan importé, un type par niveau).
- **Fermer un panneau d'outils en touchant la carte ajoute un sommet au tracé en cours**, sur PC comme sur mobile.
  Le panneau n'a pas de fond qui absorbe ce clic.
- La pref « 🪟 Ancrer » est respectée **partout où elle doit l'être** : un seul positionneur pour les 4 panneaux
  (Favoris, Tracés, Zones, Structures). Aucun panneau n'ancre ou ne centre de son côté. Le défaut est dans ce
  positionneur commun, pas dans la pref.
- Le nouveau lanceur d'export (modale de tuiles) et la modale Tracker sont propres sur les 3 formats testés. Les
  textes EN/ES ne débordent pas. Restent des écarts de « grammaire » entre panneaux : trois styles de fenêtre
  centrée, quatre tailles de croix (19 px à 36 px), deux façons de « choisir un point sur la carte » dans la même
  famille d'export.
- Boutons de zoom (ajoutés aujourd'hui) : en paysage ils s'affichent **côte à côte** (+ −), alors que le CSS
  promet qu'ils restent verticaux. Ils manquent aussi au résumé des réglages de l'accueil affiché en mode plan.
- Aucune adaptation `pointer: coarse` dans tout le CSS : les cibles tactiles suivent la largeur d'écran, jamais
  le type de pointeur. Un téléphone en paysage (844 px) est traité comme un PC par `map.js`, y compris pour le
  plancher de dézoom anti-crash mémoire.

---

## 🟢 Quick wins (≤ 1 h chacun)

**QW1 — Le panneau d'outils déborde de 22 px sous le bas de l'écran** · [Certain] (mesuré)
`js/interface.js:1813-1814` calcule `maxHeight` pour la boîte de **contenu**. `.kta-group-flyout`
(`css/style.css:17246`) a `padding: 10px` + bordure 1 px, en `box-sizing` par défaut (content-box). Le panneau
fait donc `maxH + 22 px`. Mesures : bas à 854 px pour un écran de 844 (portrait, liste longue), 395 pour 390
(paysage). Touche PC et mobile, se voit surtout en paysage et sur les listes longues.
→ Ajouter `box-sizing: border-box` à `.kta-group-flyout`. Ce correctif seul ne suffit pas (cf. M1).

**QW2 — Touche Échap pendant le « clic carte » du calibrage KMZ/GPX : tout le formulaire est perdu** · [Certain] (code)
`js/sessionExporter.js:851` : `_onEchap` appelle `_fermer()` dès qu'il y a `_modal`, même quand la modale est
masquée (`display:none`) pendant le choix d'un point (`_kmzActiverModeClic`, l.3933). Les deux points de
calibrage déjà saisis sont perdus. L'export image fait l'inverse : Échap annule le choix et rouvre la modale
(`js/exporter.js:1562-1567`). PC seulement (clavier).
→ Dans `_onEchap` : si `_kmzClickActive`, appeler `_kmzDesactiverModeClic()` et réafficher la modale, sans fermer.

**QW3 — Choix de la position de légende (export image) : rien pour annuler sur mobile** · [Certain] (code)
`js/exporter.js:1527-1571` : bandeau en `style.cssText` inline (`top:60px`, z-index 9999, pas de bouton). Seule
sortie : Échap (PC) ou un tap sur la carte, qui **pose** la légende. Le calibrage KMZ, lui, a un floater avec
bouton « Annuler » (`.kta-iti-floater`, `js/sessionExporter.js:3950`). Sur iPhone à encoche, `top:60px` touche
aussi la barre du haut (44 px + safe-area).
→ Réutiliser `.kta-iti-floater` avec un bouton Annuler (même code que le KMZ).

**QW4 — Boutons de zoom côte à côte en paysage, contre l'intention écrite** · [Certain] (mesuré : 62×31 px en 844×390 et 640×360)
`css/style.css:13010` (`body.kta-refonte-v1 .leaflet-control-zoom { flex-direction: column !important }`) perd
contre `css/style.css:12993` (`body.kta-refonte-v1 .leaflet-top.leaflet-left .leaflet-bar { flex-direction: row !important }`),
dont la spécificité est plus forte. Le contrôle zoom porte aussi `.leaflet-bar`. Le séparateur prévu pour la
verticale (`a + a { border-top }`, l.13066) s'applique alors à des boutons côte à côte.
→ `body.kta-refonte-v1 .leaflet-top .leaflet-bar.leaflet-control-zoom { flex-direction: column !important; }`.

**QW5 — Le réglage « ➕ Boutons de zoom » manque au résumé « 🏠 Réglés depuis l'accueil » du mode plan** · [Certain]
`js/interfaceConfig.js:818-825` liste `scaledMarkers`, `panneauxAncres`, `snapDraw`, mais pas `zoomBoutons`
(commit `2ef3cee`). Sur PC comme sur mobile, l'utilisateur en mode plan ne voit pas d'où viennent les boutons.
→ Ajouter `[t("config.zoomBoutons.label"), c.zoomBoutons === true ? on : off]`.

**QW6 — Croix de fermeture trop petites au doigt** · [Certain] (mesuré)
`.kta-panneau-close` (`css/style.css:730`, **95 usages** : exports session/image/PDF, Filtres…) = **19×23 px**.
`.kta-group-flyout-close` (l.17321) = 24×24. `.kta-tracker-modal-close` = 36×36. Les mêmes fenêtres ont donc des
croix de taille différente selon la famille, et toutes sont sous les 44 px recommandés au doigt. Pas de souci à la
souris.
→ `@media (pointer: coarse) { .kta-panneau-close, .kta-readme-modal-close, .kta-group-flyout-close { min-width: 40px; min-height: 40px; } }`.
Ce serait la première règle `pointer: coarse` du projet (cf. M5).

**QW7 — Modales d'export image/PDF : `vh` en `!important` qui écrase le `dvh` commun** · [Probable] (iOS Safari non testé)
`css/style.css:4082` (`.kta-export-modal-boite { max-height: 92vh !important }`) et l.4109 (`.kta-pdf-modal-boite
{ max-height: 90vh !important }`) remplacent le `min(88dvh, 920px)` de `.kta-readme-modal-boite` (l.3086). Sur
Safari iOS avec la barre d'URL visible, `vh` dépasse la zone visible. Comme `.kta-readme-modal-overlay` ne
défile pas, le bas de la boîte, là où sont **Télécharger / Générer**, peut sortir de l'écran. Sans effet sur PC.
→ Doubler en `dvh` : `max-height: 92vh !important; max-height: 92dvh !important;`.

**QW8 — Modale Tracker / lanceur d'export : centrage non « safe » + `vh`** · [Probable] (petits écrans iOS)
`.kta-tracker-modal-overlay` (`css/style.css:944`) : `align-items: center` + `overflow-y: auto`, boîte
`max-height: 92vh` (l.960). Si la boîte dépasse la hauteur visible, le haut (titre + croix) sort par le haut et
**ne peut pas être ramené en défilant**. C'est le piège déjà corrigé pour `.kta-readme-modal-overlay` par
`align-items: safe center` (v1.23.2). Il touche maintenant **aussi le lanceur d'export**, qui réutilise cette
modale.
→ `align-items: safe center;` + `max-height: 92dvh` en second.

**QW9 — Sélection de tags de l'Éditeur de données : la liste peut s'ouvrir au-dessus de l'écran** · [Probable]
`js/tableEditor.js:1128-1140` : si la liste dépasse en bas, elle se replace au-dessus de l'ancre, sans limite
haute (`top` peut devenir négatif). Elle utilise `innerHeight`, pas `visualViewport` comme le panneau d'outils.
Se produit en paysage mobile (hauteur 360-390 px, liste jusqu'à 280 px).
→ `top = Math.max(8, …)` et lire `visualViewport`.

**QW10 — Barre d'onglets de l'export de session : du code mort qui peut diverger** · [Certain]
Tous les appels passent en solo : `js/interface.js:2357`, `js/sessionPersist.js:565`, `js/tableEditor.js:436/445`,
et conversion/fusion forcées (`js/sessionExporter.js:566`). La barre `.kta-ses-tabs` (l.827-831) et le titre
non-solo ne s'affichent donc plus jamais. Retouchés un jour pour rien, ils feront croire à une incohérence.
→ Supprimer, ou bien commenter « chemin non solo : plus aucun appelant ».
Au passage : avec un format imposé, la section masquée (l.3460) emporte aussi `#kta-extern-fmt-desc`, le texte
qui explique à quoi sert le KMZ ou le GPX. À sortir de cette section.

---

## 🟡 Middle (demi-journée à 2 jours)

**M1 — Le panneau d'outils ignore la barre du haut et le footer (cause racine du bug v1.82)** · [Certain] (mesuré)
`_positionnerFlyout` (`js/interface.js:1781-1878`) borne le panneau au `visualViewport` et aux safe-areas, mais
pas à `#kta-refonte-header` ni à `#kta-refonte-statusbar` (z-index 1200, `css/style.css:12376/13376`). Le
panneau, lui, est à **1050** (l.17248). Il passe donc **dessous** les deux barres. Mesures :

| Cas | Panneau | Footer | Boutons inatteignables |
|---|---|---|---|
| 844×390, centré **et** ancré | 12 → 395 | 345 | « ✅ Fermer la structure en cours », « 🧹 Effacer » (Tracés et Zones : idem) — **pas de scroll** (`scrollHeight == clientHeight`) |
| 640×360 ES | 12 → 370 | 315 | « Cerrar la estructura en curso », « Borrar » — scroll présent mais **le bas du scroll reste sous le footer** |
| 390×844, 22 types (liste longue simulée) | 12 → 854 | 792 | dernier bouton à 809-843, `elementFromPoint` = footer, **même scrollé au bout** |
| 1366×800 / 390×844, liste standard | OK | — | aucun |

En haut, le panneau commence à 12 px, sous la barre de 36-44 px. Le titre collant reste lisible grâce au padding,
mais c'est un coup de chance.
→ Dans `_positionnerFlyout`, calculer la zone utile entre `header.getBoundingClientRect().bottom` et
`statusbar.getBoundingClientRect().top` (repli sur safe-area si absents), y caler `maxH` et le clamp, et appliquer
QW1. Garder z-index 1050 : ainsi le panneau ne masque jamais la barre d'état. Ajouter un garde-fou Playwright
(paysage 844×390, Structures : dernier bouton cliquable), puisque le correctif v1.82 avait passé la revue sans ce
cas.

**M2 — Un tap pour fermer le panneau d'outils « traverse » vers la carte et ajoute un sommet** · [Certain] (reproduit)
`_onDocClickFlyout` (`js/interface.js:1518-1528`) ferme sur `click`/`touchend` en capture, **sans consommer**
l'événement. Avec un mode tracé armé, rouvrir 🛣️ puis toucher la carte pour refermer a fait passer le tracé en
cours de **1 à 2 points**, en 390×844 tactile comme en 1366×800 souris. Le défaut centré aggrave le problème :
le panneau couvre le milieu de la carte, et « toucher à côté » devient le geste naturel pour le fermer. La modale
Tracker n'a pas ce défaut : son fond (`.kta-tracker-modal-overlay`) absorbe le clic.
→ Deux options. **(a)** En mode centré, poser un fond transparent sous le panneau, comme pour Tracker : le tap
ferme et s'arrête là. **(b)** Dans `_onDocClickFlyout`, si la cible est dans `#map`, `stopPropagation()` +
`preventDefault()`, et ignorer le `click` synthétique qui suit un `touchend`. Reco : (a). Elle rend aussi le
centré visuellement cohérent avec Tracker et Filtres (cf. M3).

**M3 — Trois « fenêtres centrées » qui ne se ressemblent pas** · [Certain]
Le libellé v1.85.1 promet « centrées comme tracker et filtres ». Ce qui existe :

| Panneau | Fond | z-index | Croix | Échap | Clic dehors |
|---|---|---|---|---|---|
| Tracker / lanceur d'export (`.kta-tracker-modal-*`) | flou sombre | 99999 | 36 px | oui (capture) | ferme, clic absorbé |
| Filtres, exports session/image/PDF (`.kta-readme-modal-*`) | sombre 88 % | 99999 | 19×23 px | oui (global `utils.js:3521`) | ferme, clic absorbé |
| Tracés / Zones / Structures / Favoris (`.kta-group-flyout`) | **aucun** | **1050** | 24 px | seulement si le focus est dans le panneau | ferme, **clic transmis à la carte** (M2) |

L'écart vient de l'histoire du code : le flyout était un panneau latéral, il est devenu centré par défaut sans
changer de nature. Sur PC ça passe ; au doigt, M1 + M2 en sont la conséquence.
→ Avec M1 et M2(a) : en mode centré, donner au flyout l'habillage du lanceur (fond, croix 36 px). En mode ancré,
garder l'habillage actuel, sans fond.

**M4 — Deux règles d'espace réservé aux barres, selon l'élément où la modale est insérée** · [Certain]
`body.kta-refonte-v1 .kta-readme-modal-overlay` (`css/style.css:12943-12958`) réserve en haut et en bas la place
du header et du footer. La règle ne s'applique qu'aux overlays insérés dans `<body>`. Or **156**
`documentElement.appendChild` (exports, Filtres, Éditeur de données…) les insèrent dans `<html>`. Ils ne la
reçoivent donc jamais, alors que `interface.js:209` (sélecteur de plan) et 77 autres `body.appendChild` la
reçoivent. Avec la même classe, la boîte n'a pas la même hauteur utile selon le module. Pas de masquage, car
l'overlay (99999) passe au-dessus du footer. Mais le commentaire « concerne TOUTES les modales » est faux.
→ Choisir une règle et l'écrire : soit `:is(html, body).kta-refonte-v1 …` avec la classe posée aussi sur `<html>`
(comme `themeManager.js:99` le fait pour le thème), soit supprimer la règle et assumer « la modale couvre les
barres ».

**M5 — Aucune adaptation au type de pointeur ; « mobile » a 6 définitions** · [Certain]
CSS : 0 `pointer: coarse`, une seule `hover: hover` (`style.css:15407`). Les seuils de largeur varient :
480 px (23 règles), 540, 600, 640, 768, 1023/1024. Côté JS : `map.js:392` utilise `max-width: 768px`,
`interfaceConfig.js:777` `max-width: 1023px`, `homeLoader.js` 640 px. Conséquences concrètes :
- **`map.js:392`** : un téléphone qui charge un plan **en paysage** (844 px > 768) reçoit le plancher de dézoom
  **PC** (−3/−4 au lieu de −2/−3 pour les grands plans). C'est justement la protection anti-crash mémoire
  (« Mobile inchangé (calibre anti-crash) »). [Certain] sur le code, [Probable] sur le crash.
- Les boutons de la barre latérale font 36 px en portrait et **30 px en paysage** (`style.css:13017`), soit moins
  qu'en portrait alors qu'on est toujours au doigt.
- Une tablette ≥ 1024 px reçoit la mise en page PC (grilles 3-4 colonnes de l'export image, `exporter.js:109`).
  Acceptable, mais à décider plutôt que subir.
→ Pour la mémoire : `Math.min(screen.width, screen.height) <= 768 || matchMedia("(pointer: coarse)")`. Pour les
cibles : un bloc `@media (pointer: coarse)` unique (croix, boutons de barre latérale ≥ 40 px). Documenter un seul
seuil « étroit » dans `docs/architecture/ui.md`.

**M6 — Les 13 boutons de la barre latérale n'ont pas de libellé visible au doigt** · [Certain]
`_creerGroupeAccordeon` (`js/interface.js:1023-1028`) ne pose qu'un `title`, donc une infobulle au survol. Sur
mobile, 13 émojis sans nom. Le nom n'apparaît qu'une fois le panneau ouvert, et pas du tout pour les actions
directes (✏️ Ajouter un point, 🔍, ⚙️).
→ Appui long = toast avec le `title`, ou une option « libellés sous les icônes ». À trancher par KARMA (place
disponible en paysage).

**M7 — Échelle de z-index hors de la charte** · [Certain]
CLAUDE.md fixe 1100 titre · 5000 loader · 9999 splash · 99999 modales · 100001 sous-modales. Mais : barres 1200,
flyout 1050 (sous les barres, cf. M1), bandeau de choix de l'export image **9999** (rang splash, inline),
floater KMZ 100000, liste de tags 100002, boussole 1250 `!important`. Rien n'est faux isolément, mais l'échelle
réelle n'est écrite nulle part, et c'est ainsi que M1 est passé inaperçu.
→ Écrire l'échelle réelle dans `ui.md`, puis des variables CSS (`--kta-z-barres`, `--kta-z-panneau`…).

---

## 🔴 Gros chantiers

**G1 — Une seule primitive « panneau / modale » pour le mode plan** · [Probable] (coût estimé)
Aujourd'hui coexistent `kta-readme-modal-*` (95 croix `kta-panneau-close`, 20 `kta-readme-modal-close`),
`kta-tracker-modal-*`, `kta-group-flyout`, `kta-iti-floater`, une dizaine de croix maison (`kta-ses-close`,
`kta-tbl-close`, `kta-sortie-close`…), trois mécanismes Échap (global `utils.js`, capture Tracker, focus dans le
flyout) et `ModalLifecycle`, adopté par 3 modules seulement. Chaque refonte d'une modale recrée l'un de ces écarts
sans le voir. C'est la crainte exprimée par KARMA.
→ Un `ktaPanneau({ titre, corps, actions, mode: "centre"|"ancre"|"feuille" })` qui porte fond, croix, Échap,
clic dehors absorbé, zone utile entre les barres, `dvh`, safe-areas et `pointer: coarse`. Migrer d'abord les
modales touchées par des refontes récentes : export, Tracker, flyouts. Puis un garde-fou statique, sur le modèle
de `check-popups-natives.js`, qui plafonne les nouveaux overlays maison.

**G2 — Un harnais Playwright « géométrie » sur 4 formats** · [Certain] (besoin démontré par M1)
Le bug v1.82 est revenu parce que le correctif a été validé au portrait PC. Les scripts de cet audit (ouvrir
chaque panneau et chaque modale du mode plan en 390×844, 844×390, 640×360, 1366×800 ; vérifier que chaque
bouton est sous le pointeur via `elementFromPoint`, hors footer et hors header) tiendraient dans
`scripts/smoke/checkup-geometrie.js` et franchiraient la porte de release. Ils coûtent ~1 j à rendre robustes :
sélecteurs, plan fictif, EN/ES.

---

## Ce qui est cohérent

- **Pref « Ancrer »** : un seul point de lecture (`interface.js:1867`). Les 4 panneaux concernés (Favoris,
  Tracés, Zones, Structures) passent tous par `_positionnerFlyout`. Aucun autre panneau du mode plan n'est
  positionné sur un bouton (grep `style.top =` : seuls le flyout et la liste de tags). Les groupes en accordéon
  (📚 Aide, ⬇️ Charger, ⏪ Historique, 📐 Mesure) ne sont pas des panneaux : ils s'ouvrent dans la barre latérale,
  et à l'horizontale en paysage. Normal qu'ils ignorent la pref. Mesuré : centré et ancré donnent des positions
  différentes et justes sur PC et en portrait.
- **Lanceur d'export** : 6 tuiles, 3 sections paires (pas de tuile orpheline), même code que Tracker. Il passe en
  390, 844×390 et 1366, et ses libellés FR/EN/ES tiennent. `_formatImpose` masque bien le sélecteur KMZ/GPX.
- **Modale Tracker** : grille 2 colonnes à toutes les tailles, scroll interne en paysage, Échap et clic dehors OK.
  Aucun libellé qui déborde en EN/ES à 360 px.
- **Footer** : aucun texte coupé en EN/ES à 360 px.
- **Popups natives** : 0 (`check-popups-natives.js`).
- **Survol** : aucun contenu visible seulement au survol (les `:hover` ne font que renforcer l'opacité).
- **Double-clic / appui long** : le seul double-clic métier (zone Secours) a son bouton « Terminer » ; le mode
  urgence n'utilise le double-clic que pour mettre le suivi en pause.

## Ce qui n'a pas pu être vérifié

- **iOS Safari / PWA réels** : `dvh` contre `vh`, barre d'URL dynamique, encoche, home indicator (QW7, QW8, la
  safe-area du floater KMZ `bottom: 20px`, `style.css:9809`). Playwright/Chromium a `vh == innerHeight`.
- **Liste Structures réellement longue** : simulée en clonant 14 boutons. Pas testé sur un plan importé
  multi-niveaux.
- **Thème clair** des panneaux et des modales d'export : pas de capture.
- **Tablette** (768-1366 tactile) et **Android bas de gamme** : risque mémoire de l'export image « Originale »,
  bridé sur iOS seulement (`exporter.js:1445-1452`). [Supposition]
- **Boutons de zoom activés à chaud** : ajoutés en bas de la colonne gauche (rang 9/10), contre le haut (rang
  0/10) quand ils sont activés avant le chargement du plan. Sans effet pratique si la carte du plan est toujours
  recréée après le réglage de l'accueil. [Supposition] : non vérifié en revenant au HOME avec un plan resté en
  mémoire.
- Barre latérale repliée (▾) avec le zoom actif, mode présentation, mode plan orienté : pas testés.
