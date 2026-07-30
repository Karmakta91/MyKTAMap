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
- Guide déployeur : `docs/applications/SELFHOST.md`. Licence CC BY-NC-SA 4.0 :
  un kiosque commercial nécessite un accord de l'auteur.
