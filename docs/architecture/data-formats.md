# Architecture MyKTAMap — Formats JSON (plan-config, point, session)

> Référence détaillée extraite de l'ancien CLAUDE.md. Lue à la demande (pas auto-chargée).
> Sections : 📦 Format des données

---

## 📦 Format des données

### `plan-config.json`

```json
{
  "plan": {
    "name": "Test 1",
    "version": "V1",
    "author": "KARMA",
    "tags": ["gironde", "carrière"],   // optionnel (16/09/2026) — PROPOSÉES à l'import : jamais par-dessus des tags posés à la main (tagsSrc "user") ni ceux de l'index serveur ("index")
    "imageWidth": 1044,
    "imageHeight": 610,
    "baseImage": "TestMAP.png",
    "collisionImage": "collision.png"
  },
  "imageLayers": [
    { "id": "legende", "label": "Légende", "file": "legende.png", "visible": true, "order": 10 }
  ],
  "dataLayers": [
    { "id": "puits", "label": "Puits", "file": "puits.json", "visible": true },
    { "id": "editor", "label": "Mes ajouts", "file": "editor.json", "visible": true }
  ],
  "tracking": {
    "startX": 345, "startY": 519, "scale": 4.9
    // ⚠️ v1.96.0 : "stepLength", "stepThreshold", "stepCooldown" ne sont PLUS écrits ni lus.
    // La foulée est celle de la personne, le seuil et le cooldown ceux du téléphone :
    // réglages GLOBAUX (app_user_prefs). S'ils sont présents dans un vieux plan-config, l'app les ignore.
  },
  "icons": {
    "default": "icon/iconetrack.png",
    "track":   "icon/iconetrack.png",
    "pa":      "icon/pa.png"
    // Les tags listés dans TAGS_BUILTIN sont auto-résolus.
    // ⚠️ v1.97.9 : une valeur qui n'est ni `data:`/`blob:` ni un fichier à
    // extension d'image est IGNORÉE au chargement (le catalogue reprend la
    // main) — un plan généré entre le 13/06 et le 26/09/2026 a pu recevoir le
    // LIBELLÉ « Icône SVG intégrée à l'application » pour `entree_plan`.
  },
  "iconsEmbarquees": ["icon/ma-icone-perso.png"]
  // 🆕 v1.97.9 — CE QUE LE ZIP CONTIENT VRAIMENT sous `icon/`, écrit par le
  // Générateur, **même vide** : c'est sa PRÉSENCE qui dit à l'app de ne pas
  // sonder le serveur. Sans lui, `resoudreIconesPlanServeur` envoie une
  // requête par icône déclarée en `icon/…` à chaque ouverture du plan
  // (21 × 404 mesurées sur un relevé réel, ~188 ms à 150 ms de RTT, en
  // `await` avant le rendu des marqueurs) — parce que `icon/` est ambigu :
  // racine de l'app pour les icônes livrées, dossier du plan pour les
  // personnalisées. Absent = plan déjà déployé → sondage, comme avant.
  // ⚠️ NE PAS remplacer le sondage par « est-ce dans un catalogue ? » :
  // c'est ce qui a cassé `icon/iconetrack.png` en v1.86.2.
}
```

### Format point (data.json)

```json
{
  "data": [
    {
      "id":          "PA1",
      "nom":         "Puits Aération",
      "x":           4843,
      "y":           2002,
      "tags":        ["aeration", "ouvert", "pa"],
      "etat":        "Non inspectée",
      "description": "Puits avec courant d'air",
      "profondeur":  12,
      "date_update": "2026-04-03"
    }
  ]
}
```

