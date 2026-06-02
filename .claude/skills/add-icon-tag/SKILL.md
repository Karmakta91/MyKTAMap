---
name: add-icon-tag
description: Ajouter un nouveau tag d'icône POI à MyKTAMap (checklist 7 sites à toucher, sinon régression silencieuse). À utiliser quand on veut ajouter un type de point/icône (ex. fontaine, échelle...).
---

# Ajouter un tag d'icône (checklist 7 étapes)

La résolution d'icône est centralisée mais l'ajout d'un tag touche **7 endroits**. En oublier un = régression silencieuse (icône manquante en légende, export ou offline).

Pour un nouveau tag `fontaine` (exemple) :

1. **PNG 50×50 transparent** → `icon/fontaine.png`
2. `js/map.js` → `TAGS_BUILTIN` : ajouter `fontaine: "icon/fontaine.png"`
3. `js/editor.js` → `EDITOR_TAG_LABELS` : ajouter `fontaine: "Fontaine"`
4. `js/interface.js` → `LEGENDE_LABELS` + le bon groupe dans le tableau `GROUPES`
5. `js/exporter.js` → `LBL` local + groupe dans `GROUPES_ICONES`
6. `js/createConf.js` → `PLANNER_DEFAULT_ICONS` : ajouter le chemin
7. `sw.js` → `ASSETS_TO_CACHE` : ajouter `"./icon/fontaine.png"` (sinon pas servi offline)

## Vérifs
- Le tag devient utilisable sur les **plans existants** sans toucher leurs `plan-config.json` (cascade `_iconMap`).
- Résolution unique via `window._iconMap[tag]` / `getIconUrlForPoint` — ne PAS recréer de global `iconeXxx`.
- Convention de nommage : 2-3 lettres + `o`/`f` pour ouvert/fermé, ou mot court.

📖 Détail cascade : `docs/architecture/rendering-leaflet.md` (§2).
