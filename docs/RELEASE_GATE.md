# 🚦 RELEASE GATE — porte de mise en production

> **Règle d'or : `main` = déployable.** La porte se franchit **avant le merge sur `main`** ;
> le FTP prod peut ensuite se faire depuis `main` sans re-réfléchir.
> Décideur unique des dérogations : **KARMA**. Claude prépare, vérifie, consigne — il ne déroge jamais lui-même.

**Pourquoi cette porte existe** : à la v1.76.0, les 9 garde-fous automatiques étaient verts en
permanence — et tous les bugs trouvés au test manuel (formulaires d'export, reset légende,
`entree_plan`, et avant eux le fond d'écran et le magnétisme) étaient passés au travers. Motif
unique : **aucun guard n'exécute l'app dans un navigateur**. La porte comble ce trou.

---

## Les 4 marches (chacune bloque la suivante)

| # | Marche | Qui | Dérogeable ? |
|---|---|---|---|
| 1 | **Garde-fous automatiques** — la suite pre-commit complète verte (`.githooks/pre-commit`, 9 scripts) | auto | ❌ jamais |
| 2 | **Smoke test standard** — les 12 points ci-dessous, sur **dev.myktamap.fr**, cache vidé | KARMA (~10 min) | ⚠️ par item, sauf 🔒 |
| 3 | **Checkup ciblé** — tableau destructif du/des modules **touchés par la release** (façon SIG, Légende) | KARMA + Claude | ⚠️ par item |
| 4 | **Trempage** — la release vit sur dev pendant l'usage réel de KARMA (24-48 h) | KARMA | ⚠️ (hotfix urgent = cas typique) |

---

## 🔥 Marche 2 — le smoke test standard (liste FIXE, ne pas adapter par release)

Les items 🔒 sont le **noyau dur : jamais dérogeables** — ils couvrent le démarrage et les
données de l'utilisateur, un échec là = pas de release, point.

| # | | Test | Attendu |
|---|---|---|---|
| 1 | 🔒 | Ouvrir le HOME, console F12 ouverte | **Zéro erreur** console |
| 2 | 🔒 | Charger un plan de la liste | Carte affichée, calques présents, zéro erreur |
| 3 | | Dessiner 1 tracé + 1 zone + 1 structure | Couleurs conformes à ≡ Légende, boutons sidebar cohérents |
| 4 | | Ajouter 1 point avec tag | Icône correcte, popup s'ouvre |
| 5 | 🔒 | Fermer l'app, rouvrir, recharger le plan | **Session restaurée intégralement** (objets, points, légende) |
| 6 | | Export PNG rapide | Fichier s'ouvre, contenu conforme à l'écran |
| 7 | 🔒 | Export session JSON → réimport | Aucune perte, aucun doublon |
| 8 | | Changer de plan puis revenir | Aucune fuite (légende, calques, position) |
| 9 | | ≡ Légende → ✏️ Modifier, puis 🔍 Filtres | Les deux s'ouvrent et agissent |
| 10 | | Ouvrir le Mode Secours | S'ouvre, données du plan présentes |
| 11 | | Badge version footer + modale « Mise à jour » | **Bonne version**, notes du bump courant |
| 12 | 🔒 | Kill SW (`killsw.html`) puis recharger | L'app revit sur la nouvelle version, URL propre |
| 13 | | **Pages annexes à jour** : ouvrir l'Audit réseau (version en tête = version du bump) + vérifier en console l'absence de `[I18n] Clé manquante` | Attrape les **uploads FTP partiels** (`docs/` ou `lang/` non montés) — vécu 2× le 06/08 : Audit resté en v1.75.2, clés `home.profile.*` « manquantes » alors que le repo était sain |

> **Voie rapide hotfix** (bump de cache type v1.75.1, zéro changement fonctionnel) :
> items 1, 2, 5, 11, 12 seulement — les 5 sont 🔒 ou version, aucun dérogeable.

---

## ⚠️ Dérogations — passer SANS valider, mais jamais en silence

Un item peut être invalidable en pratique : **SIG en est l'exemple canonique** (impossible de
tester toutes les combinaisons CRS × formats × logiciels sources ; certains fichiers réels
n'existent pas sous la main). La porte doit pouvoir s'ouvrir quand même — aux conditions
suivantes, **toutes** :

1. **Qui** : KARMA seul accorde une dérogation. Claude peut la *proposer*, jamais l'accorder.
2. **Quoi** : uniquement des items **non-🔒**. Le noyau dur ne se déroge pas, même en urgence.
3. **Trace** : chaque dérogation est consignée dans le relevé de release (ci-dessous) avec
   **motif · risque résiduel accepté · plan de rattrapage** (ou « assumé définitivement »).
4. **Suivi** : une dérogation avec rattrapage devient une entrée de `docs/BACKLOG.md` —
   sinon elle s'évapore.

**Grille de décision rapide** :
- *Invalidable en pratique* (pas de données de test, matériel absent, cas exotique) → dérogation légitime.
- *Pas le temps* → ce n'est **pas** un motif. Réduire le périmètre de la release plutôt que la valider à moitié.
- *Doute sur la criticité* → traiter comme critique. Le coût d'un smoke item est de ~1 minute.

---

## 📋 Relevé de release (recopier dans le commit de release ou en commentaire de PR)

```
RELEASE GATE — vX.Y.Z (date)
[ ] M1 guards auto : verts (commit <sha>)
[ ] M2 smoke 12 pts : OK sauf dérogations ci-dessous
[ ] M3 checkup ciblé : <modules> — OK sauf dérogations
[ ] M4 trempage dev : du <date> au <date>
Dérogations :
- (aucune) | <item> — motif · risque accepté · rattrapage (→ BACKLOG §x) — accordée par KARMA le <date>
```

---

## 🤖 Marche 1bis — smoke navigateur automatisé (EN PLACE depuis v1.76.4)

`cd scripts/smoke && npm install && npm run smoke` — boote l'app dans un
Chromium headless (serveur local inclus), passe les gates, ouvre
Configuration / Éditeur / plan de test / Réglages / Légende, et **échoue sur
toute erreur console, pageerror, clé i18n manquante, 404 inattendu ou modale
invisible**. Détails : `scripts/smoke/README.md`.

À lancer **avant la marche 2** : il attrape en 30 s la classe de bugs
(ReferenceError, classe CSS fantôme, variable hors portée) qui a traversé
trois fois les garde-fous logiques la semaine du 06/08. Le smoke manuel
(marche 2) reste : lui seul voit le VISUEL (décalages, chevauchements).

## 🔮 Marches futures

- (vide pour l'instant)
