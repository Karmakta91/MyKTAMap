# 📗 Audit du guide utilisateur — v1 (03/10/2026)

> **Objet** : `docs/applications/README_USER.md` (FR, 313 k caractères, 3 831 lignes ; EN et ES suivent la même structure).
> **Demande KARMA** : pertinence et agencement de chaque rubrique ; retrait du bruit (commentaires, historique,
> avertissements défensifs) ; toute fonction optionnelle et désactivée par défaut → « 🔭 Pour aller plus loin » ;
> cas du Mode Secours. **Priorité : éviter l'indigestion de l'utilisateur.**
> **Méthode** : 5 lectures intégrales en parallèle (tranches 1-793, 794-1429, 1430-2079, 2080-3101, 3102-fin) +
> inventaire des valeurs par défaut **dans le code** (preuves fichier:ligne). Lecture seule.
> **Version auditée** : `Karma_dev` après `e88267e` (v1.99.5 + ménage du 03/10).

---

## 0. À corriger avant tout ménage — le guide dit faux

| # | Problème | Lignes | Preuve |
|---|---|---|---|
| F1 | **Donnée réelle** : des noms de carrières réelles servent d'exemple au mode multi-niveau | 2695 | lecture |
| F2 | **Donnée réelle probable** : coordonnées GPS à 6 décimales en exemple de « Copier ma position » | 1512 | lecture (point non identifié) |
| F3 | **Promesse réseau contradictoire** : « le seul accès externe est la mise à jour » (26) et « Vue OSM seulement si tu l'actives » (63) — or la Vue OSM est **active par défaut** et interroge OpenStreetMap (421, et code `osmHomePreview.js:438` `!== "0"`) | 26, 63, 421 | code |
| F4 | **« Ping de connectivité Google »** : n'existe plus depuis v1.9.3 (test sur `ping.html`, même origine) | 762 | `interfaceMaintenance.js:175-197` |
| F5 | **Modes 🌟 Qualité / 🎯 Équilibré / ⚡ Performance** encore conseillés alors qu'ils ont été retirés | 413, 685, 687, 736, 3326, 3427, 3441-3448, 3790-3797 | guide l.494 + code |
| F6 | **ULTRA dit « global »** (il est par plan) ; tableau à 6 options (il y en a 7 : manque la limite de dézoom mobile) | 3425, 3397-3423, 3525 | `perfUltra.js`, `interfaceConfig.js:96` |
| F7 | **Renvois morts** : « Réglages > Logs détaillés » (retiré, derrière le Mode Développeur), « Désactiver le tuilage » dans un « Mode performance » de Configuration qui n'existe plus | 3300-3306, 3781, 3826 | guide l.427 |
| F8 | **Mode Secours** : « étape passée sans statut = 🟢 RAS » est faux (« Passée, non renseignée ») ; le tableau des 8 statuts oublie ce statut | 1888, 1905 | `secoursMode.js:256` |
| F9 | **Mode Secours** : l'export `.mkmsec.json` (scénario → équipes) n'est décrit nulle part ; la l.1595 attribue l'aller au fichier de rapport | 1587-1595 | lecture + code |
| F10 | « Une version future pourra supporter 3+ points » alors que le point C est documenté | 2993 / 3027 | lecture |
| F11 | « Tracker **GPS** » (l'app est sans GPS) ; « 3 sources » puis 5 listées (éditeur de données) | 518, 3055 | lecture |

## 1. Le diagnostic « indigestion »

- **Le bruit est partout** : ~45 « désormais / maintenant / avant / plus de / n'est plus / depuis vX / 🆕 » ;
  ~20 avertissements défensifs (« ⚠️ X n'est PAS ici », « n'apparaît pas », « a disparu ») ; ~12 maquettes ASCII
  d'écrans qui se périment (l'une montre déjà 7 statuts sur 8) ; jargon de développeur (fichiers `js/`, clés
  `myktamap_*`, IndexedDB, Service Worker, CSP, « runtime », « payload », « rétro-compat » ×8, « via Pathfinder » ×4,
  px internes, formats CSV/JSON) ; comptages qui vieilliront (« 38 succès », « 13 groupes », « 27 cartes », « 6 cells »).
