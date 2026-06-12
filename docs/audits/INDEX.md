# 📚 Audits MyKTAMap

> Archives des audits codebase (workflow multi-agents adversarial verify).
> À chaque audit majeur, déposer ici **avant** d'oublier — sinon perte des findings comme la 1ère fois.

## Convention de nommage

```
YYYY-MM-DD_audit-<scope>-v<N>.md          ← rapport synthèse (human-readable)
YYYY-MM-DD_audit-<scope>-v<N>.raw.json    ← findings complets (machine-readable)
```

## Historique

| Date | Scope | Version auditée | Raw → Confirmés | Lien |
|---|---|---|---|---|
| 2026-06-09 | Modales (10 modules × 5 axes) v2 | v1.43.26 | 87 → 61 (70%) | [`2026-06-09_audit-modales-v2.md`](./2026-06-09_audit-modales-v2.md) |
| 2026-06-08 | Modales (10 modules × 5 axes) v1 | v1.43.25 | 153 → 30 (20%) | ❌ perdu (avant compaction) — seuls les 10 critiques traités en v1.43.26 sont documentés dans `NETWORK_AUDIT.md` |

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
