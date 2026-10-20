# Mettre à jour le plan, changer le niveau d'un objet — décisions avant lot

> Fiche de lot : ce qui est décidé et ce qu'il faut savoir avant de coder. Les entrées correspondantes du backlog
> (`docs/BACKLOG.md`) n'en gardent qu'une ligne. Une fois le lot livré, l'état actuel passe dans
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

## Niveau d'un objet

Demande KARMA : sur la fiche d'un POI, d'un tracé, d'une zone ou d'une structure de **session**, choisir son niveau.

- Aujourd'hui le niveau est fixé à la création (`editor.js`, `road.js`, `structures.js` : niveau affiché) ; seul
  « Convertir cet objet » touche la fiche, sans le niveau.
- Liste des niveaux du plan (`plan-config`), absente sur un plan à un seul niveau.
- 🩸 `structures.js` pose `niveau − 1` dans un cas : le comprendre avant de toucher.
- Tracés qui servent de jonction interniveau ; graphe d'itinéraire à reconstruire après le changement.
- Objet d'un calque : le rapatrier d'abord (lecture seule sinon).
- `KtaUid.touch` (synchro) ; ⏪ annulable ; photos et liaisons suivent l'objet.
- Garde-fou à étendre : `check-uid.js` (et le contrôle de conversion s'il couvre la fiche).
