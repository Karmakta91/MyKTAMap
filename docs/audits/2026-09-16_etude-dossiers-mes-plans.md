# Étude — « Mes plans » à 50+ plans : le mode Dossiers

> Étude demandée par KARMA le 16/09/2026. **Livrée en v1.95.0 le jour même (marches 1 et 2)** — voir `docs/architecture/plans-loader.md` § Dossiers, `scripts/check-plan-folders.js`, `scripts/smoke/checkup-plan-folders.js`, et le QCM de test `docs/audits/2026-09-16_qcm-test-dossiers.md`. Rédigée avant le code : Contrainte stricte : « Mes plans » garde sa taille et sa place, chaque bloc de l'accueil (Vue OSM, Outils, Ajouter) reste où il est ; un sélecteur du type **TOUT / DOSSIERS** bascule l'affichage.
> Base : `js/homeLoader.js > refreshPlansList` et `planRowHTML`, `js/planRegistry.js` (métadonnées `pinned` / `tags` / `displayName`), `index.html > #myPlansBox`, CSS `.loader-col-plans`.

---

## 1. Diagnostic — pourquoi les étiquettes atteignent leur limite

Ce que fait la liste aujourd'hui (code lu) :

| Mécanisme | Où | Comportement |
|---|---|---|
| Liste unique `#allPlansList` | `refreshPlansList` | Un seul flux trié : ⭐ épinglés, puis dernier ouvert, puis nom |
| Filtre nom | `#loaderPlansNameFilter` | Sous-chaîne sur nom et nom d'affichage, en RAM |
| Chips étiquettes | `#loaderPlansTagChips` | Union de **tous** les tags des plans visibles, triés, en `flex-wrap` sans plafond ; filtre en **OU** |
| Épinglage | `pinned` | Remonte en tête, un seul niveau |
| Repli mobile | `_ktaMobileCollapsePlans` | Sous 640 px, au-delà de 5 lignes : bouton « Tous mes plans (N) » |
| Colonne PC | `.loader-col-plans #myPlansBox` | `flex: 1 1 auto; min-height: 0` : la liste scrolle **dans** la colonne, la colonne ne grandit pas |

Les limites, mesurables dès 50 plans :

1. **Le bandeau de chips grandit avec le nombre d'étiquettes distinctes**, pas avec le nombre de plans. Vingt départements, dix matériaux, quelques statuts : quarante chips sur trois ou quatre lignes, **au-dessus** de la liste, dans une colonne dont la hauteur est fixe. Les chips mangent la place des lignes. C'est la contrainte de KARMA prise à l'envers.
2. **Le filtre est un OU plat.** « Gironde » ET « calcaire » n'est pas exprimable ; cocher deux chips élargit au lieu de réduire.
3. **Une étiquette n'est pas un lieu.** Elle qualifie un plan ; elle ne donne ni ordre, ni repli, ni compteur, ni « où j'en étais ». À 50 plans, l'utilisateur cherche un **rangement**, pas un attribut.
4. **Le repli mobile est global** (5 lignes, puis tout) : il n'y a pas d'intermédiaire entre « 5 » et « 80 ».
5. **Aucun état de navigation n'est mémorisé** : les filtres nom et chips sont en RAM, perdus au rechargement.

Conclusion : les étiquettes restent le bon outil pour **qualifier** (elles arrivent maintenant depuis les ZIP et depuis ConfAdmin) ; il manque un outil pour **ranger**. Les deux ne sont pas concurrents.

---

## 2. La contrainte de place, traduite en règles