- **L'agencement suit l'historique des livraisons, pas le parcours de l'utilisateur** :
  - « 🚀 Premiers pas » fait **610 lignes** : installation, profil, liste de plans, réglages, carnet, dépannage, audit réseau.
  - « 📍 Tracker » abrite les Filtres, l'Itinéraire, le tableau de triage des urgences et le Mode Secours.
  - Le **Mode Secours** fait **48 k (15 %)**, en 5 sections calquées sur ses vagues de livraison ; 7 encarts empilés
    version après version (« Ce que le terrain a changé (v1.98.24) », « Couverture honnête (v1.98.25) »).
  - Les 4 outils d'urgence sont dispersés (un `##` isolé, deux `###` sous Tracker, un tableau de triage sous Itinéraire).
- **Doublons** (§6) : la même information à 2 à 7 endroits, parfois contradictoires.

## 2. Règles d'écriture à appliquer (et à garder)

1. **État actuel seulement.** Pas d'historique, pas de « avant / désormais / nouveau / depuis vX ». L'historique vit dans `README.md` et Git.
2. **Pas de défensif.** On dit où est une fonction, jamais où elle n'est pas.
3. **Langage d'utilisateur.** Pas de nom de fichier, de clé, de module, de format interne, de pixel interne. Exception : le chapitre « Pour aller plus loin » (administrateurs, créateurs de plans).
4. **Une information à un seul endroit**, des renvois d'une ligne ailleurs.
5. **Pas de maquette ASCII ni de comptage qui vieillira.**
6. **Tutoiement partout** (plusieurs sections sont en « vous »).
7. **Toute fonction désactivée par défaut, ou réservée aux créateurs / administrateurs → « 🔭 Pour aller plus loin »**, avec une ligne de renvoi là où l'utilisateur la chercherait.

## 3. Plan cible

Volume [Supposition, estimations des auditeurs] : corps du guide ~110 k (contre ~270 k), « Pour aller plus loin » ~70 k.

