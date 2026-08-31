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

Sert le repo en local (port 8123), boote l'app dans Chromium headless,
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
> traversés par AUCUNE étape. L'Aide porte ~1 700 lignes de HTML en dur et a
> encaissé coup sur coup une régression de langue (elle sortait en français
> pour les hispanophones) et trois défauts de structure — invisibles ici tant
> que le harnais ne l'ouvrait pas.

**Échec (exit 1) sur** : toute erreur console, toute `pageerror`, tout
`[I18n] Clé manquante`, tout 404 non listé dans le bruit toléré, toute
modale invisible, tout overlay résiduel.

Le bruit toléré (liste courte et justifiée dans `smoke.js`) : `version.json`
/ `ping.html` / `live-config` (update-checker hors-ligne), `favicon`,
`Licence-pro.json` (sonde pro : 404 = instance community, nominal).

## Quand le lancer

Marche du **RELEASE_GATE** (avant chaque release) — pas en pre-commit
(quelques dizaines de secondes par run). Un ajout d'écran dans l'app mérite
son étape ici.
