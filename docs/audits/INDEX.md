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
| 2026-10-05 | **Bugs UI depuis v2.0.0** (accueil, fenêtres Itinéraire / Tracker / Secours, fiches, panneau d'extension, thème clair, 390 px, i18n) — n° 1 (régression du correctif XSS) corrigé le jour même | v2.9.3 + `33e1c3e` | 1 agent, harnais Playwright hors dépôt · 4 🟠 · 8 🟡 | [`2026-10-05_audit-ui-v2.md`](./2026-10-05_audit-ui-v2.md) |
| 2026-10-05 | **Code mort JS** (fonctions, globales, locales, clés i18n, événements) — code déjà propre ; 19 🟢 (~45 l.), 24 🟡, 16 📌 ; un bug de lecture seule trouvé en chemin | v2.9.3 | 1 agent, ESLint hors dépôt | [`2026-10-05_audit-code-mort-js-v1.md`](./2026-10-05_audit-code-mort-js-v1.md) |
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
