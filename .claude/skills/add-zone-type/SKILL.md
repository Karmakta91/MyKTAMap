---
name: add-zone-type
description: Ajouter un nouveau type de zone polygonale à MyKTAMap (~25 sites à toucher, facile d'en oublier). À utiliser quand on veut un nouveau type au-delà de eau / masse-sol / remblais / effondrement / inaccessible / pente.
---

# Ajouter un type de zone (~25 sites)

Types actuels : `eau`, `masse-sol`, `remblais` (Comblé), `effondrement`, `inaccessible`, `pente` (zone jonction). Le
dernier ajouté (`masse-sol`) a servi de relevé : un `grep` large sur `"effondrement"` ET sur `remblais` (js/, lang/,
scripts/, docs/applications/) est le meilleur filet.

```
grep -rln "effondrement" js/ index.html css/ lang/ scripts/ docs/applications/
grep -rln "remblais" js/ scripts/ docs/applications/
```

Sites à couvrir :

1. **Style** : `js/styleResolver.js > CANON.zones.<type>` (jamais de table locale : `check-style-canon.js`). Motif en
   `CanvasPattern` par `_motif` (hachures de `inaccessible` ; grains par cran de `masse-sol`, `genre: "grains"`), aplat
   de repli `_flatFill` / `_flatFillOpacity` ; empilement dans `KTA_ORDRE_ZONES` (une seule table, lue par la carte,
   les zones embarquées et les exports).
2. **Saisie** : `js/zones.js` (libellés `_typeLabel` ×2, titres de fiche `_zoneEmojis` / `LBL`) ; `js/interface.js` (bouton
   du groupe Zones, pastille `_iconeType`).
3. **Icône** : sans émoji qui dise le type (police « KTA Emoji » : un émoji neuf = police régénérée), une icône dans
   `js/ktaIcones.js > TRACES` et, pour l'Aide, une règle `DOC` ciblée sur un émoji existant (ex. `⬛` suivi du nom).
4. **Légende** : `js/legendCustomization.js > DEFAULT_LABELS.zones`, `js/interfaceLegende.js > _ligneZone` ; clé
   `legend.label.zones.<type>` (fr / en / es).
5. **Filtres, stats, recherche** : `js/filterPanel.js` (liste des types, émoji de repli), `js/refonteInterface.js`
   (stats, liste de session), `js/searchPoints.js`.
6. **Zones embarquées** : `js/utils.js` (titres et émoji en lecture seule ; champs propres au type recopiés dans le
   registre `_ktaDataPolygons` ET `getAllEmbeddedZones`).
7. **Exports** : `js/exporter.js` (~13 sites : comptes, cases `ann_zones_*`, filtres, légende de repli),
   `js/sessionExporter.js` (~10 : `adv_` / `conv_` / `kmz_inc_zones_*`), `js/pdfExport.js` (`zonesTypes`).
8. **Échanges** : `js/kmzExport.js` (style `#zone_<type>` automatique ; champs en `mkm:…`), `js/kmzImport.js` (motif
   `#zone_(…)` + relecture des `mkm:`), `js/geojsonExport.js` (propriétés), `js/sigImport.js` (synonymes, défaut),
   `js/createConf.js` (options des imports KMZ / SIG du Générateur, `_SIG_TYPES`).
9. **Champ propre au type** (comme `comble`) : fiche (`utils.js > attacherNotePopup`, bloc type `_combleHtml`),
   `js/convertirObjet.js` (setteur avec historique, retiré par `_versType` au changement de type, validation de
   `appliquerTableau`), `js/tableEditor.js` (colonne + éditeur dédié).
10. **Palettes délibérées** : `emergencyMode.js` et `osmView.js` se replient sur le canon ; `osmHomePreview.js >
    ZONE_STYLES_DATA_HOME` (palette par plan) à compléter.
11. **Effets** si le type en a : vue 3D (`vue3d.js`, branches par type, sinon aplat « types perso » ;
    `galerieEmprise.js > ZONES_BOUCHENT`), itinéraire (`pathfinder.js`), brancard (`secoursMode.js`), volume
    (`volumeExploite.js`).
12. **Garde-fous à ajuster** : `check-style-resolver.js` (nombre de types), `check-kml-styles.js` (`REFERENCE` figée) ;
    un garde-fou propre au type si un champ voyage (modèle : `check-masse-sol.js`).
13. **Doc** : `AI_CONTEXT.md` (**liste fermée** des types de zones, anti-hallucination), guides fr / en / es + Aide
    (`aide.sec.zones.html` ×3), `data-formats.md` (champ propre), `multilevel-pathfinding.md` §31.7, `README.md`
    (journal).

## Rappels
- ⚠️ `AI_CONTEXT.md` contient une **liste fermée** des types de zones : la mettre à jour sinon l'aide IA dira que le
  type n'existe pas.
- Penser aux **4 pipelines d'export** (PNG rapide, PNG avancé/PDF, session, KMZ) — cf. `docs/architecture/exports.md`.

📖 Détail : `docs/architecture/multilevel-pathfinding.md` (§31.7).
