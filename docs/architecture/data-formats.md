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

→ **`customLegend`** (depuis v1.48.0) = état de légende personnalisée de l'utilisateur (renommages, masquages, types custom), sérialisé via `LegendCustomization.getSessionState()`. **Optionnel** : présent dans l'export complet, omis dans l'export « avancé » si l'état est vide. Restauré à l'import via `LegendCustomization.loadSessionState()` → rend la session **autoportante** même importée sur un ZIP « legacy » sans légende baked. Les **roads/zones n'ont pas d'`id`** (snapshot brut `{type, points, label?, level?}`) ; l'id de zone utilisé par l'évitement d'itinéraire est **dérivé au runtime** (`z_<type>_<x>_<y>_<n>`), jamais écrit dans l'export.

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
