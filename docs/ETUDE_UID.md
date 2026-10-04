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
| 2 | Format | **Court et préfixé** : `pt_` / `rd_` / `zn_` / `st_` + `Date.now()` en base 36 + `_` + 6 caractères aléatoires (`crypto.getRandomValues`, 6 caractères garantis). ⚠️ En migration de masse (des milliers d'objets dans la même milliseconde), le risque de doublon atteint ~1-3 % : **tout `uid` déjà vu dans un lot est régénéré**. Le préfixe dit la famille **à la création** ; après une conversion (décision 10), un `rd_` peut vivre dans les zones. **Unicité par stockage** : un objet rapatrié d'un calque garde volontairement l'`uid` de l'original. |
| 3 | Horodatage | **`updatedAt` en ms** (`Date.now()`), et **`date_update` gardé** et tenu à jour (affichage, rapport de sortie, tableur). Une **fonction unique** met les deux à jour à chaque modification. |
| 4 | Migration des sessions | **À l'ouverture du plan** : un objet sans `uid` en reçoit un, avec `updatedAt` = date de dernière sauvegarde de la session (`savedAt`). **`VERSION` de session inchangé** : les anciennes versions de l'app continuent de lire la session. |
| 5 | Objets de base | **Le Générateur écrit les `uid`** dans les nouveaux plans, et les fonctions de lecture de la base sont corrigées pour les conserver. Les anciens plans restent sans `uid` jusqu'à leur régénération. **Pas d'uid fabriqué à la volée** : il changerait dès que le fichier change. |
| 6 | Exports | **JSON** (complet, avancé, calque) : `uid` gardé (automatique, objets écrits tels quels). **Anonymisé** : `uid` retiré (il relierait le fichier à sa source). **KMZ / GPX** : pas d'`uid` (formats étrangers). |
| 7 | Imports et fusions | **Fusion sur `uid` là où on fusionne déjà** (fusion de sessions, doublon de fusion du Générateur) : même `uid` = pas de doublon, le plus récent (`updatedAt`) gagne ; deux objets d'un **même** fichier avec le même `uid` sont régénérés, jamais fusionnés. L'import qui **remplace** tout reste un remplacement. **GPX** (correction du 04/10/2026) : le format ne porte pas d'`uid` et son import est un ajout pur → chaque objet importé reçoit un `uid` neuf. |
| 8 | Suppressions | **Traces de suppression en session** : liste `{ uid, deletedAt }`, purgée après **90 jours**. Sans elles, un objet supprimé ressusciterait à la resynchro. Elles sont tenues **à un seul endroit**, l'historique d'annulation (diff des `uid` à chaque action), plutôt qu'à chacun des ~15 sites de suppression. Pas de trace pour l'itinéraire calculé ni pour un calque restitué. **« Effacer la session » vide aussi les traces** (Q1, 04/10/2026), et des traces seules comptent comme contenu (sinon tout supprimer effacerait le slot avec elles). **L'export JSON complet emporte les traces** (Q2), l'export anonymisé jamais. |
| 9 | Annulation | **Même `uid`, `updatedAt` = maintenant** (une annulation est une modification). Restaurer un objet supprimé retire sa trace de suppression. |
| 10 | Conversion de type | **L'`uid` est gardé** (même objet, autre nature), et `updatedAt` est mis à jour. |
| 11 | Références par nom | **Dans le chantier 1** (décision KARMA, contre la reco d'un chantier séparé) : photos, favoris, liaisons et Mode Secours passent à `uid`. ⚠️ Les favoris ont **déjà** un champ `uid` (l'identifiant du favori, `fav-…`) : le nouveau champ s'y appelle **`pointUid`**. |
| 12 | Nom ambigu à la migration | **Par coordonnées si la référence en garde (liaisons, Secours, favoris — qui gardent x/y et `layerId`), sinon signalé** : la référence reste sur le nom, l'app l'affiche « à rattacher » et l'utilisateur choisit. **Jamais de rattachement deviné en silence**, et **jamais de suppression de photo pendant la migration**. |
| 13 | Anciens fichiers | **Recherche par nom en secours, sans limite de durée** : à l'import, une référence sans `uid` est rattachée par nom (règle 12), puis convertie en `uid`. |
| 14 | Garde-fou | **`scripts/check-uid.js`, pré-commit bloquant** : exécute création, modification, conversion et annulation, et vérifie `uid` présent et unique, `updatedAt` mis à jour, `uid` conservé par les lectures de la base, retiré de l'export anonymisé. |

## Découpage (Q4, 04/10/2026) : trois lots, chacun livré seul

1. ✅ **Lot A — l'identité, livré en v2.1.0.** Nouveau module `js/ktaUid.js` (`genUid`, `touch`, `ensure`, `ensureAll` avec
   régénération des doublons) ; filet dans les 4 setters (`setEditorPoints`, `setRoads`, `setZones`,
   `setStructures`) ; migration dans `sessionPersist._applyRestore` (repli `updatedAt` = `savedAt`) ;
   `touch` à chaque modification ; conversion ; tableur (« Dupliquer » donne un `uid` neuf) ; lectures de
   la base (`getAllEmbedded*`) ; Générateurs (`createConf`, `kmzImport`, `gpxImport`, `sigImport`) ;
   garde-fou `check-uid.js`. N'ajoute que des champs.
