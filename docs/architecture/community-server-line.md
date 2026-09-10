# Architecture MyKTAMap — Frontière community & mode serveur « kiosque »

> **Document de gouvernance, figé le 30/07/2026 (décision KARMA, topo « mode serveur »).**
> Toute modification de ce périmètre = arbitrage explicite de KARMA, jamais un choix
> d'implémentation. Référencé par CLAUDE.md (§ Frontière community ↔ pro).

---

## 1. La promesse community (non négociable)

**« La seule promesse de community, c'est PAS DE BACKEND. »** (KARMA, 30/07/2026)

Ce repo produit une app **100 % statique** :
- servable par n'importe quel hébergement de fichiers (FTP, GitHub Pages, Docker nginx, clé USB) ;
- **aucun code serveur**, aucune API, aucune base de données côté serveur ;
- **aucun compte utilisateur**, aucune authentification, aucune synchronisation cloud ;
- toutes les données utilisateur restent dans le navigateur (localStorage / IndexedDB) ;
- gratuite, **sans bridage** : aucun flag ne verrouille une capacité derrière un paiement.

## 2. Le mode serveur « kiosque » — ce qu'il EST

Un déployeur (asso, collectif — archétype « serveur Gironde ») copie l'app statique et
pré-installe **ses plans** dans `data/` + un `data/index.json` enrichi (généré par
`confadmin.html`). C'est **la même app**, avec de la configuration de contenu :

| Capacité | Vecteur | Statut |
|---|---|---|
| Plans pré-installés | `index.json > plans[]` | depuis toujours (auto-discovery) |
| Liaisons inter-plan fournies | `index.json > liaisons` (merge par id, ids `server_<id>`) | v1.73.0 |
| Sous-titre personnalisé (ex. « Gironde ») | `index.json > config.subtitle` | v1.73.0 |
| Masquer l'import de plans | `index.json > config.serverPlansOnly` | v1.73.0 |
| Masquer le Générateur | `index.json > config.disableGenerator` | v1.73.0 |
| Étiquettes proposées par plan | `index.json > plans[].tags` (12 × 24 car.) | v1.90.1 |
| Mot de passe d'accès de l'instance | `index.json > config.accessHash` (SHA-256) | v1.90.6 |

**Règle des 2 flags** : `serverPlansOnly` et `disableGenerator` sont les DEUX SEULS
flags de comportement kiosque. Tout flag supplémentaire = topo + décision KARMA
consignée ici. Les flags sont du **désencombrement d'interface** (déclutter), PAS de
la sécurité ni du bridage : contournables via la console, et c'est assumé — les
données de l'utilisateur final lui appartiennent toujours (sessions, carnet, notes,
photos restent locales et exportables).

## 3. Ce qui n'entrera JAMAIS ici (périmètre exclu)

- Backend / API / comptes / sync cloud / multi-tenant / télémétrie.
- **Branding complet (white-label)** : logo, nom d'app, thème de marque, domaine.
  La limite community est UN champ texte : `config.subtitle` (le nom « MyKTAMap »
  et la charte restent). Au-delà → hors de ce repo.
- Gestion de droits, plans payants, quotas.
- Tout pointeur vers du code externe privé (règle CLAUDE.md : pas de `TODO pro:`).

## 4. Invariants d'implémentation

