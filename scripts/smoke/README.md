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
3. **📊 Éditeur de données** — accueil + modale du convertisseur **avec dimensions réelles** (une modale « présente mais invisible » est un échec)
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
| `node checkup-toasts.js` | **Toasts** sur PC 1280 et téléphone 390, sombre et clair : 3 et 5 toasts d'affilée (empilés, le plus récent en bas, 3 visibles, une erreur part en dernier), types info / succès / warn / erreur (icône, liseré ≥ 3:1, texte ≥ 4,5:1), « Essentielles » et « Silence », Échap, au premier plan sur la carte du relevé fictif ; « J'accepte » des CGU inactif mesuré (≥ 3:1) et sa consigne. Captures dans `$TOASTS_SHOTS` (défaut : dossier temporaire) |
| `node checkup-aide-telephone.js` | **Fiche d'Aide sur téléphone** (390 portrait et 844×390 tactile) : la fiche remplace le hub (un voile, une croix), « ← Retour » lisible (≥ 4,5:1) rend le hub à la même position de défilement, Échap revient au hub puis ferme ; PC 1280 : sous-fenêtre inchangée, Retour lisible au repos et survolé. **Mouvement réduit** : les indicateurs de chargement pulsent, le reste est coupé |
| `node checkup-repositionner.js` | **Repositionner un POI** à la souris : le clic sur « Repositionner » arme le mode sans déplacer le point (il prenait ce clic pour la position), puis le clic sur la carte y pose le POI et termine le mode |
| `node checkup-splash.js` | **Splash de démarrage** en téléphone 390 et PC 1280 : image finale complète (38 galeries, pictos, rose), fermeture seulement quand l'accueil est affiché (accueil lent / rapide), clic et Échap, seconde ouverture rejouée en entier, plafond 12 s, mouvement réduit, coût au démarrage processeur ×4. `SPLASH_SHOTS=<dossier>` : captures |

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