→ **Identité stable (v2.1.0)** : chaque objet de carte (point, tracé, zone, structure) porte aussi
`"uid": "pt_lq3x9a_k2f8m1"` (préfixe `pt_`/`rd_`/`zn_`/`st_` = famille **à la création**, puis date
base 36 et 6 caractères aléatoires) et `"updatedAt": 1759572000000` (ms, mis à jour à chaque
modification). `id` d'un point **reste son nom** (photos, favoris, liaisons, Secours s'y réfèrent
encore jusqu'au lot C). Posés : par le Générateur et les imports KMZ/GPX/SIG sur les nouveaux plans ;
dans une session, par la migration à l'ouverture (`updatedAt` de repli = `savedAt` de la session) et
par le filet des 4 setters. **Jamais** dans KMZ, GPX ni l'export anonymisé. Absents des anciens plans
tant qu'ils ne sont pas régénérés. Unicité **par stockage** (un objet rapatrié d'un calque garde l'uid
de l'original). Module : `js/ktaUid.js` ; décisions : `docs/ETUDE_UID.md`.

### Format export session

```json
{
  "type":    "myktamap-session",
  "version": "1.0",
  "exported_at": "2026-05-08T10:00:00.000Z",
  "plan":    { "name": "Test 1", "version": "V1" },
  "editorPoints": [ ... ],
  "roads":   [ { "type": "principal", "points": [...] } ],
  "zones":   [ { "type": "eau",       "points": [...] } ],
  "measure": { "points": [...] },
  "customLegend": { "schemaVersion": 1, "labels": {...}, "hidden": [...], "customEntries": [...] }
}
```

→ **Mode Histoire dans le ZIP de session** : `noteLibre` (string inline) + `historeSessionPdfs` (**tableau** depuis v1.69.0 : `[{name, file: "mode-histoire/<nom>"}]`, un fichier par entrée dans le dossier `mode-histoire/` du ZIP, noms dédoublonnés). `historeSessionPdf` (objet unique = **premier** document) reste écrit pour que les versions antérieures relisent au moins un PDF ; à l'import, le tableau prime et le champ unique sert de repli. Les deux sont **omis** en export anonymisé.

→ **`customLegend`** (depuis v1.48.0) = état de légende personnalisée de l'utilisateur (renommages, masquages, types custom), sérialisé via `LegendCustomization.getSessionState()`. **Optionnel** : présent dans l'export complet, omis dans l'export « avancé » si l'état est vide. Restauré à l'import via `LegendCustomization.loadSessionState()` → rend la session **autoportante** même importée sur un ZIP « legacy » sans légende baked. Les **roads/zones n'ont pas d'`id`** (snapshot `{type, points, label?, level?, uid, updatedAt}` — `uid` depuis v2.1.0) ; l'id de zone utilisé par l'évitement d'itinéraire est **dérivé au runtime** (`z_<type>_<x>_<y>_<n>`), jamais écrit dans l'export.

### 🌀 Liaisons inter-plan (depuis v1.57.0)