- `confadmin.html` : outil déployeur **statique et local** (rien n'est uploadé),
  à la racine, **jamais dans `ASSETS_TO_CACHE`**, pas de lien depuis l'UI de l'app.
- `data/index.json` : champs inconnus **ignorés** par les vieilles versions
  (rétrocompat totale — un index enrichi est valide partout). Servi **network-first**
  par le SW (fallback cache offline) pour que les changements d'un kiosque se
  propagent sans réinstallation. Format détaillé : `plans-loader.md`.
- Les liaisons kiosque sont **fusionnées** dans le registre local (`importLinks`,
  dédup par id) : l'utilisateur peut en créer d'autres ; une liaison retirée côté
  serveur ne disparaît PAS chez ceux qui l'ont déjà (assumé, documenté SELFHOST.md).
- **Tags de l'index (v1.90.1) — « l'index PROPOSE, l'utilisateur DISPOSE »** : `decouvrirPlansServeur`
  n'écrit `plans[].tags` que si l'entrée du registre ne porte pas `tagsSrc === "user"`.
  🩸 La découverte tourne à CHAQUE boot : une écriture inconditionnelle écraserait les
  tags de l'utilisateur en silence, boot après boot — le ping-pong exact corrigé en
  v1.88.0 sur `version`/`versionSrc`. Symétrique : **vider ses tags est un choix**, la
  trace du refus (`tagsSrc = "user"` sans `tags`) survit, sinon l'index les repropose.
  Le kiosque reste maître de ce qu'il a lui-même posé : retirer les tags de l'index
  retire ceux marqués `tagsSrc === "index"`. Normalisation unique : `PlanRegistry.setTags`
  (trim, 24 car., dédup insensible à la casse, 12 max) — `confadmin.html` applique les
  MÊMES règles, et `check-tags-index.js` compare les deux en les exécutant.
- **Licence pro locale ≠ passe-droit sur instance protégée (v1.90.8)** : quand `accessHash` est publié,
  une licence pro de **source `"local"`** (fichier importé par l'utilisateur, cf. `proLicense.js`) n'ouvre
  plus la gate — sinon elle contournerait le mot de passe. Enforcement : `main.js` refuse le bypass de boot
  si `getSource() === "local"` **et** `UnlockGate.instanceRequiertMotDePasse()`, et la gate retire le bloc
  d'import (`.kta-licence-community`) plus un refus au clic (`_instanceProtegeeGate`). 🩸 v1.90.9 — la source
  `"server"` NE bypasse PLUS non plus : fetchée pour tous les visiteurs, elle rendait l'`accessHash` muet.
  Quand l'instance impose un mot de passe, `main.js` refuse le bypass **quelle que soit la source** ; la
  licence n'accorde que le mode pro, après la gate. Seule une instance SANS `accessHash` laisse la licence
  serveur bypasser (pas de gate à contourner).
- **Le verrou kiosque est AU GOULOT, pas sur un bouton (v1.90.1)** : `window.ktaKiosqueServeurSeul()`
  est le point unique de décision ; `ouvrirImportModale` refuse avant même de lire le
  fichier. 🩸 Deux trous réels : l'import de PROFIL restaurait les archives ZIP (la
  restriction se contournait par la porte d'à côté), et un profil transporte
  `myktamap_loader_show_server_plans` — importé à `false` sur un kiosque, il masquait les
  plans serveur **dont la case de réglage est justement cachée par le mode** : accueil
  vide, aucun moyen d'en sortir. La branche kiosque remet donc `show_server_plans` à true
  et `skip_server_plans_v1` à false, **et l'index est chargé AVANT que la pref de skip ne
  soit lue** (sinon le remède n'agissait qu'au démarrage suivant). ⚠️ Cela reste du
  déclutter, pas de la sécurité : contournable en console, et c'est assumé.
- **ConfAdmin sait REPRENDRE un `index.json` existant (v1.90.1)** : sans ça, éditer une
  étiquette sur un parc déjà en ligne obligeait à redéposer tous les ZIP et à retaper
  chaque nom. Les liaisons d'un index repris sont **reposées telles quelles** tant
  qu'aucune liaison locale n'est sélectionnée — sur une machine sans registre, un index
  rechargé pour corriger un tag serait redescendu SANS ses liaisons.
- **Mot de passe d'instance (v1.90.6, EXCLUSIF depuis v1.90.7)** :
  `config.accessHash` (SHA-256, validé `/^[0-9a-f]{64}$/` avant tout usage), **quand il est publié, est le
  SEUL qui ouvre** — le `HASH_VALIDE` communautaire ne vaut plus que sur une app sans `accessHash`.
  🩸 La v1.90.6 acceptait les DEUX (either/or) : trou signalé par KARMA, le code communautaire étant
  distribué largement, il aurait ouvert n'importe quelle instance privée. Enforcement en DEUX points —
  refus au submit (`okCommunaute = !hashInstance && …`), et révocation au boot (`revaliderInstance` retire
  un accès communautaire hérité dès que l'instance publie un hash). 🔒 **Le niveau de sécurité ne change pas** : le hash est dans un fichier
  **public**, brute-forçable hors ligne — exactement comme le hash communautaire, lisible sur GitHub.
  Barrière sociale, jamais une authentification, et le dire fait partie du contrat.
  - 🩸 **`isUnlocked()` ne peut PAS se contenter de comparer le stocké au hash publié** : sur un navigateur
    vierge les deux valent `null`, et l'app s'ouvrirait pour tout le monde. Le hash d'instance accepté est
    donc mémorisé dans `myktamap_unlock_instance_v1`, et la comparaison exige les deux valeurs non vides
    **et** la forme valide.
  - 🩸 **Cette mémoire est ce qui rend l'accès utilisable HORS LIGNE** : sans elle, un visiteur entré par le
    mot de passe de l'instance serait reverrouillé au premier démarrage sans réseau — soit précisément là où
    l'app sert le plus.
  - 🩸 **`revaliderInstance(hash, indexRepondu)` prend un second paramètre EXPRÈS.** `null` veut dire deux
    choses incompatibles — « le déployeur a retiré le mot de passe » (reverrouiller) et « l'index est
    injoignable » (ne rien toucher). La fonction ne peut pas les deviner : l'appelant le déclare. La
    première version reposait sur la discipline d'un site d'appel distant de 1800 lignes, et un futur appel
    de bonne foi aurait reverrouillé l'app à la première coupure réseau.
  - ⏱️ **La rotation prend effet au démarrage SUIVANT** : la revalidation vit après la gate dans l'ordre du
    boot, et couper quelqu'un au milieu de son relevé pour un changement de mot de passe serait pire que le
    délai d'un boot.
  - ⚡ **Zéro requête ajoutée pour qui est déjà entré** : l'index n'est demandé que depuis la saisie de la
    gate, et seulement si le code communautaire a échoué.
  - ⚙️ `confadmin.html` calcule le hash localement et n'écrit **jamais** le mot de passe ; à la reprise d'un
    index existant le champ reste **vide** (un hash ne remonte pas en mot de passe) et le hash repris est
    conservé tant qu'on ne tape rien. `crypto.subtle` exigeant un contexte sûr, une ouverture en `file://`
    ou en HTTP simple est **signalée** au lieu de produire un index sans hash en silence.
- Guide déployeur : `docs/applications/SELFHOST.md`. Licence CC BY-NC-SA 4.0 :
  un kiosque commercial nécessite un accord de l'auteur.