- Le **sélecteur** vit dans la ligne de titre « 📚 Mes plans », à droite, comme le switcher Simple / Avancé du Générateur : **0 px ajouté** en hauteur.
- En mode Dossiers, chaque **en-tête de dossier** a la hauteur d'une ligne de plan (≈ 36 px). Les dossiers sont **repliés par défaut** sauf le dernier ouvert : à 8 dossiers, l'écran montre 8 en-têtes + les lignes d'un seul dossier — moins de hauteur que la liste plate, jamais plus.
- Le bandeau de chips **disparaît** en mode Dossiers (c'est lui qui déborde) ; le filtre par nom reste, il agit à l'intérieur des dossiers.
- Rien ne bouge en dehors de `#myPlansBox`. La Vue OSM, les Outils, Ajouter un plan ne sont pas touchés. Le mode par défaut reste TOUT : un utilisateur sans dossier voit **exactement** l'écran d'aujourd'hui.

---

## 3. Trois modèles possibles

### A — Dossiers physiques (rangement manuel)

Un dossier = une section nommée. Un plan appartient à **un** dossier au plus ; les autres vivent dans « Non classés ». On y met un plan par glisser (PC) ou par « Déplacer vers… » (partout).

- ✅ Modèle mental universel (explorateur de fichiers), zéro ambiguïté, un plan est à un seul endroit.
- ✅ Indépendant des étiquettes : marche pour qui ne tague rien.
- ❌ Travail manuel à 50 plans (mais une fois).
- ❌ Un plan « Gironde » et « calcaire » doit choisir son dossier.

### B — Dossiers intelligents (requêtes d'étiquettes sauvegardées)

Un dossier = une règle : « tous les plans étiquetés *Gironde* ». Un plan peut apparaître dans plusieurs dossiers ; aucun glisser.

- ✅ Zéro rangement manuel ; exploite les étiquettes qui arrivent désormais des ZIP et de ConfAdmin ; les nouveaux plans se rangent seuls.
- ✅ Exprime le ET (règle « Gironde » + « calcaire »).
- ❌ Ne sert à rien sans étiquettes ; un plan mal tagué est introuvable.
- ❌ « Déplacer un plan » n'a pas de sens : il faut éditer ses étiquettes. Ce n'est pas ce que KARMA décrit (« glisser »).

### C — Hybride : dossier manuel, avec une règle optionnelle *(recommandé)*

Un dossier est **d'abord** un rangement manuel (modèle A). Il peut porter, en option, une règle « inclut aussi les plans étiquetés X ». Un plan y est par glisser **ou** par sa règle ; le glisser vers un autre dossier **retire** l'appartenance manuelle et pose une exclusion locale si la règle le ramènerait.

- ✅ Couvre les deux usages de KARMA : « dossier Gironde » (règle sur l'étiquette) et « dossier Calcaire » (règle ou manuel), et « peu importe » (manuel pur).
- ✅ Un bouton « Créer un dossier depuis cette étiquette » sur une chip : la transition depuis l'existant est immédiate.
- ❌ Deux sources d'appartenance à expliquer. Mitigation : une ligne venue par règle porte un petit indicateur, et la fiche du dossier dit « N par règle, M placés à la main ».

Livrable en **deux marches** : d'abord A complet (sélecteur, sections, Déplacer vers, glisser PC), puis la règle par étiquette. La marche 1 est utile seule ; la marche 2 ne change ni le modèle ni l'écran.

---

## 4. Interaction — tactile d'abord, glisser en plus

Le glisser-déposer natif n'existe pas au doigt, et la colonne scrolle : un glisser tactile dans une liste qui défile est le geste le plus hostile du web mobile. La règle : **tout doit être faisable sans glisser**, le glisser est un raccourci PC.

| Geste | PC | Tactile |
|---|---|---|
| Ranger un plan | Glisser la ligne sur un en-tête de dossier (seuil de 6 px avant de démarrer, sinon c'est un clic → ouverture) | Menu **⋮** de la ligne → « 📁 Déplacer vers… » → feuille en bas listant les dossiers + « Nouveau dossier » |
| Ranger plusieurs plans | Idem, un par un ; ou « Sélectionner » dans l'en-tête → cases → « Déplacer N plans vers… » | Idem, même « Sélectionner » |
| Créer un dossier | Bouton « ➕ Dossier » en tête de mode Dossiers (même rangée que le sélecteur, ou dernière ligne de la liste) | Idem |
| Renommer, couleur, supprimer | ⋮ de l'en-tête de dossier | Idem |
| Replier / déplier | Clic sur l'en-tête | Tap sur l'en-tête |
| Réordonner les dossiers | Glisser l'en-tête | ⋮ → « Monter / Descendre » |

> ✏️ **Amendement du 16/09 (KARMA, sur mobile : « le glisser-déposer ne fonctionne pas »)** : le glisser existe aussi au doigt, par **appui long** (0,45 s immobile → la ligne se soulève, fantôme sous le doigt, vibration ; le défilement n'est bloqué que pendant le geste ; un doigt qui bouge avant fait défiler). « Déplacer vers… » reste la voie sans geste — par la sélection ☑ uniquement : le bouton 📁 par ligne a été **retiré** après la v1.95.0 (KARMA : « le glisser-déposer ou le bouton de sélection en haut suffisent »).

Règles qui évitent les pièges déjà rencontrés dans ce projet :

- **La ligne reste entièrement cliquable** (v1.71.0). Le glisser démarre après un seuil de déplacement, jamais sur `mousedown`. Sur tactile, aucun glisser sur les lignes : `touch-action` inchangé, la liste continue de défiler normalement.
- **Supprimer un dossier ne supprime jamais un plan** : ses plans retournent dans « Non classés ». Confirmation `ktaConfirm` comme pour le retrait d'un plan.
- **Le repli mobile** (`_ktaMobileCollapsePlans`, 5 lignes) devient **par dossier** en mode Dossiers : un dossier déplié montre 5 lignes puis « Tout le dossier (N) ». En mode TOUT, inchangé.
- **Les épinglés** restent en tête **de leur dossier**. Option : une section virtuelle « ⭐ Épinglés » en haut, non repliable, qui ne change pas leur appartenance.
- **« Non classés »** existe toujours, en dernier, tant qu'il n'est pas vide. Il ne se supprime ni ne se renomme.

---

## 5. Possibilités complémentaires (à retenir ou écarter)

1. **« Créer un dossier depuis cette étiquette »** sur une chip du mode TOUT : crée le dossier avec la règle (marche 2). C'est le pont entre l'existant et le nouveau, et la réponse directe au cas « dossier Gironde ».
2. **Import multiple → dossier de destination** : dans l'écran 📦, un sélecteur « Ranger dans : (Non classés) / Gironde / Nouveau dossier ». Vingt plans arrivent rangés.
3. **Dossier serveur automatique** : les plans découverts sur le serveur (`type === "server"`) dans un dossier « 🌐 Serveur » non supprimable, uniquement si l'utilisateur ne les a pas déplacés. Remplace la case « Afficher les plans serveur » en mode Dossiers (elle reste en mode TOUT). À trancher : ça touche au kiosque.
4. **Couleur ou emoji par dossier** : une pastille dans l'en-tête, reprise sur la ligne du plan en mode TOUT (petit carré avant le nom). Coût faible, lisibilité forte à 50 plans.
5. **Compteur et poids** dans l'en-tête : « Gironde · 12 plans · 340 Mo » (le poids est déjà connu par `fileSize`). Utile pour le quota, sujet récurrent.
6. **Mémoriser l'état** : mode courant, dossiers dépliés, dernier dossier ouvert — dans le registre (pas en RAM comme les filtres actuels). Le filtre par nom peut rester volatil.
7. **Recherche multi-plans** (barre d'en-tête) : inchangée, elle cherche des points, pas des plans. Pas d'impact.
8. **Vue OSM « Afficher par étiquette »** (v1.84.0) : pourrait proposer « Afficher le dossier Gironde » (tous ses plans géoréférencés). Plus tard ; le modèle le permet.
9. **Export de profil** : les dossiers voyagent avec le registre, comme `pinned` / `tags` / `displayName`. À l'import en mode Fusionner, un dossier de même nom est fusionné, pas dupliqué.
10. **Clavier PC** : flèches pour parcourir, Entrée pour ouvrir, `Suppr` sur un en-tête = supprimer avec confirmation. Bonus, pas requis.

À écarter : une arborescence à plusieurs niveaux (dossiers dans des dossiers). Un niveau suffit à 50-200 plans ; la profondeur casse le tactile et la contrainte de hauteur.

---

## 6. Modèle de données proposé (registre, rétro-compatible)

```js
// planRegistry — nouveau bloc, absent tant qu'aucun dossier n'existe
folders: [
  { id: "f_1a2b", name: "Gironde", color: "#8cb4ff", order: 0, collapsed: true,
    rule: { tags: ["gironde"] } }            // marche 2, optionnel
],
plansView: "all" | "folders",                 // mode courant, mémorisé
// sur chaque plan (métadonnée utilisateur, comme pinned / tags / displayName)
folderId: "f_1a2b",                           // absent = Non classés
folderExclude: ["f_1a2b"]                     // marche 2 : sorti à la main d'un dossier à règle
```

- `folderId` pointe sur un id **stable** : les ids de plans sont déterministes (nom + version), donc réimporter un plan le retrouve dans son dossier — mais **une nouvelle version change l'id** (`local_<nom>_<version>`). Le flux « 🔄 Mettre à jour » (v1.73.1) doit **reporter `folderId`** comme il reporte session et liaisons. C'est le point de couture le plus facile à oublier.
- Retirer un plan nettoie son `folderId` ; supprimer un dossier nettoie les `folderId` orphelins ; `init()` du registre tolère un `folderId` sans dossier (= Non classés), jamais d'erreur.
- Aucune migration : un registre sans `folders` rend le mode TOUT à l'identique.

---

## 6 bis. Profil et ConfAdmin — contrainte ajoutée par KARMA (16/09)

> « Doit être sauvegardé dans le profil (et exportable) et configurable depuis ConfAdmin, soit via import de profil, soit en live depuis la page. »

Les deux canaux existent déjà pour les étiquettes ; les dossiers les empruntent tels quels.

**Profil** `[Certain]` : l'export de profil embarque le registre entier (`pinned`, `tags`, `displayName` voyagent ainsi). `folders`, `plansView`, `folderId`, `folderExclude` sont des métadonnées du même registre : ils partent dans l'export **sans code dédié**. Ce qu'il faut écrire, c'est la **fusion** à l'import en mode Fusionner (`profileExportImport > applyProfile`, anti-doublon sur id des plans) : un dossier importé de **même nom** (insensible à la casse) qu'un dossier local est **le même** dossier — on rapproche les ids, on ne duplique pas ; en mode Remplacer, les dossiers importés remplacent les locaux. Un plan importé arrive avec son `folderId` ; si le dossier est absent du profil, il tombe en Non classés.

**ConfAdmin, en direct** `[Certain, format lu]` : `data/index.json` porte déjà par plan `id, name, version, author, multiLevel, tiledV2, tags`, édités dans `confadmin.html` (colonne `data-f="tags"`). Extension :

```json
{
  "folders": [ { "id": "gironde", "name": "Gironde", "color": "#8cb4ff", "order": 0 } ],
  "plans":   [ { "id": "citon", "path": "data/citon", "name": "Citon", "tags": ["gironde"], "folder": "gironde" } ]
}
```

- ConfAdmin gagne une liste de dossiers (nom, couleur, ordre) et, par plan, un sélecteur « Dossier ». Même écran, une colonne de plus.
- `decouvrirPlansServeur` applique `folder` avec la **doctrine v1.90.1** : origine `"index"`, jamais par-dessus un plan que l'utilisateur a **déplacé lui-même** (`folderSrc: "user"`). L'index propose, l'utilisateur dispose. Un plan retiré du dossier dans l'index en sort chez l'utilisateur **seulement** s'il y était par l'index.
- Les dossiers venus de l'index sont marqués `src: "index"` : renommables et supprimables localement ? **Reco : non** — un dossier serveur se replie et se réordonne, mais ne se renomme ni ne se supprime tant que l'index le déclare (sinon il reviendrait au boot suivant, le ping-pong exact de `version` en v1.88.0). Il redevient libre le jour où l'index ne le déclare plus.
- Kiosque « plans serveur uniquement » : c'est même le cas d'usage principal — un déployeur qui livre 60 plans **rangés**. Le sélecteur TOUT / DOSSIERS y reste visible ; le mode par défaut peut être forcé à Dossiers par `config.json` (une clé, comme `serverPlansOnly`).

**Priorité entre les trois sources**, à écrire une fois et à exécuter dans le garde-fou (7 scénarios, comme `check-plan-tags.js`) :

| Source | Marque | Peut être écrasée par |
|---|---|---|
| Geste de l'utilisateur (glisser, Déplacer vers) | `folderSrc: "user"` | personne |
| Index serveur (ConfAdmin en direct) | `"index"` | l'utilisateur ; l'index lui-même |
| Import de profil | prend la marque **contenue** dans le profil | selon sa marque |
| ZIP (`plan-config`) | — | **non retenu** : un dossier est un rangement chez l'utilisateur, pas une propriété du plan ; les étiquettes du ZIP suffisent, et la règle par étiquette (marche 2) fait le lien |

Cette contrainte ne change pas la recommandation (C en deux marches) ; elle ajoute à la marche 1 : `folderSrc`, la colonne ConfAdmin, l'application à la découverte, la fusion par nom à l'import de profil, et une clé de kiosque pour le mode par défaut. Effort marche 1 : ≈ 2,5 jours.

---

## 7. Contraintes et risques

| Sujet | Risque | Réponse |
|---|---|---|
| **Hauteur** (contrainte stricte) | Des dossiers tous dépliés dépassent la liste plate | Repli par défaut, un seul déplié à la fois en option « accordéon », repli mobile par dossier. Le checkup `checkup-home-scroll.js` mesure déjà `#panelZip` ; ajouter la mesure de `#myPlansBox` en mode Dossiers avec 8 dossiers et 60 plans |
| Ligne cliquable **et** glissable | Un glisser raté ouvre un plan ; un clic hésitant démarre un glisser | Seuil de 6 px, `dragstart` uniquement PC (`pointer: fine`), jamais sur tactile |
| Re-rendu | `refreshPlansList` reconstruit tout le HTML ; à 200 plans avec survol de glisser c'est lourd | Le survol ne re-rend pas : classe CSS sur l'en-tête cible ; re-rendu seulement au dépôt |
| **Mise à jour d'un plan** (nouvel id) | Le plan « sort » de son dossier | Reporter `folderId` dans le flux Mettre à jour + garde-fou qui l'exécute |
| Export / import de profil | Doublons de dossiers, ids en collision | Fusion par nom insensible à la casse en mode Fusionner ; remplacement en mode Remplacer |
| Découverte serveur | `addOrUpdate` fusionne : `folderId` survit (merge `Object.assign`) — à vérifier, pas à supposer | Contrôle dans le garde-fou |
| Kiosque « plans serveur uniquement » | Les dossiers sont une métadonnée locale : autorisés | Rien à fermer, mais le dire dans `community-server-line.md` |
| i18n | Une dizaine de clés ×3, feuille « Déplacer vers » | `check-i18n` parité stricte |
| Thème clair | En-têtes de dossier, pastilles, zone de dépôt survolée | Variante `html.kta-theme-light` dès la marche 1, pas après |
| Doc 4 axes | README_USER ×3, aide bibliothèque ×3, AI_CONTEXT, `session-data.md` (registre) | À livrer avec la marche 1 |

Effort estimé `[Probable]` : marche 1 (A complet + sélecteur + ⋮ Déplacer vers + glisser PC + mémorisation + doc + garde-fou + checkup hauteur) ≈ 2 jours ; marche 2 (règle par étiquette + « dossier depuis cette chip » + destination dans l'import multiple) ≈ 1 jour.

---

## 8. Décisions prises — KARMA, 16/09/2026 (QCM, les 9 recos retenues)

| # | Décision | Choix |
|---|---|---|
| 1 | Modèle | **C — hybride, en deux marches** (manuel d'abord, règle par étiquette ensuite) |
| 2 | Appartenance | **Un plan dans un seul dossier**, « Non classés » sinon |
| 3 | Dossier « 🌐 Serveur » automatique | **Plus tard** (kiosque à étudier à part) |
| 4 | Épinglés ⭐ | **En tête de leur dossier**, pas de section virtuelle |
| 5 | Sélection multiple (Déplacer N plans) | **Marche 1** |
| 6 | Import multiple → dossier de destination | **Marche 2** |
| 7 | Couleur / emoji par dossier | **Marche 1** |
| 8 | Dossiers venus de l'index serveur | **Verrouillés** tant que l'index les déclare (repliables, réordonnables ; ni renommables ni supprimables) |
| 9 | Mode par défaut forçable par le kiosque | **Oui**, une clé `config.json` |
| 10 | Suite | **Topo technique d'abord** (§9), puis code |
| 11 | Sélecteur TOUT / DOSSIERS | **Toujours visible** dès qu'il y a un plan (KARMA : « sinon on ne pourra jamais créer le premier dossier ») |

---

## 9. Topo technique — marche 1 (à valider avant la première ligne)

### 9.1 Données — `js/planRegistry.js` (une seule source de vérité)

Le magasin `myktamap_plans` est déjà `{ version, lastPlanId, plans[] }`. Ajout de deux clés au même niveau, absentes tant qu'aucun dossier n'existe :

```js
folders:   [{ id, name, color, order, collapsed, src: "user"|"index" }]
plansView: "all" | "folders"
// par plan (métadonnée utilisateur, même famille que pinned / tags / displayName)
folderId, folderSrc: "user"|"index"
```

API nouvelle, dans le style de `setTags` / `setPinned` : `getFolders()`, `createFolder(name, color, src)`, `renameFolder`, `setFolderColor`, `deleteFolder(id)` (→ ses plans en Non classés, refus si `src === "index"`), `moveFolder(id, delta)`, `setFolderCollapsed`, `setPlanFolder(planId, folderId|null, origine)` (même doctrine que `setTags` : `"index"` ne passe jamais par-dessus `"user"`), `setPlansView`. `init()` tolère un `folderId` orphelin (= Non classés). `remove(id)` ne touche à rien : l'entrée disparaît avec son `folderId`.

Ce qui **ne change pas** : l'id d'un plan mis à jour est conservé (`main.js:1317`, `meta.planId`), donc `folderId` survit à « 🔄 Mettre à jour » par le merge de `addOrUpdate` — à **vérifier par le garde-fou**, pas à supposer. La découverte serveur passe aussi par `addOrUpdate` (merge) : `folderId` survit de la même façon.

### 9.2 Écran — `index.html > #myPlansBox` + `js/homeLoader.js`

- **Sélecteur** dans `.loader-section-head` (déjà `display:flex; justify-content:space-between`) : à droite du titre, deux boutons « Tout | Dossiers », classe du switcher du Générateur (`kta-planner-mode-btn`, déjà stylé dark + clair). 0 px de hauteur ajouté. Masqué tant que `folders` est vide **et** que l'utilisateur n'a pas cliqué « ➕ Dossier » — non : **toujours visible** dès qu'il y a ≥ 1 plan, sinon personne ne découvre la fonction. Le bouton « ➕ Dossier » vit dans la même rangée, uniquement en mode Dossiers.
- **Rendu** : `refreshPlansList` garde son pipeline (serveur → nom → chips → tri → `planRowHTML`). En mode Dossiers : les chips sont masquées, le tri s'applique **par dossier**, la sortie est `[en-tête dossier][lignes]…[Non classés]`. `planRowHTML` inchangé, plus un carré de couleur devant le nom (en mode TOUT aussi, décision 7).
- **En-tête de dossier** : hauteur d'une ligne de plan, `▸/▾ ● Nom · N`, ⋮ (renommer, couleur, monter/descendre, supprimer — grisés si `src: "index"`). Clic = replier/déplier, état persisté.
- **Sélection multiple** (décision 5) : bouton « ☑ Sélectionner » dans la rangée du sélecteur ; les lignes gagnent une case à gauche ; barre d'action en pied de liste « Déplacer N vers… · Annuler ». Le clic sur une ligne coche au lieu d'ouvrir tant que le mode est actif. Pas de réutilisation de `selectionMulti.js` (il désigne des vecteurs sur la carte, autre contexte).
- **Déplacer vers…** : feuille `ktaConfirm`-like en bas (tactile) ou popover (PC), liste des dossiers + « Non classés » + « Nouveau dossier ».
- **Glisser PC** : `draggable` posé sur `.plan-row` **seulement** si `matchMedia("(pointer: fine)")` ; `dragstart` après un seuil de 6 px via `pointerdown/move` ; cibles = en-têtes de dossier + zone « Non classés » ; classe `kta-drop-cible` au survol, **aucun re-rendu** avant le `drop`. Sur tactile : rien, la liste défile comme aujourd'hui.
- **Repli mobile** (`_ktaMobileCollapsePlans`) : en mode Dossiers, appliqué **par dossier déplié** (5 lignes puis « Tout le dossier (N) »).

### 9.3 Index serveur et ConfAdmin — `data/index.json`, `confadmin.html`, `main.js > decouvrirPlansServeur`

- Format : `folders: [{ id, name, color, order }]` en tête d'index, `folder: "<id>"` par plan.
- ConfAdmin : un tableau « Dossiers » (nom, couleur, ordre, ➕/🗑️) au-dessus du tableau des plans, une colonne « Dossier » (select) par plan. `_construire()` émet les deux clés seulement si non vides.
- Découverte : `createFolder(…, "index")` pour chaque dossier déclaré (mise à jour nom/couleur/ordre si déjà là avec `src: "index"`) ; dossier `src: "index"` **plus déclaré** → devient `src: "user"` (libéré, jamais supprimé). Par plan : `setPlanFolder(id, folder, "index")`, qui ne touche pas un `folderSrc: "user"` ; plan retiré du dossier dans l'index → sort **seulement** s'il y était par l'index.
- Kiosque (décision 9) : `config.json > plansViewDefault: "folders"` lu dans `_appliquerConfigKiosque`, appliqué **seulement** si l'utilisateur n'a jamais choisi (`plansView` absent). Documenté dans `community-server-line.md`.

### 9.4 Profil — `js/profileExportImport.js > applyProfile`

Le registre part entier : rien à faire à l'export. À l'import, section Registry : mode Remplacer → `store.folders = s.registry.folders`; mode Fusionner → fusion **par nom insensible à la casse** (l'id importé est remappé sur l'id local, et les `folderId` des plans importés suivent le remappage). Les plans déjà présents ne sont pas modifiés (règle existante « anti-doublon sur id ») : leur rangement local gagne.

### 9.5 Garde-fous et preuves

- **`scripts/check-plan-folders.js`** (pré-commit, bloquant) : exécute `setPlanFolder` avec origines (7 scénarios, comme `check-plan-tags.js`), exécute la fusion de profil par nom (ids remappés), vérifie que `deleteFolder` refuse `src: "index"` et renvoie les plans en Non classés, que `draggable` est conditionné à `pointer: fine`, que le sélecteur vit dans `.loader-section-head`, que ConfAdmin émet `folders`/`folder`, textes ×3, `data-formats.md` (format d'index) à jour. Sabotages rejoués.
- **`scripts/smoke/checkup-home-scroll.js`** : une configuration de plus, **mode Dossiers avec 8 dossiers et 60 plans** — mesure que `#myPlansBox` ne dépasse pas sa hauteur en mode TOUT avec les mêmes plans (c'est la contrainte stricte, prouvée au pixel), et que le bouton primaire reste visible.
- **Smoke nouveau** `checkup-plan-folders.js` : index.json avec 2 dossiers → découverte → dossiers verrouillés ; déplacement manuel d'un plan → redécouverte → il reste où l'utilisateur l'a mis ; export de profil → import Fusionner sur un registre qui a un dossier homonyme → un seul dossier.

### 9.6 Doc des 4 axes (livrée avec la marche 1)

README_USER ×3 (section « Mes plans » : le sélecteur, les dossiers, Déplacer vers, sélection, ce qui vient du serveur), aide bibliothèque ×3, AI_CONTEXT (règle « l'index propose, l'utilisateur dispose » étendue aux dossiers, à expliquer si « mon dossier revient »), `data-formats.md` (index.json), `community-server-line.md` (clé kiosque), `session-data.md` (registre), NETWORK_AUDIT inchangé (aucune requête nouvelle : l'index est déjà lu).

### 9.7 Ordre de livraison et bump

Une seule release pour la marche 1, bump **v1.95.0** (feature visible), notes `version.json` en deux phrases. Ordre interne : registre + garde-fou → écran (sélecteur, en-têtes, Déplacer vers, sélection) → glisser PC → index/ConfAdmin/kiosque → profil → checkups → doc. Le sélecteur n'apparaît dans l'écran qu'à l'avant-dernière étape : tant qu'il n'est pas là, l'accueil est **strictement** celui d'aujourd'hui.

Hors périmètre marche 1 (marche 2, ≈ 1 j) : règle par étiquette sur un dossier, « Créer un dossier depuis cette chip », dossier de destination dans l'import multiple, `folderExclude`.
