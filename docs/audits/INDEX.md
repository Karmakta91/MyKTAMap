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

Règle : un audit reste ici tant qu'il a des lots ouverts ; soldé, il part en archive (un tag, pas un dossier).

## Historique (audits ouverts)

| Date | Scope | Version auditée | Raw → Confirmés | Lien |
|---|---|---|---|---|
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
