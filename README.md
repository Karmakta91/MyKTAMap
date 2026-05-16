# 📘 MyKTAMap
> Application web de cartographie terrain — visualisation, annotation et déplacement simulé sur plan image.

**🌍 Environnements :**
- 🟢 Production : [myktamap.is-underground.fr](https://myktamap.is-underground.fr)
- 🔧 Développement : [devmap.is-underground.fr](https://devmap.is-underground.fr)

> ⚠️ Les données présentes sur le site de démonstration sont fictives.

## 📋 Journal des modifications

> _Le journal est long (94 entrées). Clique sur une entrée pour déplier son détail. Les **2 plus récentes** sont dépliées par défaut._

<details id="karma-dev-zone-inacc-evitement" open>
<summary><strong>🚧 [Karma_dev — en cours] 🚫 Zone "Inaccessible" + Préférences d'évitement itinéraire</strong></summary>

**⚠️ Branche `Karma_dev` — pas encore release.** Pas de bump version, pas de merge main tant que KARMA n'a pas validé + dit "release".

### Feature 1 — Zone "Inaccessible" (contrainte DURE pathfinder)

Nouveau 4ème type de zone polygonale (`inaccessible`) qui bloque tout segment de route qui la traverse pour le calcul d'itinéraire. Visuel : **hachures rouge sombre / noir 45°** via `<pattern>` SVG global (`#kta-pattern-inaccessible` dans index.html). Renderer SVG forcé (canvas ignore les patterns SVG).

- Bouton ⛔ dans le groupe ⬛ Zones de la sidebar
- Multi-niveau : bloque uniquement les segments du **même niveau**
- Indépendant de la visibilité du calque (pathfinder prend en compte même si toggle off)
- Export PNG canvas : fallback rouge foncé uni (#7a0000 fillOpacity 0.65, hachures SVG non portables au canvas)

**Algorithme géométrique** (pathfinder.js) :
- `_pointInPolygon` (ray-casting O(n))
- `_segmentTraversePolygon` (true si endpoint dans poly OU intersection avec arête)
- `_segmentBloqueParZoneInaccess` (filtre niveau-aware, segments "transit" jamais bloqués)
- `_collecterZonesInaccessibles` (lit session via getZones + data layers via _ktaDataPolygons)

### Audit fonctions d'export + mode clic carte évitement (post Karma_dev)

Audit complet des 4 fonctions d'export (image rapide/avancé, session Full/Avancé/Conversion, tableau JSON, liste de plans) pour vérifier la cohérence des Features 1+2. **3 corrections** appliquées :

1. **`sessionExporter.js`** Export Avancé + Conversion drop silencieusement les jonctions (`roadTypes` ne contient pas `"jonction"` → filter exclu). Fix : bypass explicite `if (r.type === "jonction") return true;` avant le filter. Cas critique : un plan multi-niveau exporté en Advanced perdait tous ses bridges → import = perte de continuité du graphe pathfinder.
2. **`exporter.js > _dessinerLegende`** Légende PNG (mode avancé) manquait `Inaccessible` et `Jonction interniveau`. Ajout des 2 entrées avec leurs couleurs (rouge foncé pour Inaccessible côté canvas, magenta pour Jonction).
3. **`tableEditor.js`** Colonne `level` apparaissait en queue de tableau au lieu d'à côté de `x/y`. Ajout dans `ordreCourant` entre `y` et `tags`.

**Choix volontaire documenté** (non corrigé) :
- Préférences d'évitement (localStorage par plan) **non sérialisées** dans les exports session. Volontaire : ces préfs sont locales à l'user, pas portables. Si besoin futur, ajout via checkbox optionnelle dans Export Session Full.

### Mode clic carte pour évitements (audit)

Bouton **📍 Cliquer sur la carte** dans la section "🚫 Préférences d'évitement" :
- Click → la modale se réduit en floater orange "Mode clic évitement actif"
- Chaque clic sur la map ajoute un point d'évitement aux prefs (label "📍 Clic carte (x, y)")
- Compteur live dans le floater
- Bouton **✓ Terminer** réaffiche la modale

État `_itiAvoidClickActive` + handler `_itiAvoidClickHandler` séparés du mode clic waypoints existant (pas de conflit possible). Pattern identique à `_activerModeClicCarte`/`_desactiverModeClicCarte`.

### Fix Z-order multi-niveau (bug remonté KARMA pendant Karma_dev)

En multi-niveau, une galerie au Niv 0 doit toujours apparaître AU-DESSUS d'une galerie au Niv -1, etc. Avant ce fix, l'ordre était plat (= ordre d'insertion). Désormais (uniquement si `multiLevel === true`) :

- Tri primaire **par level ascendant** : LVL -∞ → -2 → -1 → 0 → +1 → +∞ (bas en arrière, haut au-dessus)
- Tri secondaire **par type** au sein du même niveau : `chemin < secondaire < principal < jonction` (Principal au-dessus de chemin)
- Itinéraire toujours en dernier (au-dessus de tout)
- Jonctions triées par `max(fromLevel, toLevel)` (= apparaissent au-dessus du niveau inférieur, cohérent avec "escalier qui monte")

Appliqué dans 4 endroits : `road.js > renderRoads` (on-map session), `utils.js > ajouterPointsDepuisJSON` (création polylines data layer), `utils.js > telechargerPlan` (export PNG rapide), `exporter.js > _genererCanvasExport` (export PNG avancé). Tous utilisent `[...arr].sort(...)` (copie immutable de l'array source).

Rétro-compat absolue : si `multiLevel === false`, ordre d'insertion conservé (= comportement v147 strict).

### Feature 2 — Préférences d'évitement (contrainte SOUPLE)

Section repliable "🚫 Préférences d'évitement (optionnel)" dans la modale itinéraire. 3 types de contraintes :

1. **Points à éviter** : ajout via autocomplete (SearchPoints.findByQuery) OU saisie ID (Pathfinder.resolvePointById). Chips orange avec ✕.
2. **Tags à éviter** : multi-select chips, expansion auto en tous les points portant ce tag (via SearchPoints.getAllPoints **async**)
3. **Marge** : px configurable (défaut 100). Tout segment à moins de cette distance d'un point évité est exclu du graphe.

**Algo 2 passes** :
- **Passe 1** : graphe avec contraintes dures (zones inaccessibles) + souples (évitements) → Dijkstra
- Si échec ET avoidances → **Passe 2** : graphe sans avoidances → Dijkstra. Si OK → marque `usedFallback: true` + détection des points évités traversés (`avoidedThrough`)
- Si Passe 2 échoue aussi → vraie absence de chemin, erreur relancée

**UI fallback** : si `usedFallback`, bloc orange "⚠️ Impossible d'éviter : X, Y" au-dessus des résultats. Marge utilisée affichée. Distinction claire dur/souple.

**Persistance** : localStorage `myktamap_route_avoid_<planId>` par plan. Restauré à l'ouverture, écrit à chaque changement, bouton 🗑️ Reset.

### API breaking change

`Pathfinder.computeRoute(waypoints, opts)` est désormais **async** (await `SearchPoints.getAllPoints` pour expansion tags). Les 2 appelants dans interface.js mis à jour avec `await`. Aucun autre appelant détecté.

### Fichiers modifiés (cumulatif Feature 1 + 2)

| Fichier | Changement |
|---|---|
| `index.html` | `<pattern>` SVG global `kta-pattern-inaccessible` |
| `js/zones.js` | Type `inaccessible` dans ZONE_STYLES + renderer SVG singleton + ordre superposition |
| `js/pathfinder.js` | Helpers géométriques + collecte zones + `_buildGraph` étendu + `_computeRouteInterne` factorisé + `computeRoute` async avec algo 2 passes |
| `js/interface.js` | Section UI complète + helpers localStorage + handlers async (autocomplete, ID, tags chips, radius, reset) + 2 appels `await Pathfinder.computeRoute` + message fallback + bouton ⛔ |
| `js/utils.js` | ZONE_STYLES_DATA + ZONE_STYLES_EMBED + ZONE_STYLES_EXPORT inclus inaccessible + entry `_ktaDataPolygons` expose type/points pour pathfinder |
| `js/exporter.js` | Liste de types, zoneLabels, sync parent/enfants, ordre tri canvas + checkbox `ann_zones_inaccessible` |
| `js/sessionExporter.js` | Type inclus dans _trierParType (×3), syncParent (×2), zoneTypes filter, zoneTypesActifs + checkboxes adv/conv |
| `css/style.css` | Styles `.kta-iti-avoid-*` (chips, groupes, details) — palette orange semantic "warning" |
| `CLAUDE.md` §31 | Section dev complète avec algo + helpers + liste 13 endroits à toucher pour ajouter un futur 5ème type de zone |
| `AI_CONTEXT.md` | Type inaccessible dans la liste anti-hallucination + recettes N et O |
| `README_USER.md` | Tableau zones étendu + section "⛔ Zone Inaccessible" + sous-section "🚫 Préférences d'évitement" |

### Workflow Karma_dev

Branche dédiée pour développement de features avant validation et release. Pas de push main, pas de release sans validation explicite + go.

À faire avant release : tests KARMA + bump version + merge dans main + workflow CI auto-release GitHub déclenché.

</details>



### 📑 Sommaire des versions

- [🚧 **Karma_dev (en cours)** — 🚫 Zone "Inaccessible" + Préférences d'évitement itinéraire](#karma-dev-zone-inacc-evitement)
- [🗓️ 15/05/2026 (suite 13) — 🤖 GitHub Releases automatiques](#2026-05-15-s13)
- [🗓️ 15/05/2026 (suite 12) — 🧹 v168 : Suppression de migrationNotice.js (doublon avec alert.json info)](#v168)
- [🗓️ 15/05/2026 (suite 11) — 🌐 v163 : Multi-alertes + annonce migration `myktamap.fr`](#v163)
- [🗓️ 15/05/2026 (suite 10) — 🏗️ v162 : Champ "Niveau" sur les image layers](#v162)
- [🗓️ 15/05/2026 (suite 9) — 🧭 v158-v161 : Tracker directionnel (4 itérations)](#v158)
- [🗓️ 15/05/2026 (suite 8) — 🧭 v157 : Nouvelle icône dédiée pour la boussole](#v157)
- [🗓️ 15/05/2026 (suite 7) — 🐛 v156 : Fix sélection niveau négatif inactive](#v156)
- [🗓️ 15/05/2026 (suite 6) — 🎨 v155 : Multi-niveau — segmented sur une seule ligne](#v155)
- [🗓️ 15/05/2026 (suite 5) — 🏗️ v154 : Niveaux négatifs (sous-sols) + auto-extension availableLevels](#v154)
- [🗓️ 15/05/2026 (suite 4) — 🔧 v153 : Fix double modale après crash V2](#v153)
- [🗓️ 15/05/2026 (suite 3) — 🛡️ v152 : Robustesse erreurs V2 + overlay chargement visible](#v152)
- [🗓️ 15/05/2026 (suite 2) — 🧱 v151 : V2 améliorations workflow + perfPreset bypass](#v151)
- [🗓️ 15/05/2026 (suite 1) — 🧱 v149 : Tiling V2 Option B (multi-imageOverlay)](#v149)
- [🗓️ 15/05/2026 — 🏗️ v148 : Mode multi-niveau (carrières multi-étages)](#v148)
- [🗓️ 14/05/2026 (suite 1) — 🧭 v147 : Fix heading tracker + Widget boussole + Popup avertissement](#v147)
- [🗓️ 14/05/2026 — 🧹 v146 : Fix mode tracé/zone après suppression + Distance totale inclut roads masquées](#v146)
- [🗓️ 13/05/2026 (suite 6) — 🏷️ Badge version cliquable dans le footer (avec notes intégrées)](#2026-05-13-s6)
- [🗓️ 13/05/2026 (suite 5) — 🎚️ Loader : drawer "Réglages de performance" + fix bug rotation + badge version footer](#2026-05-13-s5)
- [🗓️ 13/05/2026 (suite 4) — 🚀 Mode Performance ULTRA : 6 toggles d'optimisation pour gros plans / appareils faibles](#2026-05-13-s4)
- [🗓️ 13/05/2026 (suite 3) — 🚨 Bouton alerte dans le loader (icône sirène + style collé au 📖)](#2026-05-13-s3)
- [🗓️ 13/05/2026 (suite 2) — 🚨 Système d'alertes publiques via `alert.json`](#2026-05-13-s2)
- [🗓️ 13/05/2026 (suite 1) — 🎯 Générateur : position initiale tracker auto-centrée (W/2 × H/2)](#2026-05-13-s1)
- [🗓️ 13/05/2026 — 🏗️ Générateur de plan : auto-détection des dimensions de l'image principale](#2026-05-13)
- [🗓️ 11/05/2026 (suite 3) — 🖼️ Fix export PNG/JPEG : fallback automatique pour gros plans JPG source](#2026-05-11-s3)
- [🗓️ 11/05/2026 (suite 2) — 🤖 AI Context : externalisation à la racine + anti-hallucination renforcé + prompt copiable](#2026-05-11-s2)
- [🗓️ 11/05/2026 (suite 1) — 🔔 Détection de mise à jour : modale + mise à jour douce vs reset complet](#2026-05-11-s1)
- [🗓️ 11/05/2026 — ⛑️ Mode urgence "Je suis perdu" : module complet d'estimation de position en cataphilie](#2026-05-11)
- [🗓️ 10/05/2026 (suite 15) — 🤖 Aide IA : fichier de contexte téléchargeable pour assistance IA externe](#2026-05-10-s15)
- [🗓️ 10/05/2026 (suite 14) — Fix bouton "🗑️ Supprimer ce point" qui apparaissait sur points data layer](#2026-05-10-s14)
- [🗓️ 10/05/2026 (suite 13) — Modale Aide : retour à `columns:2` sans break-inside (vraie balance)](#2026-05-10-s13)
- [🗓️ 10/05/2026 (suite 12) — Modale Aide : passage de `columns:2` à CSS Grid auto-flow](#2026-05-10-s12)
- [🗓️ 10/05/2026 (suite 11) — Modale Aide : layout 2 colonnes sur PC](#2026-05-10-s11)
- [🗓️ 10/05/2026 (suite 10) — Footer copyright : licence à la ligne sur mobile](#2026-05-10-s10)
- [🗓️ 10/05/2026 (suite 9) — Loader PC : fix débordement grid (% vs fr)](#2026-05-10-s9)
- [🗓️ 10/05/2026 (suite 8) — Loader : marges équilibrées + signature image (au lieu de "alias KARMA")](#2026-05-10-s8)
- [🗓️ 10/05/2026 (suite 7) — Loader : layout 2 colonnes sur PC (≥ 1024px)](#2026-05-10-s7)
- [🗓️ 10/05/2026 (suite 6) — Sélection visuelle pour supprimer une zone (même pattern que tracés)](#2026-05-10-s6)
- [🗓️ 10/05/2026 (suite 5) — Hotfix suppression point + sélection visuelle des tracés](#2026-05-10-s5)
- [🗓️ 10/05/2026 (suite 4) — Suppression : bouton popup + modale "Sélectionner un tracé"](#2026-05-10-s4)
- [🗓️ 10/05/2026 (suite 3) — minZoom plus généreux sur desktop](#2026-05-10-s3)
- [🗓️ 10/05/2026 (suite 2) — Itinéraire : temps estimé (label bottomleft + modale)](#2026-05-10-s2)
- [🗓️ 10/05/2026 (suite 1) — Popup point : 3ème bouton "📍 Je suis ici" (recalage tracker)](#2026-05-10-s1)
- [🗓️ 10/05/2026 — Popups de points : boutons "🧭 Y aller" et "➕ Itinéraire"](#2026-05-10)
- [🗓️ 09/05/2026 (suite 33) — Décalage titre limité au mobile (desktop a assez de place)](#2026-05-09-s33)
- [🗓️ 09/05/2026 (suite 32) — Décalage du titre fixe quand le contrôle des couches est ouvert](#2026-05-09-s32)
- [🗓️ 09/05/2026 (suite 31) — Fix z-index contrôle des couches (passe derrière le titre sur mobile)](#2026-05-09-s31)
- [🗓️ 09/05/2026 (suite 30) — Tuiles fond noir + raccourci label distance + édition waypoints en mode navigation](#2026-05-09-s30)
- [🗓️ 09/05/2026 (suite 29) — Hotfix crash au reload avec itinéraire actif](#2026-05-09-s29)
- [🗓️ 09/05/2026 (suite 28) — Optimisations performance pour les plans avec beaucoup de routes](#2026-05-09-s28)
- [🗓️ 09/05/2026 (suite 27) — Tutoriel "Optimiser ton plan" dans la doc utilisateur](#2026-05-09-s27)
- [🗓️ 09/05/2026 (suite 26) — Pathfinder utilise toutes les routes embedded (visibles ou non)](#2026-05-09-s26)
- [🗓️ 09/05/2026 (suite 25) — Plafonnement dynamique du minZoom selon la taille de l'image](#2026-05-09-s25)
- [🗓️ 09/05/2026 (suite 24) — Rollback complet du forçage SVG sur roads (crash dézoom)](#2026-05-09-s24)
- [🗓️ 09/05/2026 (suite 23) — Itinéraire : bouton "🧭 Ma position" pour utiliser le tracker comme waypoint](#2026-05-09-s23)
- [🗓️ 09/05/2026 (suite 22) — Rollback du calque "Mes tracés" séparé](#2026-05-09-s22)
- [🗓️ 09/05/2026 (suite 21) — Calque "Mes tracés" séparé pour les roads session](#2026-05-09-s21)
- [🗓️ 09/05/2026 (suite 20) — Hotfix crash app : SVG renderer partagé pour les roads](#2026-05-09-s20)
- [🗓️ 09/05/2026 (suite 19) — Toast copyright à l'activation du mode debug](#2026-05-09-s19)
- [🗓️ 09/05/2026 (suite 18) — Fix toggle "Mes annotations" sur les roads (renderer SVG forcé)](#2026-05-09-s18)
- [🗓️ 09/05/2026 (suite 17) — Fallback auto-création du calque "editor" dans map.js](#2026-05-09-s17)
- [🗓️ 09/05/2026 (suite 16) — Gating buffer logs + threshold popup F12 ajusté](#2026-05-09-s16)
- [🗓️ 09/05/2026 (suite 15) — Détection DevTools réactivée mais conditionnée au mode debug](#2026-05-09-s15)
- [🗓️ 09/05/2026 (suite 14) — Fix toast DevTools faux positif + audit gating logs](#2026-05-09-s14)
- [🗓️ 09/05/2026 (suite 13) — Calque "Mes annotations" englobe points + roads + zones session](#2026-05-09-s13)
- [🗓️ 09/05/2026 (suite 12) — Protection juridique du code (Phase 1 légale)](#2026-05-09-s12)
- [🗓️ 09/05/2026 (suite 11) — Fix toggle calque "Ajout" sur points restaurés par SessionPersist](#2026-05-09-s11)
- [🗓️ 09/05/2026 (suite 10) — Conversion auto m / km sur les 3 outils de distance](#2026-05-09-s10)
- [🗓️ 09/05/2026 (suite 9) — Fix bouton ❌ Effacer le surlignage (collision de noms)](#2026-05-09-s9)
- [🗓️ 09/05/2026 (suite 8) — Distance totale : modale plein écran (uniformisation UI)](#2026-05-09-s8)
- [🗓️ 09/05/2026 (suite 7) — Fix crash Distance totale sur plans denses](#2026-05-09-s7)
- [🗓️ 09/05/2026 (suite 6) — Distance totale des tracés (filtres + surlignage magenta)](#2026-05-09-s6)
- [🗓️ 09/05/2026 (suite 5) — Itinéraire / Pathfinding sur le réseau de routes](#2026-05-09-s5)
- [🗓️ 09/05/2026 (suite 4) — OOMGuard : modale "ATTENTION arrêt brutal détecté"](#2026-05-09-s4)
- [🗓️ 09/05/2026 (suite 3) — Reset "Tout réinitialiser" : check Internet en amont](#2026-05-09-s3)
- [🗓️ 09/05/2026 (suite 2) — Perf hardening mobile (transparent utilisateur)](#2026-05-09-s2)
- [🗓️ 09/05/2026 (suite) — Audit code : suppression dead code, gating logs centralisé](#2026-05-09)
- [🗓️ 09/05/2026 — iPhone PWA : top intégré dark via hack Leaflet](#2026-05-09-bis1)
- [🗓️ 08/05/2026 (suite 3) — Filtres calques + tags dans la recherche](#2026-05-08-s3)
- [🗓️ 08/05/2026 (suite 2) — Convertisseur bidirectionnel dans le modal Export](#2026-05-08-s2)
- [🗓️ 08/05/2026 (suite) — Auto-save de la session active + toast de restauration](#2026-05-08)
- [🗓️ 08/05/2026 — Mode performance réglable (5 presets DLSS-like) + flag debug global](#2026-05-08-bis1)
- [🗓️ 06/05/2026 (suite 3) — 6 nouveaux tags d'accès + refonte cascade icônes + légende 5 groupes](#2026-05-06-s3)
- [🗓️ 06/05/2026 (suite 2) — Plan Switcher (titre cliquable)](#2026-05-06-s2)
- [🗓️ 06/05/2026 (suite) — Splash + ergonomie loader + gestion erreurs plan](#2026-05-06)
- [🗓️ 06/05/2026 — Système multi-plans + persistance ZIP locale](#2026-05-06-bis1)
- [🗓️ 05/05/2026 — Export session avancé + filtrage par tag + bugs résolus](#2026-05-05)
- [🗓️ 04/05/2026 — Recherche de point + ajustements](#2026-05-04)
- [🗓️ 04/05/2026 — Éditeur tableau JSON](#2026-05-04-bis1)
- [🗓️ 04/05/2026 — Charte graphique légende exportée](#2026-05-04-bis2)
- [🗓️ 04/05/2026 — Zones, eau, page d'accueil, calibrage](#2026-05-04-bis3)
- [🗓️ 03/05/2026 — Export plan avancé](#2026-05-03)
- [🗓️ 03/05/2026 — Module Zones](#2026-05-03-bis1)
- [🗓️ 03/05/2026 — Refonte interface](#2026-05-03-bis2)

---

<details id="2026-05-15-s13" open>
<summary><strong>🗓️ 15/05/2026 (suite 13) — 🤖 GitHub Releases automatiques</strong></summary>


Mise en place du workflow `.github/workflows/release.yml` qui auto-crée tag + Release GitHub à chaque bump de `version.json > version` sur `main`. Pas de changement côté app — pur outillage dev.

Avant : pour voir l'historique des versions, il fallait lire `README.md > Journal` (technique, dense). La page "Releases" du repo GitHub était vide.

Maintenant : la page **Releases** devient l'index visible chronologique, avec :
- Tag `v<version>` sur le commit exact du bump (= checkout possible)
- Notes user-facing formatées (extraites de `version.json > notes`)
- Lien "📊 Voir tous les commits depuis vN-1" → page compare GitHub

**Workflow** : trigger sur push main qui modifie `version.json`. Garde-fous : skip si version inchangée ou tag déjà existant.

**Documenté** : section §30 dans CLAUDE.md + commentaire d'en-tête détaillé dans le YAML (incl. commande d'antidatation v168 pour l'initialisation).

**Pas de bump** : ce commit ne change pas l'app, juste l'outillage. La prochaine vraie release (v169+) déclenchera le workflow.

Fichiers ajoutés :
| Fichier | Rôle |
|---|---|
| `.github/workflows/release.yml` | Workflow GitHub Actions (~110 lignes) |
| `CLAUDE.md` §30 | Doc pour futurs devs/agents |

---

</details>

<details id="v168">
<summary><strong>🗓️ 15/05/2026 (suite 12) — 🧹 v168 : Suppression de migrationNotice.js (doublon avec alert.json info)</strong></summary>


KARMA : "ducoup l'alerte dans le menu alerte suffit pour la migration, supprime l'autre pour éviter les doublons".

L'annonce migration était diffusée par 2 canaux distincts :
1. **Modal one-shot pédagogique** au premier lancement (`js/migrationNotice.js`, v163-v167)
2. **Alerte info dans `alert.json`** visible via badge 🚨 (v163+, multi-alertes)

→ Doublon perçu par l'utilisateur. Suppression du canal modal one-shot pour ne garder que l'alerte info (plus discrète, déjà visible en permanence).

#### Suppression

- `js/migrationNotice.js` — fichier supprimé (préservé dans l'historique git, commit `aea3a1e` l'introduisait)
- `<script src="js/migrationNotice.js">` retiré de `index.html`
- Hook `MigrationNotice.notifySplashEnded()` retiré de `main.js > _splashEnd`
- `"./js/migrationNotice.js"` retiré de `sw.js > ASSETS_TO_CACHE`
- Classes CSS `.kta-migration-*` retirées de `style.css` (-~95 lignes)

#### Ce qui reste

- ✅ `alert.json` avec l'entrée `migration-myktamap-fr-2026` (info bleu)
- ✅ Badge 🚨 dynamique avec couleur selon niveau max + pastille compteur
- ✅ Sélecteur multi-alertes (v166-v167) avec tri par criticité
- ✅ `docs/nginx-redirect-old-domain.conf` (Phase 3 J+60)
- ✅ `docs/alert-example-migration.json` (template référence)

#### Docs sync

- CLAUDE.md §29 : retire la partie "Module migrationNotice.js" + note historique sur la suppression
- AI_CONTEXT.md : recette M conservée, mention "modal one-shot" → "alerte info permanente"
- README_USER.md : section migration adaptée (1 canal au lieu de 2)

**Bump v167 → v168** (notes user-facing inchangées)

---

</details>

<details id="v163">
<summary><strong>🗓️ 15/05/2026 (suite 11) — 🌐 v163 : Multi-alertes + annonce migration `myktamap.fr`</strong></summary>


Préparation de la migration de domaine du site historique `myktamap.is-underground.fr` vers le nouveau `myktamap.fr` (prévue **15 juillet 2026**). Approche cohabitation 60j (pas de kill switch immédiat) pour éviter toute perte de données utilisateur.

#### 1. Refactor `alertChecker.js` — support multi-alertes

L'ancien format mono-alerte (`{ active, level, title, ... }`) ne pouvait afficher qu'une seule alerte à la fois. Pour cohabiter annonce migration (info, permanente) ET alertes ponctuelles (incendie emergency, etc.), passage à un format `alerts[]`.

**Nouveau format `alert.json`** (rétro-compat assurée sur l'ancien) :
```json
{
  "active": true,
  "alerts": [
    { "id": "migration-myktamap-fr-2026", "level": "info", ... },
    { "id": "incendie-glaciere-juin-2026", "level": "emergency", ... }
  ]
}
```

**Acquittement individuel par `id`** : `localStorage["myktamap_alert_seen_<id>"]` au lieu d'une seule clé globale. L'user peut acquitter migration et garder incendie visible, et vice-versa. Fallback rétro-compat sur l'ancienne clé `myktamap_alert_seen` pour les id `legacy-*` (= alertes du format mono).

**Affichage en cascade** : `_afficherCascade(alerts)` itère sur les alertes triées par priorité (`emergency > warning > info`) puis `released` desc. Chaque modale appelle un callback `onClose` (nouveau 2e arg de `afficherModaleAlerte`) qui déclenche la suivante après 250ms.

**Nouvelle API exposée** :
- `AlertChecker.getActiveAlerts()` — pour le badge dynamique
- `AlertChecker.onChange(callback)` — listeners pour MAJ badge

#### 2. Badge 🚨 dynamique selon niveau max

Avant v163 : le badge 🚨 du loader était **toujours rouge pulsant** (peu importe le niveau d'alerte). Pour cohabiter info/warning/emergency, il devient **dynamique** :

| Situation | Apparence du badge |
|---|---|
| Au moins 1 `emergency` non acquittée | 🚨 rouge pulsant |
| Sinon, au moins 1 `warning` | 🚨 orange statique |
| Sinon, seulement `info` | 🚨 bleu discret |
| Aucune alerte active | 🚨 gris neutre |

**Pastille compteur** (cercle rouge en haut-droite) affichée si N > 1 alertes non acquittées. MAJ dynamique via le listener `AlertChecker.onChange`.

CSS : 4 nouvelles classes `.loader-btn-alert-{emergency|warning|info|none}` (l'ancienne `.loader-btn-alert` perd son style propre, c'est juste un sélecteur pour le JS).

#### 3. Nouveau module `js/migrationNotice.js` — modal pédagogique one-shot

Affichée **uniquement** sur `myktamap.is-underground.fr` (hostname gate strict), au premier lancement post-update.

**Persistance** :
- `"permanent"` → vue définitivement (clic "J'ai compris")
- ISO timestamp → vue mais pas définitif (clic "Plus tard") → re-affiche dans 7 jours

**Contenu** : sections "Quand ?" (15 juillet 2026), "Nouveau domaine" (lien `myktamap.fr` désactivé tant que `NEW_DOMAIN_LIVE = false`), "Que faire avant la coupure" (exporter sessions, garder ZIPs, supprimer PWA installée), "Pendant la transition" (cohabitation).

Hook splash identique aux autres modules (`notifySplashEnded`).

#### 4. Fichiers utilitaires (`docs/`)

- **`docs/nginx-redirect-old-domain.conf`** : conf Nginx à déployer **à J+60** (15 juillet 2026). Kill switch SW + page HTML de transition. Conservée en réserve, pas déployée maintenant.
- **`docs/alert-example-migration.json`** : exemple `alert.json` multi-alertes avec entrée info migration + emplacement commenté pour alerte ponctuelle. À déployer **maintenant** côté serveur ancien domaine pour le rappel récurrent via badge 🚨.

#### Stratégie complète de migration

| Phase | Période | Actions |
|---|---|---|
| **Phase 1 — Cohabitation** | J0 → J+60 | Les 2 domaines servent l'app. Modal one-shot + alerte `info` permanente. Aucune friction utilisateur. |
| **Phase 2 — Escalade** | J+30 → J+60 | Modifier `alert.json` : `level: info → warning` + bump `released` → force re-popup |
| **Phase 3 — Cut-off** | J+60 (15/07/2026) | Déployer `docs/nginx-redirect-old-domain.conf` sur ancien domaine. Kill switch SW auto + page transition. |

#### Fichiers modifiés (+~450 lignes)

| Fichier | Changement |
|---|---|
| `js/alertChecker.js` | Refactor complet : support `alerts[]` + acquittement par `id` + cascade + listeners onChange |
| `js/migrationNotice.js` | **NEW** module, modal one-shot persistée + hostname gate |
| `js/interface.js` | `afficherModaleAlerte(alert, onClose)` accepte callback de fermeture |
| `js/main.js` | Hook splash pour MigrationNotice |
| `index.html` | `<script src>` migrationNotice.js + badge 🚨 dynamique (50 lignes JS) |
| `css/style.css` | Classes badge dynamique + modal migration (charte jaune) |
| `sw.js` | Ajout migrationNotice.js dans ASSETS_TO_CACHE |
| `docs/nginx-redirect-old-domain.conf` | (de v162, conservé) |
| `docs/alert-example-migration.json` | **NEW** exemple format multi-alertes |
| `CLAUDE.md` §20 + §29 | Format alert.json v163 + section dédiée migration |
| `README.md` | Cette entrée |

**Bump v162 → v163** (notes user-facing inchangées).

#### Rétro-compat absolue

- Anciens déploiements `alert.json` mono-alerte → fonctionnent identiquement (auto-wrap dans `alerts:[{...}]` avec id `legacy-<released>`)
- Anciennes clés localStorage `myktamap_alert_seen` → fallback pour acquit des legacy-mono
- Badge 🚨 sur déploiements sans alert.json → classe `loader-btn-alert-none` (gris discret)
- Hostname autre que `myktamap.is-underground.fr` → `migrationNotice.js` totalement silencieux

---

</details>

<details id="v162">
<summary><strong>🗓️ 15/05/2026 (suite 10) — 🏗️ v162 : Champ "Niveau" sur les image layers</strong></summary>


Le mode multi-niveau supportait déjà le tagging par niveau des roads, zones, points (session + data layers). Manquait : les **image layers** (calques image du plan : légende, hachures, surcouches statiques). Quand le plan contient une légende dessinée pour le niveau 0 ET une légende différente pour le niveau -1, on veut que seule la bonne s'affiche selon le filtre Niveaux courant.

#### 1. Champ "Niveau" dans le générateur (createConf.js)

Nouveau champ `🏗️ Niveau` à côté de chaque calque image dans la modale `📦 Générateur de plan` :
- Visible **uniquement** si la case `🏗️ Plan multi-niveau (avancé)` est cochée
- Default `0` (rétro-compat absolue)
- Accepte les entiers négatifs (cf v154)
- Toggle dynamique : cocher/décocher la case multi-niveau affiche/cache les champs niveau des image layers existants en live

À la regénération du ZIP, le champ `level` est **toujours écrit** dans `plan-config.json > imageLayers[i].level`, même à `0`. Permet la traçabilité et facilite la re-édition (l'user voit `0` et peut le modifier au lieu de "level absent" qu'il pourrait croire à un bug).

#### 2. Runtime — filtre des image layers (map.js)

Nouveau registre `window._ktaImageOverlays = [{overlay, label, level}, ...]` peuplé à l'init de la map.

Nouveau helper global `window._applyLevelFilterToImageLayers()` :
- Skip si `multiLevel: false` (rétro-compat strict v161)
- Pour chaque overlay : compare `entry.level` à `APP_CONFIG.visibleLevels`
- Force `map.addLayer(overlay)` si niveau visible et pas déjà sur la map
- Force `map.removeLayer(overlay)` si niveau pas visible et présent sur la map
- Le checkbox Leaflet du calque dans le `L.control.layers` suit automatiquement (Leaflet écoute add/remove)

**Sémantique demandée par KARMA** : la modale Niveaux fait **autorité** sur le checkbox Leaflet. Si l'user a décoché manuellement un calque dans le control Leaflet et qu'on change de niveau visible, le calque est ré-activé (override). Entre 2 changements de niveau, l'user peut toggle librement le checkbox Leaflet.

#### 3. Filtre initial au chargement (map.js)

Au build initial des overlays, si `multiLevel: true` ET le niveau du layer n'est PAS dans `visibleLevels`, le layer n'est **pas** ajouté à la map (même si `layerConfig.visible: true` dans plan-config.json). Sinon comportement strictement v161 (= `layerConfig.visible`).

#### 4. Auto-extension `_etendreAvailableLevelsSiBesoin` (main.js)

Scan élargi pour inclure les image layers. Si un plan v148-v161 chargé avec une nouvelle conversion v162 du générateur (ZIP modifié avec niveau 3 explicite) contient un image layer à niveau 3, l'auto-extension étend `availableLevels` pour englober 3.

#### 5. Hook dans `appliquerFiltreNiveau` (interface.js)

Appel ajouté à la fin de la chaîne des appliquerFilterTo* — ordre cohérent avec les autres modules level-aware (roads, zones, points, tracker).

#### Périmètre strict

- ✅ Image layers (`PLAN_CONFIG.imageLayers`)
- ❌ Pas les data layers (déjà gérés via leurs propres registres)
- ❌ Pas le base layer (image principale, pas de niveau)
- ❌ Pas le collision layer (canvas interne, jamais visible utilisateur)

#### Rétro-compat

- Plans v147 et avant (sans `multiLevel`) : aucun changement
- Plans v148-v161 avec `multiLevel: true` mais sans `level` sur image layers : tous traités comme `level: 0`. S'affichent quand niveau 0 dans visibles, masqués sinon.
- L'user qui modifie un ZIP v148-v161 dans le générateur v162 voit `0` partout — peut affecter un vrai niveau s'il le souhaite.

#### Fichiers modifiés (+~70 lignes)

| Fichier | Changement |
|---|---|
| `js/createConf.js` | Champ niveau dans le HTML de `_ajouterImageLayer` + lecture/écriture dans la sauvegarde + listener toggle multiLevel |
| `js/map.js` | Registre `_ktaImageOverlays` + filtre initial + helper `_applyLevelFilterToImageLayers` |
| `js/main.js` | Reset registre au plan switch + scan image layers dans `_etendreAvailableLevelsSiBesoin` |
| `js/interface.js` | Hook dans `appliquerFiltreNiveau` |
| `CLAUDE.md` §26.2/§26.4 + `AI_CONTEXT.md` + `README_USER.md` | Mise à jour docs |

**Bump v161 → v162** (notes user-facing inchangées).

---

</details>

<details id="v158">
<summary><strong>🗓️ 15/05/2026 (suite 9) — 🧭 v158-v161 : Tracker directionnel (4 itérations)</strong></summary>


L'icône du tracker pointe maintenant dans la direction de marche pendant le tracking actif, à la place d'être statique. Source du heading = `getCurrentHeading()` (même que la boussole 🧭, cohérence du système). 4 versions car le path n'était pas trivial.

#### v158 — Première implémentation (BUGGÉE)

Tentative initiale avec `L.icon` (un simple `<img>` top-level). `_applyRotationToTrackerMarker()` appliquait `transform: rotate(N deg)` sur l'`<img>`. Nouvelle icône "spéléo casque sombre + lampe frontale" (variant E2 généré via PowerShell System.Drawing).

**Bug critique** : Leaflet applique `transform: translate3d(X,Y,0)` sur le **même** `<img>`. CSS `transform` n'est pas additive — le rotate écrasait le translate → l'icône collait au coin `(0,0)` au lieu de rester positionnée géographiquement.

#### v159 — Fix décalage (divIcon wrapper) + retour à l'icône A

- `iconeTrack` migré de `L.icon` → `L.divIcon` produisant `<div class="kta-tracker-divicon"><img class="kta-tracker-img"></div>`
- Le DIV reçoit le translate Leaflet, l'`<img>` reçoit notre rotate → 2 éléments distincts, 2 transforms indépendants
- CSS `.kta-tracker-divicon` : reset `background/border` (sinon `.leaflet-div-icon` default = fond blanc + bordure noire qui masque le PNG)
- Retour à l'icône **A** (cône GPS bleu + dot blanc, style Google Maps classique) — l'icône E2 spéléo était trop sombre/peu visible sur les plans clairs

#### v160 — Anti-jitter (smoothing + throttle + transition)

Le magnétomètre génère du bruit ±2-5° en continu même phone immobile → l'icône tremblait. Fix avec 3 techniques combinées :

| Technique | Avant v160 | v160 | Rôle |
|---|---|---|---|
| **Smoothing exponentiel** | aucun | α=0.25 (75% historique + 25% nouvelle) | Filtre le bruit haute fréquence à la source |
| **Throttle DOM** | 0.5° | 2° (sur valeur lissée) | Évite les updates DOM minuscules |
| **Transition CSS** | 0.15s | 0.3s | Absorbe les sauts résiduels visuellement |

Gestion correcte du **wrap 0-360°** : delta circulaire signé minimum pour éviter une rotation arrière de 340° quand on passe 350°→10° via le Nord.

#### v161 — Fix sentinel null (icône bloquée)

v160 utilisait `_trackerRotationLast = -999` comme valeur "jamais initialisée". Mon wrap-fix circulaire (`if abs(delta) > 180 → 360 - delta`) appliquait son math sur -999 : `360 - 1000 = -640 < 2` → **return immédiat** dès le premier appel → icône bloquée.

Fix : sentinel `null` + check explicite avant le math circulaire. Le throttle est skip au premier appel pour permettre l'application initiale.

**Lesson learned** documentée dans le commentaire d'en-tête : les sentinels "valeur impossible numérique" sont des pièges avec du math circulaire. Préférer `null` + check explicite.

#### Fichiers modifiés (cumulatif v158→v161)

| Fichier | Changement |
|---|---|
| `icon/iconetrack.png` | Variant E2 (v158) → Variant A (v159+) — cône GPS bleu charte |
| `js/map.js` | `iconeTrack` : `L.icon` → `L.divIcon` |
| `js/tracking.js` | `_applyRotationToTrackerMarker` + `_resetRotationTrackerMarker` (+~90 lignes au total) |
| `css/style.css` | `.kta-tracker-divicon` + `.kta-tracker-img` (transition 0.3s) |

#### Sémantique respectée

- ✅ Tracking actif → flèche dans direction de marche (`rotate(+heading)`)
- ❌ Tracking off → icône pointe Nord (`rotate(0deg)`)
- ❌ Recalage seul → icône statique
- Source heading = `getCurrentHeading()` (cohérent avec boussole 🧭)
- Combinaison boussole + tracker : les 2 doivent être cohérents visuellement. Boussole contre-tourne le N pour le garder en haut, tracker tourne dans la direction réelle → les 2 mouvements sont opposés mais cohérents (axes complémentaires).

---

</details>

<details id="v157">
<summary><strong>🗓️ 15/05/2026 (suite 8) — 🧭 v157 : Nouvelle icône dédiée pour la boussole</strong></summary>


Remplacement de l'icône utilisée par le widget 🧭 Boussole : passe de `icon/mkm-full.png` (rose des vents identité MyKTAMap) à **`icon/compass.png`** dédiée, avec **N/S/E/W marqués clairement** + flèche rouge sur le Nord. Beaucoup plus lisible à l'usage en cataphilie sombre.

**Périmètre strict** : uniquement le widget boussole et son modal plein écran. Le loader/splash garde `icon/mkm-full.png` qui reste l'identité visuelle de la marque (logo PWA + signature + splash).

Fichiers : `js/compass.js` (3 `src=` remplacés + commentaire d'en-tête), `sw.js > ASSETS_TO_CACHE` (ajout `./icon/compass.png`), nouveau `icon/compass.png` (24 Ko).

---

</details>

<details id="v156">
<summary><strong>🗓️ 15/05/2026 (suite 7) — 🐛 v156 : Fix sélection niveau négatif inactive</strong></summary>


Bug remonté par KARMA : dans la modale Niveaux, cliquer sur un bouton niveau négatif (`-1`, `-2`, …) ne mettait pas le bouton en jaune (`kta-actif`) et ne changeait pas le niveau actif.

**Cause** : `interface.js > _changerNiveauActif` ligne 2423 :
```js
if (!Number.isInteger(newLevel) || newLevel < 0) return;
```

Le check `newLevel < 0` était un reste de v148 où `availableLevels` était strictement `[0, 1, 2, 3]`. Il bloquait silencieusement tous les niveaux négatifs : return immédiat sans toucher à `activeLevel`, pas de refresh pastille, pas de re-render filtre.

**Fix** : retirer `|| newLevel < 0`. Garde le check `Number.isInteger` qui suffit (rejette null/undefined/NaN/strings). Commentaire explicatif ajouté pour éviter qu'un futur dev remette le check.

Vérification exhaustive : grep `level<0`, `lvl<0`, `newLevel<0` → 1 seul endroit dans tout le code (celui-ci).

---

</details>

<details id="v155">
<summary><strong>🗓️ 15/05/2026 (suite 6) — 🎨 v155 : Multi-niveau — segmented sur une seule ligne</strong></summary>


Quand l'user étendait beaucoup le range (>7 niveaux), le segmented control "Niveau actif" passait à la ligne. Refactor pour garder tout sur une seule ligne avec scroll horizontal.

**CSS `.kta-niv-segmented`** :
- `flex-wrap: wrap` → `nowrap`
- + `overflow-x: auto`, scrollbar styling discret (charte jaune, 6px height)
- + `-webkit-overflow-scrolling: touch` (smooth iOS)
- + `padding-bottom: 4px` (respiration scrollbar)

**JS `_ouvrirSelecteurNiveau`** : `scrollIntoView({ block:"nearest", inline:"center" })` sur le bouton actif à l'ouverture → si l'user a étendu à 10+ niveaux et que l'actif est hors viewport, on scroll automatiquement pour le centrer.

Section "Niveaux visibles" (checkboxes en grid) inchangée — le wrap a du sens là car chaque case fait 80-100px.

---

</details>

<details id="v154">
<summary><strong>🗓️ 15/05/2026 (suite 5) — 🏗️ v154 : Niveaux négatifs (sous-sols) + auto-extension availableLevels</strong></summary>


Évolution du mode multi-niveau pour mieux représenter les sites souterrains à étages (Glacière, Capucins) : le défaut passe de `[0, 1, 2, 3]` à `[-2, -1, 0, 1, 2]` pour distinguer sous-sols (négatifs) et étages supérieurs (positifs), avec 0 comme niveau de référence (RDC / éléments sans `level`).

#### 1. Niveaux négatifs supportés

`APP_CONFIG.availableLevels` accepte désormais des entiers négatifs. Tout le code level-aware existant utilise déjà `Number.isInteger(level) ? level : 0` ou `parseInt(...)` qui marche nativement avec les négatifs — aucune modification d'algorithme nécessaire (pathfinder, exports, filtres data layers, etc.).

#### 2. 2 boutons d'extension dans la modale Niveaux

Avant v154 : un seul bouton `+` qui étendait vers le haut (`max+1`).
Depuis v154 :
- **`[ + ]`** (à droite du segmented) : `max+1` — ajoute le prochain niveau supérieur
- **`[ − ]`** (à gauche du segmented) : `min−1` — ajoute le prochain niveau inférieur

Affichage **trié croissant** (gauche=négatif, droite=positif, comme un axe numérique). Pareil pour la section "Niveaux visibles" et la modale jonction interniveau.

#### 3. Auto-extension `_etendreAvailableLevelsSiBesoin`

Helper global qui scanne toutes les sources level-aware (session roads/zones/editorPoints + data layers via `_ktaDataMarkers/Polylines/Polygons`) et étend `availableLevels` pour englober le min/max trouvé. Appelé :
- Au plan load dans `lancerApplication` (1ère passe, session pré-existante)
- Après chargement de chaque data layer dans `utils.js > ajouterPointsDepuisJSON` (2ème passe, layers async)

Idempotent — peut tourner plusieurs fois sans effet de bord. Cas d'usage typique : plan v148-v153 où l'user avait étendu manuellement à `[0..4]`, chargé en v154 (range default `[-2..2]`) → l'auto-extension ajoute `3` et `4` pour que les éléments existants restent sélectionnables/filtrables.

#### 4. Pastille jaune "pill" extensible

`.kta-niv-pastille` passe de cercle fixe 22×22 à capsule (`min-width: 22px; padding: 0 4px; border-radius: 11px`) pour accepter `-1` et `-2` sans débordement. Font-size 13px → 12px + `letter-spacing: -0.3px` pour compacter horizontalement et rester dans le bouton Leaflet 30×30.

#### Fichiers modifiés

| Fichier | Lignes |
|---|---:|
| `js/config.js` | +5 (defaults `[-2, -1, 0, 1, 2]` au 2 endroits + commentaires) |
| `js/main.js` | +90 (helper `_etendreAvailableLevelsSiBesoin` + appel au plan load) |
| `js/utils.js` | +10 (appel après ajouterPointsDepuisJSON) |
| `js/interface.js` | +25 (tri croissant + bouton `−` + handler) |
| `js/exporter.js` | +3 (fallback + tri) |
| `css/style.css` | +5 (pastille pill extensible) |

#### Backward compat

- Plans v147 et avant (sans `multiLevel`) : aucun changement (mode désactivé par défaut, tout est traité comme niveau 0).
- Plans v148-v153 avec `multiLevel: true` : 100% compatibles. Si l'user avait niveau 3 ou 4, auto-extension ajoute ces niveaux silencieusement au load.
- Plans v148-v153 avec `availableLevels` persistés dans `plan-config.json` : aucun, car `availableLevels` est runtime-only (jamais sérialisé).
- Sessions sauvegardées : aucun impact (sérialisent `level` comme number, donc négatifs OK).

</details>

<details id="v153">
<summary><strong>🗓️ 15/05/2026 (suite 4) — 🔧 v153 : Fix double modale après crash V2</strong></summary>


Bug remonté par l'user : après un crash OOM pendant la génération V2, la modale "🧱❌ Génération V2 interrompue" était immédiatement suivie par la modale "⚠️ ARRÊT BRUTAL DÉTECTÉ" générique — les deux pointent vers le même événement mais V2 est plus spécifique.

**Cause** : 2 flags localStorage (`myktamap_session_alive` + `myktamap_v2_gen_in_progress`) restent posés après un kill OOM en cours de génération. `_checkPreviousKill` ET `_checkV2GenerationCrash` détectent leur flag, et le `fermer()` de la modale V2 ré-affichait la modale kill standard.

**Fix** : `_checkV2GenerationCrash` discard `_pendingKillInfo` quand un crash V2 est détecté (la modale V2 couvre déjà le sujet, plus actionnable). Le code de fermeture de la modale V2 ne ré-affiche plus la modale kill. Mise à jour du commentaire dans `flushPendingToasts` pour refléter la nouvelle priorité.

Bump v153 : `sw.js`, `js/copyright.js > __MKM__.build`, `version.json` synchronisés.

</details>

<details id="v152">
<summary><strong>🗓️ 15/05/2026 (suite 3) — 🛡️ v152 : Robustesse erreurs V2 + overlay chargement visible</strong></summary>


2 demandes utilisateur traitées : (1) erreurs explicites au crash de génération V2 (plus jamais d'erreur silencieuse) et (2) overlay de chargement de plan visible au centre (au lieu du discret `#loaderStatus` en bas).

#### 1. Try/catch ciblé + modal d'erreur visible

`_genererTuilesV2` :
- `drawImage` wrappé : si OOM → throw `Échec drawImage à z=N col=X k=Y — probable saturation mémoire (...)`
- `toBlob` wrappé : si retourne `null` → throw `Échec encodage JPEG de la tuile z=N col=X k=Y — saturation mémoire navigateur (...)`
- Écriture ZIP wrappée
- `_detectContentBBox > getImageData` wrappé : si CORS-tainted ou OOM → warn console + skip auto-crop (pas d'erreur fatale)

`_afficherErreurV2(titre, message)` : nouvelle modale plein écran rouge avec message d'erreur + conseils actionnables (PC, réduire image, JPEG q85). Remplace l'usage de `_plannerErreur` inline pour les erreurs critiques.

Heuristique OOM (regex `/m[ée]moire|drawImage|toBlob|saturation/i` sur le message) → suffixe automatique du message avec conseil spécifique.

#### 2. Flag de détection de crash silencieux

`localStorage.setItem("myktamap_v2_gen_in_progress", JSON)` posé AVANT la génération, retiré dans le `finally`. Si le navigateur kill la page (OOM iOS Safari, etc.), le `finally` ne tourne pas → le flag reste.

`oomGuard.js > _checkV2GenerationCrash()` détecte au boot suivant (fenêtre de fraîcheur 1h). Si flag présent → `_afficherModaleV2Crash(info)` affichée dans `flushPendingToasts` après le splash. Modale spécifique "🧱❌ Génération V2 interrompue" avec contexte du plan + conseils ciblés.

Priorité sur la modale "kill détecté" standard (cf §27.8 de CLAUDE.md).

#### 3. Overlay de chargement plein écran visible

3 fonctions exposées sur window :
- `_afficherOverlayChargement(msg)` : crée la modale plein écran avec spinner + message
- `_majOverlayChargement(msg)` : met à jour le message d'étape sans recréer la DOM
- `_fermerOverlayChargement()` : retire la modale

Appelée depuis :
- `chargerZipFichier` (index.html) au début → "Extraction du ZIP en cours…" → "ZIP extrait — Chargement de la carte…"
- `chargerPlanServeur` (main.js) au début → "Récupération du plan depuis le serveur…"
- `startImportedPlan` (main.js) pendant indexation V2 → "Plan V2 tuilé — Indexation X / Y tuiles…" (update toutes les 50 tuiles)
- `lancerApplication` (main.js) au render → "Initialisation de la carte et des calques…"
- Fermée dans le `finally` de `lancerApplication` → cleanup garanti en cas de succès OU d'erreur

CSS `.kta-load-*` : modale centrée, fond semi-transparent + blur, spinner 48px animé bleu charte, titre + message + hint italique en pied.

#### 4. Fichiers touchés (8 modifiés)

| Fichier | Lignes | Rôle |
|---|---:|---|
| `js/createConf.js` | +95 | try/catch ciblé, `_afficherErreurV2`, flag in-progress, message si abort |
| `js/oomGuard.js` | +95 | `_checkV2GenerationCrash` + `_afficherModaleV2Crash` + hook flush |
| `index.html` | +50 | overlay chargement (afficher/maj/fermer) + hook dans `chargerZipFichier` |
| `js/main.js` | +30 | hooks overlay dans `chargerPlanServeur` + indexation tuiles + `lancerApplication` finally |
| `css/style.css` | +110 | `.kta-load-*` + `.kta-v2-error-*` |
| `sw.js`, `js/copyright.js`, `version.json` | — | bump v152 + 4 notes user |
| `CLAUDE.md` | +50 | §27.8 ajoutée |

#### 5. Backward compat

- Aucun changement sur les plans V1 ou Multi-niveau hors V2 — l'overlay de chargement bénéficie à TOUT plan (V1 trivialement, V2 explicitement)
- Le flag de crash n'est posé que si V2 generation activée
- `_afficherErreurV2` n'apparaît que si génération V2 throw une erreur catchée

---

</details>

<details id="v151">
<summary><strong>🗓️ 15/05/2026 (suite 2) — 🧱 v151 : V2 améliorations workflow + perfPreset bypass</strong></summary>


3 améliorations sur la conversion V2 suite au feedback de la session de test v149 / v150.

#### 1. V2 disponible en mode Nouveau plan

Auparavant la checkbox 🧱 V2 était cachée en mode `Nouveau` (visible UNIQUEMENT en mode Modifier qui exposait `_plannerOrigAssets`). Logique : on avait besoin d'un File source pour générer les tuiles. Mais en Nouveau, l'utilisateur upload son image via `pl_baseImage` → on a un File aussi !

Fix :
- `_majVisibiliteCheckboxV2()` factorise la logique → visible si mode Modifier OU si baseImage uploadée
- Hook sur le change handler de `pl_baseImage` pour rafraîchir
- `_genererZip` utilise `_getFile("pl_baseImage", baseImageName)` qui gère les 2 sources

#### 2. Modal d'avertissement au check V2

La conversion V2 est lourde (CPU + RAM, ~256 Mo pour image 8K). Sur iOS Safari plafonné à ~500 MB, l'utilisateur peut crasher pendant la génération. Modal d'avertissement au check de la case :
- Section "📱 Sur mobile" (rouge) : risque OOM élevé sur image >50 Mo ou >8K
- Section "💻 Sur ordinateur" (vert) : recommandé, aucune limite mémoire en pratique
- Note finale : une fois le ZIP V2 généré sur PC, il s'importe sans coût sur mobile (c'est le but de V2)
- Boutons : `Annuler (décocher)` / `J'ai compris — Continuer`
- Backdrop click + Escape = annuler

#### 3. V2 + perfPreset=off → bypass tuilage

Si l'utilisateur choisit `Mode performance: Désactivé` au loader sur un plan V2, le runtime saute le tuilage et charge l'image source directement via `L.imageOverlay(url, bounds)` (comportement V1 brut). Le `baseImage` du plan-config est toujours présent dans le ZIP (le générateur V2 ne le supprime pas), donc fallback sans crash.

Use case : comparer V2 vs V1 sur le même plan, ou bypass temporaire du système de tuiles pour troubleshooting.

#### 4. Fichiers (5 modifiés)

| Fichier | Changement |
|---|---|
| `js/createConf.js` | +80 (helper `_majVisibiliteCheckboxV2`, modal `_afficherAvertissementV2`, bind change handler, `_genererZip` accepte mode Nouveau, `_getFile` au lieu de `_plannerOrigAssets`) |
| `js/tiling.js` | +10 (test `preset === "off"` avant routing V2, fallback `L.imageOverlay`) |
| `css/style.css` | +65 (styles `.kta-v2-warn-*` modal violet cohérent badge V2) |
| `sw.js`, `js/copyright.js`, `version.json` | bump v151 + 3 notes user |
| `CLAUDE.md` | §27.7 ajoutée (améliorations v151 documentées) |

#### 5. Backward compat

- Plans V1 : aucun changement de comportement
- Plans V2 existants : continuent à fonctionner comme avant (sauf si l'utilisateur force perfPreset=off, choix volontaire)
- Le warning modal V2 n'est jamais déclenché si l'utilisateur ne touche pas la case (mode passif)

---

</details>

<details id="v149">
<summary><strong>🗓️ 15/05/2026 (suite 1) — 🧱 v149 : Tiling V2 Option B (multi-imageOverlay)</strong></summary>


Pivot vers **Option B** après échec des approches GridLayer / TileLayer.extend testées en v148 puis archivées (branche `v2-work-archive`). Système de découpage d'image en tuiles 512×512 sur 4 niveaux de zoom Google Maps-like, pour les gros plans qui saturent la RAM mobile.

#### 1. Approche

| Aspect | Approche archivée (GridLayer) | Approche Option B (depuis v149) |
|---|---|---|
| Coord math tuile | Y inversé, `_tileZoom` clamping, lazy blob URL péremption | **Aucune** — Leaflet positionne via bounds latLng |
| Code custom Leaflet | `TileLayer.extend`, override `createTile`, `getTileUrl` | Aucun — `L.imageOverlay` standard |
| Risque de bug visuel | Plusieurs régressions corrigées en cascade | Quasi-nul (même primitive que V1 classique) |
| Lazy loading natif | Oui (GridLayer auto) | Non — mais swap on `zoomend` = ~équivalent en pratique |
| Mémoire effective | ~16 MB / niveau visible | **~16 MB / niveau visible** (idem) |

Conclusion : on perd le lazy loading natif mais on **gagne en simplicité + fiabilité visuelle**. Le swap manuel des overlays sur `zoomend` n'a en RAM que les tuiles du niveau courant à tout moment.

#### 2. Génération (cherry-pick depuis v2-work-archive)

Réutilise le code générateur de `_genererTuilesV2` archivé (slice direct via `drawImage` à 9 args, pas de canvas intermédiaire — contourne la dégradation silencieuse Chrome > 256 MP) + `_detectContentBBox` pour auto-crop des marges blanches.

**Nouveauté UI** dans `js/createConf.js` : checkbox `🧱 Convertir en V2 tuile (performance)` visible uniquement en mode Modifier. Default coché si source déjà V2 (re-tilage), décoché sinon (opt-in user).

**Manifest dans plan-config.json** :
```json
{
  "plan": { "tiledV2": true, "imageWidth": ..., "imageHeight": ... },
  "tiling": {
    "version": 2,
    "tileSize": 512,
    "format": "jpeg",
    "minNativeZoom": -3,
    "maxNativeZoom": 0
  }
}
```

Tuiles dans `data/tiles/z<N>/x<col>_y<-k>.jpg`, convention Y NÉGATIF (CRS.Simple : k=1 = bottom).

#### 3. Runtime Option B (réécriture from scratch)

**Détection** dans `js/tiling.js > chargerImage` :
```js
if (PLAN_CONFIG.plan.tiledV2 === true && PLAN_CONFIG.tiling) {
  return _chargerImageV2OptionB(bounds, map, PLAN_CONFIG.tiling);
}
```

**Algorithme** :
1. `_choisirNiveau(mapZoom)` → clamp à `[minNativeZoom, maxNativeZoom]`
2. `_renderNiveau(z)` → cleanup overlays précédents + crée N `L.imageOverlay` pour le niveau z avec bounds latLng calculés. `pane: "tilePane"` pour ordre Z correct sous les overlays vectoriels.
3. `map.on("zoomend", _onZoom)` → swap si nécessaire

**Lazy blob URL** : tuiles enregistrées via `registerAsset(path, file, {lazy: true})` (config.js extension). `_resoudreUrlTuile(z, col, k)` crée la blob URL à la demande, cache dans `asset.url`, track dans `state.blobUrlsCreated`. Revoke au cleanup.

**State global** : `window._tilingV2State = { currentLevel, activeOverlays, blobUrlsCreated, zoomHandler }`. Cleanup propre via `window._libererTuilesV2()` au plan switch (hook dans `main.js > _libererRessourcesPlanPrecedent`).

#### 4. Fichiers touchés (6)

| Fichier | Changement |
|---|---|
| `js/createConf.js` | +280 (`_genererTuilesV2`, `_detectContentBBox`, checkbox UI, intégration dans `_genererZip`) |
| `js/tiling.js` | +145 (`_chargerImageV2OptionB`, `_libererTuilesV2`, détection en tête de `chargerImage`) |
| `js/config.js` | +20 (`registerAsset` opt `lazy: true`, `findMatchingFile` accepte `file._fullPath`) |
| `js/main.js` | +18 (scan tuiles dans `startImportedPlan`, hook cleanup V2 dans `_libererRessourcesPlanPrecedent`) |
| `index.html` | +7 (`file._fullPath = entry.name` dans `extraireZip`) |
| `css/style.css` | +45 (`.kta-planner-tiling-v2-row` checkbox style violet `#b452ff`) |
| `sw.js`, `js/copyright.js`, `version.json` | bump v149 |

#### 5. Workflow utilisateur

1. Ouvrir le 📦 Générateur de plan → onglet **Modifier un plan existant**
2. Uploader un ZIP V1 (plan classique)
3. Cocher ☑️ **🧱 Convertir en V2 tuile (performance)**
4. Optionnellement modifier d'autres champs (nom, calques, etc.)
5. Cliquer 📦 **Générer le ZIP** → overlay de progression "Niveau z=-N · X / Y tuiles (Z%)"
6. ZIP téléchargé avec suffixe `_v2` (ex: `plan_xxx_v2.zip`)
7. Re-importer ce ZIP via le loader → le mode V2 s'active automatiquement (détection `plan.tiledV2`)

Conversion lente (1-5 min sur image typique 4-16K px), une seule fois.

#### 6. Backward compat

- Plans V1 (sans `plan.tiledV2`) : strictement v148, aucun changement de comportement
- Plans serveur dans `data/test1`, `data/test2`, etc. : restent V1 par défaut
- Modifier un V2 sans toucher la case = re-tilage. Décocher = downgrade V2 → V1 (tuiles non reportées)
- Multi-niveau + V2 : indépendants, fonctionnent ensemble

#### 7. Hors scope (futur)

- Tuiles côté serveur (`data/<plan>/tiles/...`) : pour l'instant V2 uniquement via import ZIP
- Tuiles sans black border sur les bordures partielles (générer natural-size + bounds tighter)
- Préchargement des tuiles adjacentes (vu que le swap est on `zoomend`, légère latence au premier render après un changement de zoom)

---

</details>

<details id="v148">
<summary><strong>🗓️ 15/05/2026 — 🏗️ v148 : Mode multi-niveau (carrières multi-étages)</strong></summary>


Gros morceau : support des **carrières/galeries multi-étages** (Glacière, Capucins, sites avec plusieurs niveaux empilés physiquement). Phase 1A (data model + UI) + Phase 2A (filtre + intégration toutes fonctions) + Pathfinder niveau-aware en une seule release.

#### 1. Opt-in par plan (3 voies)

```
APP_CONFIG.multiLevel ←
  PlanRegistry[id].multiLevel       (toggle ⚙️ Réglages, prime sur le reste)
  ↓ sinon
  PLAN_CONFIG.plan.multiLevel       (depuis plan-config.json, défaut du générateur)
  ↓ sinon
  false                             (rétro-compat v147 stricte)
```

- ⚙️ Réglages → `🏗️ Mode multi-niveau (avancé)` (persisté dans PlanRegistry)
- 📦 Générateur de plan → case `🏗️ Plan multi-niveau` → écrit `plan.multiLevel: true` dans plan-config.json
- Édition manuelle du JSON

**Rétro-compat absolue** : plans v147 et avant n'ont jamais de champ `level` sur leurs items → fonctionnent strictement identique tant que le toggle est OFF.

#### 2. UI dédiée

| Élément | Visible si multiLevel ON |
|---|---|
| Bouton pastille `[N]` jaune sous le zoom (top-left, `L.control`) | Oui |
| Modale niveau (2 sections : actif + visibles) | Au clic sur la pastille |
| Sous-action 🪜 Jonction interniveau dans groupe Tracés | Oui |
| Boussole décalée à `top:130px` (au lieu de 80px) | Via `body.kta-multilevel-active` |
| Section `🏗️ Niveaux à exporter` dans export Avancé | Oui |

#### 3. Data model

- Roads / Zones / Editor points : `level: number` à la création
- Tracker position : `trackerLevel` interne (set au ▶️ Play, au recalage clic, au recalage sur point)
- Data layer items : `level: number` **optionnel** dans le JSON (`puits.json`, etc.)
- Jonctions : type spécial `"jonction"` + `fromLevel` + `toLevel` + polyline N points
- `APP_CONFIG.activeLevel` (single, pour dessiner) + `APP_CONFIG.visibleLevels` (Set, pour filtrer)

#### 4. Filtrage runtime

`window.appliquerFiltreNiveau()` orchestre :
- `renderRoads` / `renderZones` (filtre au rendu)
- `_applyLevelFilterToEditorPoints` / `DataPoints` / `DataRoads` / `DataZones` (setOpacity / setStyle)
- `_applyLevelFilterToTracker` (marker + polyline parcouru)

`currentRoad` / `currentZone` toujours visibles pendant le tracé (override filtre, sinon user clique sans rien voir).

Jonctions visibles si `fromLevel` OU `toLevel` ∈ `visibleLevels`.

#### 5. Pathfinder niveau-aware (`pathfinder.js`)

- Segments tagués `level: number | "transit"` (jonction = transit)
- Nodes tagués `nodeLevels: Set<number|"transit">` (sets multi-niveau pour les jonction endpoints)
- 3 sous-loops d'enrichissement (intersection, T-junction, endpoint-endpoint) **skip les pairs de niveaux incompatibles**
- Jonctions = **seuls bridges** entre niveaux (connectent via first/last node qui portent fromLevel/toLevel)
- `_insertVirtualNode` (waypoint snap) : virtual node hérite du niveau du segment snapped
- MultiLevel OFF → tous les helpers compat retournent true → comportement v147 strict

#### 6. Exports

| Mode | Comportement |
|---|---|
| **Export PNG rapide** (`utils.js > telechargerPlan`) | WYSIWYG : applique `window.passeFiltreNiveau(item)` qui lit `visibleLevels` du runtime |
| **Export PNG avancé** (`exporter.js`) | Section dédiée `🏗️ Niveaux à exporter` avec checkboxes (défaut = visibleLevels actuels). **Découplé** du filtre map. |
| **Session export Full/Avancé/Conversion** | Aucun filtre — `JSON.stringify` préserve automatiquement `level`/`fromLevel`/`toLevel` |
| **SessionPersist auto-save** | Idem |

#### 7. Fichiers touchés (12)

| Fichier | Lignes ajoutées |
|---|---:|
| `js/config.js` | +12 (APP_CONFIG fields multiLevel/activeLevel/visibleLevels/availableLevels) |
| `js/planRegistry.js` | +25 (getMultiLevel/setMultiLevel + fallback param) |
| `js/main.js` | +20 (init au plan load + reset registres) |
| `js/road.js` | +80 (style jonction, filtre `_passeFiltreNiveau` + intersection cross-level, helper global) |
| `js/zones.js` | +18 (level création + filtre rendu) |
| `js/editor.js` | +35 (level création + filtre marker via opacity) |
| `js/utils.js` | +110 (registres `_ktaDataMarkers/Polylines/Polygons` + filtres + style jonction export rapide) |
| `js/tracking.js` | +50 (trackerLevel + filtre marker + polyline + recalage) |
| `js/interface.js` | +220 (Leaflet control niveau + modale 2 sections + helpers + toggle Réglages + sous-action 🪜) |
| `js/pathfinder.js` | +150 (segments/nodes level + 3 helpers compat + filter dans enrichissement + virtual node level) |
| `js/exporter.js` | +90 (section 🏗️ Niveaux modale Avancé + helper `_itemPasseLevels` + filtres roads/zones/points session + embedded + jonction style + ronds endpoints) |
| `js/createConf.js` | +35 (checkbox 🏗️ dans planner + pré-remplissage en mode Modifier + écriture dans plan-config.json) |
| `css/style.css` | +200 (`.kta-niv-pastille` badge + `.kta-niv-*` sections modale + `.kta-level-*` control + `.kta-jct-*` modale jonction + `.kta-planner-multilevel-row` planner + override position boussole) |

#### 8. Bugs corrigés en route (validation terrain v148.test)

- Cercles d'intersection apparaissaient entre roads de niveaux différents qui se croisaient visuellement → fix dans `_calculerIntersectionsRoads` + `_enrichirGrapheAvecCroisements` (pathfinder)
- Pastille "Niv 0" débordait du sub-action button → simplifiée en chiffre seul `[0]` (badge jaune)
- 🪜 actif → re-clic réouvrait la modale au lieu de désactiver → fix toggle dans onClick
- Modes ✏️ saisie point + 🪜 jonction activables en même temps → fix `_desactiverTousLesModes()` dans `_activerJonctionMode`
- Pendant le tracé d'une road/zone, si son niveau n'était pas dans visibleLevels → invisible → user voyait rien → fix `currentRoad/currentZone === item` toujours visible
- Roads dans data layers ignoraient le filtre niveau → fix registre `_ktaDataPolylines` + filtre setStyle
- Marqueurs visuels sur jonctions manquaient → ronds magenta+blanc aux extrémités (∅14px)

#### 9. Bump

- `sw.js > CACHE_NAME` : v147 → v148
- `js/copyright.js > __MKM__.build` : v147 → v148
- `version.json` : v148 + 6 notes user

#### 10. Hors scope (futur)

- TableEditor support du champ `level` (édition manuelle de niveau sur points existants)
- Distance totale par niveau (breakdown dans la modale 📏)
- Recherche `🔍` filtrable par niveau
- Pré-aperçu visuel "✕ ce niveau bloque ton itinéraire" dans la modale itinéraire si waypoints isolés
- Indicateur visuel sur la map pour les jonctions (label "0↔1" au survol ?)

---

</details>

<details id="v147">
<summary><strong>🗓️ 14/05/2026 (suite 1) — 🧭 v147 : Fix heading tracker + Widget boussole + Popup avertissement</strong></summary>


Retour terrain en carrière : "tourner à droite → tracker tourne à gauche, avancer → recule". 3 livrables pour traiter le problème et ses conséquences UX.

#### 1. Fix math `getHeading` (tracking.js)

L'ancienne formule (depuis le premier commit) avait :
- **Signe inversé** sur la composante East : `+sin α cos β` au lieu de `-sin α cos β` → swap Est↔Ouest pour téléphone à plat (formule géométrique fausse).
- **Termes spurious en γ** : `cos α sin γ sin β`, `cos α cos γ sin β`, etc. — ne devraient pas exister dans la projection de l'axe Y device (rotation autour de Y laisse Y invariant).
- **Aucune gestion** de la pose verticale (téléphone tenu en main, β ≈ 90°) → cos β ≈ 0 → calcul dégénéré.

**Conséquences mesurées** :

| α (deviceorientation) | Direction réelle | Code v145 | Code v147 |
|---:|:---:|:---:|:---:|
| 0 | Nord | Nord ✅ | Nord ✅ |
| 270 | Est | **Ouest** ❌ | Est ✅ |
| 180 | Sud | Sud ✅ | Sud ✅ |
| 90 | Ouest | **Est** ❌ | Ouest ✅ |

**Fix** : math propre dérivée de la matrice W3C Z-X'-Y'' (intrinsèque) + bascule adaptative Y/-Z selon `|cos β|` (axe Y device pour pose plate, axe -Z pour pose verticale).

#### 2. Cascade de sources d'orientation

Avant : un seul listener `deviceorientation`, pas d'usage de `webkitCompassHeading`.

Après :

1. **iOS** : `event.webkitCompassHeading` capté en priorité (compass calibré natif iOS, 0=N CW). Plus précis que tout calcul depuis α/β/γ.
2. **Android moderne** : listener `deviceorientationabsolute` (au lieu de `deviceorientation`) → `event.alpha` référencé true North.
3. **Fallback** : calcul via `getHeading` corrigé.

Log throttled 1Hz `[Tracking] Heading : NNN.N° (source: webkitCompassHeading | calc-absolute | calc-relative)` pour debug terrain.

#### 3. Widget boussole (`js/compass.js`, nouveau ~200 lignes)

Outil de validation visuelle : rose des vents tournante affichant le vrai Nord en temps réel. Permet à l'utilisateur de vérifier d'un coup d'œil que le heading est cohérent.

**Deux vues** :
- **Widget flottant** : top-left, sous les boutons de zoom Leaflet. Rose 100px desktop / 80px mobile + texte "N 12°" / "NE 45°" / "O 270°" (notation française). Clic ✕ ferme, clic ailleurs ouvre le modal plein.
- **Modal plein** : pattern `.kta-readme-modal-overlay`. Rose 240px + cardinal en gros jaune + angle + hint + liste de validation 4 cardinaux + note armatures métalliques.

Réutilise `icon/mkm-full.png` (rose des vents jaune de la charte, déjà cachée par le SW). rAF unifié pour widget + modal (querySelectorAll sur classes partagées).

Entrée UI : sous-action 🧭 dans le groupe Tracker (après ▶️ Play, avant 📍 Mode recalage).

**API** : `window.CompassWidget = { show, hide, toggle, isVisible, openFull, closeFull }`. `window.getCurrentHeading()` exposé côté tracking.js (lecture seule).

#### 4. Popup d'avertissement au ▶️ Play

Modal au premier clic ▶️ Play de la session, rappelant que le module est expérimental et NE PAS l'utiliser pour se localiser en situation réelle.

**Contenu** : lead rouge, paragraphe dérive cumulative + armatures, sections ✅ usages OK (debug, calibration, détection pas) / ❌ NE PAS (localisation réelle, itinéraire fiable, perte → ⛑️), note recalage 📍.

**iOS-safe** : `requestPermission()` appelé synchronement dans le click handler de "J'ai compris" → préserve le user gesture iOS, la popup native permission s'affiche normalement après.

**Persistance** : flag in-memory `_trackerWarningAcknowledged` (pas de localStorage) → réaffiché à chaque reload de page. Volontaire pour le caractère safety-critical.

Le bouton 🧭 Boussole **ne** déclenche **pas** cette popup (c'est un outil de debug légitime, pas un démarrage de tracking).

#### 5. Fichiers touchés

| Fichier | Changement |
|---|---|
| `js/tracking.js` | Réécriture `getHeading` + `initOrientation` + nouvel export `window.getCurrentHeading()` |
| `js/compass.js` | **Nouveau** (~200 lignes) |
| `js/interface.js` | Sous-action 🧭 Tracker + helper `_afficherAvertissementTracker` + flag module |
| `css/style.css` | Styles `.kta-compass-widget` + `.kta-compass-full-*` + `.kta-tracker-warn-*` |
| `index.html` | `<script src="js/compass.js">` avant interface.js |
| `sw.js` | `./js/compass.js` ajouté à `ASSETS_TO_CACHE` + CACHE_NAME v146 → v147 |
| `js/copyright.js` | `__MKM__.build` v146 → v147 |
| `version.json` | Bump + notes user |
| `CLAUDE.md` | Sections §24 (fix heading) + §25 (boussole + popup) |
| `README_USER.md` | Section boussole + warning popup tracker |

#### 6. Pièges à connaître pour les futures interventions

- ⚠️ Ne PAS toucher à `requestPermission()` côté tracking.js sans tester iOS : c'est le geste utilisateur de la popup permission iOS qui est synchronisé avec le clic UI.
- ⚠️ Ne PAS ajouter `setTimeout` / `await` non-synchrone entre le clic "J'ai compris" et `requestPermission()` → casse le user gesture iOS.
- ⚠️ La formule `getHeading` doit rester math-propre (W3C). Si on ajoute un mode (autre pose de tél), ajouter une branche conditionnelle plutôt que de modifier les existantes.
- ⚠️ Le widget boussole et le modal plein partagent la classe `.kta-compass-rotating-rose` (et `.kta-compass-{text,cardinal,angle}-display`). Ne pas réutiliser ces noms ailleurs.

---

</details>

<details id="v146">
<summary><strong>🗓️ 14/05/2026 — 🧹 v146 : Fix mode tracé/zone après suppression + Distance totale inclut roads masquées</strong></summary>


Deux petits bugs identifiés en utilisation réelle (cf. CLAUDE.md §23 + §15).

**Bug 1 — Icône mode tracé/zone reste allumée après suppression du tracé en cours**

Reproduction (avant fix) :
1. Activer 🟩 Route principale dans la sidebar → icône passe en `kta-actif`, premier point posé sur la carte.
2. Ouvrir 🧹 Effacer → choisir 🗑️ "Tous les tracés" (ou ✂️ "Dernier tracé entier" si c'est le tracé en cours).
3. `resetRoads()` remet `window.modeRoad = null` côté road.js → la road est bien effacée, MAIS l'icône reste visuellement allumée dans la sidebar.
4. Cliquer sur la carte → rien (logique, `modeRoad` est null) → state incohérent du point de vue utilisateur.

**Cause** : double state entre `road.js` (currentRoad + window.modeRoad) et `interface.js` (`_modesActifs["road"]` + classe DOM sur le bouton). Les fonctions `resetRoads` / `removeLastRoad` ne touchent pas au state UI.

**Fix** :
- `road.js` expose `window.getCurrentRoad()` (lecture seule).
- `zones.js` expose `window.getCurrentZone()`.
- `interface.js` ajoute 2 helpers `_fermerModeRoad()` / `_fermerModeZone()` qui appellent `desactiverFn()` + retirent `kta-actif` du bouton + delete `_modesActifs[k]`.
- Appliqués dans les 4 actions du menu suppression (roads et zones) avec **logique conditionnelle** :
  - ✂️ Dernier tracé entier : ferme le mode seulement si `getCurrentRoad()` était non-null AVANT et null APRÈS.
  - 🎯 Clic sélection : ferme le mode seulement si la road cliquée === `getCurrentRoad()` avant.
  - 🗑️ Tous : ferme inconditionnellement.
  - ↩️ Annuler dernier point : ne ferme PAS (user continue à tracer).
- Idem zones.

**Bug 2 — "Distance totale des tracés" ne compte pas les routes masquées**

Le panneau 📏 utilisait `window.getEmbeddedRoads()` qui filtre par visibilité du calque Leaflet (`hasLayer`). Incohérent avec :
- Pathfinder qui utilise `getAllEmbeddedRoads()` (cf README_USER conseil perf "masquer le calque routes pour gagner en perf rendu tout en gardant le pathfinder fonctionnel")
- Recherche de points qui inclut les points des calques masqués

**Fix** : `_rdRoadsExploitables()` (interface.js) utilise désormais `getAllEmbeddedRoads()`. Le surlignage magenta s'applique aussi aux roads masquées — c'est OK car le layer magenta est séparé et se voit indépendamment du calque sous-jacent. CLAUDE.md §15 mis à jour.

**Bump version `v145 → v146`** :
- `sw.js > CACHE_NAME`
- `js/copyright.js > __MKM__.build`
- `version.json > version` + notes utilisateur

---

</details>

<details id="2026-05-13-s6">
<summary><strong>🗓️ 13/05/2026 (suite 6) — 🏷️ Badge version cliquable dans le footer (avec notes intégrées)</strong></summary>


Badge version dans le footer copyright du loader, qui devient un **indicateur d'update + bouton d'action** :

**États visuels du badge** :

| Cas | Affichage | Style | Cliquable ? |
|---|---|---|---|
| **Pas d'update** | `v143` | Gris monospace discret avec bordure subtile | Oui → modale "Déjà à jour" |
| **Update dispo** | `v141 → v142` | **Bleu accent `#8cb4ff` clignotant** (animation `kta-version-update-pulse` 1.8s) + cursor pointer | Oui → modale "🔔 Mise à jour disponible" |

**Au clic sur le badge** : appelle `UpdateChecker.showCurrent()` qui force le re-fetch + affiche soit la modale d'update (bypass snooze 24h + LS_SEEN), soit une **modale compacte "Déjà à jour"** avec :
- Version installée (depuis `__MKM__.build`)
- Date de publication (depuis localStorage cache UpdateChecker)
- **Notes de cette version** (changelog)

**Nouvelles API `window.UpdateChecker`** (js/updateChecker.js) :
- `showCurrent()` : force le re-fetch + modale update (bypass snooze)
- `onCheck(callback)` : s'inscrit aux résultats de check() → permet à l'UI (badge) de réagir au résultat fresh sans devoir poller le LS

**Modale compacte "Déjà à jour"** (`afficherModaleAlerteAbsente` enrichi) :
- Backdrop **0.55 opacité** au lieu de 0.88 (plus léger, moins invasif pour 2-3 lignes d'info)
- Box max-width 440px, hauteur déterminée par le contenu (pas de plein-écran inutile)
- Bloc "Notes de cette version" avec liste à puces, lu depuis `localStorage["myktamap_last_version_data"]`
- Échap pour fermer (event listener nettoyé)
- CSS dédié `.kta-alert-absent-overlay.kta-alert-absent-compact` (vs héritage `.kta-readme-modal-overlay` lourd)

**Wire-up du badge** (`_initFooterVersion` dans le script du loader) :
- Évaluation initiale via `localStorage["myktamap_last_version_data"]` au DOM ready
- Re-évaluation via `UpdateChecker.onCheck()` après le fetch frais (couvre le cas où la version a changé entre 2 boots)
- Si remote != installed → ajoute la classe `.kta-loader-copyright-version-update` + onclick + role/tabindex/title

**Fix bug wrap badge** : `white-space: nowrap` + `display: inline-block` + `vertical-align: baseline` empêchent le texte "v141 → v142-test-badge" de casser au milieu. Si la ligne est trop étroite, le badge passe entier à la ligne suivante au lieu de wrap.

**3 sources de vérité version à bumper ensemble** (à chaque release) :
- `sw.js > CACHE_NAME` (cache PWA)
- `js/copyright.js > __MKM__.build` (constante embarquée, affichée dans le badge)
- `version.json > version` (source serveur, comparée par UpdateChecker)

**Animation `@keyframes kta-version-update-pulse`** : box-shadow + background pulsent doucement (0% → 50% → 100% sur 1.8s ease-in-out infinite). Au hover : animation stoppée, contraste renforcé.

**`sw.js`** : `CACHE_NAME` v140 → v143 (4 itérations : badge cliquable, fix wrap, modale compacte avec notes, et bump pour propager).

---

</details>

<details id="2026-05-13-s5">
<summary><strong>🗓️ 13/05/2026 (suite 5) — 🎚️ Loader : drawer "Réglages de performance" + fix bug rotation + badge version footer</strong></summary>


Regroupement des réglages perf existants (Tiling) et nouveaux (Mode ULTRA) dans une **box déroulable unique** au loader, plus un badge version au footer + fix d'un bug de layout.

**Drawer "Réglages de performance"** (`<details id="loaderPerfDrawer">`) :
- Wrappe le Tiling existant (segmented control, par plan) + les toggles Mode Performance ULTRA (par sessions, globaux)
- **Fermée par défaut** pour réduire la hauteur visuelle initiale du loader (l'utilisateur déploie à la demande)
- Summary cliquable "🎚️ Réglages de performance" + chevron ▾ qui pivote à 180° quand ouvert
- Séparateur `<hr class="kta-loader-perf-sep">` dashed entre Tiling et toggles ULTRA
- CSS dédié `.kta-loader-perf-drawer*` avec border, rounded, overflow:hidden

**Badge version au footer copyright** :
- Nouveau `<span id="loaderCopyrightVersion">` en fin de `kta-loader-copyright-line2`
- Style monospace gris discret avec bordure rounded subtile
- Rempli au boot par `_initFooterVersion()` :
  - Priorité 1 : `window.__MKM__.build` (depuis copyright.js)
  - Fallback : `localStorage["myktamap_last_version_data"].version` (cache UpdateChecker)
  - Ultime : "v?"

**Fix bug rotation mobile** : "le footer grandit après rotation landscape→portrait" sur iOS Safari.
- Cause probable : iOS Safari applique auto-text-size-adjust après rotation, gonflant le texte
- Fix CSS sur `.kta-loader-copyright` :
  - `-webkit-text-size-adjust: 100%` + standard `text-size-adjust: 100%`
  - `line-height: 18px` (absolu) au lieu de `1.6` (em-based) → hauteur déterministe
  - `flex-shrink: 0` + `box-sizing: border-box` → évite la distorsion au reflow

**Code** :
- `index.html` : refactor du bloc perf en `<details>` + ajout des toggles ULTRA dans le drawer + span version dans le footer
- `index.html > _initPerfUltraToggles` : sync visuel + bind change events sur les checkboxes (lecture/écriture via `window.PerfUltra`)
- `index.html > _initFooterVersion` : remplissage version
- `js/copyright.js > __MKM__.build` : `"2026.05.09"` → `"v140"` (puis bumps suivants au fur et à mesure des fixes du badge)
- `css/style.css` : `.kta-loader-perf-drawer*` (~60 lignes), `.kta-loader-perf-sep`, `.kta-loader-perf-divider`, `.kta-loader-perf-hint`, fix `.kta-loader-copyright` (text-size-adjust), badge `.kta-loader-copyright-version`

**`sw.js`** : `CACHE_NAME` v138 → v140 (drawer puis fix rotation + badge).

---

</details>

<details id="2026-05-13-s4">
<summary><strong>🗓️ 13/05/2026 (suite 4) — 🚀 Mode Performance ULTRA : 6 toggles d'optimisation pour gros plans / appareils faibles</strong></summary>


Système de toggles activable depuis **⚙️ Réglages → section "🚀 Mode Performance ULTRA"** pour gérer les crash récurrents sur les très gros plans (4000+ × 2000+ pixels) avec beaucoup de tracés. Préset bloc **🚀 ULTRA** qui active les 6 optims d'un coup, ou ajustement fin via toggles individuels.

**6 optims implémentées** (aucune ne touche à l'image — déjà gérée par le mode performance au chargement) :

| Toggle | Effet | Trade-off visuel |
|---|---|---|
| 🪜 **Décimer les tracés au dézoom** | Ramer-Douglas-Peucker avec epsilon dynamique selon zoom (0→16 px) | Tracés moins lisses au dézoom |
| ⚡ **Désactiver animations zoom/pan** | `zoomAnimation/fadeAnimation/markerZoomAnimation = false` | Transitions abruptes au lieu d'animées (**reload requis**) |
| 🎯 **Désactiver cercles intersections** (gros plans) | Seuil abaissé à 50 routes (vs 200 normal) | Pas de cercles aux carrefours au-delà |
| 🚫 **Désactiver popups sur calques données** | Skip `bindPopup` sur les markers data-layer | User doit utiliser 🔍 pour interagir |
| 🐢 **Auto-save lent (30s)** | `POLL_INTERVAL_SLOW_MS = 30000` au lieu de 1500 | Risque de perdre ~30s en cas de crash |
| 👁️ **Ne rendre que les tracés visibles** | AABB check vs viewport + 10% padding → skip création L.polyline | Pop-in léger au pan |

**Architecture** :
- Nouveau module **`js/perfUltra.js`** (~150 lignes) — singleton `window.PerfUltra` avec :
  - `get(key)`, `set(key, value)`, `setUltra(bool)`, `getAll()`, `isUltra()`, `onChange(callback)`
  - Persistance `localStorage["myktamap_perf_toggles"]` (préférence globale, pas par plan, cohérent avec debugMode)
  - Defaults all `false` → comportement existant strictement préservé pour les users actuels
- **Modules consommateurs** s'inscrivent à `onChange` pour re-render à la volée :
  - `road.js` : re-render sur `decim/viewportCull/noIntersect` + sur `moveend/zoomend` si les deux toggles correspondants sont actifs
  - `sessionPersist.js` : restart polling sur changement de `slowSave`
  - `map.js` : lit `animOff` UNIQUEMENT à l'init (reload requis)
  - `utils.js > ajouterPointsDepuisJSON` : lit `noTooltips` à chaque marker créé

**UI dans ⚙️ Réglages** (`js/interface.js`) :
- `_renderPerfUltraSection()` génère le HTML avec 1 toggle master ULTRA (accent jaune) + 6 toggles individuels
- Hint italique sous chaque toggle explicitant le trade-off perf/visuel
- `animOff` a un **liseré orange** (classe `.kta-perf-ultra-row-danger`) pour signaler le besoin de reload
- Master ULTRA active/désactive les 6 d'un coup. Visuel auto-sync : si l'user toggle individuellement jusqu'à atteindre les 6 → ultra apparaît coché automatiquement.

**Helpers d'implémentation** :
- `js/road.js > _decimatePointsRDP(pts, epsilon)` : RDP itératif (évite récursion profonde sur les longues polylines). `_decimationEpsilon()` retourne 0/2/4/8/16 selon zoom.
- `js/road.js > _roadIntersectionMaxRoads()` : 50 ou 200 selon toggle.
- `js/road.js > renderRoads` : viewport AABB calculé une fois en début de fonction, comparé à `_bboxOfRoad(road)` (helper déjà existant pour les intersections).
- `js/sessionPersist.js > _currentPollInterval()` : 1500 ou 30000.

**`sw.js`** : `js/perfUltra.js` ajouté à `ASSETS_TO_CACHE`. `CACHE_NAME` v137 → v138.

---

</details>

<details id="2026-05-13-s3">
<summary><strong>🗓️ 13/05/2026 (suite 3) — 🚨 Bouton alerte dans le loader (icône sirène + style collé au 📖)</strong></summary>


Ajout d'un bouton **🚨** dans le header du loader, à gauche du **📖 Documentation**, pour permettre à l'utilisateur de **re-consulter l'alerte en cours** à tout moment (utile s'il a déjà cliqué "J'ai compris" et veut revérifier les consignes), OU de **confirmer "Aucune alerte en cours"** si la situation est revenue à la normale.

**Comportement au clic** (`AlertChecker.showCurrent()`) :

| État `alert.json` | Modale affichée |
|---|---|
| `active: true` | **Modale d'alerte rouge pulsante** (force le re-affichage, bypass de l'acquittement local) |
| `active: false` | **Modale verte sobre** "✅ Aucune alerte en cours" |
| Fichier renommé (404, ex : `alert.lock`) | **Idem** "✅ Aucune alerte en cours" |
| Offline | **Modale neutre** "📡 Vérification impossible" |

**Style** : icône `🚨` (sirène rotative), fond rouge saturé `rgba(220,53,69,0.22)`, glow box-shadow pulsant 2.2s (sans agresser), hover plus rouge avec animation stoppée. Wrap des 2 boutons (🚨 + 📖) dans `.loader-header-actions` avec `gap: 4px` → ils sont collés visuellement, séparés du titre par le `gap: 12px` du parent.

**Workflow auteur** pour désactiver une alerte :
- **Option A** : passer `"active": false` dans `alert.json`
- **Option B** : renommer `alert.json` → `alert.lock` (préserve la structure pour réutilisation future)

Dans les deux cas, les users qui cliquent 🚨 voient la modale verte "Aucune alerte en cours" → confirmation visuelle que la situation est OK.

**Code** :
- `js/alertChecker.js > showCurrent()` : fetch frais avec cache-bust + 3 modales selon l'état (alerte / pas d'alerte / offline). Distinct du `check()` automatique au boot qui respecte le LS_SEEN et la queue splash.
- `js/interface.js > afficherModaleAlerteAbsente(status)` : modale verte sobre, backdrop cliquable (vs emergency qui force le clic OK).
- `index.html > loader-header-actions` : nouveau wrapper flex pour les 2 boutons.
- `css/style.css > .loader-btn-alert` : style sirène + animation `@keyframes loader-btn-alert-pulse`.

**`sw.js`** : `CACHE_NAME` v134 → v136 (deux itérations : v135 ajout du bouton, v136 ajustement style sirène + collé).

---

</details>

<details id="2026-05-13-s2">
<summary><strong>🗓️ 13/05/2026 (suite 2) — 🚨 Système d'alertes publiques via `alert.json`</strong></summary>


Nouveau système indépendant de la version pour **diffuser des messages d'alerte** aux utilisateurs en temps réel (incendie en cataphilie, fermeture d'accès, perturbation...). Cas d'usage immédiat : incendie criminel dans une carrière calcaire de la région parisienne, gaz toxiques résiduels nécessitant de prévenir la communauté.

**Architecture** (alignée sur le pattern UpdateChecker + OOMGuard) :

`alert.json` (racine, **non caché par le SW**) :
```json
{
  "active":   true | false,
  "level":    "emergency" | "warning" | "info",
  "title":    "🚨 ALERTE — ...",
  "message":  "Texte principal",
  "details":  ["consigne 1", "consigne 2", ...],
  "released": "2026-05-13T14:00:00Z"
}
```

L'auteur active/désactive l'alerte en éditant **uniquement ce fichier** — pas besoin de toucher au code JS ni bumper le SW.

**Mécanisme côté client** (`js/alertChecker.js`, ~180 lignes au final) :
- `check()` au boot : fetch alert.json avec cache-bust `?_=${Date.now()}` + `cache: "no-store"` → contourne le SW
- Si `active: true` ET `released != localStorage["myktamap_alert_seen"]` → modale queue
- `notifySplashEnded()` flushé par `main.js > _splashEnd()` (pattern OOMGuard) → modale apparaît APRÈS le splash, jamais par-dessus
- `dismiss(released)` appelé au clic OK → stocke `released` en localStorage → plus de popup au reload tant que `released` est identique
- **Si l'auteur publie une nouvelle alerte** (changement du `released` timestamp) → re-popup pour tous, y compris ceux qui avaient acquitté l'ancienne
- Offline / 404 → silencieux (pas de popup, comportement normal)

**Modale** (`js/interface.js > afficherModaleAlerte(alert)`) :
- 3 variantes visuelles via class `kta-alert-level-{emergency|warning|info}` :
  - **emergency** : bordure rouge `#ff6b6b` + glow box-shadow + animation `kta-alert-glow` (pulse 1.8s) + `!` qui pulse de chaque côté du titre (0.9s) + bouton OK rouge sombre
  - **warning** : orange `#ff8a5c` static
  - **info** : bleu `#8cb4ff` static
- Backdrop opaque 94% (focus max)
- **Volontairement PAS de fermeture au clic backdrop** : alerte critique, l'utilisateur doit cliquer "J'ai compris" pour acquitter
- Helper `_esc()` local pour échappement HTML (anti-XSS sur le contenu remote)

**Persistance** :
- **Une fois acquittée** → silencieuse pour cet utilisateur même après mise à jour douce, même après plusieurs reloads
- **Mise à jour douce** ne touche pas le localStorage → acquittement préservé
- **Reset complet** purge localStorage → re-popup au prochain reload (comportement attendu : fresh install)
- **Nouveau timestamp `released`** → re-popup garantie pour tous

**Code** :
- `alert.json` (nouveau, racine) : valeurs initiales avec alerte V2 réelle (`active: true`, niveau emergency, contenu pro/prévention).
- `js/alertChecker.js` (nouveau, ~180 lignes) : `check()`, `notifySplashEnded()`, `dismiss()`, `showCurrent()`. State interne `_pendingAlert` + `_splashEnded`.
- `js/interface.js > afficherModaleAlerte` + `afficherModaleAlerteAbsente` (modale "pas d'alerte" pour la suite 3).
- `js/main.js > initApp` : `AlertChecker.check()` lancé après `UpdateChecker.check()`. `_splashEnd()` appelle `AlertChecker.notifySplashEnded()` après les autres.
- `index.html` : `<script src="js/alertChecker.js">` avant interface.js.
- `sw.js` :
  - `js/alertChecker.js` ajouté à `ASSETS_TO_CACHE`
  - `alert.json` **NON** ajouté (volontaire) → toujours fetched réseau-only, comme `version.json`
  - Commentaire d'en-tête à jour pour documenter ce choix

**`sw.js`** : `CACHE_NAME` v133 → v134.

---

</details>

<details id="2026-05-13-s1">
<summary><strong>🗓️ 13/05/2026 (suite 1) — 🎯 Générateur : position initiale tracker auto-centrée (W/2 × H/2)</strong></summary>


Avant : `pl_startX` et `pl_startY` avaient `value="0"` en dur dans le HTML, donc les nouveaux plans démarraient toujours avec le tracker dans le coin haut/bas-gauche (selon la conversion CRS Simple). Pas pratique : l'utilisateur devait deviner les bonnes coordonnées.

Après : la position initiale est **auto-recentrée au milieu du plan** (arrondi(W/2), arrondi(H/2)) dès que l'image principale est chargée et que ses dimensions sont auto-détectées (cf. entrée du jour sans suite).

**Comportement détaillé** :

| Cas | Comportement |
|---|---|
| Mode **nouveau** | Champs vides au chargement (placeholder `"auto = W/2"` / `"auto = H/2"`). Remplis automatiquement au choix de l'image. |
| Mode **modifier** avec valeurs non-nulles | Valeurs restaurées telles quelles depuis `plan-config.json` (rétro-compat) |
| Mode **modifier** avec `0/0` | Considérées "non configurées" → recentrées (changement bénin : 0/0 plaçait le tracker dans un coin de toute façon) |
| Bouton **🎯 Recentrer la position de départ** | Force `W/2 × H/2` même si l'utilisateur a déjà tâtonné. Flash CSS vert bref sur les inputs pour confirmer visuellement. |
| Bouton 🎯 sans image chargée | Erreur dans `_plannerErreur` : *"Charge l'image principale d'abord — sans dimensions, impossible de calculer le centre."* (auto-cleared après 4s) |

**Rétro-compatibilité confirmée** :
- Anciennes archives : `t.startX/startY` restaurés via `?? 0` comme avant
- **Structure JSON exportée IDENTIQUE** : `tracking { startX, startY, ... }`. Le code `_genererZip` lit toujours `pl_startX/pl_startY` depuis le DOM. On change uniquement la valeur **par défaut** au moment de la saisie.

**Code** :
- HTML : `value="0"` retiré, remplacé par `placeholder="auto = W/2"` et hint `(centre auto si vide)` dans le label
- HTML : nouveau bouton `.kta-planner-tracking-actions > #pl_resetStartCenter`
- `_appliquerDimensions` : check `noPos` puis remplit `pl_startX/Y` à `round(W/2)`, `round(H/2)`
- `_recentrerPositionInitiale` : helper du bouton 🎯, avec flash CSS via `@keyframes kta-planner-flash-ok`

**`sw.js`** : `CACHE_NAME` v132 → v133.

---

</details>

<details id="2026-05-13">
<summary><strong>🗓️ 13/05/2026 — 🏗️ Générateur de plan : auto-détection des dimensions de l'image principale</strong></summary>


Suppression de la saisie manuelle largeur/hauteur, remplacée par une **auto-détection** au moment du choix du fichier image. Plus d'erreur "dimensions ne correspondent pas à l'image" possible.

**UI** :
- Les 2 inputs number "Largeur (px)" / "Hauteur (px)" sont remplacés par un **encadré display dédié** sous les infos générales
- `pl_width / pl_height` deviennent des `input[type=hidden]` (les autres modules qui les lisent — `_genererZip` ligne 613-614 — fonctionnent inchangés)
- **État initial** : encadré bleu *"Dimensions : en attente du chargement..."*
- **Après upload OK** : encadré vert ✅ *"Dimensions auto-détectées : W × H px · Z Mo"*
- **Si erreur de lecture** : encadré rouge ⚠️ *"Impossible de lire les dimensions"*

**Warnings rouges** (seuils alignés sur les limites pratiques mobiles vues ailleurs dans l'app) :
- 🚨 **Grande dimension** : > 10 000 px de côté → *"Risque de crash mémoire mobile. Pense à choisir un mode performance bas, ou réduire l'image avant import."*
- 🚨 **Gros fichier** : > 30 Mo → *"Le ZIP final sera lourd. Privilégie JPEG qualité 85 plutôt que PNG, ou recadre l'image pour gagner en taille."*

**Mode "Modifier existant"** : les dimensions du plan importé sont affichées + analysées de la même façon (sans re-décoder l'image — lecture directe depuis `plan-config.json` + taille du File via `_plannerOrigAssets[name].size`).

**Code** :
- `_lireImageDimensions(file)` : Promise → `{width, height}` via `Image` + `naturalWidth/Height` + blob URL (léger, juste le header décodé)
- `_appliquerDimensions(width, height, fileSizeBytes)` : met à jour les hidden inputs + render le display avec classes `ok/warn/err`
- Constantes `PLANNER_DIM_WARN_PX=10000`, `PLANNER_FILE_WARN_MB=30`
- Hook `change` sur `pl_baseImage` (nouvelle modale + mode modifier)
- `_preRemplirFormulaire` (mode modifier) : appelle `_appliquerDimensions` avec les dims plan-config + la taille du File depuis `_plannerOrigAssets`

**CSS** (~70 lignes) :
- `.kta-planner-dim-display` : 3 variantes (`ok #6ce28a` / `warn #f4c542` / `err #ff6b6b`)
- `.kta-planner-dim-warnings` : bloc séparé pour les warnings, lignes en orange

**`sw.js`** : `CACHE_NAME` v131 → v132.

---

</details>

<details id="2026-05-11-s3">
<summary><strong>🗓️ 11/05/2026 (suite 3) — 🖼️ Fix export PNG/JPEG : fallback automatique pour gros plans JPG source</strong></summary>


**Bug** : sur les plans dont l'image source est en JPG haute résolution (typique car JPG compresse bien à l'upload, donc on s'autocensure moins sur les dimensions), `canvas.toBlob(cb, "image/png")` retournait **`null` silencieusement**. Cause : l'encodage PNG d'un gros canvas demande `width × height × 4 bytes` de RAM en continu — au-delà de ~250-400 Mo bruts (≈ 8000×8000 px), Safari iOS et Chrome Android refusent. JPEG en revanche est progressif (streamé bloc par bloc) et tolère des dimensions bien plus grandes.

**Fix** : fallback automatique dans les deux modes d'export (`utils.js > telechargerPlan` mode rapide et `exporter.js > _exporterAvance` mode avancé) :
- Si `toBlob("image/png")` retourne null → retry avec `toBlob("image/jpeg", 0.92)`.
- Si le JPEG échoue aussi → message d'erreur clair suggérant le mode avancé avec résolution ½ ou ¼.
- Plan PNG raisonnable → comportement inchangé (PNG produit).
- Plan trop grand → l'utilisateur récupère un `.jpg` q=0.92 au lieu d'une erreur silencieuse. Qualité visuellement transparente pour un plan cartographique.

**Code** :
- `js/utils.js > telechargerPlan` : helper `_exporter(mime, ext, quality)` puis try PNG / catch retry JPEG / catch erreur claire.
- `js/exporter.js > _exporterAvance` : helper `_tryEncode(targetMime, targetExt, targetQuality)`, fallback uniquement si l'utilisateur avait demandé PNG (sinon erreur directe sur JPEG échec).

**`sw.js`** : bump CACHE_NAME (sw.js a été modifié, propagation cache).

---

</details>

<details id="2026-05-11-s2">
<summary><strong>🗓️ 11/05/2026 (suite 2) — 🤖 AI Context : externalisation à la racine + anti-hallucination renforcé + prompt copiable</strong></summary>


Refactor majeur de la fonctionnalité **🤖 Aide IA** introduite la veille (10/05 suite 15) :

**Avant** : tout le contexte IA était inline dans `js/interface.js > _genererContenuContexteIA()` (~210 lignes de concaténation de strings). Pour enrichir le contexte (ajouter une FAQ, une recette), il fallait éditer le JS et bumper le SW.

**Après** : le contenu vit dans un fichier statique **`AI_CONTEXT.md` à la racine**, avec placeholders runtime `{{DATE}}`, `{{BUILD}}`, `{{README_USER}}`. La fonction JS est réduite à ~30 lignes (template.replace). Pour enrichir → éditer le `.md` directement, le SW propage.

**Structure du nouveau `AI_CONTEXT.md`** :
1. **Bandeau légal** (auteur, licence CC BY-NC-SA 4.0, code non public, collaboration sur demande)
2. **Préambule IA renforcé** :
   - ⛔ Bloc "TOLÉRANCE ZÉRO À L'HALLUCINATION" en tête
   - Procédure de vérification en 4 étapes (cherche dans tout le document, considère synonymes, cite la section)
   - 📋 **Listes fermées** anti-hallu (zones, tracés, icônes, modes perf, formats) + **survol des fonctionnalités principales** (15 modules : multi-plans, recherche, tracker, itinéraire, mode urgence, mesure, distance totale, etc.)
   - 💬 Modèles de réponse prêts à l'emploi
3. **Doc utilisateur intégrale** (README_USER.md injectée)
4. **📚 Glossaire** (15 termes)
5. **🍳 Recettes** pas-à-pas (9 workflows : 1ère utilisation, charger ZIP, point, route, itinéraire, sauvegarder/partager, créer plan, optimiser, mode urgence, intégrer session définitivement)
6. **❓ FAQ** enrichie

**Nouveau bouton "Copier le prompt" dans la modale 🤖 Aide IA** : `<textarea readonly>` avec un prompt court anti-hallucination (5 règles ⛔/✅ + demande "OK, prêt") pré-rédigé, à coller au premier message de l'IA AVEC le fichier `.md`. Bouton 📋 Copier qui utilise `navigator.clipboard.writeText` (HTTPS) ou fallback `execCommand("copy")`.

**Renforcement anti-hallu suite à un retour user** : l'IA disait initialement "le mode urgence n'existe pas" car le bloc anti-hallucination ne listait que des sous-listes (zones, tracés, icônes...) et n'incluait pas les **fonctionnalités globales** comme le mode urgence. Ajout d'une section "Fonctionnalités principales" listant les 15 modules de l'app. Procédure de vérification revue pour considérer les synonymes ("mode urgence ≡ Je suis perdu", "itinéraire ≡ trajet", etc.) avant de conclure à l'inexistence.

**Code** :
- `AI_CONTEXT.md` : nouveau fichier à la racine, ~400 lignes éditable.
- `js/interface.js > _genererContenuContexteIA(aiContextTemplate, readmeUserText)` : passe à 30 lignes (template.replace + fallback minimal si fetch échoue).
- `js/interface.js > afficherModaleAideIA` : nouvelle section "📋 Prompt prêt à coller" avec textarea + bouton Copier.
- `js/interface.js > download handler` : fetch parallèle `AI_CONTEXT.md` + `README_USER.md` via Promise.all.
- `sw.js > ASSETS_TO_CACHE` : ajout de `./AI_CONTEXT.md`.

**`sw.js`** : bump CACHE_NAME (nouvelle ressource cachée).

---

</details>

<details id="2026-05-11-s1">
<summary><strong>🗓️ 11/05/2026 (suite 1) — 🔔 Détection de mise à jour : modale + mise à jour douce vs reset complet</strong></summary>


Système de notification automatique quand une nouvelle version de l'app est dispo. L'utilisateur n'a plus à vider manuellement le cache pour bénéficier des correctifs.

**Mécanisme** :
- Fichier `version.json` à la racine, contient `{ version, released, notes[] }`. NON caché par le SW.
- Module `js/updateChecker.js` au boot fetche `version.json` avec cache-bust (`?_=${Date.now()}` + `cache: "no-store"`) pour contourner le SW cache-first.
- Compare la version reçue avec `localStorage["myktamap_known_version"]`.
- Si différente + pas snoozée + pas 1er run → modale **🔔 Mise à jour disponible** affichée.
- 1er run → stocke silencieusement, pas de popup à l'installation.
- Offline → silencieux, garde l'ancienne valeur.
- Snooze 24h si user clique "Plus tard" (localStorage `myktamap_update_postponed_at`).

**Différée après splash** : pattern identique à `OOMGuard.flushPendingToasts()`. Si la modale doit s'afficher pendant le splash (~4s), elle est mise dans `_pendingModalArgs` puis flushée par `_splashEnd()` via `UpdateChecker.notifySplashEnded()`. Plus de popup par-dessus le gradient sombre.

**Modale 🔔** : tableau "Installée → Disponible" (versions monospace), notes de version, avertissement, **3 actions** :
- **Plus tard (24h)** : snooze
- **🪶 Mise à jour douce** *(défaut, primary vert)* : purge **uniquement** le cache PWA + reload. Préserve sessions, plans, préférences, IndexedDB, localStorage. Implémentée via `mettreAJourCodeSeul()` dans `interface.js` : ping Internet + `reg.update()` + `caches.delete` + reload.
- **💥 Forcer un reset complet** *(lien rouge discret)* : `viderCacheAppli()` historique, purge tout (table rase).

**Pourquoi 2 modes** : l'ancien viderCacheAppli faisait table rase à chaque update — user perdait ses plans importés et sa session. La mise à jour douce résout 99% des cas et n'est plus destructrice. Le reset complet reste dispo en fallback si un état corrompu persiste.

**Code** :
- `version.json` (nouveau) : indicateur de version + notes.
- `js/updateChecker.js` (nouveau) : `UpdateChecker.check()`, `notifySplashEnded()`, `_showOrDefer()`.
- `js/interface.js` : `window.afficherModaleUpdateDispo({localVersion, remote, onAcceptSoft, onAcceptHard, onPostpone})`, `mettreAJourCodeSeul()` avec overlay progression, modale offline dédiée.
- `js/main.js > initApp()` : appelle `UpdateChecker.check()` au boot. `_splashEnd()` appelle `UpdateChecker.notifySplashEnded()`.
- `index.html` : `<script src="js/updateChecker.js">` avant interface.js.
- `sw.js` : nouveau fichier dans ASSETS_TO_CACHE (sauf version.json, on veut réseau-only avec fallback localStorage).

**`sw.js`** : bump CACHE_NAME (nouveaux fichiers cachés).

---

</details>

<details id="2026-05-11">
<summary><strong>🗓️ 11/05/2026 — ⛑️ Mode urgence "Je suis perdu" : module complet d'estimation de position en cataphilie</strong></summary>


Nouvelle fonctionnalité majeure (~700 lignes JS + 200 lignes CSS) accessible via la sidebar **🧭 Tracker → ⛑️ Je suis perdu — Mode urgence** (sous-action orange distinctive). Estime la **zone probable** où peut être l'utilisateur à partir de sa dernière position connue, du temps écoulé et d'indices visuels observés.

**Cas d'usage** : tu es sorti(e) sans tracker actif ou il a dérivé. Tu sais où tu étais il y a X minutes, et tu observes maintenant des éléments distinctifs ("bidon eau", "épure bélier"). L'app croise tout ça pour proposer une zone de recherche + une localisation probable affinée.

**Saisie position** (3 méthodes combinables) :
- 🔎 Recherche autocomplete d'un point existant par nom/id/tag (insensible aux accents : NFD + diacritiques)
- 📍 Clic direct sur la carte (modale se met en retrait)
- 🧭 Position actuelle du tracker (si actif)

**Paramètres** :
- ⏱️ Temps écoulé : slider 1-90 min (plafond 1h30 — au-delà la zone devient non pertinente)
- 🏃 Vitesse présumée (défaut 1.5 km/h, marche cataphile lente)
- 📊 **Marge de sécurité** (défaut ×1.0, ex-"Incertitude" renommé pour clarté) : élargit le rayon pour compenser détours, demi-tours, erreurs d'estimation du temps. Valeurs typiques ×1.0 (strict) → ×1.5 (prudent) → ×2+ (très incertain).
- 🔮 Indices visuels (texte libre) : l'app cherche les mots dans `nom + id + description + tags + label calque` de **tous les points du plan** (data layers + editor session), insensible casse + accents.

**Calcul** :
- Rayon en mètres = `vitesse_km_h × 1000 × temps_min / 60 × marge_sécurité`
- Rayon px = `rayon_m × APP_CONFIG.scale`
- "Dans la zone" = distance euclidienne ≤ rayon depuis la dernière position
- Localisation probable affinée = barycentre des matches in-zone (si ≥ 1)

**Rendu carte** (couleurs anti-collision avec Effondrement rouge / Eau bleu / Itinéraire cyan / Distance highlight magenta) :
- **Cercle orange `#ff6b35`** pulsant : zone de recherche. **Polygone 96-segments SVG** (pas `L.circle`, qui bugge avec CRS.Simple + preferCanvas — interprétation du rayon imprévisible).
- **Marker vert `#6ce28a`** pulsant 📍 : dernière position connue.
- **Markers violets `#b452ff`** pulsants 🔮 : indices in-zone (les plus pertinents).
- **Markers gris `#8892a4`** statiques : indices hors zone (exclus).
- **Cercle violet intérieur** pulsant : localisation probable affinée.
- Détection "rayon > plan" → bande d'alerte orange dans les résultats : *"Le rayon dépasse la taille du plan — tu pourrais être n'importe où"*.

**Popups markers** stylés à la charte dark (classe `.kta-lost-popup-wrapper`) : titre orange pour dernière position, badges violet/gris in-zone/out-zone, distance jaune monospace, description du point.

**📚 Bloc dépliable "Bonnes pratiques"** en haut de la modale (couleur ambre `#f4c542`, fermé par défaut) — 6 catégories thématiques de conseils cataphiles :
- 🧘 Garde ton calme (Stop. Inspire. Pas de panique.)
- 🗺️ Orientation (reviens sur tes pas, axes principaux/roulages, boussole physique, écoute les bruits)
- 🔦 Lumière & ressources
- 📡 Communication (réseau près des puits → préviens AVANT batterie morte)
- 📍 Si tu décides d'attendre (endroit identifiable, marquage)
- ⚠️ À ne pas faire (suivre l'eau, passages inconnus, se fier au tracker)

**Actions** :
- 📋 **Copier le rapport** : texte structuré dans le presse-papiers (plan, position, temps, indices, loc affinée, timestamp) — utile en offline pour SMS/radio cataphile.
- ✅ **Supprimer la zone et sauvegarder ma position supposée** : retire les layers ET ajoute un point éditeur permanent (icône ⚠️ danger) à la loc probable, exportable comme tout autre point.
- 🔄 **Recalculer** : modifie les paramètres et relance sans repartir de zéro.
- 🗑️ **Effacer la zone et fermer** : retire la zone et les markers sans sauvegarder.
- 👁️ **Fermer** (et ✕ + clic backdrop) : ferme juste la modale, **garde la zone visible** sur la carte. Re-clic ⛑️ restaure tous les paramètres + résultats précédents (`_restaurerEtatModale`).

**Cleanup au plan switch** : `LostMode._onPlanSwitch()` appelé par `main.js > _libererRessourcesPlanPrecedent()`.

**⚠️ Important rappelé partout dans l'UI et la doc** : c'est une estimation **purement géométrique**, isotrope (pas de suivi du réseau de routes), basée sur des hypothèses fragiles. Ne remplace **PAS** une opération de secours réelle (fil d'Ariane, boussole physique, lampe de secours, carte papier, et la règle d'or : prévenir quelqu'un en surface AVANT la sortie).

**Code** :
- `js/lostMode.js` (nouveau, ~700 lignes) : module IIFE complet. State interne, calcul rayon, recherche indices avec `_normalizeStr` (NFD + diacritiques), rendu carte SVG forcé + diagnostic logs, génération rapport, cleanup, modale UI complète.
- `js/interface.js > initInterface()` : sous-action `⛑️ Je suis perdu — Mode urgence` ajoutée au groupe Tracker avec `cssClass: "kta-sous-action-urgence"`. Helper `_creerGroupeAccordeon` enrichi du paramètre `cssClass`.
- `js/interface.js > afficherAide()` : entrée ⛑️ ajoutée dans la section 🧭 Tracker de la modale d'aide avec paragraphe explicatif.
- `js/main.js > _libererRessourcesPlanPrecedent()` : hook `LostMode._onPlanSwitch()`.
- `css/style.css` : ~250 lignes ajoutées (modale, sliders, accordion bonnes pratiques ambre, markers SVG polygone, popups charte).
- `README_USER.md` : nouvelle section ⛑️ détaillée avec cas d'usage type ("épure 'Bélier' + bidon d'eau") + récap des bonnes pratiques.
- `AI_CONTEXT.md` : nouvelle recette **J** + nouvelle entrée FAQ ("Je suis perdu dans la cata, comment l'app peut m'aider ?").
- `index.html` : `<script src="js/lostMode.js">` avant interface.js.
- `sw.js > ASSETS_TO_CACHE` : ajout de `./js/lostMode.js`.

**`sw.js`** : bump CACHE_NAME v107 → v128 (parcours complet de la session d'itérations : visualisation, persistance, popups, fixes).

---

</details>

<details id="2026-05-10-s15">
<summary><strong>🗓️ 10/05/2026 (suite 15) — 🤖 Aide IA : fichier de contexte téléchargeable pour assistance IA externe</strong></summary>


Nouvelle fonctionnalité dans le groupe **📚 Aide / Documentation / Légende** : une sous-action **🤖 Aide IA** qui permet à l'utilisateur de télécharger un fichier `.md` contenant tout le contexte d'usage de l'app, à coller dans n'importe quelle IA conversationnelle pour obtenir une assistance personnalisée.

**Cas d'usage** : l'utilisateur veut poser une question sur l'app à ChatGPT/Claude/Gemini/etc. mais l'IA ne connaît pas MyKTAMap par défaut → télécharge le contexte, le donne à l'IA, et obtient des réponses ciblées et à jour.

**Structure du fichier `MyKTAMap-AI-Context-{date}.md` généré** :
1. **Entête métadonnées** : date d'export, build app, URL, licence, usage commercial, collaboration, auteur
2. **Mode d'emploi utilisateur** : étapes pour utiliser le fichier dans une IA + exemples de questions
3. **Instructions IA** : rôle d'assistant, règles strictes (source unique, honnêteté, étapes claires), exemples Q/R
4. **Documentation utilisateur complète** : `README_USER.md` fetched dynamiquement et inclus tel quel
5. **FAQ rapide** : problèmes courants (tracker dérive, crash chargement, session perdue, itinéraire impossible, partage de plan, modifier icônes)

**Confidentialité** : le fichier ne contient **QUE la documentation** — aucune donnée personnelle (pas de plans, points, sessions de l'utilisateur). Partage safe.

**UI** :
- Sous-bouton **🤖 Aide IA** ajouté au groupe Aide entre 📖 Documentation et 🗺️ Légende.
- Modale charte qui explique le concept avant le téléchargement : Concept, Comment ça marche (4 étapes), Confidentialité, Note IA payante/gratuite.
- Bouton **📥 Télécharger le contexte (.md)** primary (accent jaune) + Annuler ghost.
- Status text en bas pendant la génération (fetch doc + génération fichier).

**Code** :
- `js/interface.js > _genererContenuContexteIA(readmeUserText)` : construit le contenu .md (entête + 4 sections + FAQ).
- `js/interface.js > window.afficherModaleAideIA()` : modale charte + handler de téléchargement (fetch README_USER.md, blob, download).
- `js/interface.js > initInterface()` : nouveau sous-action `🤖 Aide IA` dans le groupe Aide.
- `js/interface.js > afficherAide` : nouvelle ligne 🤖 dans la grille de référence.
- `README_USER.md` : nouvelle section "🤖 Aide IA" qui documente la fonctionnalité (et qui sera elle-même incluse dans les futurs exports — auto-référence cohérente).

**`sw.js`** : `CACHE_NAME` v98 → v99.

---

</details>

<details id="2026-05-10-s14">
<summary><strong>🗓️ 10/05/2026 (suite 14) — Fix bouton "🗑️ Supprimer ce point" qui apparaissait sur points data layer</strong></summary>


**Bug** : le bouton "🗑️ Supprimer ce point" apparaissait dans la popup de **points de calque de données** (pas seulement points session). Au clic, `supprimerPointEditor` cherchait dans `listePoints` (la session), ne trouvait rien → `console.warn("[Editor] Point a supprimer introuvable")` et retour silencieux. Du point de vue user : le bouton "ne fait rien".

**Cause racine** : la détection se basait sur `point.source === "editor"`. Or quand l'utilisateur fait une **conversion session→data** via la modale Conversion, les points editor sont copiés dans le JSON du data layer cible (ex: `data/test1/editor.json`) en gardant `source: "editor"` dans le JSON. Au reload du plan, ces points sont chargés via `ajouterPointsDepuisJSON` (donc dans le data layer, pas dans `listePoints`), mais leur `source: "editor"` reste → test trompeur, bouton affiché à tort.

**Fix** : la détection se base désormais sur le **contexte d'appel** (un argument explicite `isEditorSession` au helper) et plus sur la donnée :
- `editor.js > _ajouterMarker` (point session, vraiment dans `listePoints`) → `buildPointPopupHtml(point, true)` → bouton affiché
- `utils.js > ajouterPointsDepuisJSON` (point data layer, lecture seule) → `buildPointPopupHtml(p, false)` → bouton masqué

Plus fiable car la source de vérité est l'API qui crée le marker, pas un champ de la donnée qui peut survivre à des conversions.

**Code** :
- `js/utils.js > buildPointPopupHtml(point, isEditorSession)` : nouveau paramètre. Test `isEditorSession === true` au lieu de `point.source === "editor"`.
- `js/editor.js > _ajouterMarker` : appelle avec `true`.
- `js/utils.js > ajouterPointsDepuisJSON` : appelle avec `false`.

**`sw.js`** : `CACHE_NAME` v97 → v98.

---

</details>

<details id="2026-05-10-s13">
<summary><strong>🗓️ 10/05/2026 (suite 13) — Modale Aide : retour à `columns:2` sans break-inside (vraie balance)</strong></summary>


L'approche Grid auto-flow (suite 12) respectait l'ordre HTML mais ne pouvait pas équilibrer les hauteurs des colonnes — la grosse section "Charger / Import" laissait toujours du vide dans la colonne gauche.

**Fix final** : retour à `columns: 2` MAIS **sans `break-inside: avoid`**. Le browser peut désormais couper une grosse section entre les 2 colonnes pour vraiment équilibrer les hauteurs. Plus de trou.

**Compromis accepté** : une section peut être visuellement splittée (lecture top-bottom-left → top-right). En pratique, l'œil suit la lecture en colonne gauche puis colonne droite, c'est lisible.

**Sécurité ajoutée** : `break-after: avoid` sur les titres de section → si une coupure intervient, le titre reste avec au moins le début de son contenu (jamais "titre orphelin" en bas d'une colonne).

```css
/* Avant : Grid auto-flow → trous */
.kta-aide-corps {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

/* Après : columns:2 + balance auto, sections divisibles */
.kta-aide-corps {
  columns: 2;
  column-gap: 36px;
  column-rule: 1px solid rgba(255,255,255,0.06);
}
.kta-aide-section-titre {
  break-after: avoid;  /* titre orphelin évité */
}
```

**`sw.js`** : `CACHE_NAME` v96 → v97.

---

</details>

<details id="2026-05-10-s12">
<summary><strong>🗓️ 10/05/2026 (suite 12) — Modale Aide : passage de `columns:2` à CSS Grid auto-flow</strong></summary>


Le passage en `columns: 2` (suite 11) créait un déséquilibre visuel important : une section énorme (genre "Charger / Import") plus volumineuse que les autres réunies bloquait l'équilibrage automatique du multi-column avec `break-inside: avoid` → grand trou dans la colonne gauche.

**Fix** : remplacement du `columns: 2` par CSS Grid `1fr 1fr` avec `grid-auto-flow: row dense`. Chaque section occupe une cellule dans l'ordre HTML, le browser n'essaie plus d'équilibrer les hauteurs (ce qui est mieux ici puisque les sections ont des tailles très variables). Avec `dense`, les petites sections peuvent même remplir les trous laissés par les grandes.

```css
/* Avant : balance impossible */
.kta-aide-corps {
  columns: 2;
  /* break-inside: avoid sur sections → trou si une section est très grande */
}

/* Après : grid prévisible */
.kta-aide-corps {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 36px;
  row-gap: 18px;
  align-items: start;
  grid-auto-flow: row dense;
}
.kta-aide-intro { grid-column: 1 / -1; }
```

L'**intro** garde son full-width via `grid-column: 1 / -1` (span sur les 2 colonnes). Les sections individuelles restent atomiques par construction (chacune dans sa propre cellule, pas de coupe possible).

**`sw.js`** : `CACHE_NAME` v95 → v96.

---

</details>

<details id="2026-05-10-s11">
<summary><strong>🗓️ 10/05/2026 (suite 11) — Modale Aide : layout 2 colonnes sur PC</strong></summary>


La modale **❓ Aide** était figée à 580px de large et empilait verticalement ~10 sections. Sur grand écran, beaucoup de scroll inutile et gaspillage de largeur. Maintenant elle exploite la largeur disponible avec un layout 2 colonnes.

**Mobile (≤ 1023px)** : inchangé — modale 580px max, sections empilées verticalement, scroll vertical naturel.

**PC (≥ 1024px)** : modale élargie à 1100px max, corps en **CSS multi-column** (`columns: 2`). Avantages :
- Aucune restructuration HTML — le browser gère l'équilibrage automatique des sections sur les 2 colonnes
- `break-inside: avoid` empêche qu'une section soit coupée en 2 entre les colonnes (chaque section reste atomique)
- L'**intro** (`.kta-aide-intro`) utilise `column-span: all` pour rester full-width au-dessus des 2 colonnes
- `column-rule` discret pour démarquer visuellement les 2 colonnes
- `overflow-y: auto` du corps gère naturellement le scroll si trop long

**Code** :
- `js/interface.js > afficherAide` :
  - Style inline `max-width:580px` remplacé par classe `.kta-aide-modal-boite`
  - Style inline du paragraphe d'intro remplacé par classe `.kta-aide-intro`
  - Corps reçoit en plus la classe `.kta-aide-corps`
- `css/style.css` :
  - `.kta-aide-modal-boite` : largeur mobile (580px), override desktop (1100px)
  - `.kta-aide-intro` : style du paragraphe d'intro (couleur, font-size, line-height)
  - `@media (min-width: 1024px) .kta-aide-corps { columns: 2; column-gap: 36px; column-rule: ... }`
  - `.kta-aide-section { break-inside: avoid; ... }` pour atomicité des sections

**Note** : la **Documentation** (`afficherReadme`) avait déjà un layout 2 colonnes (sommaire 240px à gauche + corps à droite, basculement vertical sur mobile). Pas de changement nécessaire.

**`sw.js`** : `CACHE_NAME` v94 → v95.

---

</details>

<details id="2026-05-10-s10">
<summary><strong>🗓️ 10/05/2026 (suite 10) — Footer copyright : licence à la ligne sur mobile</strong></summary>


Sur mobile (≤ 768px), le footer copyright `© 2026 Flavien VIDAL [karma.png] · CC BY-NC-SA 4.0 · Usage commercial interdit` s'étendait sur 1 seule ligne et tronquait à droite si écran étroit. Désormais :

- **Mobile** : line-break après la signature → la licence passe sur une 2ème ligne (`© 2026 Flavien VIDAL [signature]` puis `CC BY-NC-SA 4.0 · Usage commercial interdit` en dessous).
- **Desktop** : inchangé, tout sur une seule ligne.

**Implémentation** :
- HTML : wrapper `.kta-loader-copyright-line2` autour de la partie licence (le 1er séparateur `·` + le lien CC + le 2ème séparateur + "Usage commercial interdit").
- CSS `@media (max-width: 768px)` : `display: block` + `margin-top: 4px` sur le wrapper. Le `·` initial (devenu redondant en début de ligne) est masqué via `:first-child`.

**`sw.js`** : `CACHE_NAME` v93 → v94.

---

</details>

<details id="2026-05-10-s9">
<summary><strong>🗓️ 10/05/2026 (suite 9) — Loader PC : fix débordement grid (% vs fr)</strong></summary>


La suite 8 augmentait le padding pour rééquilibrer les marges, mais le bug visuel persistait : la colonne droite collait toujours au bord. **Cause racine identifiée** : `grid-template-columns: 60% 40%` totalise `100%` de la largeur disponible, et le `gap: 32px` se rajoute en plus → débordement → les colonnes touchent les bords du conteneur, écrasant le padding.

**Fix** : remplacer les unités `%` par `fr` (`3fr 2fr` = ratio 60/40). Avec `fr`, le browser distribue le gap **AVANT** de calculer la largeur des colonnes, donc plus de débordement. Padding latéral du loader également relevé `36px` → `40px` pour plus de respiration.

```css
/* Avant (suite 8) — débordement */
grid-template-columns: 60% 40%;
gap: 0 32px;

/* Après (suite 9) — pas de débordement, ratio 60/40 préservé */
grid-template-columns: 3fr 2fr;
gap: 0 32px;
```

Code : `css/style.css > @media (min-width: 1024px) > .loader-grid`.

**`sw.js`** : `CACHE_NAME` v92 → v93.

---

</details>

<details id="2026-05-10-s8">
<summary><strong>🗓️ 10/05/2026 (suite 8) — Loader : marges équilibrées + signature image (au lieu de "alias KARMA")</strong></summary>


**Fix 1 — Marges équilibrées sur PC** : sur le layout 2 colonnes (suite 7), la colonne droite (drop zone + options) collait au bord du loader contrairement à la gauche qui respirait grâce aux cards plus petites. Padding horizontal du loader augmenté de `24px` → `36px` et gap entre colonnes de `24px` → `32px` sur ≥ 1024px → respiration équilibrée des deux côtés.

**Fix 2 — Signature image dans le footer copyright** : le texte `"(alias KARMA)"` à côté de "Flavien VIDAL" est remplacé par l'image manuscrite `icon/karma.png` (la même que celle utilisée dans le splash). Rendu plus identitaire et cohérent avec la charte graphique. S'applique aux 2 modes mobile et desktop (footer commun).

**Code** :
- `css/style.css > #planLoaderBox` (PC media query) : `padding: 24px 36px` au lieu de `24px`. `.loader-grid` : `gap: 0 32px` au lieu de `0 24px`.
- `css/style.css > .kta-loader-copyright-sig` : nouveau style pour l'image signature (`height: 16px`, `vertical-align: middle`, `opacity: 0.85`, `pointer-events: none`).
- `index.html` : `<img class="kta-loader-copyright-sig" src="icon/karma.png">` à la place de `"(alias KARMA)"`.

Les autres mentions "(alias KARMA)" qui restent (headers JS, banner console, meta tags, LICENSE, docs) sont des **traces techniques copyright** non visibles côté utilisateur normal — gardées pour la trace légale.

**`sw.js`** : `CACHE_NAME` v91 → v92.

---

</details>

<details id="2026-05-10-s7">
<summary><strong>🗓️ 10/05/2026 (suite 7) — Loader : layout 2 colonnes sur PC (≥ 1024px)</strong></summary>


Le loader (page d'accueil avec liste des plans + import) utilisait le même layout vertical mono-colonne sur toutes les plateformes — gaspillait de la place sur PC. Refonte responsive : **mobile/tablette inchangé**, **PC en 2 colonnes 60/40**.

**Layout PC** (≥ 1024px) :

```
┌─────────────────────────────────────────────────┐
│        📦 MyKTAMap            📖                │ ← header full-width
├─────────────────────────────────────────────────┤
│  ▶️ Reprendre [Nom du dernier plan]             │ ← bandeau full-width
├──────────────────────────┬──────────────────────┤
│                          │ 📦 Ajouter un plan   │
│ 📚 Mes plans (60%)       │ [Drop ZIP]           │
│  - Plan 1                │ [FS access]          │
│  - Plan 2                │ [Store blob]         │
│  - Plan 3 (scroll)       │ [Mode performance]   │
│  - ...                   │ [▶️ Charger]         │
│                          │                      │
│                          │ ⚙️ Plus d'options     │
│                          │ (déplié par défaut)  │
│                          │ [🏗️ Générer]         │
│                          │ [📥 Conf exemple]    │
│                          │ [🐛 Logs]            │
│                          │ [💥 Reset]           │
├──────────────────────────┴──────────────────────┤
│       © 2026 Flavien VIDAL · CC BY-NC-SA        │ ← footer
└─────────────────────────────────────────────────┘
```

**Choix utilisateur** :
- Breakpoint **1024px+** (mobile/tablette = ≤ 1023px gardent le layout vertical existant)
- Ratio **60/40** (gauche large pour la liste de plans)
- ▶️ Reprendre en bandeau **full-width** au-dessus des 2 colonnes (action prioritaire)
- ⚙️ Plus d'options **toujours déplié** sur PC (place disponible — chevron caché, pas de toggle)
- Largeur max **1100px** (confortable sur 4K, ne s'étire pas indéfiniment)
- Hauteur **auto** (scroll fenêtre si trop long), liste de plans avec scroll interne (`max-height: calc(100vh - 320px)`)

**Implémentation** :
- HTML : nouveau wrapper `.loader-grid` qui contient 2 `.loader-col` (`.loader-col-plans` / `.loader-col-actions`). Le ▶️ Reprendre, le header et le footer copyright restent hors du grid.
- CSS : `.loader-grid` est `display: contents` par défaut (transparent sur mobile, enfants directement dans le parent — layout vertical inchangé). Sur ≥ 1024px, le wrapper devient `display: grid` 60/40.
- Sur PC, override `#advancedBox { display: flex !important; }` pour forcer ouvert peu importe l'état JS.
- `.loader-col-plans .loader-plans-list { max-height + overflow-y: auto }` pour un scroll interne propre quand beaucoup de plans.

**Aucun changement JS** — la restructuration est purement HTML+CSS.

**Mobile** : aucun changement visuel ni comportemental confirmé.

**Note** : autres modales charte qui pourraient bénéficier d'un layout PC (à voir plus tard) : 📖 Documentation, ❓ Aide, 🏗️ Générateur de plan, 🖼️ Export PNG (Avancé), 💾 Sauvegarde session.

**`sw.js`** : `CACHE_NAME` v90 → v91.

---

</details>

<details id="2026-05-10-s6">
<summary><strong>🗓️ 10/05/2026 (suite 6) — Sélection visuelle pour supprimer une zone (même pattern que tracés)</strong></summary>


Reproduit le pattern "mode clic visuel sur la carte" pour les zones session, en complément des options existantes du menu **🧹 Effacer** du groupe Zones.

**Workflow** :
- Menu Zones → 🧹 Effacer → 🎯 **"Sélectionner une zone à supprimer"**
- Floater apparaît en bas : "🎯 Clique sur une zone pour la **supprimer** · ✕ Annuler"
- L'utilisateur clique directement sur la zone sur la carte
- La zone est supprimée immédiatement, le floater disparaît

**Détection** : algorithme classique du **ray casting** (point-in-polygon). On teste si le point cliqué est à l'intérieur du polygone. Si **plusieurs zones overlappent** au point cliqué, on prend la **dernière dessinée** (top z-order visuel — ce que l'utilisateur voit en dessus).

**Fallback "click près du bord"** : si le clic est hors de toute zone mais à ≤ 20 px d'un segment de contour, on prend la zone correspondante (utile pour les petites zones où il est facile de cliquer juste à côté).

**Code** :
- `js/interface.js > window.activerModeSuppressionZoneClic()` : nouvelle fonction. Floater + click handler avec ray casting (`_pointInPolygon`) + fallback bord.
- `js/interface.js` : nouvelle entrée dans `_choixSuppression` du menu Effacer Zones.
- CSS : réutilise `.kta-supp-trace-floater` (même pattern visuel rouge), pas de nouveau style.

**`sw.js`** : `CACHE_NAME` v89 → v90.

---

</details>

<details id="2026-05-10-s5">
<summary><strong>🗓️ 10/05/2026 (suite 5) — Hotfix suppression point + sélection visuelle des tracés</strong></summary>


**Bug 1** : le bouton 🗑️ Supprimer ce point dans la popup supprimait **tout** le contenu visuel (points + roads + zones) au lieu d'un seul point. Cause : `renderEditorPoints` faisait `layerEditor.clearLayers()`. Or depuis suite 13, layerEditor contient AUSSI les roads et zones session (regroupement "Mes annotations"). Le clearLayers vidait donc tout.

**Fix** : tracking séparé des markers editor dans une liste interne `_markersEditor`. `renderEditorPoints` retire désormais UNIQUEMENT ces markers (via `m.remove()` individuel) puis les recrée. Roads et zones session restent intactes.

Code : `js/editor.js` — ajout de `_markersEditor`, `_ajouterMarker` push dedans, `renderEditorPoints` cleanup ciblé, `initEditor` cleanup au boot.

**Bug 2** : la modale liste de tracés ("Sélectionner un tracé à supprimer") n'était pas claire pour identifier le bon tracé.

**Fix** : remplacement par un **mode clic visuel** (pattern identique au mode clic carte de l'itinéraire). Au clic sur "🎯 Sélectionner un tracé à supprimer" dans le menu Effacer :
- Un floater apparaît en bas : "🎯 Clique sur un tracé pour le **supprimer** · ✕ Annuler"
- L'utilisateur clique directement sur le tracé sur la carte
- Le pathfinder cherche la polyline session la plus proche du clic (tolérance 20 px)
- Si trouvée → suppression immédiate + cleanup du mode

Code :
- `js/interface.js > window.activerModeSuppressionTraceClic()` : nouvelle fonction. Floater + click handler avec calcul `_pointSegmentDistanceFlat` pour trouver la polyline la plus proche.
- `js/interface.js` : ancienne fonction `afficherModaleSuppressionTrace` supprimée (remplacée).
- `js/interface.js` : menu Effacer pointe sur la nouvelle fonction.
- `css/style.css > .kta-supp-trace-floater` : style charte rouge `#ff6b6b` (action destructive). Ancien CSS `.kta-trace-supr-*` supprimé.

**`sw.js`** : `CACHE_NAME` v88 → v89.

---

</details>

<details id="2026-05-10-s4">
<summary><strong>🗓️ 10/05/2026 (suite 4) — Suppression : bouton popup + modale "Sélectionner un tracé"</strong></summary>


Deux nouvelles options de suppression ajoutées en parallèle.

#### 1. Bouton "🗑️ Supprimer ce point" dans la popup d'un point editor

Visible **uniquement pour les points session** (`source === "editor"`). Les points embedded (puits.json, cataphile.json, etc.) restent en lecture seule — pas de bouton (cohérent : leur source de vérité est le ZIP du plan, pas la session).

Placé sur une 2ème ligne d'actions séparée par un trait pointillé rouge léger pour éviter les clics accidentels (action destructive). Suppression **immédiate** au clic (pas de confirmation), la popup se ferme.

**Code** :
- `js/utils.js > buildPointPopupHtml` : test `point.source === "editor"` → bloc `deleteRow` conditionnel.
- `js/editor.js > window.supprimerPointEditor(id, x, y)` : matching par id+coords avec fallback coords seules. Retire de `listePoints`, render, ferme la popup.
- `css/style.css > .kta-popup-actions-danger / .kta-popup-btn-delete` : style rouge `#ff8c8c`, séparation visuelle.

#### 2. Modale "Sélectionner un tracé à supprimer"

Nouvelle option dans le menu **🧹 Effacer** du groupe Tracés, en complément des options existantes (Dernier point / Dernier tracé / Tous). Ouvre une modale charte qui liste tous les tracés session (Principal/Secondaire/Chemin) avec :
- Type + numérotation par type (`🟩 Route principale #1`, `🟪 Route secondaire #2`, etc.)
- Nombre de points + distance estimée par tracé
- Bouton 🗑️ par ligne pour suppression immédiate

L'itinéraire est exclu (cycle de vie propre via la modale Itinéraire). Échap / clic backdrop / ✕ pour fermer la modale.

**Code** :
- `js/interface.js > window.afficherModaleSuppressionTrace()` : nouvelle fonction. Filtrage des roads supprimables, calcul distance, build de la liste, wire-up des boutons.
- `js/interface.js` : nouvelle entrée "🎯 Sélectionner un tracé à supprimer" dans `_choixSuppression` du menu Effacer.
- `css/style.css > .kta-trace-supr-list / .kta-trace-supr-row / .kta-trace-supr-titre` : style charte cohérent (cards avec hover rouge).

**`sw.js`** : `CACHE_NAME` v87 → v88.

---

</details>

<details id="2026-05-10-s3">
<summary><strong>🗓️ 10/05/2026 (suite 3) — minZoom plus généreux sur desktop</strong></summary>


User a demandé plus de profondeur de dezoom sur PC. Les seuils de la suite 25 (qui plafonnaient à -2 / -1 sur desktop pour anti-crash) étaient trop conservateurs : la mémoire desktop est largement suffisante pour gérer le canvas même au minZoom max.

**Nouveaux seuils** :

| Taille max de l'image | Mobile (inchangé) | Desktop (assoupli) |
|---|---|---|
| < 4000 px | -4 | **-4** (était -2) |
| 4000-8000 px | -3 | **-4** (était -2) |
| > 8000 px | -2 | **-3** (était -1) |

Mobile reste calibré anti-crash (suite 25). Desktop a maintenant une vue d'ensemble plus confortable, surtout sur les gros plans de carrière où prendre du recul est utile.

Code : `js/map.js > initMapFromConfig`.

**`sw.js`** : `CACHE_NAME` v86 → v87.

---

</details>

<details id="2026-05-10-s2">
<summary><strong>🗓️ 10/05/2026 (suite 2) — Itinéraire : temps estimé (label bottomleft + modale)</strong></summary>


Le label distance bottomleft (`.kta-iti-distance`) affiche maintenant aussi un **temps estimé** à côté de la distance, et la modale itinéraire l'affiche dans le bloc résultat (mode calcul) et le statut actuel (mode navigation).

**Formule** :
```
temps_marche  = distance_m / (5 km/h × 1000 / 60)        // m / (m/min)
nb_pauses     = max(0, nbWaypoints - 2)                  // pauses entre départ et arrivée
temps_pauses  = nb_pauses × 15 min
total         = temps_marche + temps_pauses
```

- **Vitesse marche** : 5 km/h (vitesse normale, ajustable via constante `VITESSE_MARCHE_KMH`)
- **Pause par point intermédiaire** : 15 min (constante `TEMPS_PAUSE_PAR_POINT_MIN`). Si l'itinéraire fait juste départ → arrivée (2 waypoints), pas de pause.

**Format affiché** :
- < 60 min → `"23 min"`
- ≥ 60 min → `"1h25"` (avec h sans espace, minutes 0-padded à 2 chiffres si < 10)

**Label bottomleft** :
```
🗺️ 1.23 km · ⏱️ 15 min
```
Tooltip hover (title) avec breakdown détaillé : `"Distance : 1.23 km · Temps estimé : 15 min (vitesse 5 km/h + 2 pauses de 15 min)"`.

**Code** :
- `js/interface.js` : nouvelles constantes `VITESSE_MARCHE_KMH` (5), `TEMPS_PAUSE_PAR_POINT_MIN` (15). Helpers `_tempsItineraireMinutes(distM, nbWaypoints)` et `_formatTempsMinutes(totalMin)`.
- `js/interface.js > _afficherLabelDistanceItineraire(distanceM, nbWaypoints)` : signature étendue (paramètre nbWaypoints), HTML enrichi avec span `.kta-iti-distance-time`, tooltip détaillé.
- `js/interface.js > _majLabelDistanceItineraire` : passe `road.waypoints.length` au label.
- `js/interface.js > ouvrirItinerairModal` : `statusActuel` (mode navigation) et `resEl.innerHTML` (après calcul) affichent une ligne ⏱️ Temps estimé.
- `css/style.css > .kta-iti-distance-sep` et `.kta-iti-distance-time` : style de la séparation distance/temps dans le label.
- Aide in-app : section Itinéraire mise à jour pour mentionner le temps estimé.

**`sw.js`** : `CACHE_NAME` v85 → v86.

---

</details>

<details id="2026-05-10-s1">
<summary><strong>🗓️ 10/05/2026 (suite 1) — Popup point : 3ème bouton "📍 Je suis ici" (recalage tracker)</strong></summary>


Dans la même logique que les boutons Y aller / Itinéraire ajoutés précédemment, nouveau bouton **📍 Je suis ici** dans la popup d'un point — recale ta position tracker sur les coords exactes du point.

**Cas d'usage** : tu es physiquement à côté d'un puits que tu retrouves sur la carte, tu cliques sur le marker → "📍 Je suis ici" → la position tracker s'aligne instantanément sur le puits. Plus précis que cliquer "à peu près" sur la carte en mode recalage 📍.

**Comportement** :
- Met à jour `position.x / position.y` du tracker
- Vide le polyline trace en cours (`polyline.setLatLngs([])`)
- Reset `stepCount = 0`
- Désactive le mode recalage s'il était actif (cohérent : on vient de recaler)
- Pan la map sur la nouvelle position pour que le marker tracker soit visible
- Console log `[Tracking] Recalé sur point : X, Y`

**Code** :
- `js/tracking.js > window.recalerTrackerSurPoint(x, y)` : factorise la logique du mode recalage clic-carte existant.
- `js/utils.js > buildPointPopupHtml` : ajout du bouton en première position (ordre logique : 📍 Je suis ici / 🧭 Y aller / ➕ Itinéraire).
- `js/utils.js` : `title` hover ajouté sur les 3 boutons pour clarifier l'action.
- `css/style.css > .kta-popup-btn-here` : style accent vert charte (`#6ce28a`) — distinct du jaune (Y aller, action principale) et du bleu (Itinéraire, action secondaire).
- Avec 3 boutons sur la même ligne, padding et font-size resserrés (6px 4px, 11px) pour rester compact dans la largeur ~250px d'une popup Leaflet, `flex-wrap: wrap` en backup.

**Code couleur** :
| Bouton | Couleur | Sémantique |
|---|---|---|
| 📍 Je suis ici | Vert `#6ce28a` | Recalage / position |
| 🧭 Y aller | Jaune `#f4c542` | Action principale (calcul + trace) |
| ➕ Itinéraire | Bleu `#8cb4ff` | Action secondaire (modification waypoint) |

**`sw.js`** : `CACHE_NAME` v84 → v85.

---

</details>

<details id="2026-05-10">
<summary><strong>🗓️ 10/05/2026 — Popups de points : boutons "🧭 Y aller" et "➕ Itinéraire"</strong></summary>


Nouvelle UX pour interagir avec un point depuis sa popup Leaflet. Au clic sur un marker (point editor ou point embedded JSON), la popup affiche désormais 2 boutons en bas, sous le nom et la description :

| Bouton | Comportement |
|---|---|
| **🧭 Y aller** | Calcule l'itinéraire **depuis ta position tracker actuelle** vers ce point. Trace direct (pas de modale). Si un itinéraire est déjà actif, modale charte de confirmation : *"Itinéraire en cours — il sera remplacé"*. |
| **➕ Itinéraire** | Ajoute ce point comme waypoint à l'itinéraire en cours. Si modale itinéraire ouverte → ajout direct à la liste. Sinon → ouvre la modale avec le waypoint déjà pré-rempli. |

**Architecture** :
- `js/utils.js > buildPointPopupHtml(point)` : helper commun qui construit le HTML de la popup avec les 2 boutons. Échappement HTML/JS strict (apostrophes, guillemets, < / > / &).
- `js/editor.js > _ajouterMarker` et `js/utils.js > ajouterPointsDepuisJSON` : utilisent le helper.
- `js/interface.js > window.itineraireYAller(x, y, nom)` : récupère `getTrackingPosition()`, build 2 waypoints (tracker + point cible), Pathfinder.computeRoute, écrit la road `type: "itinerary"`, met à jour markers visuels + label distance bottomleft, pan+flash sur le point cible.
- `js/interface.js > window.itineraireAjouterWaypoint(x, y, nom)` : ajoute à la liste de la modale ouverte ou ouvre la modale.
- `js/interface.js > _confirmRemplacerItineraire(callback)` : modale charte `.kta-readme-modal-overlay` pour la confirmation.
- `css/style.css > .kta-popup-actions / .kta-popup-btn / .kta-popup-btn-aller` : style des boutons (jaune charte pour Y aller = action principale, bleu pour Ajouter).

**Source de la position tracker** : `getTrackingPosition()` qui retourne `{x, y}` peu importe l'état du tracking (au boot c'est `APP_CONFIG.startX/Y`, puis modifié par recalage manuel ou pas du tracker actif). Cohérent avec le bouton **🧭 Ma position** déjà présent dans la modale.

**`sw.js`** : `CACHE_NAME` v83 → v84.

---

</details>

<details id="2026-05-09-s33">
<summary><strong>🗓️ 09/05/2026 (suite 33) — Décalage titre limité au mobile (desktop a assez de place)</strong></summary>


Le décalage du titre vers la gauche quand le contrôle des couches est ouvert (suite 32) était appliqué partout. Sur desktop la fenêtre est plus large, le panneau du contrôle a la place de s'ouvrir à droite sans toucher le titre centré → le décalage devient inutile et perturbant visuellement (le titre bouge sans raison).

**Fix** : wrap les 3 règles `body.kta-layers-panel-open` (titre, titre:active, plan-switcher) dans `@media (max-width: 768px)` — le breakpoint mobile/desktop déjà utilisé partout dans le projet (cohérent avec `js/map.js > _isMobile`).

Le watcher JavaScript (MutationObserver) reste actif sur les 2 plateformes — il ajoute toujours la classe `kta-layers-panel-open` sur le body, mais sans effet visuel sur desktop.

**`sw.js`** : `CACHE_NAME` v82 → v83.

---

</details>

<details id="2026-05-09-s32">
<summary><strong>🗓️ 09/05/2026 (suite 32) — Décalage du titre fixe quand le contrôle des couches est ouvert</strong></summary>


Le z-index élevé sur `.leaflet-control-layers-expanded` (suite 31) **n'a pas suffi** : le `#map` est en `position: fixed`, ce qui crée un **stacking context isolé**. Le z-index du panneau Leaflet est piégé dans ce contexte et ne peut pas dépasser le titre fixe (dans le body, z-index 1100), même avec une valeur très élevée.

**Solution alternative** : décaler le titre vers la gauche pendant que le contrôle des couches est ouvert.

**Implémentation** :
- `js/interface.js > _initLayersControlWatcher` : MutationObserver sur le contrôle des couches Leaflet. Détecte l'ajout/retrait de la classe `.leaflet-control-layers-expanded` (gérée par Leaflet au clic/hover du toggle). Bascule la classe `kta-layers-panel-open` sur `<body>` en conséquence.
- `css/style.css` : règle `body.kta-layers-panel-open #kta-titre-fixe` qui retire le `transform: translateX(-50%)` et ancre le titre à `left: calc(70px + env(safe-area-inset-left, 0px))` (juste après la sidebar accordéon). Le `#kta-plan-switcher` (qui s'ancre sous le titre) suit le même décalage.

Transition CSS douce déjà en place sur `transition: transform 0.1s` du titre.

**Résultat** : ouvrir le contrôle des couches → titre glisse à gauche → panneau visible intégralement → fermer le contrôle → titre revient au centre.

**`sw.js`** : `CACHE_NAME` v81 → v82.

---

</details>

<details id="2026-05-09-s31">
<summary><strong>🗓️ 09/05/2026 (suite 31) — Fix z-index contrôle des couches (passe derrière le titre sur mobile)</strong></summary>


**Bug mobile** : quand l'utilisateur ouvrait le contrôle des couches Leaflet (haut-droite) sur mobile, le panneau déplié (`.leaflet-control-layers-expanded`) passait **derrière le titre fixe** (`#kta-titre-fixe`, z-index 1100). Sur mobile le titre prend la pleine largeur en haut → chevauchement → le haut du panneau était caché par le titre.

**Fix** : `z-index: 1200 !important` sur `.leaflet-control-layers-expanded` → passe au-dessus du titre, mais reste sous les modales charte (99999) et le splash (9999) pour ne pas perturber les autres flux UI.

Code : `css/style.css > .leaflet-control-layers-expanded`.

**`sw.js`** : `CACHE_NAME` v80 → v81.

---

</details>

<details id="2026-05-09-s30">
<summary><strong>🗓️ 09/05/2026 (suite 30) — Tuiles fond noir + raccourci label distance + édition waypoints en mode navigation</strong></summary>


**3 améliorations cumulées** :

#### 1. Tuiles : fond charte sombre au lieu de blanc

Avant le rendu de la tuile, le canvas était rempli en blanc (`#ffffff`). Visible pendant le tile loading et autour des bords si l'image ne couvre pas tout le tile. Maintenant : **`#0a0d18`** (charte sombre, équivalent au fond `.leaflet-container`).

⚠️ Pas `#000000` strict pour ne pas casser la détection "canvas noir = drawImage JPEG échoué" qui check `(0,0,0)` exact.

Code : `js/tiling.js` (3 occurrences `fillStyle = "#ffffff"` → `"#0a0d18"`).

#### 2. Raccourci : clic sur le label distance bottomleft → ouvre la modale Itinéraire

Le label `Itinéraire : XX m` en bas-gauche est désormais cliquable. Title hover : "Cliquer pour ouvrir le menu Itinéraire". `cursor: pointer`. Wire-up via `L.DomEvent.on(div, "click", ...)` qui appelle `window.ouvrirItinerairModal()`. `disableClickPropagation` pour éviter que le clic se propage à la map.

Code : `js/interface.js > _afficherLabelDistanceItineraire`.

#### 3. Modale Itinéraire : édition des waypoints en mode navigation

**Avant** : en mode navigation (itinéraire actif), la modale n'avait que la quick-nav (⏮️/⏭️/🔁) + Recalculer/Effacer. Pour modifier les waypoints, il fallait cliquer "🔄 Recalculer" qui fermait la modale et la rouvrait en mode calcul.

**Maintenant** : la modale unifie les deux modes. En mode navigation, tu peux directement :
- Ajouter un waypoint via 📍 Mode clic carte / 🧭 Ma position / 🔍 recherche
- Retirer un waypoint via ✕ dans la liste
- Cliquer "🔄 Recalculer l'itinéraire" pour appliquer les modifs (sans fermer la modale)
- La quick-nav (⏮️/⏭️/🔁) reste visible en haut

**Auto-save à la fermeture** (mode navigation uniquement) : si tu as recalculé un itinéraire en mode navigation, fermer la modale **valide automatiquement** le nouveau tracé (transforme le `_preview` en road persistante). Cohérent avec l'intention "j'ai recalculé donc je veux le nouveau". Tu peux annuler explicitement via le bouton ❌ Effacer du preview.

En mode calcul (pas d'itinéraire actif), comportement inchangé : il faut cliquer 💾 Enregistrer pour sauver, sinon le preview est retiré à la fermeture.

Code : `js/interface.js > ouvrirItinerairModal` :
- HTML sectionPoints unifié (mode-toggle + search dans les 2 modes, quick-nav en plus si modeNavigation)
- HTML sectionAction unifié (bouton compute label adaptatif "Calculer / Recalculer", bouton Effacer si modeNavigation)
- Wire-up du bouton compute fonctionne dans les 2 modes
- `fermer()` adapté : auto-save preview en modeNavigation

**`sw.js`** : `CACHE_NAME` v79 → v80.

---

</details>

<details id="2026-05-09-s29">
<summary><strong>🗓️ 09/05/2026 (suite 29) — Hotfix crash au reload avec itinéraire actif</strong></summary>


**Bug** : utilisateur trace un itinéraire, ferme l'app, relance — crash instantané au démarrage, peu importe le perfPreset.

**Cause racine** : SessionPersist sauvait l'itinéraire dans le state persisté. Au reload, `setRoads` re-créait la polyline SVG du tracé itinéraire avec son `filter: drop-shadow` CSS (halo cyan néon × 2 layers). Pour un itinéraire long (centaines de points sur des plans denses où le pathfinder traverse beaucoup de tronçons), le rendu GPU saturait au boot avant même que l'app soit utilisable.

**Fix** : exclure les roads de type `"itinerary"` du state persisté SessionPersist :
- **Côté save** (`_gatherState`) : filter sur les roads pour ne pas inclure le type `"itinerary"`. L'utilisateur le recalcule à la demande via la modale 🗺️ après reload (2 clics).
- **Côté restore** (`_applyRestore`) : filter aussi sur les sessions déjà sauvegardées avant ce fix — sans ça, les utilisateurs qui n'ont pas vidé leur cache localStorage continueraient à crasher au reload.

L'itinéraire reste un calcul ponctuel à la demande, ce qui est cohérent avec sa nature (calcul Pathfinder dérivé du réseau). Aucun impact sur les autres roads (Principal/Secondaire/Chemin), points editor, zones, mesure — tous persistés normalement.

**Code** :
- `js/sessionPersist.js > _gatherState` : `persistableRoads` exclut `type === "itinerary"`.
- `js/sessionPersist.js > _applyRestore` : `safeRoads` exclut `type === "itinerary"` (filtrage défensif).

**`sw.js`** : `CACHE_NAME` v78 → v79.

⚠️ **Note utilisateur** : si tu avais un itinéraire actif au moment de fermer l'app, il ne sera pas restauré au reload. Re-clique sur **🗺️ Calculer un itinéraire** pour le retracer (les waypoints d'un itinéraire ne sont pas mémorisés non plus, choix volontaire).

---

</details>

<details id="2026-05-09-s28">
<summary><strong>🗓️ 09/05/2026 (suite 28) — Optimisations performance pour les plans avec beaucoup de routes</strong></summary>


User a partagé un fichier Road.json avec ~100+ routes (plan de carrière). Le rendu et le calcul d'intersections devenaient ingérables. 4 optimisations cumulées :

**1. Pre-check AABB dans `_calculerIntersectionsRoads`** (gain massif)
- Avant chaque comparaison de paire, calcul de l'AABB (bounding box) des 2 routes.
- Si les bbox ne se recouvrent pas (avec marge `ROAD_PROXIMITY_TOLERANCE`) → skip toute la paire.
- Sur un plan dense, élimine 90%+ des paires sans aucun calcul de segment.
- Cache des bbox calculé 1× par render (O(N×P) une seule fois au lieu de O(N²×P²) au pire).

**2. `smoothFactor: 2.5` sur les polylines roads** (gain pan/zoom)
- Leaflet simplifie les polylines via Douglas-Peucker (interne).
- Défaut 1.0 → on monte à 2.5 (3.5 pour roads, 1.5 pour itinéraire qui doit rester précis).
- Gros gain perf au pan/zoom (moins de points dessinés sur le canvas).
- Perte visuelle quasi imperceptible aux niveaux de zoom usuels.

**3. Seuil de sécurité `ROAD_INTERSECTION_MAX_ROADS = 200`** (garde-fou)
- Si total roads (session + embedded visibles) > 200, le calcul d'intersections est **complètement skippé**.
- Console.warn avec pointeur vers la doc "Optimiser ton plan" (stratégie routes-dans-PNG).
- Évite le freeze sur les plans extrêmes (>500 routes).

**4. Throttle 250ms sur le listener `overlayadd/overlayremove`** (anti-burst)
- Toggle rapide de plusieurs calques ou plan switch émettait plusieurs events en burst → recalcul cascade.
- Throttle consolide en un seul renderRoads après 250ms.

**Impact perceptible** : sur un plan 100 routes × 30 points moyens (~9 millions d'opérations potentielles), le pre-check AABB élimine ~95% des paires → ~450 000 opérations restantes (~50× plus rapide). Combiné au smoothing : pan/zoom fluides même sur plans denses.

**Code** :
- `js/road.js > _calculerIntersectionsRoads` : réécriture avec `_bboxOfRoad`, `_bboxIntersect`, seuil `ROAD_INTERSECTION_MAX_ROADS`.
- `js/road.js > ROAD_STYLES` : `smoothFactor: 2.5` (1.5 pour itinerary).
- `js/road.js > initRoad` : throttle 250ms du listener overlay.
- `js/utils.js > ROAD_STYLES_DATA` : `smoothFactor: 2.5` sur les routes embedded.

**Diagnostic en mode debug** : la console F12 affiche désormais le taux de skip AABB :
`[Roads] Roads count: N → paires testees: X (AABB skip: Y = ZZ%) → raw: A → après dedup: B`. Plus le pourcentage est haut, plus l'optimisation est efficace pour ton plan.

**`sw.js`** : `CACHE_NAME` v77 → v78.

---

</details>

<details id="2026-05-09-s27">
<summary><strong>🗓️ 09/05/2026 (suite 27) — Tutoriel "Optimiser ton plan" dans la doc utilisateur</strong></summary>


Nouvelle section dans `README_USER.md` (consommée par la modale 📖 Documentation in-app) : un tutoriel concret pour optimiser un plan en termes de performance et stabilité mémoire.

**Sujets couverts** (8 points avec recommandations chiffrées) :
1. 🖼️ Image principale — limites de dimensions (4K / 8K / 16K) + comportement attendu
2. 📦 Format image — JPEG vs PNG vs WebP avec poids typiques
3. 🗂️ Calques image — limiter à 1-2 max
4. 🛣️ Routes — stratégie "routes dessinées dans le PNG + calque JSON masqué" qui exploite la nouvelle API `getAllEmbeddedRoads`
5. 📍 Points — split en plusieurs calques de données
6. ⚡ Mode performance — quel preset choisir selon le device
7. 📱 Spécifique mobile — iPhone PWA vs Safari, OOMGuard
8. 💾 Sauvegarde régulière — protection contre les kills mémoire

**Aussi côté in-app** : nouvelle section `🚀 Optimiser un plan` dans la modale d'aide (`afficherAide` dans `interface.js`) avec un résumé concis et un pointeur vers la doc complète.

**`sw.js`** : `CACHE_NAME` v76 → v77 (force récupération du nouveau `README_USER.md` cached pour la modale Documentation).

---

</details>

<details id="2026-05-09-s26">
<summary><strong>🗓️ 09/05/2026 (suite 26) — Pathfinder utilise toutes les routes embedded (visibles ou non)</strong></summary>


**Cas d'usage** : sur un plan où les routes sont dessinées en dur sur le PNG, l'utilisateur peut vouloir **masquer le calque des routes JSON** dans le contrôle des couches Leaflet pour gagner en perf de rendu (moins d'éléments vectoriels à redessiner). Mais avant ce fix, masquer le calque empêchait aussi le module **🗺️ Itinéraire** de trouver un chemin (le pathfinder ne voyait plus le réseau de routes).

**Fix** : le pathfinder utilise désormais une nouvelle API `window.getAllEmbeddedRoads()` qui retourne **toutes** les routes embedded (visibles ET masquées). Les autres consommateurs (cercles d'intersection, panneau Distance totale) continuent d'utiliser `window.getEmbeddedRoads()` qui filtre par visibilité — leur sémantique reste correcte.

**API séparée** :
- `window.getEmbeddedRoads()` — routes embedded **visibles** uniquement (cercles intersection + panneau Distance totale, qui doivent suivre la visibilité)
- `window.getAllEmbeddedRoads()` (NOUVEAU) — **toutes** les routes embedded (pathfinder, qui doit considérer tout le réseau)

**Impact utilisateur** : tu peux désormais masquer le calque des routes (pour la perf, ou pour pas surcharger visuellement quand les routes sont déjà sur le PNG) tout en gardant l'itinéraire fonctionnel. Documenté dans l'aide in-app + README utilisateur.

**Code** :
- `js/road.js` : ajout de `window.getAllEmbeddedRoads`.
- `js/pathfinder.js` : `computeRoute()` utilise `getAllEmbeddedRoads()` avec fallback `getEmbeddedRoads()` (rétro-compat si vieux cache SW).
- `js/interface.js > afficherAide` + `README_USER.md` : doc utilisateur mise à jour.

**`sw.js`** : `CACHE_NAME` v75 → v76.

---

</details>

<details id="2026-05-09-s25">
<summary><strong>🗓️ 09/05/2026 (suite 25) — Plafonnement dynamique du minZoom selon la taille de l'image</strong></summary>


**Bug** : crash de l'app au dézoom extrême sur les gros plans (signalé sur un plan de carrière). Cause probable : avec `preferCanvas: true`, Leaflet traite l'image entière dans le canvas au minZoom maximum. Pour une image 8000+ px, le canvas devient énorme → saturation RAM, crash mobile.

**Fix** : plafonner dynamiquement le `minZoom` Leaflet selon la dimension max de l'image (`max(imageWidth, imageHeight)`) :

| Taille max de l'image | minZoom mobile | minZoom desktop |
|---|---|---|
| < 4000 px | -4 (défaut, généreux) | -2 |
| 4000 - 8000 px | -3 (modéré) | -2 |
| > 8000 px | -2 (limite, sécurité) | -1 |

Console log au boot affiche la décision : `[Map] Plan XXXX px → minZoom -N (mobile: true/false)` (visible si debug ON).

**Code** : `js/map.js > initMapFromConfig`. Calcul de `_maxImgDim` puis cascade if/else pour `_minZoom`.

**`sw.js`** : `CACHE_NAME` v74 → v75.

⚠️ **Note utilisateur** : si tu as un très gros plan, tu peux désormais dézoomer un peu moins loin qu'avant — c'est volontaire pour éviter le crash. Compromis taille/perf/stabilité.

---

</details>

<details id="2026-05-09-s24">
<summary><strong>🗓️ 09/05/2026 (suite 24) — Rollback complet du forçage SVG sur roads (crash dézoom)</strong></summary>


**Bug** : le forçage du renderer SVG sur les polylines roads + cercles d'intersection (suites 18 et 20) causait des crashes au dézoom sur les plans denses. Trop d'éléments DOM SVG redessinés simultanément lors du recalcul des coordonnées Leaflet.

**Décision pragmatique** : rollback complet du forçage SVG. Retour au renderer canvas natif (preferCanvas:true) pour toutes les polylines roads non-itinerary et tous les cercles d'intersection. Le bug du toggle "Mes annotations" pour les polylines reste ouvert (déjà connu suite 22), mais au moins plus de crash au dézoom.

L'itinéraire garde son renderer SVG dédié — il en a besoin pour le `filter: drop-shadow` CSS (halo néon cyan) impossible sur le canvas. Un seul tracé itinéraire actif à la fois → coût négligeable.

**Code** :
- `js/road.js` : suppression de `_sharedSvgRenderer`. Polylines roads non-itinerary et cercles d'intersection reviennent au renderer canvas par défaut (juste `addTo(target)` sans option `renderer`).

**`sw.js`** : `CACHE_NAME` v73 → v74.

---

</details>

<details id="2026-05-09-s23">
<summary><strong>🗓️ 09/05/2026 (suite 23) — Itinéraire : bouton "🧭 Ma position" pour utiliser le tracker comme waypoint</strong></summary>


Nouveau dans la modale **🗺️ Calculer un itinéraire** (mode calcul) : un bouton **🧭 Ma position** ajoute la position actuelle du tracker comme waypoint (snapshot figé au moment du clic).

**Position toujours disponible** : utilise `window.getTrackingPosition()` qui retourne `{x, y}` peu importe si le tracking est actif ou non. Au boot, c'est `APP_CONFIG.startX/Y` (point de départ initial du plan), puis modifié par recalage manuel (📍 Mode recalage) ou par les pas du tracker actif.

**Comportement** :
- Clic sur le bouton → ajoute un waypoint avec `source: "tracker"`, label `"🧭 Position actuelle (X, Y)"` (avec coords figées).
- Le waypoint est un **snapshot** : si tu démarres le tracker après et que tu marches, le waypoint ne suit pas (il reste à la position prise au moment du clic). Cohérent avec les autres waypoints (clic carte / search). Pour avoir une position live, ré-ajoute le waypoint.
- Dans la liste de waypoints, l'icône source `📍` est dans un **badge jaune** (classe `.kta-iti-wp-icon-tracker`) pour distinguer visuellement des sources clic carte (📍 standard) et search (🎯).

**Code** :
- `js/interface.js > ouvrirItinerairModal` : nouveau bouton `🧭 Ma position` dans la barre `.kta-iti-mode-toggle`. Wire-up qui appelle `window.getTrackingPosition()` et pousse un waypoint avec `source: "tracker"`.
- `js/interface.js > _rafraichirListeWaypointsModale` : 3 cas pour `sourceIcon` / `sourceTitle` / `sourceClass` (search / tracker / click).
- `css/style.css` : `.kta-iti-wp-icon-tracker` styles le badge jaune doré.
- Aide in-app : section Itinéraire mise à jour pour mentionner le bouton.

**`sw.js`** : `CACHE_NAME` v72 → v73.

---

</details>

<details id="2026-05-09-s22">
<summary><strong>🗓️ 09/05/2026 (suite 22) — Rollback du calque "Mes tracés" séparé</strong></summary>


La séparation des roads dans un calque dédié "Mes tracés" (suite 21) ne résolvait pas le problème de toggle chez l'utilisateur — les polylines roads continuaient à ne pas être masquées par le toggle off de leur LayerGroup parent. Bug Leaflet subtil non identifié.

**Décision pragmatique** : rollback complet du calque "Mes tracés". Les roads retournent dans `window.layerEditor` (calque "Mes annotations"). Le toggle peut ne pas masquer les polylines roads sur certaines configurations, mais au moins on n'a plus de calque parasite dans le contrôle des couches.

**Code restauré** :
- `js/map.js` : suppression de la création runtime du LayerGroup `traces` et de `window.layerTraces`.
- `js/road.js > _targetLayerForRoad` : revient à `window.layerEditor || window.map`.
- `js/road.js` : cercles d'intersection à nouveau dans `window.layerEditor`.
- `js/interface.js > afficherAide` : section "🗂️ Calques d'annotations" supprimée.
- `README_USER.md` : doc utilisateur revient à 1 seul calque.

**À investiguer plus tard si critique** : le bug Leaflet du toggle pour les polylines roads (zones et markers OK) reste ouvert. Possibilités à explorer :
- Recompilation de Leaflet local avec une version différente
- Pattern dom-to-image pour le rendu vectoriel
- Décrochage explicite de chaque polyline dans un listener `overlayremove` du calque

**`sw.js`** : `CACHE_NAME` v71 → v72.

---

</details>

<details id="2026-05-09-s21">
<summary><strong>🗓️ 09/05/2026 (suite 21) — Calque "Mes tracés" séparé pour les roads session</strong></summary>


**Problème** : malgré les fixes successifs (suite 18 SVG renderer, suite 20 SVG partagé, suite 17 fallback auto-création), le toggle "Mes annotations" ne masquait toujours pas les roads de session chez l'utilisateur. Les zones, points et tout le reste suivaient bien le toggle, mais les polylines roads échappaient. Bug Leaflet subtil non identifié — probablement lié au mixage canvas/SVG dans un même LayerGroup.

**Solution** : **séparer les roads dans un calque dédié** plutôt que continuer à debugger le bug Leaflet.

**Architecture résultante** :

| Calque (contrôle des couches Leaflet) | LayerGroup | Contenu |
|---|---|---|
| ✏️ **Mes annotations** | `window.layerEditor` | Points editor + zones session |
| 🛣️ **Mes tracés** | `window.layerTraces` (NOUVEAU) | Roads session + cercles d'intersection |

**Code** :
- `js/map.js > initMapFromConfig` : création systématique du LayerGroup `traces` (en plus de `editor`). Visible par défaut, ajouté au control de calques avec le label "Mes tracés".
- `js/road.js > _targetLayerForRoad` : cible désormais `window.layerTraces` (au lieu de `window.layerEditor`). Cascade de fallback `window.layerTraces || window.layerEditor || window.map` pour robustesse.
- `js/road.js` : cercles d'intersection également dans `window.layerTraces` (cohérence : les cercles dépendent des roads).
- `js/interface.js > afficherAide` : nouvelle section "🗂️ Calques d'annotations" qui documente les 2 calques côté utilisateur.
- `README_USER.md` : doc utilisateur mise à jour pour expliquer les 2 calques.

**Le calque `traces` n'existe PAS dans `plan-config.json`** — il est purement runtime, créé systématiquement au boot pour TOUS les plans. Aucune migration nécessaire.

**Aucun impact sur les exports** (PNG / session / Conversion) : ils utilisent `window.getRoads()` directement, pas le filtrage par visibilité de layer. Les roads session sont toujours incluses dans l'export peu importe le toggle.

**`sw.js`** : `CACHE_NAME` v70 → v71.

---

</details>

<details id="2026-05-09-s20">
<summary><strong>🗓️ 09/05/2026 (suite 20) — Hotfix crash app : SVG renderer partagé pour les roads</strong></summary>


**Bug** : la suite 18 (forçage `renderer: L.svg()` sur roads + cercles d'intersection) faisait crasher l'app instantanément après chargement sur les plans denses.

**Cause racine** : `L.svg()` **crée un nouveau pane SVG** à chaque appel. Avec N polylines + M cercles d'intersection, on instanciait N+M panes SVG distincts dans le DOM. Sur un plan avec 50+ cercles d'intersection, on saturait la mémoire.

**Fix** : créer **UNE SEULE instance** `_sharedSvgRenderer = L.svg()` au début de `renderRoads`, et la réutiliser pour toutes les polylines roads + tous les cercles d'intersection. Résultat : **1 seul pane SVG** dans le DOM peu importe le nombre d'éléments.

L'itinéraire garde son propre `L.svg()` car il a besoin d'un className CSS dédié pour le drop-shadow cyan (un seul tracé actif à la fois → 1 pane additionnel négligeable).

**`sw.js`** : `CACHE_NAME` v69 → v70.

---

</details>

<details id="2026-05-09-s19">
<summary><strong>🗓️ 09/05/2026 (suite 19) — Toast copyright à l'activation du mode debug</strong></summary>


**Avant** : la popup copyright `.kta-devtools-warn` ne s'affichait que si la heuristique outerWidth/innerWidth détectait DevTools ouvert (polling 2s, threshold 240px). Le user ne voyait pas de feedback visuel s'il activait le mode debug **sans** F12 ouvert, ou si son setup DevTools tombait en dessous du threshold.

**Maintenant** : le toast s'affiche **instantanément** dès qu'on passe `setDebugMode(false → true)` — peu importe l'état de F12. Titre adaptatif :
- **"Mode debug active"** si déclenché par activation manuelle (bouton 🐛 ou Réglages)
- **"Inspection detectee"** si déclenché par la heuristique F12 (polling)

**Code** :
- `js/copyright.js > _afficherToastDevtools(cause)` : titre adaptatif. Exposé sur `window.__MKM_showWarning__` pour appel externe.
- `js/config.js > setDebugMode(value)` : si transition false → true, appelle `window.__MKM_showWarning__("debug-activated")`.
- `js/interface.js > sauvegarderConfig` (modale Réglages ⚙️) : appelle `window.setDebugMode()` au lieu d'écrire directement `APP_CONFIG.debugMode`, pour que le toast se déclenche.

Le polling F12 (heuristique 240px) reste actif en complément si debug était déjà ON au boot.

**`sw.js`** : `CACHE_NAME` v68 → v69.

⚠️ **Force refresh nécessaire** côté utilisateur (Ctrl+Shift+R, ou Réglages → 💥 Tout réinitialiser) pour récupérer le nouveau code.

---

</details>

<details id="2026-05-09-s18">
<summary><strong>🗓️ 09/05/2026 (suite 18) — Fix toggle "Mes annotations" sur les roads (renderer SVG forcé)</strong></summary>


**Symptôme** : après le fix suite 17 (auto-création du calque editor), le toggle "Mes annotations" masquait bien les zones de session, mais **les roads de session restaient visibles**.

**Cause racine probable** : interaction subtile entre `preferCanvas: true` (Leaflet) et le toggle d'un layerGroup parent. Les polylines en canvas mode partagent le canvas de la map et leur retrait au moment du `removeLayer(layerGroup)` n'est pas toujours propagé au canvas de manière fiable. Les polygons (zones) ne sont pas affectés par ce bug.

**Fix** : forcer `renderer: L.svg()` sur **toutes les roads de session** (`roadsData`) ET sur les **cercles d'intersection** dans `road.js > renderRoads`. Avec SVG, chaque polyline / circleMarker est un élément DOM dédié, retiré proprement avec son layerGroup parent.

**Impact perf** : négligeable côté roads session car peu nombreuses (typiquement <20 par utilisateur). Les routes **embedded** du JSON (potentiellement des centaines) restent en canvas via `ajouterPointsDepuisJSON`, perf préservée.

**`sw.js`** : `CACHE_NAME` v67 → v68.

---

</details>

<details id="2026-05-09-s17">
<summary><strong>🗓️ 09/05/2026 (suite 17) — Fallback auto-création du calque "editor" dans map.js</strong></summary>


**Bug** : sur des plans-config qui ne déclarent **PAS** le calque `id: "editor"` dans leur tableau `dataLayers` (anciens plans, plans minimaux, ZIP générés avant standardisation), `dataLayerGroups.editor` était `undefined` → `window.layerEditor` aussi → les helpers `_targetLayerForRoad()` et `_zoneTarget()` faisaient `fallback || window.map` et ajoutaient les polylines/polygons directement à la map → toggle "Mes annotations" inopérant pour les routes et zones (les points editor passaient par `_ajouterMarker` qui logge un `console.error` quand `layerEditor` est undefined).

**Fix** : dans `js/map.js > initMapFromConfig`, après le `forEach` des `dataLayers`, on **auto-crée** un calque `editor` si absent. Le LayerGroup est ajouté à la map (visible par défaut) et au control de calques avec le label "Mes annotations". Console warn `[Map] Calque 'editor' absent du plan-config — fallback auto-créé` pour traçabilité.

Avec ce fallback, `window.layerEditor` existe **toujours**, peu importe la version du plan-config. Le toggle "Mes annotations" englobe systématiquement points + roads + zones de session.

**`sw.js`** : `CACHE_NAME` v66 → v67.

⚠️ **Force refresh nécessaire** côté utilisateur (Ctrl+Shift+R, ou Réglages → 💥 Tout réinitialiser) pour récupérer le nouveau code.

---

</details>

<details id="2026-05-09-s16">
<summary><strong>🗓️ 09/05/2026 (suite 16) — Gating buffer logs + threshold popup F12 ajusté</strong></summary>


**Bug 1** : la modale 🐛 Logs de débogage contenait toujours plein de logs même en mode debug OFF (notamment `[Tracking] Magnitude :` qui spammait 60 logs/s en mode tracker actif). Le proxy `debug.js` gatait les logs côté **DevTools console** mais les bufferisait quand même dans le localStorage → buffer plein de bruit.

**Fix** : `console.log` / `console.info` ne sont **plus bufferisés** quand `debugMode === false`. Seuls `console.warn` / `console.error` restent toujours bufferisés (utile pour diagnostic post-mortem en prod). Effet : modale 🐛 reste lisible même après une session intensive de tracker.

| | DevTools console | Buffer (modale 🐛) |
|---|---|---|
| `console.log` / `info` | Visible si debug ON | Bufferisé si debug ON |
| `console.warn` / `error` | Toujours visible | Toujours bufferisé |

**Bug 2** : la popup F12 ne s'affichait plus à l'activation du mode debug pour certaines configs DevTools (dock côté sur écrans pas trop larges). Le threshold 280px était trop strict.

**Fix** : threshold abaissé à **240px** (compromis entre 200 trop sensible et 280 trop strict). Le skip-modal en place protège déjà contre les faux positifs sur transitions de modales.

**`sw.js`** : `CACHE_NAME` v65 → v66.

⚠️ **À faire côté utilisateur après déploiement** : force refresh du SW (Ctrl+Shift+R, ou Réglages → 💥 Tout réinitialiser) pour récupérer le nouveau code.

---

</details>

<details id="2026-05-09-s15">
<summary><strong>🗓️ 09/05/2026 (suite 15) — Détection DevTools réactivée mais conditionnée au mode debug</strong></summary>


Compromis pratique entre la fonctionnalité copyright (dissuasion d'inspection) et l'absence de bug UX :

**Comportement** :
- **Mode debug OFF** (utilisateurs normaux en prod) : **aucune** détection, **aucune** polling, zéro overhead. Pas de faux positif possible.
- **Mode debug ON** (toi en dev/test, ou via le bouton 🐛 dans le loader) : polling 2s reprend, heuristique outer/inner > 280px déclenche le toast `.kta-devtools-warn` avec un badge "DEBUG" pour signaler sa nature dev-only.
- Toggle live : si tu actives/désactives le debug en cours de session, la détection s'active/désactive sans reload.

**Améliorations anti faux positif (même en debug)** :
- Threshold relevé de 200 à **280px** (moins sensible aux transitions de modales).
- **Skip si une modale charte est ouverte** (`.kta-readme-modal-overlay`, `kta-poi-modal`, `kta-itinerary-modal`) — le viewport interne peut bouger pendant les transitions d'ouverture/fermeture.
- Délai de 800ms avant affichage du toast (laisse le viewport se stabiliser).
- **Badge "DEBUG"** sur le toast (style `.kta-devtools-warn-tag` bleu `#8cb4ff`) pour bien signaler que c'est un outil de développement.

**Fichiers** :
- `js/copyright.js` : réintégration de la détection avec `_isDebugMode()` checked à chaque tick + skip modal.
- `css/style.css` : restauration des classes `.kta-devtools-warn-*` + ajout `.kta-devtools-warn-tag` (badge "DEBUG").

**`sw.js`** : `CACHE_NAME` v64 → v65.

---

</details>

<details id="2026-05-09-s14">
<summary><strong>🗓️ 09/05/2026 (suite 14) — Fix toast DevTools faux positif + audit gating logs</strong></summary>


**Bug** : la popup "Inspection détectée" du copyright apparaissait à tort lors de l'utilisation normale de l'app (typiquement au clic **Appliquer** dans le formulaire d'ajout de point). Cause racine : la heuristique `outerWidth - innerWidth > 200 || outerHeight - innerHeight > 200` du polling 2s était trop sensible aux transitions de modales — quand une modale plein écran s'ouvre/se ferme, le viewport interne peut basculer brièvement et déclencher le faux positif.

**Fix** : **suppression complète de la détection DevTools** dans `js/copyright.js`. Le watermark `window.__MKM__` (frozen) et le banner console stylé au boot restent en place — ils transmettent suffisamment le message copyright à un inspecteur curieux qui ouvre F12.

**Nettoyage** : suppression des CSS associés (`.kta-devtools-warn-*`, `@keyframes kta-devtools-popin`) — ~80 lignes de CSS retirées.

**Audit gating logs** (demande utilisateur "que tous les logs soient gated par debugMode si actif") :

- ✅ Le proxy `debug.js` gate déjà tous les `console.log` / `console.info` derrière `APP_CONFIG.debugMode === true`. En mode debug OFF, ces logs sont silencieux dans la console DevTools mais restent **bufferisés** dans la modale 🐛 Logs (accessible depuis ⚙️ Réglages).
- ✅ `console.warn` / `console.error` restent **toujours visibles** par design — cas critiques (échecs fetch, parsing corrompu, OOM, etc.) qui doivent rester diagnostiquables même en prod.
- ✅ Aucun bypass `window.console.*` dans le code (grep exhaustif des 21 fichiers JS, 117 occurrences `console.*`) — tous passent par le proxy.
- ✅ Le banner console copyright bypass volontairement le proxy (chargé AVANT `debug.js`) → reste visible en mode debug OFF, ce qui est le comportement souhaité.

**Conclusion audit** : le système de gating est propre, aucune fuite. Tous les `console.warn`/`error` actuels sont des cas légitimes (pas d'info banale mal classée).

**`sw.js`** : `CACHE_NAME` v63 → v64.

---

</details>

<details id="2026-05-09-s13">
<summary><strong>🗓️ 09/05/2026 (suite 13) — Calque "Mes annotations" englobe points + roads + zones session</strong></summary>


**Avant** : le calque "Ajout" dans le contrôle des couches Leaflet ne masquait que les **points editor**. Les routes (Principal/Secondaire/Chemin) et les zones (Eau/Remblais/Effondrement) tracées en session étaient ajoutées directement à `window.map` → restaient visibles peu importe l'état du toggle.

**Après** : un seul toggle **"Mes annotations"** masque/affiche TOUT ce que l'utilisateur a tracé en session (points + roads + zones + cercles d'intersection).

**Exclus du toggle** (cycle de vie propre) :
- 🗺️ **Itinéraire** (type road `"itinerary"`) — géré par la modale Itinéraire (❌ Effacer / 🔄 Recalculer)
- 📐 **Mesure** — mode actif/inactif via le bouton mesure
- 🧭 **Tracker** — démarrage explicite via ▶️ Play

**Changements code** :

- `js/road.js > renderRoads()` : routes non-itinerary ciblent désormais `window.layerEditor` au lieu de `window.map`. Helper `_targetLayerForRoad(roadType)` qui retourne `map` pour itinerary, `layerEditor` sinon. Cercles d'intersection également dans `layerEditor`.
- `js/zones.js > renderZones() / initZones() / resetZones()` : tous les `addTo(window.map)` deviennent `addTo(layerEditor)` via le helper `_zoneTarget()`. Inclut polygones fermés, polyline preview pendant tracé, et cercle "fermeture possible" sur le 1er point.
- Tous les `removeLayer` remplacés par `layer.remove()` (API portable Leaflet, fonctionne où que soit attaché le layer).
- Fallback `window.map` si `layerEditor` pas encore créé (init précoce).

**Renommage du calque dans le contrôle des couches** :
- `data/test1/plan-config.json` : `"label": "Ajouts"` → `"label": "Mes annotations"`
- `data/test2/plan-config.json` : idem
- `js/createConf.js` : default pour les nouveaux plans → `"Mes annotations"`

**Compatibilité plans existants** : les anciens ZIP avec `"label": "Ajouts"` continuent de fonctionner, leur calque s'affichera juste comme "Ajouts" dans le contrôle. Pour migrer, l'utilisateur peut éditer le `plan-config.json` du ZIP manuellement (ou regénérer le plan via 🏗️).

**`sw.js`** : `CACHE_NAME` v61 → v62.

---

</details>

<details id="2026-05-09-s12">
<summary><strong>🗓️ 09/05/2026 (suite 12) — Protection juridique du code (Phase 1 légale)</strong></summary>


Mise en place d'un dispositif de protection contre le vol commercial du code (cible : sociétés carrière qui voudraient piquer le code via F12 et l'utiliser commercialement).

**Choix de licence** : **CC BY-NC-SA 4.0** (Creative Commons Attribution - NonCommercial - ShareAlike). Autorise l'usage non-commercial avec attribution + partage dans les mêmes conditions. **Interdit explicitement l'usage commercial** sans accord écrit préalable.

**Choix de nom légal** : **Flavien VIDAL** (vrai nom civil, force probante en cas de litige) avec mention "(alias KARMA)" pour la continuité de la marque visible dans le splash et la signature.

**Fichiers ajoutés** :
- `LICENSE` à la racine — licence formalisée avec lien officiel CC, mention claire de l'interdiction commerciale, contact pour licence commerciale, référence à l'art. L.335-2 CPI.
- `js/copyright.js` — module chargé EN PREMIER dans `index.html`, contient :
  - Watermark global `window.__MKM__` (frozen) avec auteur, copyright, licence, build → permet de prouver l'origine d'une copie.
  - Bannière console stylée au boot (visible quand quelqu'un ouvre F12).
  - Détection DevTools (heuristique outerWidth/innerWidth) → toast charte au coin haut-droit avec mention "Inspection détectée · Code propriétaire · Usage commercial INTERDIT".

**Fichiers modifiés** :
- `index.html` :
  - Commentaire copyright en tête (avant `<html>`)
  - Meta `author`, `copyright`, `license`, `description` dans `<head>`
  - Chargement de `copyright.js` AVANT tous les autres scripts (premier `<script>` après les `<style>`)
  - Footer copyright dans le loader (visible côté utilisateur) : `© 2026 Flavien VIDAL · CC BY-NC-SA 4.0 · Usage commercial interdit`
- `sw.js` :
  - Header copyright en tête
  - `LICENSE` et `js/copyright.js` ajoutés à `ASSETS_TO_CACHE` (consultables offline)
  - `CACHE_NAME` v60 → v61
- `js/main.js`, `js/utils.js`, `js/interface.js`, `js/pathfinder.js`, `js/planRegistry.js`, `js/sessionPersist.js`, `js/oomGuard.js` : header copyright en tête (algos métier les plus précieux à protéger).
- `css/style.css` : styles `.kta-devtools-warn-*` (toast détection DevTools) + `.kta-loader-copyright` (footer loader).

**Phase 2.1 (build pipeline esbuild) à venir** : minification + bundle 1 seul fichier en prod (le code source reste lisible en repo privé, le code en prod est compressé). À discuter selon outillage local (node ou binaire standalone).

**Phase 2.2 (obfuscation forte) gardée de côté** : pas activée pour préserver la perf mobile.

---

</details>

<details id="2026-05-09-s11">
<summary><strong>🗓️ 09/05/2026 (suite 11) — Fix toggle calque "Ajout" sur points restaurés par SessionPersist</strong></summary>


**Bug** : après quitter / relancer / restaurer la session via SessionPersist, le toggle du calque **"Ajout"** dans le contrôle des couches Leaflet ne masquait que les points **nouvellement** ajoutés. Les points restaurés depuis localStorage restaient visibles peu importe l'état de la case.

**Causes racines** (deux confondues) :

**1. Asymétrie `setEditorPoints` vs `setRoads / setZones`** — `window.setRoads` et `window.setZones` appellent `renderRoads / renderZones` automatiquement en fin d'exécution. `window.setEditorPoints` était une simple assignation `listePoints = points` sans re-render. SessionPersist appelait bien `renderEditorPoints()` derrière, mais d'autres callers (import session, _viderEtatCourant…) pouvaient laisser le state désynchronisé.

**2. Course async `data/editor.json` ↔ SessionPersist** — `initDataFromConfig` lance le fetch `data/editor.json` en background (RAF batch). SessionPersist restaure ensuite les points en synchrone. Quand le fetch JSON résolvait APRÈS le restore, ses markers s'ajoutaient au `layerEditor` MAIS pas dans `listePoints`. Au prochain `renderEditorPoints` (suppression d'un point, etc.), `clearLayers + addAll(listePoints)` purgeait les markers JSON sans les recréer. Surtout, ces markers fantômes étaient parfois rendus dans un état où le toggle ne les affectait pas correctement.

**Fixes** :

- `editor.js > setEditorPoints()` redessine désormais en interne (`renderEditorPoints()` automatique). Symétrie avec setRoads/setZones, plus aucun caller à risque d'oubli.
- `main.js > initDataFromConfig()` détecte si la session SessionPersist contient des `editorPoints` pour le plan courant (peek `localStorage["myktamap_session_v1"]`) — si oui, **skip le fetch `data/editor.json`** car la session est autoritative. Sans cette détection, on risquait des doublons ou des markers fantômes.
- `sessionPersist.js > _applyRestore` simplifié (l'appel manuel à `renderEditorPoints` n'est plus nécessaire — `setEditorPoints` le fait).

**`sw.js`** : `CACHE_NAME` v59 → v60.

---

</details>

<details id="2026-05-09-s10">
<summary><strong>🗓️ 09/05/2026 (suite 10) — Conversion auto m / km sur les 3 outils de distance</strong></summary>


Au-delà de 1000 mètres, les distances affichées par les 3 outils (📐 Mesure simple, 📏 Distance totale, 🗺️ Itinéraire) basculent automatiquement en kilomètres pour la lisibilité.

**Helper centralisé** `window.formatDistance(distM, decimalsM)` dans `js/utils.js` :
- `< 1000 m` → `"123.4 m"` (nombre de décimales paramétrable, défaut 1)
- `≥ 1000 m` → `"1.23 km"` (toujours 2 décimales en km, soit ~10 m de précision)
- Retourne `"—"` si l'entrée n'est pas un nombre valide.

**Endroits mis à jour** (8 appels au total) :
- `js/measure.js > afficherDistance()` — mesure simple, label bottomleft (decimalsM = 2 conservé pour la précision)
- `js/interface.js > _afficherLabelDistanceItineraire()` — label itinéraire bottomleft (decimalsM = 1)
- `js/interface.js > ouvrirItinerairModal()` — modale mode navigation (`Distance : ...`)
- `js/interface.js > ouvrirItinerairModal()` — modale après calcul (`Distance : ...`)
- `js/interface.js > _rdRafraichirAffichage()` — distance totale road : 3 compteurs par type + total

**Cohérence visuelle** : tous les labels affichent la même unité (m ou km) selon la valeur — pas de mix où l'itinéraire afficherait "1234.5 m" pendant que la mesure affiche "1.23 km".

**`sw.js`** : `CACHE_NAME` v58 → v59.

---

</details>

<details id="2026-05-09-s9">
<summary><strong>🗓️ 09/05/2026 (suite 9) — Fix bouton ❌ Effacer le surlignage (collision de noms)</strong></summary>


**Bug** : le bouton **❌ Effacer le surlignage** dans la modale "Distance totale" ne faisait rien, alors que les checkboxes et le calcul fonctionnaient.

**Cause racine** : collision de noms dans `interface.js`. La fonction privée `function _rdEffacerHighlight()` au top-level du fichier — dans un script chargé via `<script>` (pas un module ES) — devient implicitement `window._rdEffacerHighlight` (les function declarations top-level sont hoistées sur l'objet global). Plus bas dans le fichier, `window._rdEffacerHighlight = function() { ...; _rdEffacerHighlight(); };` (l'export pour main.js > plan switch) **écrasait** la définition initiale, et son corps appelait `_rdEffacerHighlight()` qui résolvait désormais au wrapper export lui-même → **récursion infinie silencieuse** → stack overflow → l'event handler ne complétait jamais son travail.

**Fix** : renommage de la fonction privée en `_rdInternalEffacerHighlight()` pour éliminer la collision avec `window._rdEffacerHighlight`. Tous les appels internes (closure `_rdToutEffacer` du clic ❌ + wrapper export pour plan switch) pointent maintenant explicitement vers la fonction interne. Commentaire de mise en garde ajouté pour éviter une régression future.

**Leçon** : dans un script global (pas module ES), éviter les collisions de noms entre `function FOO()` au top-level et `window.FOO = function()`. Préférer un préfixe `_internal*` ou `_priv*` pour les fonctions privées qui ont un export wrapper de même responsabilité.

**`sw.js`** : `CACHE_NAME` v57 → v58.

---

</details>

<details id="2026-05-09-s8">
<summary><strong>🗓️ 09/05/2026 (suite 8) — Distance totale : modale plein écran (uniformisation UI)</strong></summary>


Le panneau flottant bas-droite introduit en suite 6 est converti en **modale plein écran** style charte (pattern `.kta-readme-modal-overlay` partagé avec les modales itinéraire, légende, config, aide).

**Changements UI** :
- Shell `.kta-readme-modal-overlay` + boîte `.kta-rd-modal-boite` (max-width 480px, max-height 90vh, centrée).
- Header standard avec ✕, ouverture par fade-in natif des modales charte.
- Rows checkbox stylées en boîtes (background subtil + hover magenta), swatch couleur 22×5 px, label 14px.
- Total mis en avant : bloc 12×14 padding, fond magenta 6%, bordure 22%, valeur 20px gras.
- **Footer actions** :
  - `❌ Effacer le surlignage` — retire le halo magenta de la carte ET ferme la modale.
  - `✓ Fermer (garder le surlignage)` — ferme uniquement la modale, le surlignage reste visible.

**Sémantique de persistance** (cohérent avec le choix initial 5:b "persiste jusqu'à clic Effacer") :
- ✕ / clic backdrop / ✓ Fermer → ferme la modale, garde le surlignage actif sur la carte (utilisateur peut explorer avec le highlight).
- Re-clic 📏 → rouvre la modale en restaurant les filtres précédents (`_rdHighlightLayer !== null` détecte un surlignage actif). Sinon reset à "tous cochés".
- ❌ Effacer → cleanup complet.

**CSS supprimé** : `.kta-rd-floater`, `@keyframes kta-rd-popin`, `.kta-rd-header`, `.kta-rd-titre`, `.kta-rd-close`, `.kta-rd-corps` — remplacés par les classes shell de `.kta-readme-modal-*`.

**`sw.js`** : `CACHE_NAME` v56 → v57.

---

</details>

<details id="2026-05-09-s7">
<summary><strong>🗓️ 09/05/2026 (suite 7) — Fix crash Distance totale sur plans denses</strong></summary>


**Bug** : la fonctionnalité "📏 Distance totale" introduite plus tôt dans la journée crashait l'app sur mobile (et même desktop sur les plans très denses), alors que le calcul lui-même était correct. Reproductible même en mode performance.

**Cause racine** : le surlignage magenta créait UNE polyline SVG distincte par road incluse, chacune avec un `filter: drop-shadow` × 2 en CSS. Sur un plan dense (carrière avec 100+ routes embedded), ça générait 100+ éléments SVG avec chacun 2 drop-shadows GPU → explosion du compositing layer cache iOS Safari → kill mémoire silencieux par l'OS.

**Fix** : remplacement du `forEach(create polyline)` par UNE SEULE `L.polyline([[seg1], [seg2], ...])` — Leaflet supporte nativement le format multi-segments dans un seul `<path>` SVG. Résultat :
- 1 seul élément DOM peu importe le nombre de routes incluses
- 1 seul `filter: drop-shadow` appliqué (au lieu de N × 2)
- Coût compositing ~constant
- Visuel identique (halo magenta lumineux)

Le commentaire dans `interface.js > _rdRedessinerHighlight` documente la contrainte pour éviter une régression au refactoring futur.

**`sw.js`** : `CACHE_NAME` v55 → v56.

---

</details>

<details id="2026-05-09-s6">
<summary><strong>🗓️ 09/05/2026 (suite 6) — Distance totale des tracés (filtres + surlignage magenta)</strong></summary>


Nouvel outil de mesure agrégée qui calcule la somme des longueurs de tous les tracés Principal / Secondaire / Chemin présents sur le plan, avec filtrage par type et highlight visuel des tronçons inclus.

**Entrée UI** : nouvelle sous-action **📏 Distance totale (filtres)** dans le groupe accordéon **🛣️ Tracés / Routes** (entre 🟨 Chemin et 🧹 Effacer). Toggle ON/OFF — re-cliquer ferme le panneau.

**Panneau flottant** (`#kta-rd-floater`, `.kta-rd-floater`) :
- Position bas-droite, 280px de large, au-dessus de `safe-area-inset-bottom` (compatible PWA iPhone bottom bar).
- Style charte : fond `#1a1f2e` + bordure gauche magenta `#ff4ecb` (3px), animation pop-in 0.18s.
- 3 lignes checkbox (Principal vert / Secondaire violet / Chemin jaune) avec swatch coloré + compteur live `nb — distM m` par type.
- Total séparé en bas, valeur magenta gras 16px (`#ff4ecb`).
- Toggle case → recalcul + redraw highlight instantanés.

**Surlignage magenta** :
- `L.layerGroup` dédié (`_rdHighlightLayer`), créé à l'ouverture / purgé à la fermeture / nettoyé au plan switch.
- Polylines `weight: 9, opacity: 0.85, color: #ff4ecb`, renderer `L.svg()` forcé pour permettre `filter: drop-shadow` × 2 (cohérent avec le pattern itinéraire cyan).
- Classe CSS `.kta-rd-highlight-polyline` avec halo magenta. `pointer-events: none` → ne bloque pas les clics carte.

**Sources de données** : combine `getRoads()` (session) + `getEmbeddedRoads()` (calques de données visibles uniquement). Le type `itinerary` est explicitement exclu pour éviter le double-comptage.

**Conversion px → m** via `APP_CONFIG.scale` (px/m), comme pour le label measure et l'itinéraire.

**Hooks de rafraîchissement live** :
- `road.js > renderRoads()` appelle `window._rdOnRoadsChanged()` à la fin → si le panneau est ouvert, le surlignage et les compteurs sont mis à jour quand l'utilisateur trace ou efface une road.
- `overlayadd/overlayremove` (toggle calque dans le contrôle des couches) déclenche `renderRoads`, donc les calculs suivent automatiquement la visibilité des calques de données.

**Cleanup au plan switch** : `main.js > _libererRessourcesPlanPrecedent()` appelle `window._rdEffacerHighlight()` AVANT `map.remove()` pour éviter qu'un layer détaché flotte ou que le panneau se superpose au splash.

**PAS exporté dans la légende des images PNG** : la fonctionnalité est purement runtime. Aucune modif à `exporter.js / utils.js > telechargerPlan`. Les magenta polylines ne sont pas dans `roadsData` ni dans `getEmbeddedRoads()` (layerGroup parallèle dédié).

**Aide in-app réorganisée** :
- Section "🧭 Tracker / Navigation" → renommée "🧭 Tracker" (l'itinéraire en sort).
- Nouvelle section "📐 Outils de mesure" qui regroupe : 📐 Mesure simple, 📏 Distance totale, 🗺️ Itinéraire — avec paragraphe explicatif pour chacun.
- Section "🛣️ Tracés & Routes" : ajout d'une ligne 📏 pour pointer vers la sous-action.

**API exposée** :
- `window.ouvrirRoadsDistanceFloater()` — toggle ouverture/fermeture
- `window._rdEffacerHighlight()` — cleanup forcé (utilisé par main.js)
- `window._rdOnRoadsChanged()` — hook appelé par road.js > renderRoads

**`sw.js`** : `CACHE_NAME` v54 → v55 (forcer purge cache utilisateurs pour récupérer les nouveaux CSS et JS).

---

</details>

<details id="2026-05-09-s5">
<summary><strong>🗓️ 09/05/2026 (suite 5) — Itinéraire / Pathfinding sur le réseau de routes</strong></summary>


Nouvelle feature : calcul du chemin le plus court entre N points en empruntant les routes existantes.

**Module `js/pathfinder.js` (nouveau)** — algorithme :
- Construction d'un graphe à partir de toutes les polylines visibles : `getRoads()` (session) + `getEmbeddedRoads()` (calques de données).
- Spatial-bucketing pour fusionner les nœuds coïncidents (1.5 px).
- Étape d'enrichissement `_enrichirGrapheAvecCroisements` qui gère 3 cas de jonction :
  - **Croisement strict** : intersection segment-segment paramétrique → nœud virtuel à l'intersection, lié aux 4 endpoints.
  - **T-junction** : extrémité d'un segment à ≤ 15 px de l'intérieur d'un autre, projection orthogonale + insertion de nœud virtuel.
  - **Endpoint↔endpoint** : 2 extrémités distinctes à 1.5 < d < 15 px, arête directe pondérée.
- Snap des waypoints : projection orthogonale sur le segment le plus proche, insertion d'un nœud virtuel à la projection.
- Dijkstra entre paires consécutives de waypoints, concaténation des chemins.
- API publique : `window.Pathfinder.computeRoute(waypoints, opts)` retourne `{ path, totalDistance (px), segmentCount, snappedPoints }`.

**Module `js/searchPoints.js` (extension)** :
- Nouvelle API publique `window.SearchPoints.getAllPoints()` (async) et `findByQuery(q)` (async, recherche substring sur nom + id + tags) — utilisées par la modale itinéraire pour l'autocomplete.

**UI — modale itinéraire (`interface.js`)** :
- Entrée : sous-action **🗺️ Calculer un itinéraire** dans le groupe Tracker.
- **Mode calcul** (pas d'itinéraire actif) :
  - Toggle "📍 Mode clic carte" → masque la modale et affiche un mini-floater en bas (pour ne pas bloquer la carte). Clics sur la carte ajoutent des waypoints numérotés (markers cyan).
  - Input "🔍 Rechercher un point existant…" avec dropdown autocomplete sur tous les points (data layers + editor). Clic sur un résultat ajoute un waypoint avec son nom.
  - Liste de waypoints affichés avec source (📍 clic / 🎯 search), label, et bouton ✕ par ligne pour retirer.
  - Bouton "🎯 Calculer l'itinéraire" lance le pathfinder, trace le résultat en **cyan néon** (halo `drop-shadow` × 2 grâce au renderer SVG forcé).
  - Boutons résultat : "💾 Enregistrer" (persiste comme road type "itinerary") / "❌ Effacer" (retire le preview).
- **Mode navigation** (itinéraire actif détecté au re-open) :
  - Titre "🗺️ Itinéraire actif — Navigation".
  - Quick-nav row : "⏮️ Début" / "⏭️ Fin" / "🔁 Tour complet" (fitBounds sur tout le tracé).
  - Liste des waypoints avec bouton 🎯 par ligne → pan + flash cyan (style search), et ✕ pour retirer.
  - Section "Itinéraire actuel" : distance + nombre de tronçons.
  - Boutons "🔄 Recalculer" (drop le tracé, ré-ouvre en mode calcul avec waypoints conservés) / "❌ Effacer l'itinéraire" (red).

**Persistance** : la road de type `"itinerary"` porte une propriété `waypoints: [{x, y, label, source}, ...]` en plus de `points`. SessionPersist sauve la road comme n'importe quelle autre, donc les waypoints survivent au reload du plan.

**Type de road `"itinerary"`** :
- `road.js > ROAD_STYLES.itinerary` : cyan `#00d4ff`, weight 7, dashArray "12 6".
- Renderer SVG forcé sur la polyline pour permettre le filter CSS (effet néon).
- Filtré du calcul des cercles d'intersection (`renderRoads`) pour éviter les cercles redondants sur le tracé itinéraire.

**Label de distance** : nouveau `L.control` `bottomleft` `.kta-iti-distance` (cyan `#00d4ff` sur fond `#1a1f2e`), affiché dès qu'une road de type "itinerary" existe, juste **au-dessus du label measure** (Distance : …). Helper `_majLabelDistanceItineraire` exposé sur `window`, appelé après chaque setRoads et après `lancerApplication` (pour le restore session).

**Sémantique** : un seul itinéraire actif à la fois. Recalculer remplace le précédent. Effacer le retire complètement.

**Aide en-app** : section "🧭 Tracker / Navigation" mise à jour pour mentionner la sous-action 🗺️ et son fonctionnement.

**`sw.js`** : `js/pathfinder.js` ajouté à `ASSETS_TO_CACHE`. Cache bumpé v43 → v50 sur la chaîne (multiples itérations Phase 1 / Phase 2 / fixes intersections / persistance).

---

</details>

<details id="2026-05-09-s4">
<summary><strong>🗓️ 09/05/2026 (suite 4) — OOMGuard : modale "ATTENTION arrêt brutal détecté"</strong></summary>


- **Nouveau module `js/oomGuard.js`** — détection des kills mémoire silencieux d'iOS Safari et Android Chrome :
  - **Heartbeat** localStorage `myktamap_session_alive` rafraîchi toutes les 5s, effacé proprement aux events `beforeunload` ET `pagehide` (iOS préfère `pagehide`)
  - **Au boot** : si le marker est présent et < 1h → kill brutal probable (l'app n'a pas atteint son unload). Stocke l'info en `_pendingKillInfo` et programme l'affichage de la modale.
  - **`flushPendingToasts()`** appelée depuis `_splashEnd` dans main.js → vide la file 400ms après le fade splash → la modale s'affiche au bon moment, pas derrière le gradient sombre.
- **Modale plein-format `_afficherModaleKill`** dans le style charte :
  - **Bordure rouge 2px** + glow rouge (layered box-shadow) autour de la carte
  - **Titre `⚠️ ATTENTION — ARRÊT BRUTAL DÉTECTÉ ⚠️`** en gros (18px), all caps, rouge `#ff6b6b`, bold 800. Les ⚠️ de chaque côté pulsent doucement (1.6s scale 1↔1.15) pour attirer l'œil sans agresser.
  - **Sections** : intro pill (accent rouge gauche), "🤔 Pourquoi ?", "💡 Comment éviter que ça recommence" (liste de conseils concrets : fermer apps en arrière-plan, baisser le mode performance, éviter onglets multiples, garder OS à jour, plan trop volumineux, exporter régulièrement), "🔧 Détails techniques" (planId, ageSec, PWA vs navigateur)
  - **Bouton "✓ Compris"** + ✕ + Échap + clic backdrop pour fermer
- **Wording neutre** : "smartphone" au lieu d'"iOS" (Android Chrome aggressif aussi).
- **API `window.OOMGuard`** : `start()`, `showToast(msg, type)` (warn/error/info, file derrière le splash), `flushPendingToasts()`.
- **Toast quota localStorage** : `sessionPersist.js` détecte `QuotaExceededError` au save et affiche un toast charte-aligné incitant à exporter manuellement (anti-spam : 1× max).
- **`sw.js`** : `js/oomGuard.js` ajouté à `ASSETS_TO_CACHE`. CACHE_NAME bumpé v36 → v40.

---

</details>

<details id="2026-05-09-s3">
<summary><strong>🗓️ 09/05/2026 (suite 3) — Reset "Tout réinitialiser" : check Internet en amont</strong></summary>


- **Restoration d'une feature perdue** dans `viderCacheAppli()` (`js/interface.js`) : ping Internet AVANT toute confirmation, parce qu'un reset wipe le SW + caches → l'app ne pourra se relancer que si la connexion permet de redescendre les fichiers.
- **`_pingInternet()`** : combine `navigator.onLine` (rapide signal offline) + `fetch no-cors` sur `gstatic.com/generate_204` (HTTP 204 No Content, payload minimal) avec `AbortController` + timeout 5s. Fail = vrai offline.
- **Modale "📶 Vérification de la connexion…"** affichée pendant le ping (max 5s).
- **Si OFFLINE** : nouvelle modale rouge insistante (`_resetFlowOfflineWarning`, style cohérent avec la modale OOM : bordures rouges, gros titre `⚠️ PAS DE CONNEXION INTERNET ⚠️`) explique :
  - L'app sera inutilisable après reset (splash bloqué au reboot, aucun asset)
  - Plans / session / prefs perdus définitivement
  - Recommandation : reconnecter avant de relancer
  - Boutons "Annuler" / "Continuer quand même"
- **Si ONLINE OU forcé** : flow inchangé (2 confirmations).
- **Total confirmations** : 2 quand online, **3 quand offline**.
- **CACHE_NAME bumpé** v40 → v41.

---

</details>

<details id="2026-05-09-s2">
<summary><strong>🗓️ 09/05/2026 (suite 2) — Perf hardening mobile (transparent utilisateur)</strong></summary>


Optims user-invisibles pour réduire le risque de crash sur smartphone, **aucun changement graphique**.

- **`preferCanvas: true`** sur init Leaflet (`map.js`) → polylines (routes), polygons (zones), `circleMarker` (intersections) rendus sur 1 canvas au lieu de N éléments SVG. Markers (icon images) restent en DOM. Gain perf sur plans denses.
- **`_libererRessourcesPlanPrecedent()`** dans `main.js` factorise le cleanup au plan switch :
  - libère les tuiles (`libererTuiles` → overlays + blob URLs)
  - `map.remove()`
  - **vide explicitement `collisionCanvas`** (width/height à 0 → libération immédiate des pixels — sur plans 4K c'est jusqu'à 64 MB, sinon iOS Safari accumule la pression mémoire entre 2 plans)
  - nullifie `window.collisionCanvas` / `window.collisionCtx`
  - `resetRuntimeAssets()` (blob URLs ZIP)
  - reset des flags `interfaceInitialized` / `roadInitialized` / `zonesInitialized`
- **Listeners device idempotents** (`tracking.js`) : flags `_orientationListenerAttached` / `_motionListenerAttached` empêchent la duplication des handlers `deviceorientation` / `devicemotion` après plan switch + nouveau Play.
- **SessionPersist throttle adaptatif** (`sessionPersist.js`) : `save()` mesure le main thread via micro-bench (`performance.now` × busy-loop). Si > 5ms → main thread busy → skip ce tick. Max 6 skips consécutifs (≈ 9s) avant force. `beforeunload` et `visibilitychange` appellent `save({force:true})` pour ne jamais perdre les dernières modifs au moment de fermer / passer en arrière-plan.
- **`createImageBitmap` étudié puis SKIPPÉ** : commentaire explicite dans `tiling.js > _imageVersCanvasReduit` indique que l'auteur a déjà testé et est revenu à `new Image()` pour de meilleures perfs mémoire sur Safari iOS avec gros JPEG. Décision : respecter le précédent.

---

</details>

<details id="2026-05-09">
<summary><strong>🗓️ 09/05/2026 (suite) — Audit code : suppression dead code, gating logs centralisé</strong></summary>


Nettoyage des reliquats accumulés. Net : **−1700 lignes** dans le repo.

**Fichiers orphelins supprimés** :
- `js/sw.js` (75 lignes) — ancien SW abandonné, le vrai vit à la racine
- `js/import.html` (321 lignes) — page autonome obsolète, fusionnée dans `index.html`

**Globals window morts** retirés :
- `js/map.js` : 13 `window.iconeXXX` (`iconeSalle`, `iconepa`, `iconepc`, `iconepb`, `iconeVehicule`, `iconeElec`, `iconeEpure`, `iconePS`, `iconeInfo`, `iconeChatiere`, `iconePassage`, `iconeDanger`, `iconepe`) + leurs `let` locaux. Résolution unique via `window._iconMap[tag]` désormais. Conservés : `iconeDefault` et `iconeTrack`.
- `js/tiling.js` : `perfModeActif()` + `window.perfModeActif` — alias rétro-compat jamais consommé.
- `js/config.js` : `window._SERVER_PLAN_PATH` — dead write (jamais lu).

**Reliquats deprecated** :
- `js/config.js > buildAppConfigFromPlan` lit désormais `tracking.debugMode` en priorité, fallback sur l'ancien `tracking.motionDebug` (rétro-compat zip terrains).

**Classes CSS orphelines** retirées (style.css) : `.kta-cfg-actions`, `.kta-cfg-cache`, `.kta-conv-apercu`, `.kta-conv-hint`, `.kta-legende-separateur` (+ first-child), `.kta-planner-tabs`, `.kta-planner-tab` (+ .active).

**Gating logs centralisé** dans `js/debug.js` :
- `console.log` / `console.info` patchés : silence dans la console DevTools sauf si `APP_CONFIG.debugMode === true`. Toujours bufferisés pour la modale 🐛 Logs (utile en post-mortem).
- `console.warn` / `console.error` : toujours visibles ET bufferisés (critiques).
- Plus de gating manuel `if (APP_CONFIG?.debugMode)` à coder dans les modules.
- Préfixage uniforme `[Module]` (ex : `[Road]`, `[Tracking]`, `[Zones]`, `[Export rapide]`).

**Onglets export renommés** : `⚡ Export rapide` / `🎨 Avancé` → `⚡ Mode rapide` / `🎨 Mode avancé` (UX : le mot "Mode" évite que l'utilisateur lise ça comme un bouton d'action — observé en session de troubleshooting où l'utilisateur cliquait l'onglet en pensant déclencher l'export).

---

</details>

<details id="2026-05-09-bis1">
<summary><strong>🗓️ 09/05/2026 — iPhone PWA : top intégré dark via hack Leaflet</strong></summary>


Saga iPhone PWA edge-to-edge / safe-area pour avoir un look intégré dark en haut sans bug de bande sombre en bas. **Conclusion** : `viewport-fit=cover` est ingérable proprement sur iOS PWA portrait sans devtools Safari Mac. On revient à un setup safe-area natif iOS + un hack ciblé.

**Setup final** :
- `index.html` viewport **sans** `viewport-fit=cover` : iOS reste dans la safe-area, pas de bug bottom band.
- `apple-mobile-web-app-status-bar-style: black` : bande noire opaque fixe avec icônes blanches, **indépendante du contenu**. Ne flashe plus en blanc quand les tuiles Leaflet (claires) chargent.
- **Hack `lib/leaflet/leaflet.css` ligne 267** : `background: #000000` (au lieu du `#ddd` Leaflet par défaut). Effet : la zone hors-tuiles est noire, et surtout le sliver visible juste sous la status bar avant le rendu des tuiles l'est aussi. Cohérence visuelle splash → loader → map.
- **`viderCacheAppli` complète** : étend le wipe à `localStorage`, `sessionStorage`, **toutes** les bases IndexedDB (avec fallback Safari/Firefox sur `myktamap_handles`). Avant ça, la fonction nettoyait juste SW + caches HTTP — les plans, prefs, sessions survivaient. CLAUDE.md décrivait déjà le comportement attendu mais le code avait dérivé.

**Fix indirects en route** :
- **Bug zones embarquées non exportées en mode avancé** : regex `/_zone_(.+)$/` greedy gauche-droite + id checkbox `export_layer_zone_zone_eau` (collision quand l'id du layer contient "zone") capturait `"zone_eau"` au lieu de `"eau"`. Filter excluait toutes les zones. Fix : `[^_]+$` pour zone/road, `startsWith` + `slice` pour les tags (qui peuvent contenir des `_`).
- **Bug cross-plan leakage** : `initEditor` et `initRoad` ne reset pas `listePoints` / `roadsData` au switch de plan. Le polling SessionPersist ré-enregistrait les points de l'ancien plan sous l'id du nouveau plan, créant une cross-pollination. Fix : reset complet en début d'init (cohérent avec `initZones` / `initMeasure` qui le faisaient déjà).
- **Export rapide planté silencieusement** : `telechargerPlan` attrapait ses erreurs en interne et alertait, puis la modale fermait → alert masqué. Fix : rethrow + Promise wrapper autour de `toBlob` + try/catch par marker (un icône qui rate ne fait plus tomber l'export entier).

**Cercles aux intersections de routes** :
- 16px de diamètre, priorité couleur `chemin > secondaire > principal`, croisements même type conservés (vert/vert = vert, etc.).
- Détection segment + T-junction avec tolérance 8px (gère les hand-drawn imparfaits).
- Inclut les routes embarquées dans les data layers (registre `_embeddedRoads` via `registerEmbeddedRoad` / `clearEmbeddedRoads`).
- Visible sur la carte ET dans les exports (rapide + avancé), z-order ZONE → TRAIT → CERCLE → ICÔNE.

**Splash** :
- Échelle 0-100 ajoutée sous la barre de chargement (style barre d'échelle de carte, 10 segments alternés jaune/dark, labels 0..100 centrés sur leurs ticks).

**Modale Documentation** :
- Footer enrichi : `Développé par <signature KARMA> — 🍃 Cartographie propulsée par Leaflet` (au lieu du seul crédit Leaflet).

---

</details>

<details id="2026-05-08-s3">
<summary><strong>🗓️ 08/05/2026 (suite 3) — Filtres calques + tags dans la recherche</strong></summary>


- **Filtres ajoutés** dans la modale `🔍 Rechercher un point` (`js/searchPoints.js`) :
  - 2 lignes de chips compactes sous le champ de recherche : **Calques** (un chip par calque utilisé) + **Tags** (un chip par tag unique présent dans les points)
  - **Multi-sélection** : clic sur un chip l'active (jaune `#f4c542` charte) ou le désactive
  - **Logique** : AND entre catégories, OR à l'intérieur (ex: calques `[A, B]` + tags `[ouvert, fermé]` → points dans A ou B ET ayant ouvert ou fermé)
  - **Bouton "✕ Effacer les filtres"** apparaît si au moins 1 chip actif
  - **Auto-reset** des filtres à chaque ouverture de la modale (état propre)
- **Empty states** mis à jour :
  - Avec query + 0 match → "Aucun point ne correspond à `<query>`"
  - Sans query + filtres actifs + 0 match → "Aucun point ne correspond aux filtres actifs"
  - Sans query + sans filtre + 0 résultat → "Tape une recherche pour trouver un point"
- **Compteur info** : indique "X sur Y point(s) (filtré)" quand au moins un filtre est actif, sinon "Y point(s) disponible(s)"
- **Helpers internes** : `_availableLayers()` (calques uniques avec leurs labels), `_availableTags()` (tags uniques triés alpha), `_matchesFilters(it)` (test passe-filtre)
- **Charte respectée** : chips fond `rgba(255,255,255,0.04)` inactif → `#f4c542` actif (texte `#1a1f2e` sombre, comme les segmented controls perf et debug)

---

</details>

<details id="2026-05-08-s2">
<summary><strong>🗓️ 08/05/2026 (suite 2) — Convertisseur bidirectionnel dans le modal Export</strong></summary>


- **Onglet "🔄 Conversion"** du modal "💾 Enregistrer la session" (`sessionExporter.js`) gère désormais **les 2 sens** :
  - **✏️ → 🗂️ Session vers data layer** (existant) : convertit la session en cours en fichier(s) data layer chargeable(s) dans un plan via `plan-config.json > dataLayers`. Granularité basique (1 fichier/catégorie) ou fine (1 fichier/type)
  - **🗂️ → ✏️ Data layer vers session** (NOUVEAU) : prend un fichier data layer en entrée (drop zone + file picker), affiche un aperçu (compte points/tracés/zones), et produit un fichier session JSON ré-importable
- **Toggle de direction** en haut de l'onglet via 2 boutons `.kta-conv-sens-btn` (charte existante du convertisseur)
- **Reset de l'état uploadé** automatique à la fermeture du modal (pas de pollution entre ouvertures successives)
- **Code mort supprimé** : ancienne fonction `afficherConvertisseur` dans `interface.js` retirée (~200 lignes) + son export `window.afficherConvertisseur`. Le pattern `convertir(json, direction, typeLabel)` est entièrement absorbé par `_exportConvSession2Data` + `_exportConvData2Session` du nouveau modal
- **Fichiers modifiés** : `js/sessionExporter.js` (ajout des fonctions de rendu + dispatch), `js/interface.js` (suppression code mort)

---

</details>

<details id="2026-05-08">
<summary><strong>🗓️ 08/05/2026 (suite) — Auto-save de la session active + toast de restauration</strong></summary>


- **Nouveau module `js/sessionPersist.js`** — auto-sauvegarde silencieuse de la session active dans `localStorage["myktamap_session_v1"]` :
  - **Slot unique** : la dernière session active "gagne" — si tu charges un autre plan, l'auto-save écrase le slot avec le nouvel état
  - **Polling 1.5s** : un hash de l'état (`getEditorPoints + getRoads + getZones + getMeasurePoints`) est comparé périodiquement ; si changement, sauvegarde
  - **Safety nets** : `beforeunload` (fermeture page) + `visibilitychange` (mobile en arrière-plan)
  - **Tracker path EXCLU** volontairement de la persistance (PDR expérimental — restaurer une trail morte est trompeur)
- **Hook restore** dans `main.js > lancerApplication()` : après init complète, appelle `SessionPersist.onPlanLoaded(planId)` qui :
  - Restaure la session si `saved.planId === currentPlanId`
  - Purge la session sauvegardée si `saved.planId !== currentPlanId` (un autre plan a été chargé entre temps)
  - Ne fait rien si pas de session sauvegardée
- **Modale de feedback** centrée (pattern `kta-readme-modal`) après restore :
  - Icône ↻ jaune dans un cercle (charte `#f4c542`), titre "Session précédente restaurée", détail *"N points · M tracés · K zones"*
  - Bouton **🗑️ Effacer la session** (ghost) : vide la session restaurée + le slot localStorage (redémarrer ce plan vierge)
  - Bouton **✓ Continuer** (primary jaune) : ferme la modale, garde la session
  - Click sur le backdrop ou Échap = "Continuer" (pattern modal soft)
  - Animations : fade-in overlay + pop-in box (cubic-bezier overshoot léger)
- **Format storage** :
  ```json
  {
    "version": 1,
    "planId": "local_planmarseille_v1",
    "savedAt": "2026-05-08T...",
    "editorPoints": [...],
    "roads": [...],
    "zones": [...],
    "measure": [...]
  }
  ```
- **Volume typique** : <50 Ko (rentre largement dans la limite localStorage de ~5 Mo)
- **Conditions de purge** : changement de plan + reset complet 💥 + bouton 🗑️ Effacer du toast
- **Choix d'implémentation : polling vs hooks** : polling retenu (1 seul nouveau fichier + 1 hook dans main.js) au lieu de modifier editor/road/zones/measure individuellement. Lag de 1.5s imperceptible, pas de risque d'oublier un module.

- **Fichiers modifiés** : `js/sessionPersist.js` (nouveau), `js/main.js`, `index.html` (loader le script), `css/style.css` (toast). **Inchangés** : editor/road/zones/measure (pas de hooks invasifs)

---

</details>

<details id="2026-05-08-bis1">
<summary><strong>🗓️ 08/05/2026 — Mode performance réglable (5 presets DLSS-like) + flag debug global</strong></summary>


- **Refonte du mode performance** : la simple checkbox boolean est remplacée par un **segmented control 5 boutons** dans le loader, à la manière du DLSS dans les jeux vidéo :
  - 💤 **Désactivé** — aucun tiling, `L.imageOverlay` direct (qualité brute, équivalent de l'ancien `perfMode = false`). ⚠️ Risque de crash sur Safari iOS pour images > 8192 px
  - 🔄 **Auto** — comportement legacy : tile uniquement si fichier > 60 Mo, avec params Équilibré (= défaut sain pour 90% des cas)
  - 🌟 **Qualité** — `MAX_WORK_DIM 12288 / TILE 1024 / JPEG 0.95`. Plus net, recommandé sur PC desktop avec plans très grands à zoomer
  - 🎯 **Équilibré** — `MAX_WORK_DIM 8192 / TILE 1024 / JPEG 0.88`. Reproduit le comportement v1 (mode performance forcé) — défaut idéal
  - ⚡ **Performance** — `MAX_WORK_DIM 6144 / TILE 768 / JPEG 0.78`. Plans très lourds, mobile faible, urgence terrain
- **Persistance par plan** : le preset choisi est sauvegardé dans `PlanRegistry[planId].perfPreset` (localStorage). Plus de pref globale `app_user_prefs.perfMode` — chaque plan a son propre réglage
- **Tiling logic** :
  - Mode `off` → JAMAIS de tiling (`L.imageOverlay` direct, choix utilisateur explicite)
  - Mode `auto` → tile si `fileSize > 60 Mo` (= seuil legacy `PERF_AUTO_TILE_THRESHOLD`)
  - Modes explicites (`quality`/`balanced`/`performance`) → tile si `imageWidth × imageHeight > 4096²` (= `tuilingNecessaire()` existant, sécurité GPU mobile). Sinon `L.imageOverlay` direct (qualité native)
- **Nouvelle table `PERF_PRESETS`** dans `tiling.js` (export `window.PERF_PRESETS`) — chaque preset porte ses 3 leviers techniques + emoji + label + description
- **Nouvelle fonction `resoudrePerfPreset(preset, fileSize, W, H)`** retournant `{tile: bool, params: {...}}`. Remplace l'ancien `perfModeActif(fileSize)` (conservé en alias rétro-compat)
- **Pipeline de tiling rendu paramétrique** : `chargerImageTuillee`, `_imageVersCanvasReduit`, `_tilerDepuisCanvas` reçoivent désormais `params` (au lieu de lire les constantes globales). Permet à chaque preset d'utiliser ses propres réglages
- **`plan-config.json` inchangé** — le mode performance est purement un choix utilisateur côté app, pas une donnée du plan

- **Renommage du flag debug** : `motionDebug` → `debugMode` (flag global, plus uniquement tracker)
  - Ce flag contrôlait UNIQUEMENT les logs du tracker auparavant — il sert maintenant aussi à afficher les **chiffres techniques** (`MAX:8192 / TILE:1024 / Q:0.88 / tile si > 60 Mo`) sous le segmented control du loader
  - Migration silencieuse au boot : `localStorage.app_user_prefs.motionDebug` → `debugMode` (préserve la valeur)
  - L'ancienne pref globale `perfMode` est SUPPRIMÉE de localStorage au boot (perfPreset est désormais par plan)
  - Réglages ⚙️ : ligne "Debug mouvement" renommée en **"Logs détaillés"** (id `cfg_motionDebug` → `cfg_debugMode`)
  - `tracking.js` met à jour ses 2 références (logs Magnitude + détection de pas)

- **Nouveau bouton 🐛 dans le loader** (bloc "Plus d'options", inséré avant Reset)
  - Toggle global pour `APP_CONFIG.debugMode` accessible avant tout chargement de plan
  - Texte dynamique `🐛 Logs détaillés : ON/OFF` + état actif teinté avec la couleur d'accent `#f4c542`
  - Helper unique `window.setDebugMode(value)` dans `config.js` — utilisé à la fois par le bouton du loader et par le toggle des Réglages ⚙️ (un seul point d'entrée)

- **Nouveaux helpers `PlanRegistry.getPerfPreset(id)` / `setPerfPreset(id, preset)`**
  - Validation contre `["auto", "quality", "balanced", "performance"]` (toute autre valeur ignorée + warn console)
  - Le champ `perfPreset` est ajouté au format de fiche plan (optionnel — absent = pas de pref → défaut "auto")

- **Charte graphique respectée** :
  - Boutons inactifs : fond `rgba(255,255,255,0.04)` / texte `#c8d0e0`
  - Bouton actif : fond `#f4c542` (jaune doré accent) / texte `#1a1f2e` (sombre, contraste maximal)
  - Hover inactif : fond `rgba(255,255,255,0.08)` / texte `#e8eaf0`
  - Description sous segmented : italique `#8892a4` (couleur secondaire)

- **Fichiers modifiés** : `index.html`, `css/style.css`, `js/tiling.js`, `js/config.js`, `js/main.js`, `js/planRegistry.js`, `js/interface.js`, `js/tracking.js`. **Inchangés** : `plan-config.json`, `js/createConf.js` (générateur ZIP), `js/exporter.js`, `js/sessionExporter.js`

---

</details>

<details id="2026-05-06-s3">
<summary><strong>🗓️ 06/05/2026 (suite 3) — 6 nouveaux tags d'accès + refonte cascade icônes + légende 5 groupes</strong></summary>


- **Ajout de 6 nouveaux tags built-in** dans le set par défaut :
  - `peo` / `pef` — Puits à échelon ouvert / fermé
  - `eso` / `esf` — Escalier service ouvert / fermé
  - `cao` / `caf` — Cavage ouvert / fermé
  - Convention : **vert = ouvert**, **rouge = fermé**, transparence 50% sur le fond du cercle
  - PNG 50×50 avec transparence alpha (générés via Pillow), placés dans `icon/`

- **Refonte de la cascade de résolution d'icônes**
  - Nouveau **fallback built-in `TAGS_BUILTIN`** dans `map.js` (fonction `creerIcones`) : si un tag n'est pas déclaré dans `plan-config.json > icons`, l'app pointe automatiquement vers `icon/<tag>.png`
  - Permet d'utiliser les nouveaux tags sur des plans existants **sans modifier leur `plan-config.json`**
  - Tous les tags built-in sont précisés dans `TAGS_BUILTIN` : salle, pa, pb, pc, pe, ps, **peo, pef, eso, esf, cao, caf**, vehicule, elec, epure, info, chatiere, passage, danger
  - `_iconMap` est désormais **toujours rempli** avec ces tags, même si le plan-config ne les déclare pas

- **Nouvelle fonction utilitaire centralisée `getIconUrlForPoint(point)`** (`utils.js`)
  - Cascade complète :
    1. `PLAN_CONFIG.icons[tag]` (déclaré dans le plan)
    2. `_iconMap[tag].options.iconUrl` (built-in fallback de `TAGS_BUILTIN`)
    3. `PLAN_CONFIG.icons.default`
    4. `_iconMap.default.options.iconUrl`
    5. `null`
  - Exposée globalement via `window.getIconUrlForPoint`
  - **Utilisée maintenant par tous les modules** qui ont besoin d'une URL d'icône (au lieu d'un objet `L.icon`)

- **Modules mis à jour pour utiliser la cascade complète** (correction de bugs visuels) :
  - `searchPoints.js > _getIconUrl` — la recherche affichait l'icône par défaut pour les nouveaux tags
  - `utils.js > telechargerPlan > getIconForPoint` — l'export PNG simple ratait les nouveaux tags
  - `exporter.js > _iconePourTag` — l'export PNG avancé ratait les nouveaux tags
  - `exporter.js > getIconUrl` (dessin canvas) — idem
  - `exporter.js` (construction légende) — itère désormais sur `config.icons ∪ _iconMap`
  - `sessionExporter.js > _iconePourTag` — preview session manquait les nouveaux tags

- **Editor — modale d'ajout de point** (`editor.js > _buildTypeOptionsHTML`)
  - Avant : la liste déroulante n'affichait **que les tags du `plan-config.json`**
  - Après : fusion `EDITOR_TAG_LABELS` ∪ `plan-config.json` → l'utilisateur peut **toujours** sélectionner un type même si le plan-config ne le déclare pas (l'app utilise `_iconMap` ou l'icône par défaut)
  - Tri : tags labellisés d'abord (ordre canonique), puis tags custom non labellisés en queue

- **Légende d'aide** (`interface.js > LEGENDE_LABELS` + groupes)
  - Ajout des 6 labels (peo/pef/eso/esf/cao/caf)
  - Nouveau groupe **"🪜 Accès"** affiché entre "🕳️ Puits" et "⚠️ Signalétique"
  - Lecture depuis `_iconMap` en fallback → les icônes apparaissent même si pas dans `plan-config.icons`

- **Export PNG — Légende refondue en 5 groupes** (`exporter.js`)
  - **Avant** : un seul gros bloc "Icônes" à gauche + Tracés/Zones à droite → déséquilibre énorme dès qu'on a 15+ icônes
  - **Après** : 5 sections distinctes (cohérent avec la légende d'aide) :
    - 🕳️ Puits, 🪜 Accès, ⚠️ Signalétique, 🛣️ Tracés, ⬛ Zones
    - + 🏷️ Autres (auto, si tags custom créés via "➕ Créer un nouveau tag")
  - **Algorithme de répartition équilibré** : chaque groupe est ajouté à la **colonne la moins remplie** (en lignes cumulées)
  - Adaptation automatique selon le nombre d'icônes effectivement disponibles

- **Générateur de plans** (`createConf.js > PLANNER_DEFAULT_ICONS`)
  - Les 6 nouveaux tags apparaissent automatiquement dans le panneau "Icons" du générateur 🏗️
  - Les nouveaux plans créés via le générateur incluent ces tags dans leur `plan-config.json`

- **Service Worker** (`sw.js`)
  - Les 6 nouveaux PNG ajoutés au cache PWA pour disponibilité hors-ligne

- **Bug fix corollaire — Plan Switcher** (`interface.js > _chargerPlanDirect`)
  - Suppression prématurée de `kta-titre-fixe` corrigée
  - Si l'utilisateur clique sur un autre plan via le titre puis annule la modale "Plan introuvable", le titre du plan en cours reste désormais affiché

</details>

<details id="2026-05-06-s2">
<summary><strong>🗓️ 06/05/2026 (suite 2) — Plan Switcher (titre cliquable)</strong></summary>


- **Titre du plan rendu cliquable** (`interface.js` + `style.css`)
  - Suppression de `pointer-events: none` sur `#kta-titre-fixe`
  - Ajout d'une flèche `▾` (`.kta-titre-arrow`) à côté du nom du plan
  - Hover : fond légèrement plus clair, bordure bleutée, opacité de la flèche augmentée
  - État `.ouvert` (panneau actif) : flèche pivotée à 180°, bordure plus marquée
  - Animation `:active` (scale 0.98) au clic

- **Nouveau panneau "Plan Switcher"** (`#kta-plan-switcher`)
  - Affichage : ancré sous le titre, animation slide+fade-in 180ms
  - Contenu : "📚 PLANS RÉCENTS" + 3 derniers plans **excluant le plan en cours** (filtre par `id`)
  - Pour chaque plan : icône (🌐 ou 💾), nom + version (badge bleuté), date relative ("il y a 5 min", "hier", "04/05")
  - Lien "📚 Tous mes plans…" en bas → revient au loader complet (avec confirmation si session active)
  - Si aucun autre plan : message "Aucun autre plan dans votre liste" + lien "Tous mes plans…"
  - Fermeture : clic ailleurs / Escape / re-clic sur le titre

- **Détection automatique de la "session active"** (fonction `_sessionAModif`)
  - Considère la session active si **au moins un** des éléments est non-vide :
    - `getEditorPoints().length > 0` (points ajoutés)
    - `getRoads().length > 0` (routes tracées)
    - `getZones().length > 0` (zones)
    - `getMeasurePoints().length > 0` (mesure)
    - `getTrackingPath().length > 1` (parcours du tracker)
  - Fonction `_resumeSession()` retourne la liste détaillée pour l'affichage : `["5 points ajoutés", "2 tracés", "1 zone", ...]`

- **Comportement adaptatif au clic sur un plan du switcher**
  - **Si session vierge** → chargement direct via `_chargerPlanDirect()` (pas de friction)
  - **Si session active** → modale stylisée `kta-modal` :
    ```
    ⚠️ Session en cours
    Vous avez des modifications non enregistrées sur le plan en cours :
       • 5 points ajoutés
       • 2 tracés
       • 1 zone
    Charger « Plan Test 1 » va vous faire perdre ces modifications.
    [Annuler]   [Charger quand même]
    ```

- **Chargement direct sans repasser par le loader** (`_chargerPlanDirect`)
  - Plans serveur → `window.chargerPlanServeur(plan.path, plan)` direct
  - Plans locaux → `window.chargerPlanDuRegistre(plan.id)` (logique blob → fsHandle → re-sélection conservée)
  - Si erreur → fallback `window.afficherLoader()` pour proposer la modale "Plan introuvable"
  - **Nouvelle exposition** : `window.chargerPlanDuRegistre = chargerPlanDuRegistre` dans `index.html` pour que le switcher puisse l'appeler depuis `interface.js`

- **Bouton 🗂️ "Changer de plan" dans ⬇️ Import conservé** (choix 6:b)
  - Redondance utile pour les utilisateurs qui ne découvrent pas le titre cliquable
  - Toujours accessible comme alternative

- **Helpers ajoutés** dans `interface.js` :
  - `_fmtDateRel(iso)` — date relative ("à l'instant", "il y a 5 min", "hier", "il y a 3 jours", "04/05")
  - `escapeHtmlSwitcher(s)` — échappement HTML pour les noms de plan dans le panneau

- **Styles CSS ajoutés** (`style.css`) — section "PLAN SWITCHER" :
  - `#kta-plan-switcher` (panneau ancré + animation `ktaSwitcherIn`)
  - `.kta-switcher-head` / `.kta-switcher-list` / `.kta-switcher-row` / `.kta-switcher-icon` / `.kta-switcher-info` / `.kta-switcher-name` / `.kta-switcher-ver` / `.kta-switcher-sub`
  - `.kta-switcher-divider` / `.kta-switcher-link` / `.kta-switcher-empty`
  - `.kta-titre-arrow` (flèche avec rotation à 180° en mode ouvert)
  - Responsive mobile (`max-width: 92vw`)

</details>

<details id="2026-05-06">
<summary><strong>🗓️ 06/05/2026 (suite) — Splash + ergonomie loader + gestion erreurs plan</strong></summary>


- **Splash screen au démarrage** (`index.html` + `style.css` + `main.js`)
  - Bloc `<div id="splashOverlay">` placé en HTML statique tout en haut du `<body>` → s'affiche **instantanément** dès le parsing du DOM, avant tout JS
  - Logo `icon/mkm-full.png` (rose des vents jaune) + signature `icon/karma.png`
  - Titre `MyKTAMap` + sous-titre `CARTOGRAPHIE TERRAIN`
  - Barre de progression dorée (gradient `#f4c542` + animation shine)
  - Footer : "Par [signature KARMA]" + "Licence libre — usage non commercial"
  - **Animation cumulée** : logo (zoom + rotation rebond), titre, sous-titre, barre, footer (delays 0.3s → 0.85s)
  - **Comportement** :
    - `_splashStart()` enregistre `Date.now()` au démarrage de `initApp`
    - `_splashEnd()` attend que `SPLASH_MIN_DURATION_MS = 4000ms` soit écoulé
    - Si chargement < 4s → splash reste visible 4s minimum
    - Si chargement > 4s → splash s'efface dès la fin du chargement
    - Lancement de l'app **en parallèle** de la fin du splash (pas de blocage)
    - Ajout de la classe `.fading` (opacity 0 transition 0.4s) puis suppression du DOM
  - **Une seule fois par session** : `initApp()` n'étant appelé qu'au chargement initial, le splash ne réapparaît jamais lors d'un changement de plan
  - **Réapparaît à F5 / réouverture** : naturel puisque le HTML est re-parsé
  - **Responsive** : tailles adaptées en mobile portrait (logo 130px) et paysage (logo 90px, layout compact)

- **Refonte ergonomique du loader** (`index.html` + `style.css`)
  - Header avec **bouton 📖 Documentation utilisateur** (top-right, toujours accessible) → appelle `window.afficherReadme()`
  - Bloc **▶️ Reprendre** en haut si `lastPlanId` existe
  - Bloc **📚 Mes plans** unique trié par dernière ouverture descendante (suppression des anciennes sections "Récents/Tous" — demande utilisateur)
  - Bloc **📦 Ajouter un plan** cohérent regroupant : zone drop ZIP + options de persistance + ⚡ mode performance + bouton ▶️ Charger ce plan (pleine largeur)
  - Section collapsable **⚙️ Plus d'options** (fermée par défaut, chevron ▾/▴) regroupant : 🏗️ Générer un plan, 📥 Conf exemple, 🐛 Logs détaillés, 💥 Tout réinitialiser
    *(Note : le bouton "🌐 Plan serveur racine" a été retiré le 08/05/2026 — les plans serveur sont déjà listés dans 📚 Mes plans via auto-discovery `data/index.json`)*
  - Le bouton **📖 Documentation utilisateur** ouvre la même modale que depuis l'app (avec sommaire complet)

- **Bouton "💥 Tout réinitialiser" depuis le loader** (`index.html` + `interface.js`)
  - Appelle la fonction existante `viderCacheAppli()` (rétro-compat de nom)
  - Ajout d'une variante CSS `.loader-btn-secondary.loader-btn-danger` (rouge clair `#ffb3b3`)
  - **Reset complet enrichi** dans `viderCacheAppli` :
    1. Désinscription Service Worker
    2. Vidage des caches HTTP/PWA
    3. **`localStorage.clear()`** (registre + préférences + debug logs)
    4. **`sessionStorage.clear()`**
    5. **Suppression de TOUTES les bases IndexedDB** via `indexedDB.databases()` + `deleteDatabase` (avec fallback Safari/iOS qui n'expose pas `databases()`)
    6. `window.location.reload(true)`
  - Reset complet = retour à l'état "premier lancement" (splash réapparaît, registre vide, auto-discovery serveur s'exécute)
  - **Double confirmation** conservée (modale 1 : explication détaillée, modale 2 : confirmation finale avec rappel "Pensez à exporter votre liste avant")
  - Wording du bouton dans Réglages mis à jour : `🗑️ Réinitialiser` → `💥 Tout réinitialiser`

- **Modale "Plan introuvable" pour la persistance cassée** (`index.html` + `main.js`)
  - Scénario : utilisateur vide le cache puis ré-importe sa liste de plans → les blobs ZIP / FS handles n'existent plus
  - Détection à la volée au clic sur un plan local du registre (pas de scan préventif → 0 coût au démarrage)
  - 4 cas distincts avec wording adapté :
    - `server` — Plan serveur 404 (dossier supprimé/renommé) → bouton **🔄 Réessayer**
    - `local-blob` — `storedBlob: true` mais blob absent en IDB
    - `local-fs` — `fsHandleId` mais handle introuvable / fichier ZIP supprimé du disque
    - `local-fs-denied` — Permission FS refusée par le navigateur
  - Modale **pédagogique** avec liste des causes possibles (vidage cache, autre appareil, réinstallation, quota dépassé, etc.)
  - Actions disponibles :
    - **🔄 Réessayer** (cas serveur uniquement)
    - **📁 Re-sélectionner le ZIP** (cas locaux) avec **restauration auto de la persistance** (option 4:a) — si l'entrée originale avait `storedBlob: true`, le nouveau ZIP sera re-sauvé en IDB ; si FS Access dispo, le `fsHandle` est sauvé automatiquement
    - **🗑️ Retirer de la liste** (rouge `#5e2828`) — supprime l'entrée + ses dépendances (handle + blob)
    - **Annuler**
  - `chargerPlanServeur()` lance maintenant une `Error` avec `code = "PLAN_NOT_FOUND"` pour distinguer une 404 d'une vraie erreur runtime
  - Validation conservée (5:b) : si nom du plan dans le ZIP re-sélectionné ≠ nom cliqué → confirmation
  - Réutilise 100% des classes CSS existantes (`kta-readme-modal-overlay`, `kta-readme-modal-boite`, `kta-btn`, etc.) — pas de styles supplémentaires nécessaires

- **`sw.js`** — `icon/mkm-full.png` et `icon/karma.png` ajoutés au cache PWA pour que le splash fonctionne hors-ligne

</details>

<details id="2026-05-06-bis1">
<summary><strong>🗓️ 06/05/2026 — Système multi-plans + persistance ZIP locale</strong></summary>


- **Nouveau module `planRegistry.js`** — gestionnaire de la liste des plans connus (serveur découverts + locaux ZIP)
  - Stockage dans `localStorage["myktamap_plans"]` (format JSON v1.0 avec `lastPlanId` + `plans[]`)
  - `IndexedDB myktamap_handles` avec 2 stores : `handles` (FileSystemFileHandle) + `blobs` (ZIP entiers, mobile)
  - API publique : `init`, `getAll`, `getRecents(n)`, `getLastOpened`, `findById`, `addOrUpdate`, `markOpened`, `remove`, `removeAll`, `exportToFile`, `importFromFile(file, mode)`, `statsImport`, `genServerId`, `genLocalId`, `saveHandle`/`getHandle`/`removeHandle`, `hasFsAccess`, `ensureHandlePermission`, `saveBlob`/`getBlob`/`removeBlob`, `requestPersistentStorage`, `getStorageEstimate`
  - Fichier d'export `myktamap_plans_AAAAMMJJ.config` (sans `fsHandleId` qui n'est pas portable)

- **Auto-discovery serveur via `data/index.json`** (format A — détaillé)
  - L'app fetch `data/index.json` au démarrage, lit les plans listés et les ajoute au registre comme `discovered: true`
  - Format minimal accepté : `{ "plans": ["test1", "test2"] }`
  - Format détaillé : `{ "plans": [{ "id": "test1", "path": "data/test1", "name": "Plan Test 1", "version": "V1" }] }`
  - Si absent → fallback rétro-compat sur `data/plan-config.json` racine (chargement auto comme avant)

- **`config.js` — `loadAppConfig(planPath)` paramétrée**
  - `loadAppConfig()` → comportement historique (data/plan-config.json racine)
  - `loadAppConfig("data/test1")` → tente `data/test1/plan-config.json`
  - Nouvelle fonction `resolveServerPath(p, baseDir)` qui résout les chemins relatifs au dossier du plan
  - Rétro-compat préservée : `data/...` et `icon/...` non modifiés

- **`main.js` — orchestration multi-plans**
  - `decouvrirPlansServeur()` — auto-discovery au démarrage
  - `chargerPlanServeur(planPath, registryEntry)` — charge un plan serveur depuis le registre + l'enregistre
  - `startImportedPlan(planConfigFile, assetFiles, perfChoisi, meta)` — 4ᵉ paramètre `meta = { zipFile, fsHandle, planId, storeBlob, fromStoredBlob }` qui pilote la persistance et l'enregistrement
  - Enregistrement post-chargement : lecture des champs `plan.name` / `plan.version` / `plan.author` du plan-config et création/maj d'une entrée dans le registre
  - Si `meta.storeBlob === true` : `navigator.storage.persist()` puis `saveBlob(id, file)` en IndexedDB
  - `afficherLoader()` rafraîchit automatiquement la liste via `window.refreshPlansList()`

- **Refonte `index.html` — home unifié**
  - Bouton **▶️ Reprendre [nom]** visible si `lastPlanId` (recharge le dernier plan ouvert)
  - Section unique **📚 Mes plans** triée par dernière ouverture descendante (plans jamais ouverts en bas, alphabétique)
  - Boutons **💾 Exporter ma liste** / **📂 Charger une liste** (modale Replace / Merge / Cancel avec stats)
  - Bouton **🔐 Autoriser l'accès permanent** (FS Access) — visible Chrome/Edge desktop uniquement
  - Checkbox **💾 Mémoriser ce plan dans l'app** — visible mobile/Firefox/Safari (pas FS Access)
  - ~~Bouton **🌐 Charger le plan serveur (racine)**~~ — *retiré le 08/05/2026 (les plans serveur sont auto-découverts dans Mes plans via `data/index.json`)*
  - Validation : si le ZIP contient un `plan.name` différent du plan cliqué dans la liste → confirm avant chargement
  - Fonction `chargerZipFichier(file, perfChoisi, meta)` exposée globalement pour usage externe (bouton 🗂️ Changer de plan)
  - **Suppression** des sections "Récents" / "Tous" — liste unique demandée par l'utilisateur

- **Hiérarchie de chargement d'un plan local du registre**
  1. Si `plan.storedBlob === true` → lecture IndexedDB → 0 clic (mobile + desktop, fonctionne hors-ligne)
  2. Sinon si `plan.fsHandleId` + Chrome/Edge → `getHandle` + `ensureHandlePermission` → 0 ou 1 clic confirmation
  3. Sinon → `reSelectionnerZipPourPlan(plan)` qui ouvre `showOpenFilePicker` ou `<input type="file">` selon dispo

- **Badges visuels dans la liste des plans locaux**
  - ✅ vert (`storedBlob`) — Plan mémorisé dans l'app
  - 🔐 bleu (`fsHandleId`) — Accès FS permanent autorisé
  - 📁 gris — Re-sélection requise au chargement

- **Gestion du quota IndexedDB** — si `saveBlob` échoue (`QuotaExceededError`)
  - Le plan se charge quand même
  - Message orange dans le statut : "⚠️ Mémorisation impossible : Quota dépassé"
  - Le plan apparaît avec le badge 📁 (re-sélection au prochain chargement)

- **Nettoyage à la suppression** — `PlanRegistry.remove(id)` supprime aussi le `FileSystemFileHandle` ET le blob IndexedDB associés (libère l'espace)

- **`interface.js` — AIDE enrichie**
  - Section ⬇️ Charger / Import refondue avec encadré multi-plans
  - Documentation des 3 modes de persistance (✅ Mémorisé / 🔐 Permanent / 📁 Re-sélection)
  - Conseil PWA pour iOS (persistance jusqu'à 1 Go)
  - Documentation du format `data/index.json`

- **`style.css` — nouveaux styles**
  - `.loader-btn-resume` — bouton Reprendre (gradient bleu nuit)
  - `.loader-section-head` / `.loader-section-actions` / `.loader-btn-mini` — entête de section avec actions
  - `.loader-plans-list` / `.plan-row` / `.plan-row-icon` / `.plan-row-info` / `.plan-row-name` / `.plan-row-version` / `.plan-row-sub` / `.plan-row-date` / `.plan-row-actions` / `.plan-row-btn` / `.plan-row-load` / `.plan-row-remove`
  - `.plan-row-badge-stored` (vert) / `.plan-row-badge-fs` (bleu) / `.plan-row-badge-pick` (gris)
  - `.fs-access-hint` / `.loader-btn-fs` / `.fs-access-info` / `.loader-store-blob` (checkbox + label)

- **`sw.js`** — `js/planRegistry.js` ajouté à `assetsToCache`

</details>

<details id="2026-05-05">
<summary><strong>🗓️ 05/05/2026 — Export session avancé + filtrage par tag + bugs résolus</strong></summary>


- Sommaire dans la documentation
- Documentation Utilisateur afficher uniquement

- **Nouveau module `sessionExporter.js`** — modale d'export de session avec 3 onglets
  - 🚀 **Full** : export complet sans tracker (équivalent ancien comportement, mais sans la mesure)
  - 🎨 **Avancé** : sélection fine par catégorie + sous-types, format de sortie au choix (1 fichier session OU ZIP multi-fichiers), case optionnelle "Position du tracker" (path + position)
  - 🔄 **Conversion** : convertit la session en data layer(s) au format `devmap-data`, granularité au choix (basique = 3 fichiers max, fine = 1 fichier par type)
- **Sélection des points par tag** (dans Avancé ET Conversion)
  - Liste dynamique des tags présents dans les points, avec compteur et **icône miniature** depuis `PLAN_CONFIG.icons`
  - Catégorie spéciale `(sans tag)` pour les points sans tags
  - Synchronisation parent ↔ enfants : décocher Points ajoutés décoche tous les tags, et inversement
  - Filtrage : un point est inclus s'il a **au moins un de ses tags coché** (ou s'il n'a pas de tag et que `(sans tag)` est coché)
  - Helpers : `_listerTagsPoints()`, `_filtrerPointsParTags()`, `_lireTagsCoches()`, `_slugTagId()`, `_iconePourTag()`
- **Suppression du bouton 🔄 Convertisseur** séparé du menu ⬆️ Enregistrer — la conversion se fait maintenant exclusivement via la modale 💾 → onglet Conversion
- **Suppression de la mesure** dans l'export session (Full)
- **Bouton 💾** : "Exporter la session JSON" → "Enregistrer la session" (ouvre la modale)
- **Format JSON** : `version` passe de `1` (number) à `"1.0"` (string) + ajout du champ `date_export`
- **Bug eau résolu** : dans `utils.js` → `ajouterPointsDepuisJSON`, l'objet `ZONE_STYLES_DATA` ne contenait pas l'`eau` → les zones d'eau d'un calque de données s'affichaient en remblais à l'écran (mais étaient correctement exportées en eau). Ajout de l'eau + tri eau → remblais → effondrement.
- **Bug zones/routes embarquées dans dataLayers** : à l'export PNG, les `roads[]` et `zones[]` lus depuis un fichier de calque étaient ignorés. Fix dans `exporter.js` (mode Avancé) et `utils.js` (mode Rapide) : on dessine maintenant zones embarquées (arrière-plan) → routes embarquées → markers, comme à l'écran.
- **Bug tracker non exporté** : `tracking.js` n'exposait pas les fonctions appelées par les exporters. Ajout de `window.getTrackingPosition()` (renvoie `{x, y}`) et `window.getTrackingPath()` (renvoie la liste des points du tracé en coords plan, reconvertie depuis la polyline Leaflet).
- **Tracker complet** : à l'export, dessine le tracé parcouru (polyline bleu `#3388ff` weight 3) + position courante (icône). Label de la case "Position du tracker" enrichi avec `(+ tracé N pts)` quand path > 1 point.
- **Permission capteurs au play uniquement** : suppression du listener `document.body.click` dans `main.js` et `main_import.js` qui demandait la permission au tout premier clic global. Maintenant la popup iOS de permission n'apparaît qu'au clic sur ▶️ Play du tracker (cohérent avec la directive Apple "permission dans une tâche utilisateur directe").
- **Icône groupe Édition** : confirmation que ✏️ est bien en place partout (vs. 📌 punaise testé puis abandonné)

</details>

<details id="2026-05-04">
<summary><strong>🗓️ 04/05/2026 — Recherche de point + ajustements</strong></summary>

- **Nouveau module `searchPoints.js`** — recherche rapide d'un point par nom, id, tag, description ou état

  . Bouton **🔍 Rechercher un point** ajouté en position solo dans la barre latérale, après ⚙️ Paramètres
  . Recherche live debounced 200ms, normalisation NFD (insensible aux accents et à la casse)
  . Tri par pertinence : match exact nom (100) → début nom (80) → dans nom (60) → exact id (50) → début id (40) → dans id (30) → tags (20) → description/état (10)
  . Limite 50 résultats avec compteur "+ N autres"
  . Affichage : icône miniature + ID en bleu + nom + chip layer + tags + coordonnées
  . Navigation clavier : ↑/↓ entre résultats, Entrée pour valider, Échap pour fermer
  . **Cache de points** par signature de plan (name|version|baseImage), invalidation auto au changement de plan
  . Au clic sur un résultat : `setView` instantané (pas `flyTo` pour éviter dérive cumulée), popup ouvert sur le marker existant ou popup temporaire si layer non visible, **cercle d'entourage statique orange** (3s puis disparition)

- **Couleur des remblais** : passage à `#3a3a44` (bordure) / `#5a5a68` (remplissage) — gris franc qui ne se confond plus avec les fonds beiges/marron des plans
- **Icône du groupe Zones** : 🟫 → **⬛** (Large Brown Square → Black Large Square) car 🟫 est marron par définition Unicode et ne reflétait pas la couleur réelle des remblais. Synchronisé dans le bouton principal, les sous-actions, l'aide et les modes actifs.

</details>

<details id="2026-05-04-bis1">
<summary><strong>🗓️ 04/05/2026 — Éditeur tableau JSON</strong></summary>

- **Nouveau module `tableEditor.js`** — éditeur de fichier JSON sous forme de tableau interactif
  . Bouton **📊 Éditer un fichier JSON** ajouté en 2e position dans le groupe ⬇️ Charger
  . Auto-détection du format (`data` calque ou `editorPoints` session)
  . Détection automatique des colonnes avec ordre privilégié (id, nom, x, y, tags, etat...)
  . Édition inline : Tab/Enter/Échap, validation typée (number pour x/y/profondeur)
  . **ID en lecture seule** (cellule grisée)
  . **Validation des coordonnées** : cellule rouge ⚠ si hors `imageWidth`/`imageHeight` + tooltip
  . **Tags multi-select** avec dropdown : icônes en preview, tags existants + champ "Créer un tag"
  . Recherche live debounced 200ms, tri asc/desc/none, sélection multi (shift+clic)
  . Aperçu sur la carte : modale masquée, markers cercles oranges + banner retour
  . Avertissement si > 1000 lignes
  . Sauvegarde via menu : 📥 Téléchargement / 🗺️ Remplacer le calque actif / ✏️ Remplacer la session
  . Confirmation à la fermeture si modifications non sauvées (Sauvegarder / Quitter / Continuer)
  . Module autonome — styles CSS injectés dynamiquement au premier appel
  . Branchement : `<script src="js/tableEditor.js">` ajouté dans `index.html` après `exporter.js`

</details>

<details id="2026-05-04-bis2">
<summary><strong>🗓️ 04/05/2026 — Charte graphique légende exportée</strong></summary>

- **Légende exportée alignée sur le dark theme des modales** (fond `#1a1f2e`, accents bleu vif `#8cb4ff`)
- **Titre "Légende" en Georgia italique**, taille réduite (compact 13 / standard 17 / large 22) pour ne plus dominer
- **Date au format FR `JJ/MM/AAAA`** (suppression de "Exporté :" devant la date)
- **Layout en 2 colonnes** : Icônes à gauche, Tracés + Zones à droite — légende plus large mais moins haute
- Métadonnées et titre restent en pleine largeur en haut

</details>

<details id="2026-05-04-bis3">
<summary><strong>🗓️ 04/05/2026 — Zones, eau, page d'accueil, calibrage</strong></summary>

- **Eau (3e type de zone)** — bouton 🟦 dans le groupe Zones, couleurs `#0066aa` / `#3aa9e8`
  . Tri d'affichage : eau (0) → remblais (1) → effondrement (2)
  . Synchronisé partout : `zones.js` (renderZones), `utils.js` × 2 (export PNG + lecture data layer), `exporter.js`
- **Page d'accueil — boutons supplémentaires en bas du loader** :
  . 🏗️ Générer un plan (toujours visible) → ouvre `afficherPlanner()`
  . 🌐 Charger le plan serveur (toujours visible) → tente `loadAppConfig()` avec message d'erreur si plan absent
- **Calibrage d'échelle — formule corrigée** : `nouveau = scale × (affichée / réelle)` (au lieu de `réelle / affichée`)
- **Onglet "Fichiers séparés" supprimé** du loader — ZIP uniquement

</details>

<details id="2026-05-03">
<summary><strong>🗓️ 03/05/2026 — Export plan avancé</strong></summary>

- **Nouveau module `exporter.js`** — modale d'export avec deux modes : ⚡ Rapide (export historique inchangé) et 🎨 Avancé
- **Mode avancé** :
  . Choix précis des calques d'image / calques de données / annotations à inclure
  . Légende intégrée positionnable (4 coins ou point custom via 🎯 sélection sur la carte)
  . 3 styles de légende : Opaque / Semi-transparent / Filigrane
  . 3 tailles : Compact / Standard / Large
  . Format PNG ou JPEG 90%, résolution Originale / ½ / ¼
  . Aperçu mini-canvas 320×200 px (debounced 300ms)
- Bouton 🖼️ ouvre maintenant la modale au lieu de télécharger directement

</details>

<details id="2026-05-03-bis1">
<summary><strong>🗓️ 03/05/2026 — Module Zones</strong></summary>

- **Nouveau module `zones.js`** — zones polygonales remplies (remblais / effondrement)
- **Nouveau groupe Zones** dans la barre latérale (10e position, après Tracés)
- Sous-actions : 🟫 Remblais / 🟥 Effondrement / 🟦 Eau / ✅ Fermer / 🧹 Effacer
- Aperçu pointillé pendant le tracé + cercle visible sur 1er point dès 3 points posés
- Fermeture par re-clic sur 1er point (tolérance 5px) OU bouton ✅
- Tri d'affichage : eau → remblais → effondrement (effondrement toujours visible)
- Préservation dans : session JSON (`zones[]`), data layer embarqué (`zones[]`), export PNG
- Convertisseur JSON préserve `zones` dans les 2 sens

</details>

<details id="2026-05-03-bis2">
<summary><strong>🗓️ 03/05/2026 — Refonte interface</strong></summary>

- **Barre latérale refondue en 9 groupes** (accordéon vertical, exclusivité)
  . Ordre : Aide → Paramètres → Charger → Créer-Modifier → Enregistrer → Tracker → Mesure → Édition → Tracés
  . **Paramètres ⚙️ et Créer/Modifier 🏗️** sont des boutons solo (clic direct, pas de sous-menu)
  . Les autres groupes sont des accordéons déroulables verticalement
- **Set d'icônes cohérent** : 📚 Aide / ⚙️ Paramètres / ⬇️ Charger / 🏗️ Créer / ⬆️ Enregistrer / 🧭 Tracker / 📐 Mesure / 📌 Édition / 🛣️ Tracés
- **Mode actif → groupe verrouillé ouvert** + icône principale reflète le mode actif (ex: 🟩 sur Tracés quand Principal en cours, ⏹️/📍 sur Tracker)
- **Clic en dehors** d'un groupe ouvert le ferme automatiquement (sauf si mode actif)
- **Modale d'import de session** (`📥`) en plein écran avec drag & drop, aperçu du contenu (nb points / tracés / zones / mesure) et avertissement avant écrasement
- **Bouton 🎯 de calibrage d'échelle** dans ⚙️
- **Mode Performance** déplacé dans la section Debug, affichage compact horizontal
- **Fix mobile paysage** : barre latérale scrollable quand `max-height ≤ 500px`

### 03/05/2026
- **Icône PWA pour écran d'accueil iOS** — ajout des balises `<link rel="apple-touch-icon">` dans `index.html` (4 tailles + fallback)
- **Modale d'ajout de point en plein écran** (style cohérent avec les autres modales)
- **Création de tags à la volée** depuis le formulaire d'ajout — le tag est ajouté dynamiquement à `PLAN_CONFIG.icons` avec l'icône par défaut
- **Option "Aucun tag"** disponible — utilise l'icône `default` (pin Leaflet natif si pas configuré)
- **Légende refondue** — fusion des sections custom + tracker + default dans une seule rubrique "📌 Autres", URL réelle de chaque icône résolue depuis `_iconMap`
- **Suppression granulaire** :
  . Mesure : *Dernier point* ou *Toute la mesure*
  . Points : *Dernier point ajouté* ou *Tous les points*
  . Tracés : *Dernier point du tracé* / *Dernier tracé entier* / *Tous les tracés*
- Nouveau helper `_choixSuppression()` dans `interface.js` — modale avec liste d'options
- Nouvelles fonctions API : `removeLastEditorPoint`, `removeLastRoad`, `removeLastRoadPoint`, `removeLastMeasurePoint`
- `creerIcones()` sécurisé : aucune icône avec `iconUrl: undefined`, fallback `L.Icon.Default` natif Leaflet si `default` manquant dans la config

### 02/05/2026
- **Service Worker réactivé** — mode hors-ligne fonctionnel via `sw.js`
- Onglet **"Modifier existant"** dans le générateur 📦 — importe un ZIP, pré-remplit le formulaire, régénère un ZIP modifié
- **Gestionnaire d'icônes & tags dynamique** dans le générateur — création de tags personnalisés avec icônes custom
- Le mode ajout de point ✏️ utilise maintenant la liste de tags **dynamique** depuis `PLAN_CONFIG.icons`
- `choisirIcone()` et `getIconForPoint()` (export PNG) refactorisés pour parcourir dynamiquement `_iconMap` — supporte tous les tags personnalisés
- Suppression du mode "Fichiers séparés" du loader — **ZIP uniquement**
- Correction icône véhicule à l'export (était étirée 50×25 → maintenant 50×50 comme l'affichage)

### 30/04/2026
- Correction collision : ratio scale plan/canvas pour les cartes de collision downscalées
- Mode performance : limite `MAX_WORK_DIM` à 8192px (limite Safari iOS sur `drawImage` JPEG)
- Détection canvas noir avec re-essai (Safari iOS échec silencieux sur gros JPEG)
- Blob URL fraîches créées à l'intérieur de `_imageVersCanvasReduit` (évite révocation prématurée)
- Mode performance affiché en lecture seule dans ⚙️ (modifiable au chargement uniquement)

### 27/04/2026
- **Refonte architecture complète** — fusion `index.html` + `import.html` en une seule page PWA
- Suppression de `import.html`, `config_import.js`, `map_import.js`, `main_import.js`
- `config.js`, `map.js`, `main.js` unifiés : gèrent les deux modes (serveur + import navigateur)
- Auto-détection au démarrage : charge `data/plan-config.json` si disponible, sinon affiche le loader
- Ajout du mode performance (tiling) pour les plans JPEG volumineux sur Safari iOS
- `tiling.js` — module de découpage en tuiles via `<img>` HTML + canvas
- Préférences utilisateur (`perfMode`, `motionDebug`) persistées séparément du plan dans `app_user_prefs`
- Panneau de logs de débogage intégré (🐛 dans ⚙️) avec persistance `localStorage`
- Optimisation collision : cache pixel en mémoire (`initCollisionCache`)
- Chargement des markers par batch de 50 via `requestAnimationFrame`
- Routes embarquées dans les calques de données (`roads[]` dans le JSON data)
- Métadonnées PWA ajoutées (`apple-mobile-web-app-capable`)
- `debug.js` — capture silencieuse des logs

### 26/04/2026
- Documentation utilisateur séparée du README DEV (`README_USER.md`)
- Aide, Légende, Réglages en modales plein écran
- Ajout du convertisseur JSON bidirectionnel (`editor ↔ data`)
- Ajout du générateur de plan ZIP (`createConf.js`)
- Refonte graphique de l'interface (charte dark cohérente)
- Import de plan via archive ZIP
- Normalisation des formats JSON dans `utils.js`
- Gestion des modes exclusifs (un seul mode actif à la fois)
- Bouton vider le cache avec double confirmation

### 25/04/2026
- Documentation intégrée à l'interface (README + README_USER)
- Bouton vider le cache dans les réglages
- Correction du responsive design (interface mobile)

### 22/04/2026
- Ajout du mode import local (chargement d'un plan depuis le navigateur sans serveur)

### 19/04/2026
- Le bouton télécharger intègre désormais tous les calques visibles
- Ajout du tracé de routes : Principal / Secondaire / Chemin
- Interface mise à jour avec import/export global de session JSON
- Correction du tracker : intégration de la boussole via `alpha`, `beta`, `gamma`

**Points en cours d'investigation :**
- Erreur d'échelle constatée sur le tracker — possible problème de cooldown
- Tiling JPEG sur Safari iOS : qualité réduite par contrainte mémoire GPU (MAX_WORK_DIM = 8192)

---

</details>

## 🧭 Introduction générale

MyKTAMap est une application web permettant de **visualiser, annoter et exploiter un plan** (carrière souterraine, bâtiment, site industriel…) à partir d'une image haute résolution.

L'outil repose sur **[Leaflet](https://leafletjs.com/)** en projection simple (`L.CRS.Simple`), ce qui permet de travailler sur une carte personnalisée **sans coordonnées GPS**.

### 🧩 Fonctionnalités principales

| Fonctionnalité | État |
|---|---|
| Affichage du plan (image haute résolution) | ✅ Disponible |
| Gestion de calques et d'icônes dynamiques | ✅ Disponible |
| Ajout de points d'intérêt (modale + tags custom) | ✅ Disponible |
| Mesure de distances | ✅ Disponible |
| Tracé de routes (Principal / Secondaire / Chemin) | ✅ Disponible |
| Suppression granulaire (dernier point / dernier tracé / tout) | ✅ Disponible |
| Export / import JSON de session | ✅ Disponible |
| Import de plan via ZIP | ✅ Disponible |
| Conversion session → data layer (intégrée à 💾) | ✅ Disponible |
| Générateur de plan ZIP avec gestion des tags | ✅ Disponible |
| Modification d'un plan existant | ✅ Disponible |
| Mode performance (tiling JPEG volumineux) | ✅ Disponible |
| Application PWA — mode standalone iOS | ✅ Disponible |
| Mode hors-connexion (Service Worker) | ✅ **Réactivé** |
| Panneau de logs de débogage | ✅ Disponible |
| Déplacement simulé via capteurs mobile | ⚠️ Expérimental |

---

## 🏗️ Architecture applicative

```
index.html                  ← Page unique (loader avec home multi-plans + carte)
sw.js                       ← Service Worker (mode hors-ligne)
manifest.json              ← PWA google chrome

data/
  index.json                ← (Optionnel) Liste des plans serveur disponibles
  plan-config.json          ← (Optionnel) Plan racine (rétro-compat)
  test1/
    plan-config.json        ← Plan dans un sous-dossier
    ...
  test2/
    plan-config.json
    ...

js/
        │
        ├── debug.js           ← Capture logs + GATING CENTRALISÉ debugMode + modale débogage
        ├── config.js          ← Configuration unifiée + loadAppConfig(planPath) paramétrée
        ├── utils.js           ← Fonctions utilitaires + export PNG dynamique (rapide)
        ├── measure.js         ← Mesure de distance + suppression granulaire
        ├── tiling.js          ← Mode performance : découpage en tuiles (5 presets)
        ├── map.js             ← Initialisation Leaflet (preferCanvas:true) + _iconMap dynamique
        ├── tracking.js        ← Déplacement simulé via capteurs (listeners idempotents)
        ├── editor.js          ← Modale plein écran + tags custom
        ├── road.js            ← Tracé routes + cercles intersections + halo néon itinerary
        ├── zones.js           ← Zones polygonales remplies (eau / remblais / effondrement)
        ├── exporter.js        ← Modale d'export plan (Mode rapide / Mode avancé + légende)
        ├── sessionExporter.js ← Modale d'export de session (Full / Avancé / Conversion bidirectionnelle)
        ├── tableEditor.js     ← Éditeur de fichier JSON sous forme de tableau
        ├── searchPoints.js    ← Recherche d'un point (nom / id / tag / calque + filtres)
        │                         + API publique window.SearchPoints (getAllPoints, findByQuery)
        ├── pathfinder.js      ← Module Dijkstra pour la fonction Itinéraire (chemin le plus
        │                         court sur le réseau de polylines, snap orthogonal des waypoints)
        ├── createConf.js      ← Générateur de plan ZIP (Nouveau / Modifier)
        ├── planRegistry.js    ← Registre multi-plans (localStorage + IndexedDB blobs/handles)
        ├── sessionPersist.js  ← Auto-save session active (polling 1.5s + throttle adaptatif)
        ├── oomGuard.js        ← Détection kill mémoire mobile + modale d'avertissement
        ├── interface.js       ← Interface Leaflet + toutes les modales (incl. itinéraire, reset internet check)
        └── main.js            ← Point d'entrée unique + cleanup factorisé _libererRessourcesPlanPrecedent

lib/
        ├── leaflet/           ← Leaflet.js (local)
        └── jszip.min.js       ← JSZip 3.10.1 (local, requis pour ZIP)
```

> `import.html`, `config_import.js`, `map_import.js` et `main_import.js` ont été **supprimés**. Toute leur logique est absorbée dans les fichiers unifiés.

---

## 📱 PWA — Application installable

MyKTAMap est une **PWA installable** sur mobile et desktop. Sur iOS, elle peut être ajoutée à l'écran d'accueil via Safari (Partager ↑ → Sur l'écran d'accueil) et fonctionne ensuite en mode standalone (sans la barre Safari).

### 🧾 Métadonnées dans `<head>`

```html
<!-- Mode standalone -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="MyKTAMap">
<meta name="mobile-web-app-capable" content="yes">

<!-- Icône écran d'accueil iOS -->
<link rel="apple-touch-icon" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="180x180" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="167x167" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="152x152" href="icon/mkm.png">
<link rel="apple-touch-icon" sizes="120x120" href="icon/mkm.png">

<!-- Favicon classique navigateur -->
<link rel="icon" type="image/png" href="icon/mkm.png">
```

### 🍎 Pourquoi 5 balises `apple-touch-icon`

Safari iOS **ignore complètement** la balise `<link rel="icon">` standard pour le bouton "Sur l'écran d'accueil". Il cherche **uniquement** `apple-touch-icon`. On déclare plusieurs tailles pour qu'iOS choisisse la plus proche selon l'appareil :

| Taille | Appareil cible |
|---|---|
| 180×180 | iPhone Retina (récents) |
| 167×167 | iPad Pro |
| 152×152 | iPad standard |
| 120×120 | iPhone non-Retina |
| sans taille | Fallback universel |

En pratique on peut servir le même fichier (Safari redimensionne) — l'important c'est que la balise existe.

### 🖼️ Contraintes du fichier icône

- **PNG carré** (idéalement 180×180 minimum, 512×512 recommandé)
- **Fond opaque** — pas de transparence, sinon iOS met du noir
- **Pas d'arrondi** dans l'image — iOS arrondit les coins automatiquement
- **Marge interne 10-15%** — iOS rogne légèrement les bords

### 🔁 Mise à jour de l'icône

iOS cache l'icône PWA de manière agressive. Pour forcer le rafraîchissement après changement :

1. Sur l'iPhone : appui long sur l'icône MyKTAMap → Supprimer l'app
2. Réglages → Safari → Effacer historique et données
3. Ferme Safari complètement (swipe up dans le sélecteur d'apps)
4. Rouvre `myktamap.is-underground.fr` dans Safari
5. Partager ↑ → Sur l'écran d'accueil

L'icône est servie depuis `icon/mkm.png` — vérifier sa disponibilité directe avec `https://devmap.is-underground.fr/icon/mkm.png`.

---

## 🔄 Mode hors-connexion — Service Worker

Le `sw.js` est **actif** et précache l'ensemble des assets statiques de l'application au premier chargement. Une fois en cache, l'app fonctionne entièrement hors-ligne.

**Stratégie :**
- **Cache First** pour les assets app (HTML, JS, CSS, icônes)
- **Network First** pour `data/plan-config.json` et les données du plan (toujours fraîches si dispo)
- **Fallback Cache** automatique si pas de réseau

**Mise à jour de version :**
Quand tu déploies une nouvelle version, incrémente `CACHE_VERSION` dans `sw.js`. Les anciens caches sont automatiquement purgés au prochain `activate`.

**Désactivation manuelle :**
Le bouton 🗑️ Réinitialiser dans ⚙️ désinscrit le SW et vide tous les caches → recharge complète depuis le serveur.

---

## 🚀 Démarrage — auto-détection du mode

`main.js` orchestre le démarrage avec auto-discovery serveur + rétro-compat :

```
initApp()
  ├─ PlanRegistry.init()              ← charge la liste depuis localStorage
  ├─ decouvrirPlansServeur()          ← fetch('data/index.json') si présent
  │     → ajoute les plans découverts au registre (discovered: true)
  │
  ├─ Si registre vide ET data/plan-config.json racine existe :
  │     → loadAppConfig()             ← rétro-compat ancien comportement
  │     → registre += server_root     ← enregistre comme plan racine
  │     → lancerApplication()
  │
  └─ Sinon :
        → afficherLoader()             ← home avec liste de plans + import
        → refreshPlansList()           ← rafraîchit l'UI

# Chargement d'un plan serveur (depuis le registre)
chargerPlanServeur(planPath, registryEntry)
  ├─ libère tuiles + détruit map existante
  ├─ resetRuntimeAssets()
  ├─ loadAppConfig(planPath)          ← résout chemins relatifs au baseDir
  ├─ enregistre dans registre + markOpened
  └─ lancerApplication()

# Chargement d'un ZIP (depuis import ou registre local)
startImportedPlan(planConfigFile, assetFiles, presetChoisi, meta)
  ├─ resetRuntimeAssets()
  ├─ registerAsset() × N
  ├─ cloneAndResolvePlanConfig()
  ├─ buildAppConfigFromPlan() + perfPreset du loader
  ├─ Enregistrement registre :
  │     ├─ Si meta.fsHandle → saveHandle(id, handle)
  │     ├─ Si meta.storeBlob → requestPersistentStorage() + saveBlob(id, file)
  │     └─ markOpened(id)
  └─ lancerApplication()
```

Le loader HTML est intégré dans `index.html` avec `display:none` — il s'affiche au démarrage si aucun plan racine n'est trouvé, ou à la demande via 🗂️ "Changer de plan".

---

## 🎬 Splash screen (animation de bienvenue)

Le splash s'affiche **uniquement au chargement initial de la page** (F5, ouverture d'onglet, démarrage PWA). Il ne réapparaît jamais lors d'un changement de plan via 🗂️ "Mes plans".

### Architecture

- **HTML statique** dans `<body>` (visible avant tout chargement JS)
- **CSS d'animation** dans `style.css` (entrée en cascade : logo → titre → sous-titre → barre → footer)
- **Logique de durée** dans `main.js` (4s minimum + parallèle au chargement)

### Cycle de vie

```
HTML parsé → splashOverlay visible (animations CSS démarrent)
   ↓
initApp() → _splashStart() enregistre Date.now()
   ↓
   PlanRegistry.init() + decouvrirPlansServeur() en parallèle
   ↓
   afficherLoader() OU lancerApplication() (en parallèle de _splashEnd)
   ↓
_splashEnd() :
   ├─ Attendre que (4000ms - elapsed) soit écoulé
   ├─ Ajouter classe .fading (opacity 0 transition 0.4s)
   └─ Retirer du DOM après 500ms
```

### Constantes et variables

| Élément | Description |
|---|---|
| `SPLASH_MIN_DURATION_MS` | Durée minimum d'affichage (`main.js`, défaut 4000) |
| `--splash-duration` | Variable CSS injectée dynamiquement pour synchroniser la barre |
| `_splashShownAt` | Timestamp d'affichage pour calculer le temps restant |

### Assets requis (cachés par le SW)

- `icon/mkm-full.png` — logo principal (rose des vents)
- `icon/karma.png` — signature

---

## 💥 Reset complet de l'application

Fonction `viderCacheAppli()` (nom historique conservé) — accessible depuis :
- **⚙️ Réglages** dans l'app (bouton rouge `💥 Tout réinitialiser`)
- **⚙️ Plus d'options** dans le loader (bouton `loader-btn-secondary loader-btn-danger`)

### Étapes du reset

```
1. navigator.serviceWorker.getRegistrations() + unregister  ← désinscrit le SW
2. caches.keys() + caches.delete                             ← vide les caches HTTP/PWA
3. localStorage.clear()                                      ← registre + préférences + debug
4. sessionStorage.clear()
5. indexedDB.databases() → deleteDatabase pour chaque        ← blobs ZIP + FS handles
   (fallback Safari : deleteDatabase("myktamap_handles"))
6. window.location.reload(true)                              ← redémarrage complet
```

### Sécurité — double confirmation

| Étape | Modale |
|---|---|
| 1 | "⚠️ Tout réinitialiser ?" — liste les éléments effacés + boutons Annuler / Continuer |
| 2 | "🚨 Confirmation finale" — rappel "Pensez à exporter votre liste avant" + boutons Annuler / 💥 Tout réinitialiser |
| 3 | "⏳ Réinitialisation en cours…" (spinner pendant le nettoyage) |

Après reload, l'app revient strictement à l'état "premier lancement" : splash s'affiche, registre vide, auto-discovery serveur s'exécute, etc.

---

## ⚠️ Gestion des erreurs "Plan introuvable"

Détection à la volée au clic sur un plan du registre (pas de scan préventif).

### Cas couverts

| Cas | Détection | Reason |
|---|---|---|
| Plan serveur 404 | `chargerPlanServeur()` throw avec `e.code === "PLAN_NOT_FOUND"` | `server` |
| Blob mémorisé absent | `getBlob(id)` retourne `null` (vidage cache, autre appareil) | `local-blob` |
| FS handle perdu | `getHandle(id)` null OU `handle.getFile()` throw (ZIP supprimé du disque) | `local-fs` |
| FS permission refusée | `ensureHandlePermission(handle)` retourne `false` | `local-fs-denied` |

### Modale d'erreur (`afficherModalePlanIntrouvable`)

Modale **pédagogique** dans `index.html` listant les causes possibles selon le `reason`, avec actions :

- **🔄 Réessayer** — uniquement pour `server` (réessaye le chargement)
- **📁 Re-sélectionner le ZIP** — pour les cas locaux, ouvre `showOpenFilePicker` avec **restauration auto de la persistance** :
  - Si `plan.storedBlob === true` → réinjecte `meta.storeBlob = true` → re-sauvegarde IDB
  - Si `showOpenFilePicker` utilisé → handle automatiquement persisté
- **🗑️ Retirer de la liste** — supprime l'entrée + ses blobs/handles via `PlanRegistry.remove()`
- **Annuler**

Si le ZIP re-sélectionné a un `plan.name` différent du nom cliqué → confirmation conservée (5:b).

---

## 🎨 Système d'icônes — cascade et fallback

### Architecture en 4 niveaux

L'app dispose d'un système de résolution d'icônes en cascade qui permet d'**ajouter de nouveaux types** sans modifier les `plan-config.json` existants.

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. PLAN_CONFIG.icons[tag]                                       │
│    Personnalisation par plan (chemin custom dans plan-config)   │
├─────────────────────────────────────────────────────────────────┤
│ 2. _iconMap[tag] (rempli par creerIcones() via TAGS_BUILTIN)    │
│    Fallback built-in dans map.js → pointe vers icon/<tag>.png   │
├─────────────────────────────────────────────────────────────────┤
│ 3. PLAN_CONFIG.icons.default                                    │
│    Icône par défaut déclarée dans le plan                       │
├─────────────────────────────────────────────────────────────────┤
│ 4. _iconMap.default / iconeDefault                              │
│    Filet de sécurité ultime (pin Leaflet natif)                 │
└─────────────────────────────────────────────────────────────────┘
```

### `TAGS_BUILTIN` (`map.js > creerIcones`)

Liste des tags reconnus nativement par l'app et leurs PNG par défaut :

```js
const TAGS_BUILTIN = {
  salle:    "icon/house.png",
  pa:       "icon/pa.png",  pc: "icon/pc.png",  pb: "icon/pb.png",
  pe:       "icon/pe.png",  ps: "icon/ps.png",
  // === 6 nouveaux tags d'accès ===
  peo:      "icon/peo.png", pef: "icon/pef.png",   // puits à échelon
  eso:      "icon/eso.png", esf: "icon/esf.png",   // escalier service
  cao:      "icon/cao.png", caf: "icon/caf.png",   // cavage
  // === ===
  vehicule: "icon/vehicule.png", elec: "icon/elec.png", epure: "icon/epure.png",
  info:     "icon/info.png", chatiere: "icon/chatiere.png",
  passage:  "icon/passage.png", danger: "icon/danger.png"
};
```

À chaque chargement de plan, `_iconMap` est complété : si un tag built-in n'est pas dans `iconConfig`, l'app crée quand même son entrée pointant vers `icon/<tag>.png`.

### Fonction centralisée `getIconUrlForPoint(point)` (`utils.js`)

Implémente la cascade complète et expose une URL utilisable directement (canvas, recherche, légende, etc.).

```js
function getIconUrlForPoint(point) {
  const planIcons = (window.PLAN_CONFIG && window.PLAN_CONFIG.icons) || {};
  const map       = window._iconMap || {};

  if (point && Array.isArray(point.tags)) {
    for (const tag of point.tags) {
      if (planIcons[tag]) return planIcons[tag];           // niveau 1
      const u = urlFromMapEntry(map[tag]);
      if (u) return u;                                     // niveau 2
    }
  }
  if (planIcons.default) return planIcons.default;         // niveau 3
  return urlFromMapEntry(map.default);                     // niveau 4
}
```

**Modules qui l'utilisent** : `searchPoints.js`, `utils.js > telechargerPlan`, `exporter.js`, `sessionExporter.js`.

### Ajouter un nouveau tag — checklist développeur

Pour ajouter un nouveau type d'icône (ex: `fontaine`) sans casser la rétro-compat :

1. **PNG 50×50** transparent dans `icon/fontaine.png`
2. **`map.js`** — ajouter `fontaine: "icon/fontaine.png"` dans `TAGS_BUILTIN`
3. **`editor.js`** — ajouter `fontaine: "Fontaine"` dans `EDITOR_TAG_LABELS`
4. **`interface.js`** — ajouter `fontaine: "Fontaine"` dans `LEGENDE_LABELS` + dans le bon groupe du tableau `GROUPES`
5. **`exporter.js`** — ajouter `fontaine: "Fontaine"` dans le `LBL` local + dans le bon groupe de `GROUPES_ICONES`
6. **`createConf.js`** — ajouter `fontaine: "icon/fontaine.png"` dans `PLANNER_DEFAULT_ICONS`
7. **`sw.js`** — ajouter `"./icon/fontaine.png"` dans `urlsToCache`

→ Le tag est utilisable immédiatement, **même sur les plans existants** (sans modifier leur `plan-config.json`).

### Légende exportée — répartition en 5 groupes (`exporter.js`)

La légende du PNG exporté est désormais découpée en sections cohérentes avec la légende d'aide :

| Groupe | Tags |
|---|---|
| 🕳️ Puits | pa, pb, pc, pe, ps |
| 🪜 Accès | peo, pef, eso, esf, cao, caf |
| ⚠️ Signalétique | salle, chatiere, passage, danger, info, elec, epure, vehicule |
| 🛣️ Tracés | principal, secondaire, chemin |
| ⬛ Zones | eau, remblais, effondrement |
| 🏷️ Autres | tags custom créés via "➕ Créer un nouveau tag" (auto) |

**Algorithme de répartition équilibré** : les 5 groupes sont parcourus dans l'ordre et chacun est ajouté à la **colonne la moins remplie** (en lignes cumulées). Garantit un visuel équilibré même avec un nombre variable d'icônes.

```js
entrees.forEach(function(sec) {
  const h = _hauteurEstimee(sec); // 1 + nb lignes
  if (hG <= hD) { colGauche.push(sec); hG += h; }
  else          { colDroite.push(sec); hD += h; }
});
```

---

## 📚 Système multi-plans (`planRegistry.js`)

Module dédié à la gestion de **N plans simultanés** côté utilisateur, avec persistance localStorage + IndexedDB.

### 🗂️ Format de stockage `localStorage["myktamap_plans"]`

```json
{
  "version": "1.0",
  "lastPlanId": "server_data_test1",
  "plans": [
    {
      "id":         "server_data_test1",
      "type":       "server",
      "path":       "data/test1",
      "name":       "Test 1",
      "version":    "V1",
      "author":     "Karma",
      "discovered": true,
      "lastOpened": "2026-05-06T10:23:00Z",
      "addedAt":    "2026-05-06T10:00:00Z"
    },
    {
      "id":               "local_planmarseille_v1",
      "type":             "local",
      "name":             "Plan Marseille",
      "version":          "V1",
      "author":           "...",
      "originalFilename": "plan_marseille.zip",
      "fileSize":         24592384,
      "fsHandleId":       "local_planmarseille_v1",
      "storedBlob":       false,
      "lastOpened":       "2026-05-06T11:10:00Z",
      "addedAt":          "2026-05-04T08:00:00Z"
    }
  ]
}
```

### 📂 Auto-discovery serveur — `data/index.json`

Pour exposer plusieurs plans côté serveur, créer `data/index.json` à la racine :

**Format minimal** (l'app lit le `name` dans chaque `plan-config.json` à la volée) :

```json
{ "plans": ["test1", "test2", "demo"] }
```

Avec ce format, l'app cherche `data/test1/plan-config.json`, `data/test2/plan-config.json`, etc.

**Format détaillé** (évite N fetches au démarrage, recommandé en prod) :

```json
{
  "plans": [
    { "id": "test1", "path": "data/test1", "name": "Test 1", "version": "V1", "author": "..." },
    { "id": "test2", "path": "data/test2", "name": "Test 2", "version": "V2", "author": "..." }
  ]
}
```

### 🔐 Persistance des plans locaux — 3 stratégies

L'UI propose **automatiquement la meilleure méthode disponible** selon la plateforme :

#### 1. File System Access API (Chrome / Edge desktop)

- Bouton **🔐 Autoriser l'accès permanent** sous la zone de drop
- L'utilisateur sélectionne le ZIP via `showOpenFilePicker()`
- Le `FileSystemFileHandle` est sauvé en IndexedDB store `handles`
- Au rechargement futur : `getHandle(id)` + `ensureHandlePermission()` (`queryPermission` puis `requestPermission` si besoin)
- Au pire 1 clic Chrome ("Voir le fichier") après refresh ; 0 clic en session courante
- **Limites** : pas supporté Firefox / Safari / mobile

#### 2. Stockage Blob IndexedDB (mobile + fallback)

- Checkbox **💾 Mémoriser ce plan dans l'app** sous la zone de drop
- Au chargement, le `File` (Blob ZIP entier) est copié dans IndexedDB store `blobs`
- `navigator.storage.persist()` appelé avant pour empêcher la purge auto (iOS Safari, Chrome Android)
- Au rechargement futur : `getBlob(id)` retourne directement le Blob → reconstruction d'un `File` → flux normal
- **Fonctionne hors-ligne** et sur **mobile**
- **Limites de stockage** :
  - iOS Safari (navigateur) : ~50 Mo, peut être purgé après inactivité
  - iOS Safari (PWA installée) : jusqu'à 1 Go, persistant
  - Android Chrome : plusieurs Go (% de l'espace disque)
  - Desktop : très large (Go)

#### 3. Re-sélection (fallback)

- Aucune persistance enregistrée
- Au clic sur un plan local du registre, ouverture du sélecteur de fichier
- Validation : si `cfg.plan.name !== plan.name` du registre → `confirm()` "Charger quand même ?"

### 🏷️ Indicateurs visuels (badges)

Chaque ligne de plan local affiche un badge selon sa stratégie de persistance :

| Badge | Signification | Couleur |
|---|---|---|
| ✅ | `storedBlob: true` — ZIP mémorisé en IDB | Vert |
| 🔐 | `fsHandleId` présent — FS handle en IDB | Bleu |
| 📁 | Aucune persistance — re-sélection requise | Gris |

### 🔄 Hiérarchie de chargement

Quand l'utilisateur clique sur un plan local depuis le home, l'app tente dans cet ordre :

1. **Blob IDB** si `plan.storedBlob === true`
2. **FS Handle** si `plan.fsHandleId` + `hasFsAccess()`
3. **Re-sélection** via `showOpenFilePicker` (avec capture du handle pour persistance future) ou `<input type="file">`

Cet ordre est volontairement structuré pour optimiser l'UX : le blob donne 0 clic et fonctionne hors-ligne, le handle FS demande au pire 1 clic, la re-sélection est le dernier recours.

### 💾 Export / Import de la liste

L'utilisateur peut exporter sa liste pour la migrer entre appareils ou la partager :

- **Export** : génère `myktamap_plans_AAAAMMJJ.config` (JSON, type `myktamap-plans-list`). Les `fsHandleId` sont volontairement retirés (non portables entre machines).
- **Import** : modale 3 modes
  - **Remplacer** : écrase la liste actuelle
  - **Fusionner** : ajoute les plans non déjà présents (par id), conserve les existants
  - **Annuler**

`statsImport(file)` retourne `{ ok, total, newOnes, duplicates }` pour pré-afficher un résumé avant action.

### 🗄️ Schéma IndexedDB

Base `myktamap_handles` (version 2) :

```
└── ObjectStore "handles"   ← FileSystemFileHandle, clé = id du plan
└── ObjectStore "blobs"     ← Blob ZIP, clé = id du plan
```

À la suppression d'un plan via `remove(id)` :

1. Suppression de l'entrée localStorage
2. `removeHandle(id)` sur store `handles`
3. `removeBlob(id)` sur store `blobs` (libère l'espace disque)

---

## 🎨 Système d'icônes dynamique

Les icônes sont entièrement **pilotées par `PLAN_CONFIG.icons`** — aucune liste hard-codée dans le code.

### 🗺️ `_iconMap` (map.js)

Construit dynamiquement par `creerIcones()` à partir de `iconConfig` :

```js
window._iconMap = {};
Object.keys(iconConfig).forEach(function(tag) {
  if (!iconConfig[tag]) return;
  window._iconMap[tag] = L.icon({
    iconUrl:    iconConfig[tag],
    iconSize:   [50, 50],
    iconAnchor: [25, 25]
  });
});
```

Toutes les icônes sont en **50×50 avec ancrage centré** (auparavant `vehicule` était une exception en 50×25 qui causait un export PNG étiré).

### 🧭 `choisirIcone(point)` (utils.js)

Parcourt `point.tags` et retourne la première icône définie dans `_iconMap`. Permet à `editor.js` de gérer des tags personnalisés sans modifier le code.

### 🖼️ `getIconForPoint(point)` (utils.js, export PNG)

Même logique que `choisirIcone` mais pour le canvas d'export. Charge l'image en cache et retourne le couple `{img, path}`.

---

## ⚡ Mode performance (tiling.js)

Pour les plans JPEG volumineux qui crashent Safari iOS (`drawImage` > 8192px échoue silencieusement → canvas noir), le mode performance découpe l'image en tuiles. Depuis le **08/05/2026**, le mode est **réglable en 5 presets** (DLSS-like) au lieu d'un simple toggle.

### ✅ Les 5 presets

| `APP_CONFIG.perfPreset` | `MAX_WORK_DIM` | `TILE_SIZE` | JPEG Q | Quand on tile |
|---|---|---|---|---|
| `"off"` | — | — | — | **JAMAIS** (rendu direct, équivalent de l'ancien `perfMode = false`) |
| `"auto"` (défaut) | (Équilibré quand tile) | — | — | si `fileSize > 60 Mo` |
| `"quality"` | 12288 | 1024 | 0.95 | si `imageW × imageH > 4096²` |
| `"balanced"` | 8192 | 1024 | 0.88 | si `imageW × imageH > 4096²` |
| `"performance"` | 6144 | 768 | 0.78 | si `imageW × imageH > 4096²` |

> Mode `off` = aucun tiling, choix utilisateur explicite (⚠️ risque de crash Safari iOS pour images > 8192 px).
> Mode `auto` = comportement v1 (tile uniquement sur fichier énorme, params Équilibré).
> Modes explicites = on tile dès que techniquement nécessaire (sécurité GPU mobile), avec les params correspondants.

### 💾 Persistance

Le preset est **par plan** (pas une pref globale) — sauvegardé dans `PlanRegistry[planId].perfPreset` (localStorage). Le segmented control du loader reflète la valeur sauvée pour chaque plan.

Le choix dans le loader est passé explicitement à `startImportedPlan(file, assets, presetChoisi, meta)` (ou `chargerPlanServeur(path, registryEntry, presetChoisi)`).

### 🔁 Flux technique

```
chargerImage(url, bounds, map, fileSize, sourceFile)
  → resoudrePerfPreset(APP_CONFIG.perfPreset, fileSize, W, H)
      → { tile: bool, params: PERF_PRESETS[preset] | null }
  → si tile :
      → chargerImageTuillee(url, bounds, map, sourceFile, params)
          → _imageVersCanvasReduit(..., params.maxWorkDim)
              ↳ Blob URL créée et révoquée à l'intérieur (sécurité Safari)
              ↳ Détection canvas noir + re-essai 100ms
          → _tilerDepuisCanvas(..., params)  ← params.tileSize / params.jpegQuality
              → L.imageOverlay()             ← placement Leaflet
  → sinon :
      → L.imageOverlay(url, bounds)          ← rendu direct (qualité native)
```

### 🍎 Limites Safari iOS

- `drawImage` sur un JPEG > 8192px échoue silencieusement → canvas noir
- Détection automatique : `getImageData(1,1,1,1)` après drawImage
- Fallback : re-essai avec `setTimeout(100ms)`, puis `imageOverlay` classique si toujours noir
- La Blob URL est créée et révoquée **à l'intérieur** de `_imageVersCanvasReduit` pour éviter l'expiration sandbox Safari

### 🐛 Mode debug

Si `APP_CONFIG.debugMode === true`, le segmented control du loader affiche une ligne supplémentaire avec les chiffres techniques courants (ex: `MAX:8192 / TILE:1024 / Q:0.88 / tile si > 60 Mo`). Activable via le bouton `🐛 Logs détaillés` dans "Plus d'options" du loader, OU via Réglages ⚙️ > Logs détaillés.

---

## 💾 Préférences utilisateur

Deux niveaux de persistance :

### 1. Globale — `localStorage.app_user_prefs`

```js
{
  "debugMode": true | false   // unique pref globale (logs détaillés tracker + chiffres perf)
}
```

Géré par `sauvegarderPrefsUtilisateur()` (config.js). Helper unique `setDebugMode(value)` pour modifier (utilisé par le bouton 🐛 du loader ET le toggle Réglages ⚙️).

### 2. Par plan — `PlanRegistry[planId].perfPreset`

```js
{
  "id": "local_planmarseille_v1",
  ...
  "perfPreset": "balanced"   // optionnel — absent = défaut "auto"
}
```

Géré par `PlanRegistry.getPerfPreset(id)` / `setPerfPreset(id, preset)`. Validation contre la liste `["auto", "quality", "balanced", "performance"]`.

### Migration v1 → v2 (au boot, idempotente)

- Ancienne clé `motionDebug` → `debugMode` (préserve la valeur)
- Ancienne clé `perfMode` (globale) → SUPPRIMÉE (perfPreset est par plan désormais)

Les dimensions du plan et paramètres tracking viennent toujours du `plan-config.json` (inchangés).

---

## ⚙️ Configuration — `plan-config.json`

Chaque plan est décrit par un fichier `plan-config.json`.

### 🧾 Exemple complet

```json
{
  "plan": {
    "name": "TEST",
    "version": "V1",
    "author": "KARMA",
    "imageWidth": 1044,
    "imageHeight": 610,
    "baseImage": "data/TestMAP.png",
    "collisionImage": "data/collision.png"
  },
  "imageLayers": [
    { "id": "legende", "label": "Legende", "file": "data/TestMAP_LEGENDE.png", "visible": true, "order": 10 }
  ],
  "dataLayers": [
    { "id": "puits",    "label": "Puits",   "file": "data/puit.json",    "visible": true },
    { "id": "vehicule", "label": "Vehicule","file": "data/vehicule.json","visible": true },
    { "id": "editor",   "label": "Ajouts",  "file": "data/editor.json",  "visible": true }
  ],
  "tracking": {
    "startX": 345,
    "startY": 519,
    "scale": 4.9,
    "stepLength": 0.7,
    "stepThreshold": 13,
    "stepCooldown": 400
  },
  "icons": {
    "default":  "icon/iconetrack.png",
    "track":    "icon/iconetrack.png",
    "salle":    "icon/house.png",
    "pa":       "icon/pa.png",
    "vehicule": "icon/vehicule.png",
    "peo":      "icon/peo.png",
    "pef":      "icon/pef.png",
    "eso":      "icon/eso.png",
    "esf":      "icon/esf.png",
    "cao":      "icon/cao.png",
    "caf":      "icon/caf.png",
    "fontaine": "icon/iconetrack.png"
  }
}
```

> Le calque `editor` doit toujours être présent dans `dataLayers`.
> Les tags `default` et `track` sont **obligatoires** dans `icons`. Les autres sont libres.
> Depuis 06/05/2026, les tags listés dans `TAGS_BUILTIN` (`map.js`) sont **automatiquement résolus** vers `icon/<tag>.png` même si non déclarés ici — voir section "🎨 Système d'icônes".

---

## 📁 Description des modules

### `config.js` (unifié)

Gère :
- `DEFAULT_CONFIG` / `APP_CONFIG` — configuration active
- `RUNTIME_ASSETS` — registre des fichiers importés (Blob URLs)
- `buildAppConfigFromPlan()` — construit APP_CONFIG depuis un plan + préférences
- `loadAppConfig()` — charge `data/plan-config.json` (mode serveur)
- `sauvegarderPrefsUtilisateur()` — persiste `debugMode` (la seule pref globale ; `perfPreset` est par plan via PlanRegistry)
- `setDebugMode(value)` — helper unique pour modifier le flag debug (utilisé par loader + Réglages ⚙️)
- Helpers : `registerAsset()`, `findMatchingFile()`, `cloneAndResolvePlanConfig()`, `validateImportedPlan()`

### `map.js` (unifié)

- `cleanupExistingMap()` — destruction propre de la carte existante avant rechargement
- `initMapFromConfig()` — initialisation Leaflet, calques, tiling si nécessaire
- `creerIcones(iconConfig)` — construit `_iconMap` dynamique
- `initCollisionMap()` — canvas collision avec downscale automatique (max 4096px)

### `main.js` (unifié)

- `lancerApplication()` — reset complet + init carte + init modules dans l'ordre : `initEditor → initRoad → initZones → initMeasure → initInterface → initTracking`
- `startImportedPlan(planConfigFile, assetFiles, perfChoisi)` — chargement depuis le loader
- `afficherLoader()` — affiche le loader intégré
- Auto-détection au démarrage via `loadAppConfig()`
- Reset des flags `interfaceInitialized`, `roadInitialized`, `zonesInitialized` au changement de plan

### `editor.js`

Modale plein écran pour ajouter un point. Liste de tags dynamique avec :
- **— Aucun tag (défaut) —** (utilise icône `default`)
- Tags du `PLAN_CONFIG.icons`
- **➕ Créer un nouveau tag…** (validation regex `[a-z0-9_-]+`, ajout à `PLAN_CONFIG.icons` + `_iconMap`)

API exposée :
- `getEditorPoints()` / `setEditorPoints(points)`
- `removeLastEditorPoint()` — supprime le dernier point ajouté
- `renderEditorPoints()` — re-rendu complet du calque

### `road.js`

API exposée :
- `getRoads()` / `setRoads(roads)`
- `resetRoads()` — supprime tout
- `removeLastRoad()` — supprime le dernier tracé entier
- `removeLastRoadPoint()` — supprime le dernier point du dernier tracé (et le tracé s'il devient vide)
- `toggleRoadMode(type)` — active/désactive un mode de tracé

### `zones.js`

Module dédié aux zones polygonales remplies. Trois types : `eau`, `remblais`, `effondrement`.

**Comportement :**
- Tracé avec aperçu pointillé pendant l'édition + cercle visible sur le 1er point dès 3 points posés
- Fermeture par re-clic sur le 1er point (tolérance **5 px**) OU bouton ✅ Fermer
- Mode exclusif : activer une zone désactive les autres modes (mesure, ajout, route, recalage, autre zone)

**Tri d'affichage :** `{ eau: 0, remblais: 1, effondrement: 2 }` — eau toujours en arrière-plan, effondrement toujours visible. Tri appliqué à 3 endroits : `renderZones()` (zones.js), export PNG (utils.js + exporter.js), data layer embarqué (utils.js).

**Styles :**
| Type | Bordure | Remplissage | Opacité bordure | Fill opacity |
|---|---|---|---|---|
| Eau | `#0066aa` | `#3aa9e8` | 1 | 0.7 |
| Remblais | `#3a3a44` | `#5a5a68` | 1 | 0.7 |
| Effondrement | `#cc0000` | `#ff3333` | 1 | 0.7 |

**API exposée :**
- `getZones()` / `setZones(zones)`
- `resetZones()` — supprime tout
- `toggleZoneMode(type)` — active/désactive un type
- `fermerZoneEnCours()` — ferme manuellement la zone (min 3 points)
- `removeLastZone()` — supprime la dernière zone fermée
- `removeLastZonePoint()` — supprime le dernier point (zone en cours OU dernière fermée)

**Format de stockage :**
```json
{ "type": "remblais", "points": [{"x":100,"y":200}, ...] }
```
Le point de fermeture est implicite (1er point répété). Inclus dans : session JSON (`zones[]`), data layer embarqué (`zones[]`), export PNG.

### `exporter.js`

Module dédié à la modale d'export du plan. Entrée publique : `window.ouvrirExportModal()`.

**Deux modes :**
- ⚡ **Rapide** — appelle `window.telechargerPlan()` (utils.js, comportement historique inchangé)
- 🎨 **Avancé** — modale détaillée avec choix par calque + légende intégrée

**Mode avancé — sections :**
1. Calques d'image (checkboxes pré-cochées selon visibilité)
2. Calques de données (checkboxes pré-cochés selon visibilité)
3. Annotations de session (points / tracés / zones / mesure / tracker)
4. **Légende intégrée** — toggle ON/OFF avec sous-options :
   - Position : 4 coins ou custom (bouton 🎯 sélection sur la carte)
   - Style : Opaque / Semi-transparent / Filigrane (dark theme cohérent avec les modales)
   - Taille : Compact / Standard / Large
   - Contenu : Icônes / Tracés / Zones / Tag tracker / Métadonnées (nom, version, auteur, date)
5. Format (PNG / JPEG 90%) + Résolution (1 / ½ / ¼)
6. Aperçu mini-canvas 320×200 (debounced 300ms)

**Sélection 🎯 sur la carte :** capture l'état de la modale, ferme temporairement la modale, attend le clic sur la carte, capture les coords plan (`x = lng`, `y = imageHeight - lat`), rouvre la modale en restaurant l'état + coords remplies. Échap pour annuler.

**Légende dessinée :**
- Layout en **2 colonnes** : Icônes à gauche, Tracés + Zones à droite (titre et méta en pleine largeur)
- Titre "Légende" en **Georgia italique**
- Date au format FR `JJ/MM/AAAA`
- Largeur ajustée au libellé le plus long, anti-débordement clamp aux bords du canvas
- Fond avec coins arrondis 6px

**Pas de persistance** des réglages — chaque ouverture repart sur les défauts (mode rapide, calques visibles cochés).

### `tableEditor.js`

Éditeur de fichier JSON sous forme de tableau interactif. Entrée publique : `window.ouvrirTableEditor()`.

**Workflow :**
1. Modale d'import (drag & drop ou file picker `.json`)
2. Auto-détection du format (`data` calque ou `editorPoints` session)
3. Tableau plein écran (~1100 px de large) avec édition inline
4. Sauvegarde via menu : 📥 Téléchargement / 🗺️ Remplacer le calque actif / ✏️ Remplacer la session
5. Confirmation à la fermeture si modifications non sauvées

**Détection des colonnes :** automatique avec ordre privilégié `id, nom, x, y, tags, etat, description, profondeur, date_update` puis le reste alphabétiquement.

**Édition inline :**
- Clic sur cellule → input avec focus auto
- **Tab** → cellule suivante (skip `id` lecture seule)
- **Entrée** → valide et passe à la ligne suivante (même colonne)
- **Échap** → annule la modification
- Validation typée : `x`/`y`/`profondeur` → input number ; `id` → lecture seule (cellule grisée) ; autres → text

**Validation des coordonnées :** cellule rouge avec ⚠ si `x < 0` ou `x > imageWidth` (idem pour `y`/`imageHeight`), tooltip avec la limite, compteur global "⚠️ N coordonnée(s) hors plan".

**Tags multi-select :**
- Affichage en chips avec × pour retirer
- Clic sur la cellule → dropdown avec :
  - Tags existants dans `PLAN_CONFIG.icons` (avec icône en preview)
  - Tags utilisés ailleurs dans le fichier
  - Champ "Créer un tag" (sanitization `/[^a-z0-9_-]/g`)
- Positionnement auto avec recadrage si dépasse de l'écran

**Autres fonctionnalités :**
- Recherche live (debounced 200ms) sur tous les champs textuels
- Tri par colonne (clic en-tête : asc → desc → none)
- Sélection multiple avec checkboxes + Maj+clic pour plage
- Ajouter ligne (vide en bas), Supprimer (avec confirmation), Dupliquer (suffixe `_copie` à l'id)
- 📍 **Aperçu sur la carte** : modale masquée, markers cercles oranges + banner "↩️ Retour à l'éditeur"
- Avertissement visuel si > 1000 lignes

**Sauvegarde — préservation totale du JSON original :** les champs `type`, `version`, `roads`, `zones`, `measure` du fichier source sont conservés tels quels au save.

**État interne :**
```js
let _data, _colonnes, _modifie, _selection, _tri, _filtre,
    _format, _sourceMeta, _lastSelectedIdx;
```

### `searchPoints.js`

Recherche rapide d'un point. Entrée publique : `window.ouvrirRecherche()`.

**Périmètre :** tous les calques `dataLayers` du plan + points de session (`editor`).

**Cache :**
- Au premier appel, charge tous les fichiers JSON via `fetch()` + récupère les `editorPoints` via `getEditorPoints()`
- Stocké dans `_pointsCache` sous forme `[{ point, layerId, layerLabel }]`
- Invalidé automatiquement au changement de plan via `_signaturePlan()` qui combine `name|version|baseImage`

**Recherche :**
- Champ live debounced 200ms
- Normalisation NFD + lowercase → insensible aux accents et à la casse
- Champs cherchés : `nom`, `id`, `description`, `tags`, `etat`
- **Tri par pertinence** :
  - Match exact dans `nom` → score 100
  - Début du `nom` → 80
  - Dans le `nom` → 60
  - Match exact dans `id` → 50
  - Début de l'`id` → 40
  - Dans l'`id` → 30
  - Dans `tags` → 20
  - Dans `description` ou `etat` → 10
- Limite : 50 résultats affichés + compteur "+ N autre(s)"

**Affichage des résultats :**
- Icône miniature 28×28 (résolue depuis `PLAN_CONFIG.icons` via les tags du point)
- ID en bleu vif (`#8cb4ff`) suivi du nom en gras
- Chip de calque (label) + tags (max 4 + "+N") + coordonnées en monospace
- 1er résultat pré-sélectionné (classe `.active`) → Enter valide directement

**Navigation clavier :**
- ↑ / ↓ : naviguer entre résultats
- Entrée : ouvrir le résultat actif
- Échap : fermer la modale

**Au clic sur un résultat (`_aller(item)`) :**
1. Modale fermée
2. **`map.setView(latlng, zoomCourant, { animate: false })`** — pas de `flyTo` pour éviter dérive cumulée d'arrondi sur plusieurs recherches successives
3. `map.invalidateSize()` pour sécurité
4. Recherche du marker existant dans `dataLayerGroups[layerId]` par comparaison **coords plan x/y** (reconvertit le `latlng` du marker en plan via `imageHeight - lat`) — pas par latlng direct, plus robuste
5. Si marker trouvé → `openPopup()`, sinon popup temporaire avec nom/description/layer/tags
6. **Cercle d'entourage statique** (pas d'animation) : `circleMarker` orange `#ffaa00`, rayon 24, fillOpacity 0, weight 3 — disparaît après 3 secondes

### `measure.js`

API exposée :
- `getMeasurePoints()` / `setMeasurePoints(points)`
- `resetMesure()` — supprime tout
- `removeLastMeasurePoint()` — supprime le dernier point de mesure
- `telechargerMesureJSON()` — export du tracé en JSON

### `tracking.js`

Cache collision initialisé une seule fois à l'init (`initCollisionCache`) — stocke le tableau RGBA complet en mémoire avec ratio `_collisionScaleX/Y` pour la conversion plan → canvas.

**API exposée** :
- `initTracking()` — reset complet, recrée marker + polyline + handlers (appelé à chaque chargement de plan)
- `startTracking()` / `stopTracking()` — active/désactive la lecture des capteurs
- `requestPermission()` — demande la permission iOS (appelé uniquement au clic sur ▶️ Play, plus au premier clic global)
- `resetTrackingPosition()` — repositionne le tracker à `startX/startY` et vide la polyline
- `getStepCount()` — nombre de pas détectés
- `initCollisionCache()` — recharge le cache collision après changement de plan
- **`getTrackingPosition()`** → `{ x, y }` — position courante en coords plan, **utilisé par les exporters et la recherche**
- **`getTrackingPath()`** → `[{x, y}, ...]` — liste des points du tracé depuis le démarrage (reconvertis depuis la polyline Leaflet en coords plan), **utilisé par les exporters**

### `utils.js`

- `convertCoord(x, y)` — coordonnées plan → Leaflet
- `choisirIcone(p)` — sélection dynamique depuis `_iconMap`
- `ajouterPointsDepuisJSON(url, layer)` — chargement par batch de 50, dessine les `roads[]` et **`zones[]`** embarqués (en lecture seule). `ZONE_STYLES_DATA` contient eau, remblais, effondrement avec tri eau → remblais → effondrement.
- `telechargerPlan()` — export PNG complet (mode Rapide). Lit les `roads[]` et `zones[]` embarqués depuis chaque calque actif (cohérence avec ce qui est affiché à l'écran). Dessine le tracker complet : path (polyline `#3388ff`) + position. Le mode **Avancé** est géré par `exporter.js`.

### `interface.js`

#### 🧱 Structure de l'interface — barre latérale 10 groupes

L'interface est organisée en **10 groupes** dans la barre latérale droite. Un seul groupe peut être ouvert à la fois — ouvrir un groupe ferme automatiquement les autres (sauf ceux qui ont un mode actif).

| # | Groupe | Icône | Type | Sous-actions |
|---|---|---|---|---|
| 1 | Aide / Doc / Légende | 📚 | Accordéon | Aide → Documentation → Légende |
| 2 | Paramètres | ⚙️ | **Solo** | (clic direct, ouvre la modale Réglages) |
| 3 | Recherche | 🔍 | **Solo** | (clic direct, ouvre la modale de recherche) |
| 4 | Charger / Import | ⬇️ | Accordéon | 📥 Importer une session → 📊 Éditer un fichier JSON → 🗂️ Changer de plan |
| 5 | Créer / Modifier plan | 🏗️ | **Solo** | (clic direct, ouvre le générateur) |
| 6 | Enregistrer | ⬆️ | Accordéon | 💾 Session (modale 3 modes) → 🖼️ Plan PNG (export avancé) |
| 7 | Tracker | 🧭 | Accordéon | ▶️/⏹️ Tracking → 📍 Recalage |
| 8 | Mesure | 📐 | Accordéon | 📐 Activer mesure → ❌ Effacer |
| 9 | Édition | 📌 | Accordéon | 📌 Activer ajout → 🗑️ Effacer |
| 10 | Tracés | 🛣️ | Accordéon | 🟩 Principale → 🟪 Secondaire → 🟨 Chemin → 🧹 Effacer |
| 11 | Zones | ⬛ | Accordéon | ⬛ Remblais → 🟥 Effondrement → 🟦 Eau → ✅ Fermer → 🧹 Effacer |

#### ⚙️ Règles de comportement

- **Sens de déroulement** : accordéon vertical — les sous-actions apparaissent en dessous de l'icône principale et repoussent les groupes suivants
- **Exclusivité** : un seul groupe ouvert à la fois ; ouvrir un groupe ferme automatiquement le précédent
- **Mode actif** : si un mode du groupe est actif (mesure, ajout, route, zone, recalage, tracking), le groupe **reste verrouillé ouvert** pour permettre l'accès direct aux sous-actions
- **Icône principale active** : l'icône principale du groupe **reflète visuellement le mode actif**
  - Tracker : 🧭 → ⏹️ (tracking en cours) ou 📍 (recalage actif)
  - Tracés : 🛣️ → 🟩 / 🟪 / 🟨 selon le type actif
  - Zones : ⬛ → ⬛ / 🟥 / 🟦 selon le type actif
- **Clic hors d'un groupe ouvert** → ferme le groupe automatiquement
- **Modes exclusifs préservés** : Mesure / Édition / Recalage / Tracés / Zones restent mutuellement exclusifs

#### 🏗️ Architecture du code

- **`_creerGroupeAccordeon(config)`** — fonction unique qui crée un groupe (solo ou accordéon)
- **`_groupes`** — registry global de tous les groupes avec leur état (`{ container, btnPrincipal, subActions, modeActif }`)
- **`_ouvrirGroupe`, `_fermerGroupe`, `_toggleGroupe`** — gestion centralisée de l'état accordéon
- **`_setGroupeModeActif(id, actif, iconeReflet)`** — verrouille un groupe ouvert et change l'icône principale
- **`_initClickExterieur`** — listener global qui ferme le groupe ouvert au clic en dehors

#### 🪟 Modales disponibles

| Fonction | Description |
|---|---|
| `afficherAide()` | Référence des boutons par groupe |
| `afficherConfig()` | Réglages APP_CONFIG + 🎯 calibrage + logs + réinitialiser |
| `afficherLegende()` | Icônes, tracés et zones du plan actif |
| `afficherReadme()` | Choix doc utilisateur / développeur |
| `ouvrirExportSessionModal()` | **Modale d'export de session — 3 modes (Full / Avancé / Conversion)** (sessionExporter.js) |
| `afficherPlanner()` | Générateur de plan ZIP (Nouveau / Modifier) |
| `afficherLogsDebug()` | Panneau logs de débogage |
| `afficherFormulaire(x, y)` | Modale ajout de point (editor.js) |
| `ouvrirImportSession()` | Modale d'import de session avec drag & drop et aperçu |
| `ouvrirCalibrageEchelle()` | Modale de calibrage par produit en croix |
| `ouvrirExportModal()` | **Modale d'export plan avancé** (exporter.js) |
| `ouvrirTableEditor()` | **Éditeur de fichier JSON sous forme de tableau** (tableEditor.js) |

#### 🧹 Helpers de suppression

- `_confirmerAction(titre, texte, callback)` — modale simple Annuler/Confirmer
- `_choixSuppression(titre, texte, options[])` — modale avec liste d'options labellées (chacune avec icône, description, callback). Utilisée pour : effacer mesure, points, tracés, zones.

#### 🎯 Calibrage de l'échelle

`ouvrirCalibrageEchelle()` ouvre une modale dédiée accessible via le bouton 🎯 à côté du champ Échelle dans ⚙️.

Calcul (formule corrigée) : `nouveau_scale = scale_actuel × (distance_AFFICHÉE / distance_RÉELLE)`

> **Vérification :** scale=4.9, l'appli affiche 100m, en réalité 150m → l'appli surestime → il faut **réduire** scale → `4.9 × (100/150) = 3.27` ✅

L'utilisateur saisit la distance affichée par l'appli et la distance réelle mesurée au sol. La modale calcule la nouvelle échelle en temps réel et l'injecte dans le champ Échelle quand on valide.

#### 📥 Modale d'import de session

`ouvrirImportSession()` ouvre une modale plein écran cohérente avec les autres modales :
- Zone drag & drop pour fichier `.json`
- Validation du type (`devmap-session` requis)
- Aperçu du contenu : nombre de points, tracés, **zones**, et points de mesure
- Avertissement explicite : *"l'import remplacera tes points/tracés/zones/mesure actuels"*
- Bouton "Importer" désactivé tant que le fichier n'est pas validé
- Restauration via `setEditorPoints`, `setRoads`, `setZones`, `setMeasurePoints`

#### 🏠 Page d'accueil — boutons supplémentaires

Le loader (`#planLoaderOverlay` dans `index.html`) propose en bas, sous le mode performance :
- **🏗️ Générer un plan** — toujours visible, ouvre `window.afficherPlanner()`
- **🌐 Charger le plan serveur** — toujours visible, tente `loadAppConfig()` au clic. Affiche un message d'erreur clair si aucun `plan-config.json` n'existe à la racine.

L'onglet "Fichiers séparés" du loader a été supprimé — seul le mode ZIP est conservé.

#### 📱 Adaptation mobile paysage

CSS `@media (max-height: 500px)` :
- `.leaflet-top.leaflet-right { max-height: calc(100vh - 16px); overflow-y: auto }` — barre scrollable verticalement
- Scrollbar masquée (Webkit + Firefox)
- Boutons réduits à 28×28px / font 14px
- Espacement entre groupes réduit à 1px

### `debug.js`

Capture silencieuse de tous les `console.log/warn/error` + erreurs non catchées. Persistance dans `localStorage("kta_debug_logs")` — les logs survivent au crash du tab. Accessible via ⚙️ → 🐛 Logs.

### `createConf.js` (Générateur de plan)

Deux onglets :
- **📄 Nouveau** — formulaire vierge
- **📂 Modifier existant** — drop ZIP, pré-remplissage, régénération

Sections du formulaire :
1. Métadonnées (nom, version, auteur, dimensions)
2. Images principales (base + collision)
3. Calques image supplémentaires (jusqu'à 10)
4. Calques de données JSON (jusqu'à 10, `editor` ajouté automatiquement)
5. Paramètres de tracking
6. **Icônes & Tags** — gestionnaire dynamique avec :
   - Bouton "↺ Charger défauts" — pré-remplit avec les icônes standards
   - Bouton "+ Ajouter un tag" — création d'un tag personnalisé
   - Upload d'icônes custom par tag (preview live)
   - Tags `default` et `track` en lecture seule (système)

### `planRegistry.js` (Gestionnaire multi-plans)

Module autonome chargé avant `interface.js`. Gère la liste des plans connus de l'utilisateur (serveur découverts + ZIP locaux) avec persistance localStorage et IndexedDB.

#### Format de stockage `localStorage["myktamap_plans"]`

```json
{
  "version": "1.0",
  "lastPlanId": "server_data_test1",
  "plans": [
    {
      "id": "server_data_test1",
      "type": "server",
      "path": "data/test1",
      "name": "Plan Test 1",
      "version": "V1",
      "author": "Karma",
      "discovered": true,
      "addedAt": "2026-05-06T...",
      "lastOpened": "2026-05-06T..."
    },
    {
      "id": "local_planmarseille_v1",
      "type": "local",
      "name": "Plan Marseille",
      "version": "V1",
      "originalFilename": "plan_marseille.zip",
      "fileSize": 24592384,
      "fsHandleId": "local_planmarseille_v1",
      "storedBlob": true,
      "addedAt": "2026-05-04T...",
      "lastOpened": "2026-05-06T..."
    }
  ]
}
```

#### Format `data/index.json` (auto-discovery serveur)

```json
{
  "plans": [
    { "id": "test1", "path": "data/test1", "name": "Plan Test 1", "version": "V1" },
    { "id": "test2", "path": "data/test2", "name": "Plan Test 2" }
  ]
}
```

Format minimal aussi accepté : `{ "plans": ["test1", "test2"] }` (le path devient `data/test1`).

#### Format export `myktamap_plans_AAAAMMJJ.config`

```json
{
  "type": "myktamap-plans-list",
  "version": "1.0",
  "exported_at": "2026-05-06T...",
  "plans": [...]   // sans fsHandleId (non portables)
}
```

#### IndexedDB `myktamap_handles` (v2)

| Object Store | Clé | Valeur | Persistance |
|---|---|---|---|
| `handles` | `id` du plan | `FileSystemFileHandle` | Chrome/Edge desktop uniquement |
| `blobs` | `id` du plan | `Blob` du ZIP entier | Toutes plateformes (mobile recommandé) |

Demande `navigator.storage.persist()` avant `saveBlob` pour garantir la persistance (empêche purge auto par iOS Safari et Chrome Android).

#### API publique (`window.PlanRegistry`)

| Méthode | Description |
|---|---|
| `init()` | Charge les données depuis localStorage. Appelée automatiquement par `getAll`/`findById` etc. |
| `getAll()` | Retourne le tableau complet des plans |
| `findById(id)` | Retrouve un plan par son id |
| `getRecents(n)` | n derniers plans ouverts (toujours dispo, pas utilisé par l'UI actuelle) |
| `getLastOpened()` | Le dernier plan ouvert (basé sur `lastPlanId`) — utilisé par le bouton ▶️ Reprendre |
| `addOrUpdate(plan)` | Crée ou met à jour une entrée (clé = `id`). Préserve `addedAt` et `lastOpened` existants si non fournis |
| `markOpened(id)` | Met à jour `lastOpened` et `lastPlanId` |
| `remove(id)` | Supprime l'entrée + son `FileSystemFileHandle` + son `blob` IDB |
| `removeAll()` | Vide tout (mais ne supprime pas les blobs IDB — utiliser avec prudence) |
| `exportToFile()` | Téléchargement `myktamap_plans_AAAAMMJJ.config` |
| `importFromFile(file, mode)` | mode = `"replace"` ou `"merge"` |
| `statsImport(file)` | Avant import : `{ ok, total, newOnes, duplicates, error? }` |
| `genServerId(path)` | `server_<sluggified_path>` (ex: `server_data_test1`) |
| `genLocalId(name, version)` | `local_<slug_name>_<slug_version>` (déterministe, pas de doublon si même ZIP rechargé) |
| `saveHandle(id, handle)` / `getHandle(id)` / `removeHandle(id)` | Gestion des `FileSystemFileHandle` |
| `hasFsAccess()` | Détection support `showOpenFilePicker` |
| `ensureHandlePermission(handle)` | `queryPermission` puis `requestPermission` (mode read) |
| `saveBlob(id, blob)` / `getBlob(id)` / `removeBlob(id)` | Gestion des ZIP en IndexedDB |
| `requestPersistentStorage()` | Demande au navigateur de marquer le stockage comme persistant |
| `getStorageEstimate()` | `navigator.storage.estimate()` — espace total et utilisé |

#### Workflow de chargement (orchestré par `index.html` + `main.js`)

1. **Démarrage** → `PlanRegistry.init()` → `decouvrirPlansServeur()` (lit `data/index.json` si présent, ajoute les plans en mode `discovered`)
2. **Rétro-compat** → si registre vide ET `data/plan-config.json` racine existe → chargement auto direct + ajout `server_root` au registre
3. Sinon → `afficherLoader()` qui appelle `refreshPlansList()` pour rendre la liste

#### Hiérarchie de re-chargement d'un plan local du registre (`chargerPlanDuRegistre(id)`)

```
1. Si plan.storedBlob === true
   → PlanRegistry.getBlob(id) → File(blob, originalFilename) → chargerZipFichier(file, perfChoisi, { planId, fromStoredBlob: true })

2. Sinon si plan.fsHandleId && hasFsAccess()
   → PlanRegistry.getHandle(id) → ensureHandlePermission → handle.getFile() → chargerZipFichier(file, perfChoisi, { fsHandle, planId })

3. Sinon (fallback)
   → reSelectionnerZipPourPlan(plan)
     → showOpenFilePicker (si dispo) ou <input type="file">
     → Validation : si plan.name dans le ZIP ≠ nom cliqué → confirm
     → chargerZipFichier(file, perfChoisi, { fsHandle?, planId })
```

---

## 📦 Structure des données JSON

### 🗂️ Format standard (calques de données)

```json
{
  "type": "puits",
  "version": 1,
  "data": [ ... ],
  "roads": []
}
```

Le champ `roads[]` est optionnel — s'il est présent, les tracés sont affichés en lecture seule dans le même calque Leaflet (non modifiables via 🧹).

### 💾 Format session exportée

```json
{
  "type": "devmap-session",
  "version": 1,
  "editorPoints": [ ... ],
  "measure": { "points": [] },
  "roads": []
}
```

### 📍 Format point

```json
{
  "id": "PA1",
  "nom": "Puits Aération",
  "x": 4843,
  "y": 2002,
  "tags": ["pa"],
  "etat": "Non inspectée",
  "description": "Puits avec courant d'air",
  "profondeur": 12,
  "date_update": "2026-04-03"
}
```

Un point peut avoir un tableau `tags` vide → utilise l'icône `default`.

---

## 💾 Export de session — `sessionExporter.js`

Module autonome activé par `window.ouvrirExportSessionModal()`. Modale avec 3 onglets.

### Mode 🚀 Full
- Inclus : `editorPoints`, `roads`, `zones`
- **Exclu** : tracker, mesure
- Format de sortie : 1 fichier `devmap-session` (JSON)
- Nom : `session_<plan>_AAAAMMJJ.json`

### Mode 🎨 Avancé
Cases à cocher hiérarchiques :
- ✏️ **Points ajoutés** + sous-cases par tag (avec icône miniature) + `(sans tag)`
- 🛣️ **Tracés** + sous-cases par type (principal / secondaire / chemin)
- ⬛ **Zones** + sous-cases par type (eau / remblais / effondrement)
- 🧭 **Position du tracker** (case unique avec mention `(+ tracé N pts)` si path > 1)

Format de sortie au choix :
- 📄 Un seul fichier `devmap-session` (réimportable, contient tout en un bloc)
- 📦 ZIP multi-fichiers (`session_points.json`, `session_roads.json`, `session_zones.json`, `session_tracker.json`)

### Mode 🔄 Conversion
Convertit la session en data layer(s) au format `devmap-data`. Pas de tracker.

Cases à cocher :
- ✏️ **Points ajoutés** + sous-cases par tag (idem Avancé)
- 🛣️ **Tracés**
- ⬛ **Zones**

Granularité au choix :
- 📄 **Basique** : 1 fichier par catégorie (`points.json`, `roads.json`, `zones.json`)
- 🔬 **Fine** :
  - Points : 1 fichier `points.json` (les tags peuvent être multiples → séparation ambiguë)
  - Tracés : 1 par type (`roads_principal.json`, `roads_secondaire.json`, `roads_chemin.json`)
  - Zones : 1 par type (`zones_eau.json`, `zones_remblais.json`, `zones_effondrement.json`)

Sortie : fichier unique si 1 seul, ZIP sinon.

### Filtrage par tag (Avancé + Conversion)

**Logique d'inclusion** : un point est inclus s'il a **au moins un de ses tags coché**, OU s'il n'a pas de tag et que `(sans tag)` est coché.

**Synchronisation parent ↔ tags** :
- Décocher Points ajoutés → décoche tous les tags
- Cocher au moins 1 tag → recoche le parent
- Tout décocher → décoche le parent

**Helpers internes** :
- `_listerTagsPoints(points)` — retourne `[{tag, count, isUntagged}]` trié alphabétiquement
- `_filtrerPointsParTags(points, tagsCoches, untaggedCoche)` — filtre selon les tags cochés
- `_lireTagsCoches(prefix, tagsList)` — lit les sous-cases du DOM (préfixes `adv_points_tag_` ou `conv_points_tag_`)
- `_slugTagId(tag)` — sécurise un nom de tag pour servir d'id CSS
- `_iconePourTag(tag)` — récupère le chemin de l'icône depuis `PLAN_CONFIG.icons`

### Format `devmap-session` (Full / Avancé)
```json
{
  "type": "devmap-session",
  "version": "1.0",
  "date_export": "2026-05-05T...",
  "editorPoints": [...],
  "roads": [...],
  "zones": [...],
  "tracker": { "position": {x,y}, "path": [...] }   // optionnel, mode Avancé
}
```

### Format `devmap-data` (Conversion)
```json
{
  "type": "devmap-data",
  "version": "1.0",
  "date_export": "2026-05-05T...",
  "data": [...],         // ex-editorPoints
  "roads": [...],        // optionnel
  "zones": [...]         // optionnel
}
```
Lecture par `ajouterPointsDepuisJSON()` (utils.js) qui rend les markers, les routes et les zones.

### Permission capteurs (tracking)

Avant : listener `document.body.click({once:true})` dans `main.js` et `main_import.js` qui appelait `requestPermission()` au tout premier clic global → popup iOS gênante (interférait avec l'import, l'édition, etc.).

Maintenant : `requestPermission()` est appelé **uniquement** au clic sur ▶️ Play du tracker (interface.js ligne 1555). Cohérent avec la directive Apple : la permission `DeviceMotionEvent.requestPermission()` doit être appelée dans une tâche utilisateur directe.

---

## 📍 Gestion des coordonnées

GIMP : origine haut-gauche (Y vers le bas). Leaflet `L.CRS.Simple` : origine bas-gauche (Y vers le haut).

```js
function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}
```

---

## 🐛 Débogage

Le panneau de logs est accessible via **⚙️ → 🐛 Logs**. Il capture en silence :
- Tous les `console.log`, `console.warn`, `console.error`
- Les erreurs non catchées (`window.onerror`)
- Les promesses rejetées (`unhandledrejection`)

Les logs sont persistés dans `localStorage("kta_debug_logs")` — ils survivent au crash du tab Safari iOS. Au prochain ouverture, les logs du crash précédent s'affichent en grisé avec le label `[CRASH PRÉCÉDENT]`.

---

## 📄 Licence

Projet personnel — libre d'adaptation selon vos besoins non commerciaux.