2. ✅ **Lot B — suppressions et fusion, livré en v2.2.0.** Traces (payload, purge, vidage, historique d'annulation),
   annulation, fusion par `uid`, import par remplacement.
3. **Lot C — références**, découpé le 04/10/2026 (le nom sert de clé photo dans 11 endroits) : ✅ **C1 photos de session, livré en v2.3.0** (double lecture uid puis nom, migration douce, « à rattacher » par photo) · ✅ **C2 favoris, liaisons, Secours, livré en v2.4.0** (corrige au passage : supprimer un point effaçait les liaisons de ses homonymes) · ✅ **C3 photos des ZIP de plan, livré en v2.5.0** (index du Générateur par uid ; plus d'effacement global des photos à la réouverture d'un plan ZIP). **Chantier 1 terminé.** Photos, favoris, liaisons, Secours ; « à rattacher » ; i18n ; 3 guides.
   Le plus dangereux : une garde mal remplacée dans l'éditeur supprimerait réellement des photos.

## Points d'attention pour l'implémentation

- **Sites de modification réels** (vérifiés dans le code le 04/10/2026) : création / modification /
  repositionnement de point, ajout et retrait du dernier sommet (tracé, zone, structure), description
  (`setDescr`), conversion, cellules et tags du tableur, rapatriement de calque. Il n'existe **ni glisser
  de sommet ni sélection multiple qui déplace ou supprime** (la sélection ne fait que convertir).
- **Le tableur ne déduplique pas d'objets** : sa « dédup » retire des sommets répétés à l'intérieur d'un
  objet. Son vrai risque est **« Dupliquer »**, qui recopierait l'`uid`.
- **Rapatriement de calque** : l'en-tête de `calqueSession.js` note que le rapatriement objet par objet
  avait été écarté faute d'id. Avec `uid`, il redevient possible : hors périmètre ici.
- **Stockage local** : +~45 octets par objet ; un très gros relevé rapatrié peut approcher le quota.
- **Même nom, autre sens** : `updatedAt` du Carnet est une chaîne ISO, celui des objets de carte est en ms.
- **Docs à mettre à jour à la livraison** : `docs/architecture/data-formats.md` (format point / session),
  `session-data.md`, les 3 `README_USER` si un écran « à rattacher » apparaît, NETWORK_AUDIT (aucun
  impact réseau attendu, à confirmer).
- **Données réelles** : les tests de migration se font sur le relevé fictif ou dans le scratchpad, jamais
  en citant un plan réel dans un commit ou une doc.
