# Étude — Identifiant stable des objets de carte (`uid` + `updatedAt`)

> Étude menée avec KARMA le 04/10/2026 (QCM). Toutes les décisions ci-dessous sont **tranchées** ;
> elles font foi pour l'implémentation. **Rien n'est codé.** C'est le chantier 1 de l'ordre fixé dans
> `docs/architecture/community-server-line.md` §3 : une **release community**, utile en soi et livrée
> seule, avant tout point d'extension.

## Le besoin

La synchro « le dernier gagne, par objet » et le journal des changements exigent que chaque point,
tracé, zone et structure ait une **identité stable** et une **date de modification précise**. Sans
attendre le pro, community y gagne aussi : annulation qui ne casse plus les sélections, fusions
d'imports sans doublons, rattachement fiable des photos au lieu d'un rattachement par nom.

## Ce que fait le code aujourd'hui

- **Points** (`editor.js:648-667`) : `{ id, nom, x, y, tags, etat, description, profondeur,
  date_update, source, level? }`. **`id` vaut le nom** (« garde id === nom (rétro-compat) »,
  `:633-637`) : il change au renommage et n'est pas unique. `date_update` est au **jour** près.
- **Tracés, zones, structures** (`road.js:201`, `zones.js:126`, `structures.js:382-409`) :
  `{ type, points[], level? }`, **sans id ni date**. Ils sont reconnus par leur référence en mémoire
  (`indexOf(obj)`, `convertirObjet.js:206-210`).
- **Annulation** (`historyManager.js:94-126`) : copie profonde de tableaux entiers. Après une annulation,
  les objets sont de nouvelles références, donc une fenêtre ou une sélection ouverte pointe dans le vide.
- **Session** (`sessionPersist.js:331-367`) : les tableaux sont enregistrés tels quels. Un champ ajouté
  survit à la sauvegarde et au rechargement sans rien toucher. ⚠️ Une session dont `version` diffère de
  `VERSION` est **ignorée** (`:422`).
- **Objets de base d'un plan** (calques de données, lecture seule) : les fonctions de lecture recopient
  les champs un par un (`utils.js:1960-2019`) et perdraient un champ ajouté. `getAllEmbeddedRoads`
  (`road.js:1528`) recopie tout.
- **Références par nom de point** : photos (`renamePointId`, `editor.js:614-616`), favoris
  (`favoris.js:119-166`), liaisons inter-plans (`_pointKey`, `interPlanLinks.js:101-107` : nom, sinon
  coordonnées arrondies), Mode Secours (`pointId` + instantané x/y, `secoursMode.js:11599`, `:2730`).
- **Générateurs d'id existants** : `prefixe + Date.now().toString(36) + "_" + aléa(6)` dans favoris,
  liaisons, Carnet, mode Histoire, légende. Aucun pour les objets de carte.

## Décisions

| # | Sujet | Décision |
|---|---|---|
| 1 | Champ | **Nouveau champ `uid`.** `id` reste le nom du point, comme aujourd'hui. |
| 2 | Format | **Court et préfixé** : `pt_` / `rd_` / `zn_` / `st_` + `Date.now()` en base 36 + `_` + 6 caractères aléatoires (format déjà en usage dans le code). |
| 3 | Horodatage | **`updatedAt` en ms** (`Date.now()`), et **`date_update` gardé** et tenu à jour (affichage, rapport de sortie, tableur). Une **fonction unique** met les deux à jour à chaque modification. |
| 4 | Migration des sessions | **À l'ouverture du plan** : un objet sans `uid` en reçoit un, avec `updatedAt` = date de dernière sauvegarde de la session (`savedAt`). **`VERSION` de session inchangé** : les anciennes versions de l'app continuent de lire la session. |
| 5 | Objets de base | **Le Générateur écrit les `uid`** dans les nouveaux plans, et les fonctions de lecture de la base sont corrigées pour les conserver. Les anciens plans restent sans `uid` jusqu'à leur régénération. **Pas d'uid fabriqué à la volée** : il changerait dès que le fichier change. |
| 6 | Exports | **JSON** (complet, avancé, calque) : `uid` gardé (automatique, objets écrits tels quels). **Anonymisé** : `uid` retiré (il relierait le fichier à sa source). **KMZ / GPX** : pas d'`uid` (formats étrangers). |
| 7 | Imports et fusions | **Fusion sur `uid` là où on fusionne déjà** (fusion de sessions, import GPX) : même `uid` = pas de doublon, le plus récent (`updatedAt`) gagne. L'import qui **remplace** tout reste un remplacement. |
| 8 | Suppressions | **Traces de suppression en session** : liste `{ uid, deletedAt }`, purgée après **90 jours**. Sans elles, un objet supprimé ressusciterait à la resynchro. |
| 9 | Annulation | **Même `uid`, `updatedAt` = maintenant** (une annulation est une modification). Restaurer un objet supprimé retire sa trace de suppression. |
| 10 | Conversion de type | **L'`uid` est gardé** (même objet, autre nature), et `updatedAt` est mis à jour. |
| 11 | Références par nom | **Dans le chantier 1** (décision KARMA, contre la reco d'un chantier séparé) : photos, favoris, liaisons et Mode Secours passent à `uid`. |
| 12 | Nom ambigu à la migration | **Par coordonnées si la référence en garde (liaisons, Secours), sinon signalé** : la référence reste sur le nom, l'app l'affiche « à rattacher » et l'utilisateur choisit. **Jamais de rattachement deviné en silence.** |
| 13 | Anciens fichiers | **Recherche par nom en secours, sans limite de durée** : à l'import, une référence sans `uid` est rattachée par nom (règle 12), puis convertie en `uid`. |
| 14 | Garde-fou | **`scripts/check-uid.js`, pré-commit bloquant** : exécute création, modification, conversion et annulation, et vérifie `uid` présent et unique, `updatedAt` mis à jour, `uid` conservé par les lectures de la base, retiré de l'export anonymisé. |

## Points d'attention pour l'implémentation

- **Tous les sites de modification doivent passer par la fonction unique** (décision 3). Ceux repérés :
  éditeur de points, tracés, zones, structures, conversion (`convertirObjet.js`), sélection multiple
  (`selectionMulti.js`), tableur (`tableEditor.js:1469`, qui aujourd'hui ne met même pas `date_update`
  à jour), déplacement de sommets, rapatriement d'un calque (`calqueSession.js:190-227`).
- **Le tableur a une déduplication** (`tableEditor.js:385-408`) : elle doit raisonner sur `uid`.
- **Rapatriement de calque** : l'en-tête de `calqueSession.js` (`:31-40`) note que le rapatriement objet
  par objet avait été écarté faute d'id. Avec `uid`, il redevient possible : hors périmètre ici, à
  reconsidérer ensuite.
- **Docs à mettre à jour à la livraison** : `docs/architecture/data-formats.md` (format point / session),
  `session-data.md`, les 3 `README_USER` si un écran « à rattacher » apparaît, NETWORK_AUDIT (aucun
  impact réseau attendu, à confirmer).
- **Données réelles** : les tests de migration se font sur le relevé fictif ou dans le scratchpad, jamais
  en citant un plan réel dans un commit ou une doc.
