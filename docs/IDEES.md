# 💡 Idées — MyKTAMap

> Pistes gardées, **pas du travail** : chacune dit son **déclencheur** (ce qui la ferait entrer au backlog). Au
> déclencheur, elle passe dans `docs/BACKLOG.md` (avec ses métadonnées) et quitte ce fichier. Une piste abandonnée
> part dans `docs/DECISIONS_FERMEES.md` avec sa raison. Avant de reproposer une idée : relire les deux fichiers.

## Fonctionnalités

- **Puits inter-étage** — un puits n'existe que comme **tracé** « jonction » 🪜 (`multilevel-pathfinding.md` §26.5).
  Idée : un POI dédié, visible sur ses **deux** niveaux, qui porte la jonction pour l'itinéraire (logique d'un
  portail ; ajout du tag par la skill `add-icon-tag`). Déclencheur : décision de KARMA de le cadrer.
- **Adresse de contact de l'installation** — `contact@myktamap.fr` est en dur (`index.html` ×2, dicos ×3, guide ×3).
  Idée : un champ ConfAdmin → `index.json > config`, repli sur l'adresse actuelle ; trancher quelles mentions
  suivent (crédit, licence, `NETWORK_AUDIT` restent). Déclencheur : une installation tierce qui le demande.
- **Import VisualTopo (`.tro`)** — la cible spéléo n'a aucun format topo lisible. Socle : `sigImport.js` +
  `GpxImport.genererCanvasVierge` ; un `.tro` = texte tabulé → points + polylignes. *[Supposition]* : format le plus
  répandu chez les spéléos français. Déclencheur : « pas maintenant » (KARMA, 10/10) — une demande d'utilisateur.
- **Harmoniser les icônes par défaut** — le portail a deux visages (PNG sur carte / légende / exports, 🌀 dans les
  liaisons et l'itinéraire). 🔴 Avant toute vectorisation : `kmzExport.js` écrit le blob en `.png` sans regarder son
  type, et `utils.js` fait gagner `PLAN_CONFIG.icons[tag]` sur le catalogue. Déclencheur : refonte des icônes.
- **Doc « une source, trois rendus »** — guide / Aide intégrée / contexte IA depuis une source ;
  `check-doc-langues.js` aligne déjà les trois langues du guide. Déclencheur : « pas maintenant » (KARMA, 10/10).
- **Export de profil en flux** — `showSaveFilePicker` + `generateInternalStream` (Chrome/Edge) contre le pic de RAM
  des très gros exports. Déclencheur : un cas réel d'export qui sature.
- **Seuils « mobile » à converger** — 🔬 inventaire du 17/10 (seul le plancher de dézoom passe par
  `window.ktaAppareilTactile()`) : JS `homeLoader.js` (640 px ×2), `interfaceConfig.js` (1023), `interfaceDocs.js`
  (1100) ; détection iPadOS recopiée dans `createConf.js`, `modeHistoire.js`, `profileExportImport.js` alors que
  `ktaEstIos` existe ; CSS `@media max-width` 480 ×16, 640 ×6, 600 ×5, 768 ×3, 540 ×3, 1023 ×2, autres ×1, ~5 blocs
  `max-height: 500px`. Déclencheur : on touche le module concerné.
- **Vieille clé de profil** — ⚪ un vieil export de profil réécrit `myktamap_network_paranoia_v1` (inerte, plus lue
  par le code). Purge en une ligne. Déclencheur : si elle gêne.

## Outillage

- **Tendance des garde-fous** — le tableau de la CI (`ci.yml › tableau-garde-fous`) n'a pas d'historique d'une
  version à l'autre. Déclencheur : un garde-fou qui ralentit sans qu'on le voie venir.

## Mode Secours (suite de l'audit du 29/09)

Rapport : `docs/audits/2026-09-29_audit-secours-v1.md`. Un commit par case.

- **Parcours de la phase 2 préparé pendant la phase 1** (L). Déclencheur : un exercice qui le demande.
- **Lot C** — C2 gabarit brancard (L) · C3 rôle par personne en liste fermée (M). C1 secteurs + balayage : livré
  (`secours.md` § Secteurs). Déclencheur : des exercices qui le réclament.
- **Balayage : affiner l'écart entre secteurs** — 🔬 1,35 sur un plan réel (l'audit visait 1,16 avec un découpage
  par niveau). Déclencheur : un exercice qui le demande.
