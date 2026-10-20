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

Décidé en QCM avec KARMA (20/10/2026) :
- **Où** : une liste « Niveau » dans la fiche des tracés, zones et structures (à côté de 🔄 Convertir) et dans le
  formulaire d'édition d'un POI ; absente sur un plan à un seul niveau et pendant un tracé en cours de dessin.
- **Jonctions interniveau** : hors lot (pas de fiche aujourd'hui ; les supprimer et les recréer).
- **Objet de calque** : pas de liste (lecture seule, le rapatrier d'abord).
- **Niveau cible masqué par le filtre** : un message « déplacé au niveau N (masqué par le filtre) », la vue reste sur
  le niveau en cours.

État du code (lu le 20/10/2026) :
- Champ `level` (entier, absent = 0, seulement si `APP_CONFIG.multiLevel`) ; jonctions : `fromLevel`/`toLevel`.
- Modèle à copier : `convertirObjet.js > convertir` (garde lecture seule, `HistoryManager.captureState`, mutation +
  `KtaUid.touch`, setter, `HistoryManager.record`, `SessionPersist.save`) ; fiche commune `utils.js >
  attacherNotePopup`. POI : `editor.js > afficherFormulaire` (portée d'annulation `editorPoints`), puis
  `MyKTAMapPhotos.majFichesPoints` (la fiche photo copie le niveau).
- 🩸 Graphe de navigation `roadGraph.js` : sa signature (nombre de tracés et de points) ne voit pas un changement de
  niveau → l'invalider. `interPlanLinks.js` garde un instantané du niveau des points liés → le rafraîchir.
- La liste doit contenir le niveau actuel même s'il sort de `availableLevels`.

- Aujourd'hui le niveau est fixé à la création (`editor.js`, `road.js`, `structures.js` : niveau affiché) ; seul
  « Convertir cet objet » touche la fiche, sans le niveau.
- Liste des niveaux du plan (`plan-config`), absente sur un plan à un seul niveau.
- 🩸 `structures.js` pose `activeLevel − 1` pour `pilier-2` / `front-2` (la « 2e masse », niveau du dessous vu
  d'ici, décision produit) : c'est seulement le niveau par défaut à la création, la valeur stockée est le vrai
  niveau. Un changement écrit la valeur choisie, sans réappliquer le − 1.
- Tracés qui servent de jonction interniveau ; graphe d'itinéraire à reconstruire après le changement.
- Objet d'un calque : le rapatrier d'abord (lecture seule sinon).
- `KtaUid.touch` (synchro) ; ⏪ annulable ; photos et liaisons suivent l'objet.
- Garde-fou à étendre : `check-uid.js` (et le contrôle de conversion s'il couvre la fiche).
