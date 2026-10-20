# Mettre à jour le plan — décisions avant lot

> Fiche de lot : ce qui est décidé et ce qu'il faut savoir avant de coder. L'entrée correspondante du backlog
> (`docs/BACKLOG.md`) n'en garde qu'une ligne. Une fois le lot livré, l'état actuel passe dans
> `docs/architecture/` et cette fiche quitte `docs/`.

## Assistant « Mettre à jour le plan »

Décidé en QCM avec KARMA.

- **Où** : une tuile dans ⬆️ Exporter et un raccourci en tête des calques (≡ Filtres).
- **Étape 1** — calques en modification : cochés, chacun remplace son fichier.
- **Étape 2** — objets hors calque, groupés par catégorie / tag (comme la Conversion) ; pour chaque groupe :
  calque existant, nouveau calque, ou laisser.
- **Étape 3** — le **Générateur s'ouvre en mode Modifier déjà rempli** (ZIP actuel du plan + calques + nouveaux
  calques + photos) ; l'utilisateur vérifie et génère.
- **Étape 4** — plan local : télécharger, ou remplacer dans l'app. Plan d'une extension : **nouvelle version** par
  une prise neutre `publierVersion` (réservée par l'extension au droit le plus haut ; un droit de modification
  prépare et télécharge seulement — vérifier le droit côté serveur de l'envoi du fichier).
- **Après** : proposer de rendre les calques à l'équipe et de retirer de la session les objets intégrés (sinon
  doublons).
- Prérequis intégrés : effacer la session d'un plan d'extension, intégrer des ajouts au calque, export en
  modification.
