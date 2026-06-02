---
name: add-zone-type
description: Ajouter un nouveau type de zone polygonale à MyKTAMap (~13 sites à toucher, facile d'en oublier). À utiliser quand on veut un 5e+ type de zone au-delà de eau/remblais/effondrement/inaccessible.
---

# Ajouter un type de zone (~13 sites)

Les zones n'ont que 4 types (eau / remblais / effondrement / inaccessible). En ajouter un touche **~13 endroits**. Un `grep` large sur `"effondrement"` est le meilleur filet pour ne rien oublier.

```
grep -rn "effondrement" js/ index.html css/
```

Sites à couvrir :

1. `js/zones.js` → `ZONE_STYLES` (color/fillColor/fillOpacity)
2. `js/zones.js` → `ordreType` (ordre d'affichage = z-index logique)
3. `js/interface.js` → `_creerGroupeAccordeon zones` (bouton sous-action)
4. `js/interface.js` → Aide intégrée (ligne descriptive)
5. `js/utils.js` → `ZONE_STYLES_DATA` + `ZONE_STYLES_EMBED` + `ZONE_STYLES_EXPORT`
6. `js/utils.js` → `ajouterPointsDepuisJSON > zonesTriees` (ordre embedded)
7. `js/utils.js` → `telechargerPlan` (tri zones session — export PNG rapide)
8. `js/exporter.js` → `_compterTypes / hasZones / zoneLabels / ordre / filtreZ` + checkboxes `ann_zones_*` (~10 sites)
9. `js/sessionExporter.js` → `_trierParType` (×3) / `syncParent` (×2) / filtres `zoneTypes` + checkboxes `adv_zones_* / conv_zones_*`
10. `index.html` → pattern SVG si rendu spécial (cf. `kta-pattern-inaccessible`)
11. `css/style.css` → styles spécifiques si besoin
12. `js/pathfinder.js` → helper de détection si la zone est **bloquante** pour l'itinéraire
13. **Doc** : `docs/architecture/multilevel-pathfinding.md` + `docs/applications/AI_CONTEXT.md` (liste anti-hallucination) + `README_USER.md` + `README.md` (journal)

## Rappels
- ⚠️ `AI_CONTEXT.md` contient une **liste fermée** des types de zones (anti-hallucination) : la mettre à jour sinon l'aide IA dira que le type n'existe pas.
- Penser aux **4 pipelines d'export** (PNG rapide, PNG avancé/PDF, session, KMZ) — cf. `docs/architecture/exports.md`.

📖 Détail : `docs/architecture/multilevel-pathfinding.md` (§31.7).
