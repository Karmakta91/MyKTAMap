---
name: release
description: Préparer une release MyKTAMap community (bump cohérent des 3 sources de version + notes + commit). À utiliser quand KARMA veut publier/bumper une version vX.Y.Z ou préparer un déploiement community.
---

# Release MyKTAMap (community)

⚠️ **Claude ne push JAMAIS sur `main` et ne déploie JAMAIS** (FTP manuel par KARMA). Cette skill **prépare** le commit ; KARMA pousse et déploie lui-même.

## 1. Type de bump (semver-like vX.Y.Z)
- **PATCH (Z+1)** : fix / UX / raffinement, pas de changement d'archi. → défaut quand on hésite.
- **MINOR (Y+1, Z=0)** : évolution majeure visible user (nouvelle feature).
- **MAJOR (X+1, Y=0, Z=0)** : changement fondamental (modèle de données / backend). Rare.

## 2. Bumper les 3 sources ENSEMBLE (sinon incohérence)
1. `sw.js` → `const CACHE_NAME = "myktamap-cache-vX.Y.Z..."` (force la purge du cache PWA)
2. `js/copyright.js` → `__MKM__.build = "vX.Y.Z"` (badge version du footer)
3. `version.json` → `"version": "vX.Y.Z"` (comparé par UpdateChecker pour détecter les MAJ)

Vérifier qu'aucune n'est oubliée :
```
grep -n "vX\.Y\.Z" sw.js js/copyright.js version.json
```
🛡️ Depuis le 16/08/2026, ce contrôle est **automatique et bloquant** : `.githooks/commit-msg` refuse tout commit qui bumpe `version.json` sans que les 3 sources concordent (noyau **non dérogeable**) ni que `README.md` / `NETWORK_AUDIT.md` / `.html` (généré, cf. §3 bis) / `AI_CONTEXT.md` suivent (dérogeable par une ligne `Docs-deroge: <motif · risque · rattrapage>` dans le message). Le grep reste utile pour corriger AVANT de buter dessus.

## 3. Notes user-facing + journal README
- `version.json > notes` : 1-2 puces concises orientées **utilisateur** (pas technique), **uniquement le bump courant** (les notes précédentes sont remplacées).
- Détail technique dans `README.md`, **2 endroits précis** (⚠️ ne JAMAIS prépender en tête de fichier) :
  1. Remplacer le bloc `## 📦 Version courante` (tête de fichier, 3-5 lignes max) ;
  2. Ajouter l'entrée détaillée **en tête de la section `## 📋 Journal des versions`** (fin de fichier, juste sous `### 🕐 Versions récentes`).

## 3 bis. Audit réseau (axe 🔒) — on écrit le `.md`, le `.html` se génère
1. `docs/applications/NETWORK_AUDIT.md` : en-tête « À jour pour la version **vX.Y.Z** (date) » + l'état actuel si le réseau a changé.
2. `docs/applications/NETWORK_AUDIT_HISTORIQUE.md` : en tête de `## Notes par version`, un titre et un paragraphe :
   ```
   ### vX.Y.Z (titre court)

   **Aucune requête nouvelle, aucun domaine nouveau.** Ce qui change côté réseau, en mots d'utilisateur.
   ```
3. **Régénérer les pages** : `node scripts/audit-html.js` → réécrit `NETWORK_AUDIT.html` et `NETWORK_AUDIT_HISTORIQUE.html`
   (reproductible : deux passages = mêmes octets). Indexer les **4** fichiers.
   Ne JAMAIS retoucher un `.html` à la main : `scripts/check-audit-html.js` (pré-commit + CI) refuse un `.html` qui n'est
   pas le rendu de son `.md`. Encadrés : une ligne `<!-- kta:classe kta-promesse -->` (ou `kta-alerte`, `kta-auteur`)
   juste avant un bloc du `.md` lui pose la classe (invisible sur GitHub). Mise en page : `docs/applications/audit.css`.

## 4. Nouveaux assets
Si un nouveau fichier `js/` ou une icône a été ajouté → vérifier qu'il est dans `sw.js > ASSETS_TO_CACHE` (sinon pas servi offline).

## 5. Commit (préparation seulement)
- Sur une branche de dev (`Karma_dev`), **JAMAIS `main`** (bloqué par hook).
- Le pre-commit anti-leak `.githooks/` tourne automatiquement (vérifie qu'activé : `git config core.hooksPath .githooks`).
- Message : `release(vX.Y.Z): <résumé court>`.

## 6. 🚦 Porte de release (AVANT le merge main)
La release préparée ne part pas en prod sans franchir **`docs/RELEASE_GATE.md`** :
guards auto → smoke 12 points sur dev → checkup ciblé des modules touchés → trempage.
Items non-🔒 dérogeables par **KARMA seul**, avec motif + risque + rattrapage consignés
(le relevé de release est dans le gate). Rappeler à KARMA de recopier le relevé.

## 7. Déploiement (KARMA, manuel — pas Claude)
- KARMA pousse la branche ; le merge sur `main` déclenche le workflow GitHub Actions (`release.yml`) qui crée tag + Release auto.
- Déploiement prod = **FTP manuel par KARMA**. Règle : **`main` = déployable** (la porte se franchit avant le merge).

📖 Détails complets : `docs/architecture/infra-versioning.md`.
