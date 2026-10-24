---
name: add-icon-tag
description: Ajouter un nouveau tag d'icône POI à MyKTAMap (checklist 8 sites + i18n à toucher, sinon régression silencieuse). À utiliser quand on veut ajouter un type de point/icône (ex. fontaine, échelle...).
---

# Ajouter un tag d'icône (checklist 8 étapes + i18n)

La résolution d'icône est centralisée mais l'ajout d'un tag touche **8 endroits + les dicos i18n**. En oublier un = régression silencieuse (icône manquante en légende, export ou offline).

Pour un nouveau tag `fontaine` (exemple) :

1. **PNG 128×128 transparent** → `icon/fontaine.png` (gabarit du jeu existant ; variante « fermé » = même dessin + barre rouge)
2. `js/map.js` → `TAGS_BUILTIN` : ajouter `fontaine: "icon/fontaine.png"`
3. `js/editor.js` → `EDITOR_TAG_LABELS` : ajouter `fontaine: "Fontaine"`
4. `js/interfaceLegende.js` → `LEGENDE_LABELS` + le bon groupe dans le tableau `GROUPES` (⚠️ **2 occurrences** du tableau — mettre à jour les deux ; ex-`interface.js`, extrait en v1.31.0 P3 Lot 3)
5. `js/exporter.js` → groupe dans `GROUPES_ICONES` (les libellés passent par LegendCustomization, plus de `LBL` local)
6. `js/createConf.js` → `PLANNER_DEFAULT_ICONS` : ajouter le chemin
7. `sw.js` → `ASSETS_TO_CACHE` : ajouter `"./icon/fontaine.png"` (sinon pas servi offline)
8. `js/legendCustomization.js` → `DEFAULT_LABELS.icones` : ajouter `fontaine: "Fontaine"` (cascade légende session > plan > default — sinon la clé brute s'affiche dans l'éditeur de légende ; site découvert en v1.59.0 avec le tag `portail`)

## i18n (fr + en + es)
Les libellés sont résolus au rendu via des clés dynamiques — ajouter dans `lang/fr.json`, `lang/en.json`, `lang/es.json` :
- `"editor.tag.fontaine"` (label dans le sélecteur de tag de l'éditeur)
- `"legendui.label.fontaine"` (label légende quand LegendCustomization absent)
- `"legend.label.icones.fontaine"` (libellé traduit de la légende personnalisable)

## Vérifs
- Le tag devient utilisable sur les **plans existants** sans toucher leurs `plan-config.json` (cascade `_iconMap`).
- Résolution unique via `window._iconMap[tag]` / `getIconUrlForPoint` — ne PAS recréer de global `iconeXxx`.
- Convention de nommage : 2-3 lettres + `o`/`f` pour ouvert/fermé, ou mot court.
- Astuce icône : générable en Python/Pillow (supersampling 512×512 → LANCZOS 128×128), charte : disque `#1a1f2e`, accents `#f4c542`/`#8cb4ff` (cf. `icon/portail.png`).

📖 Détail cascade : `docs/architecture/rendering-leaflet.md` (§2).
