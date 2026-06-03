# CLAUDE.md — MyKTAMap (community)

> Contexte essentiel, chargé à chaque session. Détails d'archi : `docs/architecture/` (lus à la demande). Journal complet : `README.md`.

## 🎯 Projet
- App web **cartographie souterraine** (Leaflet `L.CRS.Simple`), plans = images HD, **sans GPS**. Cible : cataphiles, spéléo, sites souterrains.
- **PWA page unique** `index.html`. Stack **HTML/CSS/JS vanilla + Leaflet**, pas de framework, **pas de bundler**.
- Prod https://myktamap.fr · Dev https://devmap.is-underground.fr
- Auteur Flavien VIDAL (KARMA). Licence **CC BY-NC-SA 4.0** (usage commercial interdit sans accord).

## 🔒 Frontière community ↔ pro (CRITIQUE)
- Le **pro** (cloud sync, multi-tenant, backend, white-label…) vit dans le repo privé **`MyKTAMap-pro`**. Ce repo reste **100% offline, gratuit, sans bridage**.
- ❌ Ne JAMAIS coder une feature pro ici sans valider — **par défaut tout est community**.
- ❌ Ne JAMAIS référencer du code/feature pro (`// TODO pro:`, pointeurs…).
- 🛡️ Hook anti-fuite : `.githooks/pre-commit` + `scripts/check-no-pro-leak.js` (activer 1×: `git config core.hooksPath .githooks`).

## ⚙️ Commandes & validation
- **Syntaxe** : `node -c fichier.js` (seul filet — pas de tests auto, pas de linter).
- **Pas de build** : `<script src="js/…">` chargés dans l'ordre par `index.html` (= source de vérité des modules).
- **Release** : bumper ENSEMBLE `sw.js > CACHE_NAME` + `js/copyright.js > __MKM__.build` + `version.json > version`. Détails : `docs/architecture/infra-versioning.md`.
- **Bump = sync docs sur 4 axes** (sans MAJ = dette immédiate, à vérifier AVANT de considérer la release faite) :
  - 📱 **In-app** : `docs/applications/README_USER.md` + `README_USER.en.md` (modale Documentation) · `js/interfaceDocs.js` (Aide intégrée) · `docs/applications/AI_CONTEXT.md` (modale Aide IA)
  - 🔒 **Audit** : `docs/applications/NETWORK_AUDIT.md` + `NETWORK_AUDIT.html`
  - 📖 **Dev** : `README.md` (journal des versions)
  - 🤖 **Archi IA** : `CLAUDE.md` (si archi/règle changée) + `docs/architecture/<sujet>.md` (selon sujets impactés)
- **`version.json > notes` = USER-FRIENDLY + UNIQUEMENT LE DERNIER BUMP** (lues par l'user via modale « Mise à jour disponible » et badge version footer) :
  - **Scope** : UNIQUEMENT les notes de la version courante (1-2 entrées max). Les notes des versions précédentes sont **supprimées** à chaque bump — l'historique vit dans `README.md` (journal), les commits Git, et `NETWORK_AUDIT.md`. Pas de cumul.
  - **Style** : **1-2 phrases courtes**, zéro jargon technique (pas de noms de fichier `js/...`, pas de constantes `LIKE_THIS`, pas de termes algorithmiques, pas de mention `O(N)`/`AbortController`/`viewportcull`/etc.). Ne mentionne **QUE** ce que l'user voit ou doit savoir.
  - **Pas de ligne « Sources de vérité v1.X.Y »** (= dette technique inutile à l'user).
  - La doc technique détaillée vit dans `docs/architecture/<sujet>.md` + commit message + `NETWORK_AUDIT` pour le réseau, **PAS** dans `version.json`.
- **Déploiement** : prod = **FTP manuel par KARMA**. Claude ne déploie/push-main JAMAIS.

## 🚨 Garde-fous — NE JAMAIS
- `push main` / `push --force` / `reset --hard` → **bloqués en dur** (`.claude/hooks/guard-git.js`).
- Toucher **`Chig_Dev`** (branche collaborateur) — bloqué en dur.
- Éditer **`data/**`** (dont `plan-config.json`) = DATA pure. Claude bosse **uniquement sur le moteur** (`js/`, `css/`, `index.html`, `sw.js`). Bloqué (`deny`).
- Changer les couleurs de la charte, supprimer un tag built-in, reset `localStorage`/IndexedDB sans avertir l'user.

## 🧭 Conventions
**JS** : vanilla, globales via `window.x`, privées préfixe `_`, pas d'`import/export` ES6. Logs préfixés `[Module]`. 2 espaces, lignes < 120.
**CSS** : charte dark (`#1a1f2e`→`#0a0d18`, texte `#e8eaf0`/`#c8d0e0`/`#8892a4`), accent `#f4c542`, interaction `#8cb4ff`. Préfixe **`kta-`**. Pas de Tailwind/SCSS. Z-index : 1100 titre · 5000 loader · 9999 splash · 99999 modales · 100001 sous-modales.
**Coords** : TOUJOURS `convertCoord(x,y)` = `[imageHeight - y, x]`. Jamais `[y,x]` direct.
**Distances** : TOUJOURS `window.formatDistance(distM, dec)`. Jamais `toFixed()+" m"`.
**Icônes** : résolution unique `window._iconMap[tag]` / `getIconUrlForPoint`.

## 🗺️ Où chercher (lis le bon fichier avant de coder)
| Sujet | Référence |
|---|---|
| Ordre chargement modules | `index.html` |
| Journal des versions | `README.md` |
| Rendu Leaflet, icônes, calques, splash | `docs/architecture/rendering-leaflet.md` |
| Plans : registre, loader, générateur | `docs/architecture/plans-loader.md` |
| Perf, mémoire, OOM, tiling V2, ULTRA, batterie | `docs/architecture/perf-memory.md` |
| Tracker, boussole, heading, navigation | `docs/architecture/tracking.md` |
| Multi-niveau, pathfinding, itinéraire | `docs/architecture/multilevel-pathfinding.md` |
| Exports PNG/PDF/KMZ/GPX + légende | `docs/architecture/exports.md` |
| Refonte UI, thème, modales, filtres, i18n | `docs/architecture/ui.md` |
| Session, photos, undo, recherche, stats, favoris | `docs/architecture/session-data.md` |
| Sécurité : gates, PIN, audit, légal, licence | `docs/architecture/security-legal.md` |
| Mode Secours (toutes phases) + urgence | `docs/architecture/secours.md` |
| Versioning, live-config, releases, DX (selfhost, hooks), logs | `docs/architecture/infra-versioning.md` |
| Formats JSON (plan-config, point, session) | `docs/architecture/data-formats.md` |
| Pièges connus & renommages | `docs/architecture/gotchas.md` |

## 📝 Style KARMA
- **Topo avant de coder** (choix numérotés + reco). Réponses courtes OK (`1:a 2:b`).
- Coder le **minimum**, vérifier les **régressions cross-module** avant d'affirmer qu'un fix marche.
- Ne pas écraser un fichier récent. MAJ `README.md` (+ `README_USER.md` si user-facing).
- Recap final : cause racine · fix · avant/après · tests.

## 🆘 Si perdu
1. `README.md` (journal). 2. `docs/architecture/<sujet>.md`. 3. Topo à KARMA avant tout changement complexe.