| Chapitre | Contenu | Vient de |
|---|---|---|
| 📖 Le topo | condensé (−40 %) ; corriger F3 | 7 |
| 🙏 Remerciements | condensé (−50 %) : une ligne par bibliothèque, sans jargon ; supprimer le doublon « Crédits » (86) et « À l'assistant » (74) | 42 |
| 🔴 Avant de descendre | confidentialité (+ audit réseau condensé, 747), avertissement tracker, alertes publiques (−50 %) | 93, 747 |
| 🚀 Premiers pas | installer (mobile + limites de stockage simplifiées, PC), charger un plan, **préparer une sortie hors connexion**, réimporter un plan | 180-235, 689 |
| 🆘 Urgence sous terre | tableau de triage en tête → 4 réflexes (un seul « boussole, carte, prévenir » au lieu de 5) → 🚪 Sortie d'urgence → Affichage XL → ⛑️ Je suis perdu → encart 3 lignes « quelqu'un d'autre est perdu → Mode Secours » | 856, 1419, 1430, 1500 |
| 🗺️ Utiliser la carte | interface (+ barre du bas), lire le plan, ≡ Filtres (sortis du Tracker), légende + personnaliser, changer de plan, coordonnées GPS | 504, 904, 995, 1244, 3481, 1028 |
| 🔍 Chercher | recherche unifiée (sans « Rendu groupé » ASCII) + multi-plans | 1052, 984 |
| 📍 Se repérer | Tracker : menu, démarrer, recaler, boussole (−40 %), réglages | 1146-1305 |
| 🧭 Itinéraire | `##` à part : calcul, vivant, guidage, évitement, inter-plans | 1321-1418, 963-969 |
| 🌀 Plans liés | liaisons (cœur seulement) | 936 |
| ✏️ Annoter | points (+ bulle d'un point, photos), tracés, zones, structures, convertir ; **un seul encadré « Effacer / annuler »** au lieu de 6 ; Undo ; mesure | 2080, 2331-2692 |
| 🌍 Vue OSM · 📖 Mode Histoire | condensés | 794, 818 |
| 📔 Mes sorties et mes données | sauvegarde auto, Carnet (`##` propre, doublon distance fusionné), stats de session, profil et stats (−50 %) | 541, 556, 2303, 236 |
| ⬆️ Sauvegarder et partager | Full, Avancé, PNG, PDF ; import ; export de profil | 2830, 3033, 321 |
| ⚙️ Mes plans et réglages | liste de plans (nettoyée), Configuration (l'app), Réglages (ce plan), calibrer l'échelle | 348, 411, 3491, 3544 |
| 📚 Aide et documentation | tutoriel, recherche dans la doc, Aide IA | 3452 |
| 🆘 En cas de problème | **FAQ unique** : l'app s'arrête, un plan ne charge pas, tout réinitialiser (+ code avant reset), page de secours | 679, 704, 725, 3597, 3785 |
| 🔭 Pour aller plus loin | voir §4 | — |

## 4. « 🔭 Pour aller plus loin » — ce qui y entre

**Fonctions désactivées par défaut** (défaut vérifié dans le code — preuves dans l'inventaire de l'audit) :

| Fonction | Défaut | Portée | Aujourd'hui dans le guide |
|---|---|---|---|
| Replay, Heatmap, Batterie, Vibration | OFF | appareil | 🧩 Fonctionnalités optionnelles (2136) |
| Navigation intelligente | OFF | **par plan** | 1306 |
| Plan orienté | OFF | appareil | 1190 (un `####` dans une citation) |
| Commandes vocales | OFF | appareil | 3522 |
| Itinéraire via plusieurs plans | OFF | appareil | 969 |
| Code PIN / Face ID | OFF | appareil | 3558 |
| Mode hors-ligne strict | OFF | appareil | 774 |
| Mode incognito | OFF | fenêtre | 3533 |
| Magnétisme au dessin, cercles aux intersections, panneaux ancrés | OFF | appareil / par plan | 432 |
| Mode Performance ULTRA (7 options) | OFF | par plan | 3397 |
| Mode Développeur, état mémoire, logs | OFF, mot de passe | appareil | 427, 435, 3775 |
| Ignorer les plans du serveur | OFF | appareil | 447 |

**Restent dans le corps** (actifs par défaut) : guidage (auto), Vue OSM (active), Carnet (actif), mémorisation des
plans (active), icônes au zoom (actif), aide contextuelle ❓ (active). **Écran allumé** : OFF mais la case est
pré-cochée au démarrage du tracker → garder une ligne dans le Tracker.

**Publics à part** :
- **🏗️ Pour les créateurs de plans** : Générateur (nouveau, modifier, image vierge), GeoTIFF / SIG, datalayer + photos
  (fusionnés), conversion V2 tuilée, optimiser son plan (avec le doublon « Découpage de l'image » 473 fusionné),
  multi-niveau côté créateur (activation, calques, JSON `level`), éditeur de données, conversion / fusion à l'export,
  calibrage KMZ. L'**import de plusieurs plans** (3108) revient dans « Mes plans » : il se lance de l'accueil.
- **🖥️ Héberger l'app** (Docker réduit à une commande + lien, découverte des plans serveur), **💼 Édition pro**,
  **🛡️ Plans révoqués** (côté utilisateur : quoi faire devant la fenêtre rouge — SHA-256 et empreintes supprimés).
- **🚑 Mode Secours** : décision KARMA (§5).

## 5. Mode Secours

**Constat** : mode à part [Probable] — préparation, plusieurs téléphones avec le même plan, rôle d'opérateur, échange
de fichiers ; le cataphile courant ne l'ouvrira pas en sortie.

**Plan cible du chapitre** (suit le parcours de l'opérateur, pas les vagues) — ~16-18 k au lieu de 48 k (−65 %) :

```
## 🚑 Mode Secours — coordonner une recherche
   > 4 lignes : pour qui, quand, prérequis (même plan partout, hors-ligne), « prépare-le à froid »
### Comment ça s'organise — 3 rôles + cycle préparer → transmettre → suivre → clôturer
### 1. Préparer un scénario — créer (Tracker ou ⛑️), équipes, parcours / zone / itinéraire, couverture, phases
### 2. Transmettre avant de descendre — .mkmsec.json, hors-ligne (plan + carte OSM), PDF équipes, KMZ
### 3. Sur le terrain — lancer et choisir son rôle ; côté équipe ; côté opérateur ; victime trouvée
### 4. Secours extérieurs — briefing pompiers, accès numérotés, GPS surface
### 5. Clore et faire le rapport — clore une phase, importer les rapports (fusion, annuler), rapport final
```

Partent ailleurs : enregistrement hors-ligne de la carte OSM et filtre des tags (→ Vue OSM), pause entre arrêts
(→ Itinéraire), tag « Point d'entrée » (→ Légende / Sortie d'urgence). Supprimés : « Cycle complet typique »
(la structure le donne), maquettes ASCII, « 43 styles », « JPEG q85 », « opacity 0.75 ».

## 6. Doublons principaux

| Sujet | Endroits | Garder |
|---|---|---|
| Tout réinitialiser | 725, 3597 | un seul, dans « En cas de problème » |
| Dépannage | 679, 704, 3785 | FAQ unique |
| Découpage de l'image | 473, 3378 | « Pour les créateurs » |
| ULTRA | 425, 3397, 3525 | « Pour aller plus loin », renvois ailleurs |
| Logs / Mode Développeur | 427, 3433, 3781, 3826 | un seul endroit |
| Distance d'une sortie par repères | 578-589, 613-632 | Carnet, fusionné |
| Effacer (points, tracés, zones, structures, jonctions, mesure) | 6 endroits | un encadré commun |
| « Boussole physique, carte papier, préviens quelqu'un » | 1434, 1488, 1496, 1498, 1710 | une fois, dans Urgence |
| Distinction des modes d'urgence | 858, 1419, 1502, 1533 | le tableau de triage |
| Exports Secours | 7 endroits | §5 |
| Limite de 10 scénarios | 1541, 1585 (exceptions différentes) | une fois |
| « 🔒 100 % local » | 852, 900, 3126, 3142, 3730, 3773… | une fois, dans Confidentialité |
| Langue de l'app, wake lock, fonctions optionnelles | Configuration ↔ Réglages | un endroit par réglage |

## 7. Hors guide — à signaler

- **UI** : 🚨 sert à 3 outils (Sortie d'urgence, Affichage XL, Mode Secours) et deux s'appellent « Mode urgence »
  (`ui.subaction.*`). Sous stress, c'est le premier facteur de confusion ; corriger la doc seule ne le lève pas.
- **Commentaires de code périmés** : `config.js:106` (smartNav « globale », il est par plan), `road.js:780-784`
  (intersections « default true », c'est false), `memInspector.js:340-341` (teste `!== false` → affiche les
  intersections comme actives à tort).

## 8. Lots proposés

| Lot | Contenu | Taille |
|---|---|---|
| **L0** | F1-F11 : données réelles, promesse réseau, réglages disparus, contradictions | S |
| **L1** | Restructuration (§3) : déplacements seuls, sans réécriture — mesurable par check-doc-langues | M |
| **L2** | « Pour aller plus loin » (§4) + chapitre Créateurs | M |
| **L3** | Mode Secours (§5) | L |
| **L4** | Passe « bruit » (§1, §2) et condensation section par section, doublons (§6) | L |

Chaque lot : FR + EN + ES dans le même commit (règle CLAUDE.md), check-doc-langues vert, smoke `checkup-langues`.
