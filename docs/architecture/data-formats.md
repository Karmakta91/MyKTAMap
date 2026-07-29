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
    "startX": 345, "startY": 519, "scale": 4.9,
    "stepLength": 0.7, "stepThreshold": 13, "stepCooldown": 400
  },
  "icons": {
    "default": "icon/iconetrack.png",
    "track":   "icon/iconetrack.png",
    "pa":      "icon/pa.png"
    // Les tags listés dans TAGS_BUILTIN sont auto-résolus
  }
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

→ **`customLegend`** (depuis v1.48.0) = état de légende personnalisée de l'utilisateur (renommages, masquages, types custom), sérialisé via `LegendCustomization.getSessionState()`. **Optionnel** : présent dans l'export complet, omis dans l'export « avancé » si l'état est vide. Restauré à l'import via `LegendCustomization.loadSessionState()` → rend la session **autoportante** même importée sur un ZIP « legacy » sans légende baked. Les **roads/zones n'ont pas d'`id`** (snapshot brut `{type, points, label?, level?}`) ; l'id de zone utilisé par l'évitement d'itinéraire est **dérivé au runtime** (`z_<type>_<x>_<y>_<n>`), jamais écrit dans l'export.

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
