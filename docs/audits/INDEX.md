# 📚 Audits MyKTAMap

> Archives des audits codebase (workflow multi-agents adversarial verify).
> À chaque audit majeur, déposer ici **avant** d'oublier — sinon perte des findings comme la 1ère fois.

## Convention de nommage

```
YYYY-MM-DD_audit-<scope>-v<N>.md          ← rapport synthèse (human-readable)
YYYY-MM-DD_audit-<scope>-v<N>.raw.json    ← findings complets (machine-readable)
```

## Archives

Les audits et études **soldés** ont quitté le dépôt le 30/09/2026 (modales v1/v2, i18n, ergonomie, dossiers « Mes
plans », notifications). Ils restent dans l'historique Git, sous le tag **`archive-docs-2026-09-30`** :

```
git show archive-docs-2026-09-30:docs/audits/2026-09-13_audit-ergonomie-v1.md
git ls-tree -r --name-only archive-docs-2026-09-30 docs/
```

Soldés le 06/10/2026 (bugs UI v2 et code mort JS du 05/10) : tag **`archive-docs-2026-10-06`** —
`git show archive-docs-2026-10-06:docs/audits/2026-10-05_audit-ui-v2.md`.

Soldé le 09/10/2026 (CI/CD du 08/10, toutes les actions faites ou retirées ; pistes restantes au `BACKLOG.md`) :
tag **`archive-docs-2026-10-09`** — `git show archive-docs-2026-10-09:docs/audits/2026-10-08_audit-cicd-v1.md`.

Règle : un audit reste ici tant qu'il a des lots ouverts ; soldé, il part en archive (un tag, pas un dossier).

## Historique (audits ouverts)

| Date | Scope | Version auditée | Raw → Confirmés | Lien |
|---|---|---|---|---|
| 2026-10-16 | **Ergonomie PC/mobile du mode plan** (export, Tracker, panneaux ancrés ou centrés) : panneaux d'outils sous le footer (bug v1.82 toujours là en paysage), toucher la carte pour fermer un panneau ajoute un sommet, 6 définitions de « mobile » ; export et Tracker propres | v2.16.0 + `Karma_dev` | 1 agent, lecture + Playwright 5 formats × 3 langues, pas de `.raw.json` | [`2026-10-16_audit-ergonomie-pc-mobile-v1.md`](./2026-10-16_audit-ergonomie-pc-mobile-v1.md) |
| 2026-10-16 | **Commentaires du code** : 35 % de lignes de commentaire, journal de versions dans le code ; 13 garde-fous ancrés sur des commentaires, 2 faussement verts — à réparer avant tout nettoyage | v2.16.0 + `Karma_dev` | 1 agent, mesures sur copie `git archive`, pas de `.raw.json` | [`2026-10-16_audit-commentaires-v1.md`](./2026-10-16_audit-commentaires-v1.md) |
| 2026-10-09 | **CD (déploiement)** : scripts `deploy-*.sh`, nginx servi, Service Worker, retour arrière — sûr pour `data/` mais muet : `docs/` interne public sur le dev, prod en retard sur `main` sans signal, aucune vérification après déploiement, retour arrière jamais exercé ; 5 quick wins | v2.10.3 (prod v2.10.2) | lecture + `curl` en direct sur dev et prod, pas de `.raw.json` | [`2026-10-09_audit-cd-v1.md`](./2026-10-09_audit-cd-v1.md) |
| 2026-10-03 | **Aide intégrée** (hub ❓, 35 fiches fr/en/es) — lots A1-A3 appliqués, contrôle final fait : faits faux dans plus de 20 fiches, 1 donnée réelle + 1 indice de localisation, rangement incohérent, 5 fiches manquantes, 4 erreurs résiduelles du guide | v1.99.5 + guide réécrit | 3 agents de lecture, pas de `.raw.json` | [`2026-10-03_audit-aide-integree-v1.md`](./2026-10-03_audit-aide-integree-v1.md) |
| 2026-10-03 | **Guide utilisateur** (`README_USER` fr/en/es) : pertinence et agencement des rubriques, bruit (historique, défensif, jargon), fonctions désactivées par défaut → « Pour aller plus loin », Mode Secours — 11 erreurs factuelles (dont 2 données réelles), plan cible, 5 lots | v1.99.5 | 6 agents de lecture (5 tranches + inventaire des défauts dans le code), pas de `.raw.json` | [`2026-10-03_audit-guide-utilisateur-v1.md`](./2026-10-03_audit-guide-utilisateur-v1.md) |
| 2026-09-29 | **Mode Secours** (jeu de rôle GRIMP × IGC) : planifier le balayage d'un réseau réel en 5-8 équipes puis exécuter jusqu'à la victime — fusion inter-téléphones cassée, mode « tracés » inerte, victime sans position, guidage absent | v1.98.4 | 5 bloquants (2 vérifiés à la main) · 10 lots B · 3 lots C (pas de `.raw.json` : agents de lecture + harnais Node hors dépôt ; rapports bruts non versionnés car ils nomment le relevé réel) | [`2026-09-29_audit-secours-v1.md`](./2026-09-29_audit-secours-v1.md) |

## Lecture

Pour chaque audit :
- **Rapport `.md`** : synthèse, top critiques, patterns, plan d'action
- **Brut `.raw.json`** : tous les findings (file, line, category, severity, title, why, code_excerpt, fix_hint, verdicts adversarial)

Le `.raw.json` permet de :
- Tracker fix-par-fix au cours du sprint suivant
- Comparer entre audits (avant/après sprint = mesurer le bruit éliminé)
- Reprendre un finding sans relancer le workflow

## Process pour les futurs audits

1. Lancer le workflow `audit-modales-vN+1` (ou autre scope)
2. **DÈS la réception du rapport**, sauvegarder dans `docs/audits/` :
   - Le markdown synthèse
   - Le JSON brut avec tous les findings + metadata
3. Mettre à jour cet `INDEX.md`
4. Commit (avec ou sans le sprint, ils ont leur vie propre)