**Registre central** `localStorage["myktamap_interplan_links_v1"]` (module `js/interPlanLinks.js`) — la « DB de croisement » entre plans. **Jamais** écrit dans les datalayers (le popup d'un point est enrichi au runtime par croisement `(planId, pointId||coords arrondies)`) :

```json
{
  "version": 1,
  "links": [
    {
      "id": "ipl_<ts36>_<rand>",
      "a": { "planId": "local_gm1_v2", "planName": "GM1", "pointId": "PA1",
             "pointNom": "Puits nord", "x": 4843, "y": 2002, "level": 0, "source": "session" },
      "b": { "planId": "server_data_oise", "planName": "Oise", "pointId": "",
             "pointNom": "Accès cave", "x": 120, "y": 88, "source": "data" },
      "createdAt": "2026-07-21T10:00:00.000Z"
    }
  ]
}
```

- Chaque côté = **snapshot** (affichable même si le plan cible est absent de l'appareil). `pointId` peut être vide (points data sans id) → croisement par coords arrondies.
- Les ids `PlanRegistry` étant **déterministes** (slug), les liaisons sont **portables entre appareils**.
- **Export session** (Full + Avancé) : clé racine `interPlanLinks` = liaisons du plan courant → réinjectées au registre à l'import (**fusion par id**, jamais de doublon).
- **Datalayer baked** : un point peut porter `interPlanLinks: [<link>]` dans son JSON → lu au popup (lecture seule, navigable, pas de 🗑️).
- Suppression d'un point session → `InterPlanLinks.onPointDeleted` purge le lien **entier** (hook `editor.js > supprimerPointEditor`).

### Format export liste de plans

```json
{
  "type":        "myktamap-plans-list",
  "version":     "1.0",
  "exported_at": "2026-05-08T10:00:00.000Z",
  "plans": [
    { "id": "server_data_test1", "type": "server", "path": "data/test1", ... }
  ]
}
```

→ **Les `fsHandleId` ne sont PAS exportés** (non portables entre appareils/sessions).

---


### 📄 PDF Histoire embarqués — `plan.histoirePdf` / `plan.histoirePdfs` (v1.71.0)

- **`plan.histoirePdfs`** (tableau, depuis v1.71.0) : chemins relatifs `"data/<nom>.pdf"` des PDF embarqués par le générateur (multi-upload, noms sanitizés + dédoublonnés `-2`, `-3`…).
- **`plan.histoirePdf`** (chaîne, historique) : TOUJOURS écrit = **premier élément** du tableau → une app antérieure à v1.71.0 lit au moins le premier document.
- ⚠️ Lecteurs : préférer le tableau, replier sur la chaîne, **ne jamais concaténer les deux** (doublon garanti). `config.js` résout chaque entrée via `getRuntimeAssetUrl` ; `modeHistoire._getEmbeddedPdfUrls()` liste N entrées 📕 (ids `__embed__<i>`, non supprimables) ; `homeLoader._addPath` collecte chaque chemin (assets runtime ZIP).
- Aucun PDF → les deux champs **absents** (rétrocompat stricte inchangée).

---

## 🆕 Champs ajoutés de la v1.83.0 à la v1.85.0

### `plan.niveauxProfondeur` (v1.83.0) — plan-config.json

```json
"plan": { "niveauxProfondeur": { "0": 0, "-1": -5, "-2": -12, "1": null } }
```

Profondeur **sous la surface**, en mètres, par niveau. **Trois états, et la distinction porte du sens** :

| État | Sens |
|---|---|
| clé **absente** | non renseigné — l'état de tout plan d'avant la v1.83.0, qu'on n'invente pas |
| **nombre** | profondeur connue (négatif vers le bas) |
| **`null`** | « sans profondeur » — le niveau existe mais n'a pas d'altitude |

🩸 Le `null` n'est pas un trou de saisie : c'est le niveau que l'import SIG donne au **topo historique**. Ce n'est pas un étage physique au-dessus, c'est une **convention d'empilement** pour séparer deux relevés du même endroit. Lui donner une altitude fausserait tout profil en long qui le traverse.

### `calquesSession` (v1.85.0) — payload de session

```json
"calquesSession": { "rapatries": ["sig"] }
```

Les ids des **calques de données rapatriés** dans la session (cf. `session-data.md`). Ne porte QUE la liste : les objets, eux, vivent déjà dans `roads` / `zones` / `structures` / `editorPoints`, marqués `_srcCalque`. **`null` tant que rien n'est rapatrié** → zéro octet dans `localStorage` pour qui ne s'en sert pas.

⚠️ **Absent du fichier session exporté** (sauvegarde locale uniquement). À l'import, la liste est **reconstruite depuis les marques `_srcCalque`** des objets (`CalqueSession.resynchroniser`) — elle ne peut donc pas contredire les copies.

### `_srcCalque` (v1.85.0) — marqueur d'objet, session UNIQUEMENT

Porté par chaque objet copié depuis un calque. C'est lui qui rend le retour possible (on sait quoi retirer) et l'export capable de ne réémettre que le contenu du calque.

⚠️ **Il est RETIRÉ à l'export** (`CalqueSession.exporterCalque`) : c'est un outil interne de session, il n'a rien à faire dans le ZIP d'un plan qu'on partage.

🩸 **Rappel du piège de fond** : *roads* et *zones* n'ont toujours **pas d'`id`**. C'est la raison pour laquelle le rapatriement porte sur le **calque entier** et non objet par objet — une clé dérivée de la géométrie serait cassée en silence par le dédoublonneur de l'Éditeur de données, qui retire les sommets consécutifs identiques.
