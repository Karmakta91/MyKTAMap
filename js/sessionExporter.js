// =========================
// SESSION EXPORTER — Modale d'export de session avec 3 modes
// =========================
// Modes disponibles :
//   • 🚀 Full       — points + tracés + zones + structures + mesure + tracker (timeline GPS si présente)
//   • 🎨 Avancé     — sélection fine + sortie 1 fichier ou ZIP multi-fichiers
//                     (peut inclure le tracker en option)
//   • 🔄 Conversion — convertit en calque de données (devmap-data) prêt à
//                     intégrer dans plan-config.json
//
// Entrée publique : window.ouvrirExportSessionModal()
// =========================

(function() {
  "use strict";

  // i18n helper — résout au RENDU (jamais au load). Fallback FR via I18n
  // (clé brute si dico absent). Interpolation {param} via 2e arg.
  function t(key, params) {
    return (window.I18n && typeof window.I18n.t === "function")
      ? window.I18n.t(key, params)
      : key;
  }

  let _modal = null;
  let _activeTab = "full"; // "full" | "advanced" | "conversion" | "extern" | "fusion"

  // 🔗 Fusion de datalayers (v1.55.0) : ingère N fichiers data layer (.json/.zip),
  // concatène par CATÉGORIE de contenu (data/roads/zones/structures) et ressort
  // un fichier par type. _fusionInputs = [{name, json}] ; _fusionMerged = résultat
  // + dupIds (ids POI en double détectés, concat brut conservé — alerte seulement).
  let _fusionInputs = [];
  let _fusionMerged = null;
  // Mode "solo" : modale focalisée sur un seul onglet (barre masquée), ex. le
  // fusionneur ouvert depuis l'accueil via ouvrirExportSessionModal("fusion", true).
  let _soloTab = false;

  // v1.14.1 — onglet unifié "📡 Export externe" (KMZ + GPX partagent
  // le même calibrage GPS 2 points). Persisté côté localStorage pour
  // ré-ouvrir sur le dernier format choisi.
  const _EXTERN_FMT_KEY = "myktamap_extern_format_v1";
  let _externFormat = (function() {
    try {
      const v = localStorage.getItem(_EXTERN_FMT_KEY);
      return (v === "gpx" || v === "kmz") ? v : "kmz";
    } catch(e) { return "kmz"; }
  })();

  // État de l'onglet Conversion (bidirectionnel depuis 08/05/2026)
  let _convDirection      = "ed2data"; // "ed2data" (session→data) | "data2ed" (data→session)
  let _convUploadedJson   = null;      // JSON parsé du fichier uploadé (mode data2ed)
  let _convUploadedName   = "";        // nom du fichier uploadé (mode data2ed)
  let _convUploadedPhotos = null;      // 🆕 v1.9.3-B1d++ : Array<{id, pointId, mime, size, blob}>
                                       // si l'input est un ZIP data layer avec photos/, sinon null

  // ========== STYLES ==========
  function _injecterStyles() {
    if (document.getElementById("kta-session-export-styles")) return;
    const s = document.createElement("style");
    s.id = "kta-session-export-styles";
    s.textContent = `
      #kta-session-export-modal .kta-readme-modal-boite {
        max-width: 560px; width: 95%;
        display: flex; flex-direction: column;
        max-height: 90vh;
      }

      .kta-ses-tabs {
        display: flex;
        gap: 4px;
        padding: 12px 18px 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        background: var(--bg-modal, #1a1f2e);
      }
      .kta-ses-tab {
        flex: 1;
        padding: 10px 8px;
        background: transparent;
        color: #8892a4;
        border: 1px solid transparent;
        border-radius: 6px 6px 0 0;
        cursor: pointer;
        font-size: 13px;
        font-family: inherit;
        font-weight: 500;
        transition: all 0.12s;
      }
      .kta-ses-tab:hover {
        color: #c0c8d8;
        background: rgba(140,180,255,0.05);
      }
      .kta-ses-tab.active {
        color: #8cb4ff;
        background: rgba(140,180,255,0.1);
        border-color: rgba(140,180,255,0.3);
        border-bottom-color: transparent;
      }

      .kta-ses-content {
        padding: 18px;
        overflow-y: auto;
        flex: 1;
      }

      .kta-ses-intro {
        font-size: 13px;
        color: #c0c8d8;
        margin-bottom: 16px;
        line-height: 1.5;
      }

      .kta-ses-section {
        margin-bottom: 18px;
      }
      .kta-ses-section-title {
        font-size: 12px;
        font-weight: 600;
        color: #8cb4ff;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
      }

      .kta-ses-cb-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 4px;
        font-size: 13px;
        color: #e8eaf0;
        cursor: pointer;
        border-radius: 4px;
      }
      .kta-ses-cb-row:hover {
        background: rgba(140,180,255,0.06);
      }
      .kta-ses-cb-row input[type="checkbox"] {
        width: 16px; height: 16px;
        cursor: pointer;
        accent-color: #8cb4ff;
      }
      .kta-ses-cb-row .kta-ses-count {
        color: #8892a4;
        font-size: 12px;
      }
      .kta-ses-cb-sub {
        margin-left: 28px;
        font-size: 12px;
      }

      .kta-ses-radio-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 4px;
        font-size: 13px;
        color: #e8eaf0;
        cursor: pointer;
        border-radius: 4px;
      }
      .kta-ses-radio-row:hover {
        background: rgba(140,180,255,0.06);
      }
      .kta-ses-radio-row input[type="radio"] {
        accent-color: #8cb4ff;
      }
      .kta-ses-radio-row .kta-ses-radio-hint {
        color: #8892a4;
        font-size: 12px;
        margin-left: 4px;
      }

      .kta-ses-summary {
        background: rgba(140,180,255,0.06);
        border: 1px solid rgba(140,180,255,0.18);
        border-radius: 6px;
        padding: 12px 14px;
        font-size: 13px;
        color: #c0c8d8;
        line-height: 1.7;
      }
      .kta-ses-summary strong {
        color: #e8eaf0;
      }
      .kta-ses-summary .kta-ses-zero {
        color: #8892a4;
        font-style: italic;
      }

      .kta-ses-empty {
        text-align: center;
        padding: 20px;
        color: #ff8888;
        font-size: 13px;
      }

      .kta-ses-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        padding: 14px 18px;
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      .kta-ses-btn {
        padding: 10px 18px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-size: 13px;
        font-family: inherit;
        font-weight: 600;
        transition: all 0.12s;
      }
      .kta-ses-btn-primary {
        background: #8cb4ff;
        color: #1a1f2e;
      }
      .kta-ses-btn-primary:hover {
        background: #aac6ff;
      }
      .kta-ses-btn-primary:disabled {
        background: rgba(140,180,255,0.3);
        color: rgba(255,255,255,0.4);
        cursor: not-allowed;
      }
      .kta-ses-btn-secondary {
        background: rgba(255,255,255,0.06);
        color: #c0c8d8;
        border: 1px solid rgba(255,255,255,0.12);
      }
      .kta-ses-btn-secondary:hover {
        background: rgba(255,255,255,0.1);
      }

      /* 🌍 v169 (Karma_dev) : Onglet KMZ — calibrage 2 points + aperçu coins */
      .kta-kmz-section {
        margin: 14px 0;
        padding: 10px 12px;
        background: rgba(140,180,255,0.04);
        border: 1px solid rgba(140,180,255,0.18);
        border-radius: 6px;
      }
      .kta-kmz-section-titre {
        font-size: 13px;
        font-weight: 600;
        color: #8cb4ff;
        margin-bottom: 8px;
      }
      .kta-kmz-pt-grille {
        display: grid;
        grid-template-columns: auto 1fr auto 1fr;
        gap: 6px 8px;
        align-items: center;
        margin-bottom: 8px;
      }
      .kta-kmz-lbl {
        font-size: 12px;
        color: #8892a4;
        text-align: right;
      }
      .kta-kmz-input {
        font-family: monospace;
        font-size: 12.5px;
        padding: 4px 8px;
      }
      .kta-kmz-pt-actions {
        display: flex;
        gap: 6px;
        margin-bottom: 4px;
      }
      .kta-kmz-search-results {
        margin-top: 6px;
        padding: 8px;
        background: rgba(0,0,0,0.25);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 4px;
        max-height: 200px;
        overflow-y: auto;
      }
      /* Item de résultat dans le panneau de recherche (calibrage KMZ).
         Pas de classe .kta-iti-search-result en CSS (incohérence historique
         avec .kta-iti-search-item) — on isole donc avec une classe dédiée KMZ. */
      .kta-kmz-search-item {
        padding: 6px 10px;
        margin: 2px 0;
        cursor: pointer;
        border-radius: 4px;
        font-size: 12.5px;
        color: #c8d0e0;
        transition: background 0.12s;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px;
      }
      .kta-kmz-search-item:hover {
        background: rgba(140,180,255,0.14);
        color: #e8eaf0;
      }
      .kta-kmz-search-item strong {
        color: #8cb4ff;
        font-weight: 600;
      }
      .kta-kmz-search-item .kta-kmz-search-meta {
        color: #8892a4;
        font-size: 11px;
      }
      .kta-kmz-search-empty {
        padding: 8px 10px;
        color: #8892a4;
        font-style: italic;
        font-size: 12px;
        text-align: center;
      }
      .kta-kmz-apercu {
        padding: 8px 10px;
        background: rgba(0,0,0,0.20);
        border-radius: 4px;
        font-size: 12px;
        color: #c8d0e0;
      }
      .kta-kmz-coins-grille {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 12px;
      }
      .kta-kmz-coins-grille code {
        font-size: 11px;
        color: #f4c542;
      }
      .kta-kmz-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
      }
      .kta-kmz-chip-niveau {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        font-size: 12px;
        color: #c8d0e0;
        cursor: pointer;
      }
      .kta-kmz-chip-niveau:hover {
        background: rgba(140,180,255,0.10);
        border-color: rgba(140,180,255,0.35);
      }
      .kta-kmz-chip-niveau input[type="checkbox"] {
        accent-color: #8cb4ff;
      }
      .kta-kmz-opacity-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 4px 0 8px 28px;
        padding: 4px 6px;
        font-size: 12px;
        color: #c0c8d8;
      }
      .kta-kmz-opacity-row.disabled {
        opacity: 0.4;
        pointer-events: none;
      }
      .kta-kmz-opacity-lbl {
        color: #8892a4;
        white-space: nowrap;
      }
      .kta-kmz-opacity-slider {
        flex: 1;
        min-width: 120px;
        accent-color: #8cb4ff;
        cursor: pointer;
      }
      .kta-kmz-opacity-val {
        font-family: monospace;
        font-size: 12px;
        color: #f4c542;
        min-width: 36px;
        text-align: right;
      }

      /* 📡 v1.14.1 — Sélecteur de format (KMZ/GPX) en pills segmentées */
      .kta-ses-format-pills {
        display: flex;
        gap: 4px;
        padding: 4px;
        background: rgba(0,0,0,0.25);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        margin-bottom: 8px;
      }
      .kta-ses-fmt-pill {
        flex: 1;
        padding: 8px 12px;
        background: transparent;
        color: #8892a4;
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-family: inherit;
        font-weight: 600;
        transition: all 0.12s;
      }
      .kta-ses-fmt-pill:hover {
        color: #c0c8d8;
        background: rgba(140,180,255,0.06);
      }
      .kta-ses-fmt-pill.active {
        background: linear-gradient(180deg, rgba(140,180,255,0.25), rgba(140,180,255,0.12));
        color: #e8eaf0;
        border-color: rgba(140,180,255,0.45);
        box-shadow: 0 1px 0 rgba(140,180,255,0.15) inset;
      }
      .kta-ses-fmt-desc {
        font-size: 12px;
        color: #a8b2c4;
        margin: 4px 2px 0;
        line-height: 1.5;
      }
      .kta-ses-fmt-desc strong {
        color: #e8eaf0;
      }

      /* Theme light : sélecteur format + onglets unifiés */
      body.kta-theme-light .kta-ses-format-pills,
      html.kta-theme-light .kta-ses-format-pills {
        background: rgba(0,0,0,0.05);
        border-color: rgba(0,0,0,0.12);
      }
      body.kta-theme-light .kta-ses-fmt-pill,
      html.kta-theme-light .kta-ses-fmt-pill {
        color: #6b5e3a;
      }
      body.kta-theme-light .kta-ses-fmt-pill:hover,
      html.kta-theme-light .kta-ses-fmt-pill:hover {
        background: rgba(244,197,66,0.12);
        color: #3a2f15;
      }
      body.kta-theme-light .kta-ses-fmt-pill.active,
      html.kta-theme-light .kta-ses-fmt-pill.active {
        background: linear-gradient(180deg, #f4c542, #e8b537);
        color: #3a2f15;
        border-color: #c99a1f;
      }
      body.kta-theme-light .kta-ses-fmt-desc,
      html.kta-theme-light .kta-ses-fmt-desc {
        color: #6b5e3a;
      }
      body.kta-theme-light .kta-ses-fmt-desc strong,
      html.kta-theme-light .kta-ses-fmt-desc strong {
        color: #3a2f15;
      }
      /* 🔗 Fusion datalayers (v1.55.0) */
      .kta-fusion-list { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
      .kta-fusion-file { display: flex; justify-content: space-between; gap: 10px;
        padding: 6px 10px; background: rgba(140,180,255,0.07); border-radius: 6px;
        font-size: 0.86em; }
      .kta-fusion-file-name { color: #c8d0e0; word-break: break-all; }
      .kta-fusion-file-cats { color: #8892a4; white-space: nowrap; }
      .kta-fusion-clear-btn { float: right; background: none; border: 1px solid #8892a4;
        color: #c8d0e0; border-radius: 6px; padding: 1px 8px; font-size: 0.8em; cursor: pointer; }
      .kta-fusion-clear-btn:hover { border-color: #ff8c8c; color: #ff8c8c; }
      .kta-fusion-warn { margin-top: 8px; padding: 8px 10px; border-radius: 6px;
        background: rgba(244,197,66,0.12); border: 1px solid rgba(244,197,66,0.4);
        color: #f4c542; font-size: 0.86em; }
    `;
    document.head.appendChild(s);
  }

  // ========== ENTRÉE PUBLIQUE ==========
  window.ouvrirExportSessionModal = function(initialTab, solo) {
    _injecterStyles();
    if (_modal) { _modal.remove(); _modal = null; }
    // initialTab optionnel (ex. "fusion" depuis le home) ; défaut "full".
    const TABS = ["full", "advanced", "conversion", "fusion", "extern"];
    _activeTab = (typeof initialTab === "string" && TABS.indexOf(initialTab) >= 0) ? initialTab : "full";
    // solo = true → modale focalisée sur un seul onglet (barre d'onglets masquée
    // + titre = libellé de l'onglet), ex. le fusionneur ouvert depuis l'accueil.
    _soloTab = !!solo && TABS.indexOf(_activeTab) >= 0;
    _afficherModal();
  };

  // v1.14.12 → v1.14.17 : exposition window.SessionExporterStyles.inject
  // retirée. La modale Import a été repensée en v1.14.17 pour utiliser
  // exclusivement des classes CSS statiques (pattern .kta-conv-sens-* de
  // exporter.js). Plus aucun module externe ne dépend de cet injecteur,
  // les styles .kta-ses-* restent purement internes à sessionExporter.

  // ========== COMPTAGES ==========
  function _compter() {
    return {
      points:    window.getEditorPoints  ? window.getEditorPoints()  : [],
      roads:     window.getRoads         ? window.getRoads()         : [],
      zones:     window.getZones         ? window.getZones()         : [],
      // 🆕 v1.9.3-A1.a : structures (piliers + murs) incluses dans
      // l'export session. Rétrocompat : si getStructures n'existe pas
      // (ancien build), retourne array vide → pas de breakage.
      structures: window.getStructures   ? window.getStructures()    : [],
      // 🆕 v1.9.3-A1.b.2.5 (KARMA "qu'il soit exporter dans l'export
      // session") : mesure de distance dans l'export. Avant, elle était
      // explicitement EXCLUE du mode Full / Avancé (commentaire ligne 5
      // "sans mesure"). Maintenant incluse car KARMA en a besoin pour
      // retrouver ses mesures entre sessions / appareils.
      mesure:        window.getMeasurePoints        ? window.getMeasurePoints()        : [],
      // 🆕 v1.12.0-fix (KARMA "on peut faire en // 1 calcul de surface et 1
      // de distance ... attention à ne pas mélanger") : la mesure de surface
      // est désormais persistée séparément. Sans ce champ, l'export session
      // perdrait le polygone surface au re-import.
      mesureSurface: window.getMeasurePointsSurface ? window.getMeasurePointsSurface() : [],
      trackerOk: !!(window.getTrackingPosition && window.getTrackingPosition()),
      trackerPath: window.getTrackingPath ? window.getTrackingPath() : [],
      // 🆕 v1.21.2 (KARMA "tu enrengister dans export session le tracker ?
      // si non fait le") : timeline temporelle complète (persistée depuis
      // v1.21.2 dans SessionPersist) + startTs. C'est ce qui permet aux
      // exports session de transporter aussi l'historique GPS daté de
      // l'user (= heatmap multi-sessions / replay multi-appareils).
      // Ces champs s'ajoutent à trackerPath (rendu Leaflet runtime) sans
      // le remplacer — pour rétrocompat avec sessions exportées avant
      // v1.21.2. NB : exclu volontairement de la conversion data layer
      // (ed2data) qui reste un format "devmap-data lecture seule".
      trackerTimeline: (typeof window.getTrackingTimeline === "function")
                         ? (window.getTrackingTimeline() || [])
                         : [],
      trackerStartTs:  (typeof window.getTrackingStartTs === "function")
                         ? (window.getTrackingStartTs() || null)
                         : null
    };
  }

  function _trierParType(arr, validTypes) {
    const out = {};
    validTypes.forEach(function(t) { out[t] = []; });
    out.autres = [];
    (arr || []).forEach(function(item) {
      if (validTypes.indexOf(item.type) >= 0) out[item.type].push(item);
      else out.autres.push(item);
    });
    return out;
  }

  // 🐛 v1.76.0 — DÉVERSOIR DU BUCKET `autres`.
  // `_trierParType` range tout type non built-in dans `out.autres`, et les
  // appelants n'itéraient QUE sur `validTypes` : le bucket n'était écrit dans
  // aucun fichier. Conséquence mesurée : en granularité « fine », TOUS les
  // objets d'un type CUSTOM disparaissaient de l'export de calque de données,
  // sans un log ni un avertissement. C'est le même défaut qui avait déjà
  // effacé les `jonction` (corrigé en v169) — en pire, parce qu'un type custom
  // est une création de l'utilisateur, pas un built-in qu'on peut redessiner.
  //
  // On émet un fichier par type restant, comme pour les built-in : la
  // granularité fine tient enfin sa promesse. Le groupement se fait sur le
  // type BRUT (deux types distincts ne doivent jamais fusionner) ; seul le nom
  // de fichier est assaini.
  function _emettreTypesRestants(items, prefixe, cleTableau, files) {
    if (!items || !items.length) return;
    const parType = new Map();
    items.forEach(function(it) {
      const t = String(it.type || "inconnu");
      if (!parType.has(t)) parType.set(t, []);
      parType.get(t).push(it);
    });
    let n = 0;
    parType.forEach(function(liste, type) {
      const nomSur = type.replace(/[^A-Za-z0-9_-]/g, "_");
      const payload = { data: [] };
      payload[cleTableau] = liste;
      files.push({ name: prefixe + "_" + nomSur + ".json", payload: payload });
      n += liste.length;
    });
    console.log("[SessionExport] granularité fine — " + n + " objet(s) de " + parType.size +
                " type(s) hors built-in émis dans " + prefixe + "_*.json");
  }

  // Liste tous les tags présents dans les points avec leur compte.
  // Un point peut avoir plusieurs tags → il sera compté dans chacun.
  // Cas spécial : points sans tag → catégorie "(sans tag)".
  // Retourne [{ tag, count, isUntagged }] trié alphabétiquement, sans tag à la fin.
  function _listerTagsPoints(points) {
    const tagCounts = {};
    let untaggedCount = 0;

    (points || []).forEach(function(p) {
      const tags = Array.isArray(p.tags) ? p.tags.filter(function(t) { return t && String(t).trim(); }) : [];
      if (tags.length === 0) {
        untaggedCount++;
      } else {
        tags.forEach(function(t) {
          const k = String(t);
          tagCounts[k] = (tagCounts[k] || 0) + 1;
        });
      }
    });

    const list = Object.keys(tagCounts).sort().map(function(t) {
      return { tag: t, count: tagCounts[t], isUntagged: false };
    });
    if (untaggedCount > 0) {
      list.push({ tag: "__untagged__", count: untaggedCount, isUntagged: true });
    }
    return list;
  }

  // Filtre une liste de points selon les tags cochés.
  // - tagsCoches : Set des tags cochés
  // - untaggedCoche : si true, inclut aussi les points sans tag
  // Un point est inclus si AU MOINS UN de ses tags est coché, OU s'il n'a pas de tag et que untaggedCoche.
  function _filtrerPointsParTags(points, tagsCoches, untaggedCoche) {
    return (points || []).filter(function(p) {
      const tags = Array.isArray(p.tags) ? p.tags.filter(function(t) { return t && String(t).trim(); }) : [];
      if (tags.length === 0) return untaggedCoche;
      return tags.some(function(t) { return tagsCoches.has(String(t)); });
    });
  }

  // Récupère depuis le DOM les tags cochés d'un préfixe donné (ex: "adv_points_tag_")
  function _lireTagsCoches(prefix, tagsList) {
    const tagsCoches = new Set();
    let untaggedCoche = false;
    tagsList.forEach(function(item) {
      const safe = _slugTagId(item.tag);
      const cb = document.getElementById(prefix + safe);
      if (cb && cb.checked) {
        if (item.isUntagged) untaggedCoche = true;
        else tagsCoches.add(item.tag);
      }
    });
    return { tagsCoches: tagsCoches, untaggedCoche: untaggedCoche };
  }

  // Identifiant CSS-safe pour un tag (peut contenir des caractères bizarres)
  function _slugTagId(tag) {
    return String(tag).replace(/[^a-z0-9_-]/gi, "_");
  }

  // Récupère l'icône miniature d'un tag avec cascade :
  //   1. PLAN_CONFIG.icons[tag]  2. _iconMap[tag] (built-in fallback)
  function _iconePourTag(tag) {
    const planIcons = (window.PLAN_CONFIG && window.PLAN_CONFIG.icons) || {};
    if (planIcons[tag]) return planIcons[tag];
    const entry = window._iconMap && window._iconMap[tag];
    if (!entry) return null;
    // v174 : entry peut être un L.divIcon (scaledMarkers ON) → check _kta_iconUrl
    return entry._kta_iconUrl || (entry.options && entry.options.iconUrl) || null;
  }

  // ========== AFFICHAGE MODALE ==========
  function _afficherModal() {
    const modal = document.createElement("div");
    modal.id = "kta-session-export-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = `
      <div class="kta-readme-modal-boite">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">${_soloTab ? t("tabledit.source.fusion") : t("export.modal.titre")}</span>
          <button class="kta-panneau-close" id="kta-ses-close">✕</button>
        </div>

        <div class="kta-ses-tabs"${_soloTab ? ' style="display:none;"' : ''}>
          <button class="kta-ses-tab" data-tab="full">${t("export.tab.full")}</button>
          <button class="kta-ses-tab" data-tab="advanced">${t("export.tab.advanced")}</button>
          <button class="kta-ses-tab" data-tab="conversion">${t("export.tab.conversion")}</button>
          <button class="kta-ses-tab" data-tab="fusion">${t("export.tab.fusion")}</button>
          <button class="kta-ses-tab" data-tab="extern">${t("export.tab.extern")}</button>
        </div>

        <div class="kta-ses-content" id="kta-ses-content"></div>

        <div class="kta-ses-actions">
          <button class="kta-ses-btn kta-ses-btn-secondary" id="kta-ses-cancel">${t("export.btn.cancel")}</button>
          <button class="kta-ses-btn kta-ses-btn-primary" id="kta-ses-download">${t("export.btn.download")}</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(modal);
    _modal = modal;

    function fermer() {
      if (_modal) _modal.remove();
      _modal = null;
    }

    document.getElementById("kta-ses-close").addEventListener("click", fermer);
    document.getElementById("kta-ses-cancel").addEventListener("click", fermer);
    modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape" && _modal) {
        fermer();
        document.removeEventListener("keydown", onEsc);
      }
    });

    // Listeners onglets
    modal.querySelectorAll(".kta-ses-tab").forEach(function(tab) {
      tab.addEventListener("click", function() {
        _activeTab = tab.dataset.tab;
        _renderTab();
      });
    });

    document.getElementById("kta-ses-download").addEventListener("click", _executerExport);

    _renderTab();
  }

  // ========== RENDU DES ONGLETS ==========
  function _renderTab() {
    if (!_modal) return;

    _modal.querySelectorAll(".kta-ses-tab").forEach(function(t) {
      t.classList.toggle("active", t.dataset.tab === _activeTab);
    });

    const c = document.getElementById("kta-ses-content");
    if (!c) return;

    // Bouton Télécharger ré-activé par défaut à chaque changement d'onglet ;
    // les onglets qui exigent un upload (Conversion data→session, Fusion) le
    // re-désactivent dans leur bind tant que rien n'est chargé.
    const _dlBtnReset = document.getElementById("kta-ses-download");
    if (_dlBtnReset) _dlBtnReset.disabled = false;

    if (_activeTab === "full") {
      c.innerHTML = _renderFull();
      // 🆕 v1.9.3-B1d : remplit le compteur photos en async (lecture IDB).
      // Si aucune photo trouvée OU module indispo, la section reste cachée.
      setTimeout(_majCompteurPhotosFull, 0);
    }
    else if (_activeTab === "advanced") {
      c.innerHTML = _renderAdvanced();
      // 🆕 v1.9.3-B1d+ : remplit le compteur photos en async (lecture IDB).
      setTimeout(_majCompteurPhotosAdvanced, 0);
    }
    else if (_activeTab === "conversion") {
      c.innerHTML = _renderConversion();
      // 🆕 v1.9.3-B1d++ : remplit le compteur photos pour le sens
      // session→data (skip si on est en sens data→session, la section
      // n'est pas dans le DOM dans ce cas).
      setTimeout(_majCompteurPhotosConvEd2Data, 0);
    }
    else if (_activeTab === "extern") {
      // v1.14.1 — onglet unifié : KMZ + GPX partagent le calibrage 2 points.
      c.innerHTML = _renderExtern();
      // Bind handlers calibrage (autocomplete + clic carte + validations + aperçu coins)
      setTimeout(_bindKmzHandlers, 0);
      // Bind handlers du sélecteur de format (pills KMZ/GPX)
      setTimeout(_bindExternFmtHandlers, 0);
    }
    else if (_activeTab === "fusion") {
      c.innerHTML = _renderFusion();
      setTimeout(_bindFusion, 0);
    }
  }

  // 🆕 v1.9.3-B1d : compteur photos async pour la section "📸 Photos" de
  // l'onglet Full. Section restée cachée si aucune photo (ou si module
  // MyKTAMapPhotos indispo). Compteur format "(N · X Mo)".
  function _majCompteurPhotosFull() {
    const section = document.getElementById("full_photos_section");
    const counter = document.getElementById("full_photos_count");
    const cb      = document.getElementById("full_photos");
    if (!section || !counter) return;
    _collecterPhotosPlan(null).then(function(pack) {
      if (pack.photos.length === 0) {
        // Aucune photo → on cache la section (l'export reste JSON pur).
        section.style.display = "none";
        if (cb) cb.checked = false;
        return;
      }
      section.style.display = "block";
      counter.textContent = "(" + pack.photos.length + " · " + _formatBytes(pack.totalSize) + ")";
    });
  }

  // 🆕 v1.9.3-B1d+ : compteur photos async pour la section "📸 Photos" de
  // l'onglet Avancé. Affiche le compteur GLOBAL du plan (toutes photos).
  // Le filtrage par points effectivement exportés se fait à la save (cf.
  // _exportAdvanced). Le compteur indique donc "max" — il pourra être plus
  // petit selon les filtres tag à la save.
  function _majCompteurPhotosAdvanced() {
    const section = document.getElementById("adv_photos_section");
    const counter = document.getElementById("adv_photos_count");
    const cb      = document.getElementById("adv_photos");
    if (!section || !counter) return;
    _collecterPhotosPlan(null).then(function(pack) {
      if (pack.photos.length === 0) {
        section.style.display = "none";
        if (cb) cb.checked = false;
        return;
      }
      section.style.display = "block";
      counter.textContent = "(max " + pack.photos.length + " · " + _formatBytes(pack.totalSize) + ")";
    });
  }

  // 🆕 v1.9.3-B1d++ : compteur photos pour la conversion session→data layer.
  // Section auto-cachée si 0 photo. Affichage "max N" : le filtre par
  // points/tags peut réduire le nombre final à la conversion.
  function _majCompteurPhotosConvEd2Data() {
    const section = document.getElementById("conv_ed2data_photos_section");
    const counter = document.getElementById("conv_ed2data_photos_count");
    const cb      = document.getElementById("conv_ed2data_photos");
    if (!section || !counter) return;
    _collecterPhotosPlan(null).then(function(pack) {
      if (pack.photos.length === 0) {
        section.style.display = "none";
        if (cb) cb.checked = false;
        return;
      }
      section.style.display = "block";
      counter.textContent = "(max " + pack.photos.length + " · " + _formatBytes(pack.totalSize) + ")";
    });
  }

  // ---------- ONGLET FULL ----------
  function _renderFull() {
    const d = _compter();
    // 🆕 v1.9.3-B1d : section 📸 Photos. Le compteur exact est rempli en
    // async après render via _kta_majCompteurPhotosFull (cf. _afficherModale).
    // En attendant, on affiche "Chargement…" pour ne pas bloquer le render.
    return `
      <div class="kta-ses-intro">
        ${t("export.full.intro")}
        <br><span style="color:#8892a4;">${t("export.full.introDetail")}</span>
      </div>
      <div class="kta-ses-summary">
        <div>✏️ ${t("export.full.points", { n: d.points.length, s: d.points.length > 1 ? "s" : "" })}</div>
        <div>🛣️ ${t("export.full.roads", { n: d.roads.length, s: d.roads.length > 1 ? "s" : "" })}</div>
        <div>⬛ ${t("export.full.zones", { n: d.zones.length, s: d.zones.length > 1 ? "s" : "" })}</div>
      </div>

      <div class="kta-ses-photos-section" id="full_photos_section" style="display:none;">
        <label class="kta-ses-cb-row" style="margin-top:8px;">
          <input type="checkbox" id="full_photos" checked>
          <span>
            ${t("export.full.photosLabel")}
            <span class="kta-ses-count" id="full_photos_count">${t("export.loading")}</span>
          </span>
        </label>
        <p style="font-size:11.5px; color:#8892a4; font-style:italic; margin:6px 0 0 26px; line-height:1.4;">
          ${t("export.full.photosHint")}
        </p>
      </div>

      <!-- 🆕 v1.31.7 F1 : toggle anonymisation pour partage public -->
      <div class="kta-ses-anonymize-section" style="margin-top:14px; padding-top:10px; border-top:1px solid #2a3144;">
        <label class="kta-ses-cb-row">
          <input type="checkbox" id="full_anonymize">
          <span>${t("export.full.anonymizeLabel")}</span>
        </label>
        <p style="font-size:11.5px; color:#8892a4; font-style:italic; margin:6px 0 0 26px; line-height:1.4;">
          ${t("export.full.anonymizeHint")}
        </p>
      </div>
    `;
  }

  // ---------- ONGLET AVANCÉ ----------
  function _renderAdvanced() {
    const d = _compter();
    const roadsByType = _trierParType(d.roads, ["principal", "secondaire", "chemin"]);
    const zonesByType = _trierParType(d.zones, ["eau", "remblais", "effondrement", "inaccessible"]);
    // 🆕 v1.9.3-A1.a : tri par sous-type pour les structures (UI filtre)
    const structuresByType = _trierParType(d.structures || [], ["pilier-1", "pilier-2", "mur", "front-1", "front-2"]);
    const tagsList = _listerTagsPoints(d.points);

    function row(id, label, count, defaultChecked) {
      const disabled = count === 0 ? " disabled" : "";
      const checked = (count > 0 && defaultChecked) ? " checked" : "";
      const dim = count === 0 ? "opacity:0.4;" : "";
      return `<label class="kta-ses-cb-row" style="${dim}">
        <input type="checkbox" id="${id}"${checked}${disabled}>
        <span>${label} <span class="kta-ses-count">(${count})</span></span>
      </label>`;
    }

    function rowSub(id, label, count, defaultChecked) {
      const disabled = count === 0 ? " disabled" : "";
      const checked = (count > 0 && defaultChecked) ? " checked" : "";
      const dim = count === 0 ? "opacity:0.4;" : "";
      return `<label class="kta-ses-cb-row kta-ses-cb-sub" style="${dim}">
        <input type="checkbox" id="${id}"${checked}${disabled}>
        <span>${label} <span class="kta-ses-count">(${count})</span></span>
      </label>`;
    }

    function rowTagSub(prefix, item, defaultChecked) {
      const safe = _slugTagId(item.tag);
      const id = prefix + safe;
      const checked = defaultChecked ? " checked" : "";
      const iconUrl = item.isUntagged ? null : _iconePourTag(item.tag);
      const iconHtml = iconUrl
        ? '<img src="' + iconUrl + '" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin-right:4px;">'
        : (item.isUntagged ? '<span style="opacity:0.5;margin-right:4px;">∅</span>' : '<span style="opacity:0.5;margin-right:4px;">🏷️</span>');
      const label = item.isUntagged ? t("export.untagged") : _escapeHtml(item.tag);
      return `<label class="kta-ses-cb-row kta-ses-cb-sub">
        <input type="checkbox" id="${id}"${checked}>
        <span>${iconHtml}${label} <span class="kta-ses-count">(${item.count})</span></span>
      </label>`;
    }

    let pointsTagsHtml = "";
    if (tagsList.length > 0) {
      pointsTagsHtml = tagsList.map(function(item) {
        return rowTagSub("adv_points_tag_", item, true);
      }).join("");
    }

    return `
      <div class="kta-ses-intro">
        ${t("export.adv.intro")}
      </div>

      <div class="kta-ses-section">
        <div class="kta-ses-section-title">${t("export.adv.contentTitle")}</div>

        ${row("adv_points", t("export.adv.points"), d.points.length, true)}
        ${pointsTagsHtml}

        ${row("adv_roads", t("export.adv.roads"), d.roads.length, true)}
        ${rowSub("adv_roads_principal",  t("export.adv.roadsPrincipal"),  roadsByType.principal.length,  true)}
        ${rowSub("adv_roads_secondaire", t("export.adv.roadsSecondaire"), roadsByType.secondaire.length, true)}
        ${rowSub("adv_roads_chemin",     t("export.adv.roadsChemin"),     roadsByType.chemin.length,     true)}

        ${row("adv_zones", t("export.adv.zones"), d.zones.length, true)}
        ${rowSub("adv_zones_eau",          t("export.adv.zonesEau"),           zonesByType.eau.length,          true)}
        ${rowSub("adv_zones_remblais",     t("export.adv.zonesRemblais"),      zonesByType.remblais.length,     true)}
        ${rowSub("adv_zones_effondrement", t("export.adv.zonesEffondrement"),  zonesByType.effondrement.length, true)}
        ${rowSub("adv_zones_inaccessible", t("export.adv.zonesInaccessible"),  zonesByType.inaccessible.length, true)}

        ${row("adv_structures", t("export.adv.structures"), (d.structures || []).length, true)}
        ${rowSub("adv_structures_pilier-1", t("export.adv.structPilier1"),     structuresByType["pilier-1"].length, true)}
        ${rowSub("adv_structures_pilier-2", t("export.adv.structPilier2"),     structuresByType["pilier-2"].length, true)}
        ${rowSub("adv_structures_mur",      t("export.adv.structMur"),         structuresByType["mur"].length,      true)}
        ${rowSub("adv_structures_front-1",  t("export.adv.structFront1"),      structuresByType["front-1"].length,  true)}
        ${rowSub("adv_structures_front-2",  t("export.adv.structFront2"),      structuresByType["front-2"].length,  true)}

        ${row("adv_mesure",        t("export.adv.mesureDistance"), (d.mesure || []).length,        (d.mesure || []).length > 0)}
        ${row("adv_mesure_surface",t("export.adv.mesureSurface"),  (d.mesureSurface || []).length, (d.mesureSurface || []).length >= 3)}

        ${(function() {
          // 🆕 v1.21.2 : tracker activable dès qu'il y a une timeline historisée
          // (= heatmap multi-sessions) ou un path runtime ou une position courante.
          const trkAvailable = d.trackerOk
                               || (d.trackerPath || []).length > 0
                               || (d.trackerTimeline || []).length > 0;
          const parts = [];
          if ((d.trackerPath || []).length > 1) parts.push(t("export.adv.trackerTrace", { n: d.trackerPath.length }));
          if ((d.trackerTimeline || []).length > 0) parts.push(t("export.adv.trackerTimeline", { n: d.trackerTimeline.length }));
          const detailHtml = parts.length ? '<span class="kta-ses-count">(' + parts.join(" + ") + ')</span>' : '';
          return `<label class="kta-ses-cb-row" style="${trkAvailable ? "" : "opacity:0.4;"}">
            <input type="checkbox" id="adv_tracker" ${trkAvailable ? "" : "disabled"} ${trkAvailable ? "checked" : ""}>
            <span>${t("export.adv.trackerGps", { detail: detailHtml })}</span>
          </label>`;
        })()}
      </div>

      <!-- 🆕 v1.9.3-B1d+ : section 📸 Photos (auto-cachée si 0 photo, peuplée
           en async via _majCompteurPhotosAdvanced après render). Filtrée
           selon les points effectivement exportés à la save. -->
      <div class="kta-ses-photos-section" id="adv_photos_section" style="display:none;">
        <div class="kta-ses-section-title">${t("export.adv.photosTitle")}</div>
        <label class="kta-ses-cb-row">
          <input type="checkbox" id="adv_photos" checked>
          <span>
            ${t("export.adv.photosLabel")}
            <span class="kta-ses-count" id="adv_photos_count">${t("export.loading")}</span>
          </span>
        </label>
        <p style="font-size:11.5px; color:#8892a4; font-style:italic; margin:6px 0 0 26px; line-height:1.4;">
          ${t("export.adv.photosHint")}
        </p>
      </div>

      <div class="kta-ses-section">
        <div class="kta-ses-section-title">${t("export.adv.outputTitle")}</div>
        <label class="kta-ses-radio-row">
          <input type="radio" name="adv_format" value="single" checked>
          <span>${t("export.adv.outputSingle")} <span class="kta-ses-radio-hint">${t("export.adv.outputSingleHint")}</span></span>
        </label>
        <label class="kta-ses-radio-row">
          <input type="radio" name="adv_format" value="zip">
          <span>${t("export.adv.outputZip")} <span class="kta-ses-radio-hint">${t("export.adv.outputZipHint")}</span></span>
        </label>
      </div>
    `;
  }

  // Listeners pour la cohérence parent/sub-cases
  function _attacherListenersAdvanced() {
    if (!_modal || _activeTab !== "advanced") return;

    function syncParent(parentId, subIds) {
      const parent = document.getElementById(parentId);
      const subs = subIds.map(function(id) { return document.getElementById(id); }).filter(Boolean);
      if (!parent || subs.length === 0) return;

      // Parent → enfants : décocher parent décoche tous les enfants
      parent.addEventListener("change", function() {
        subs.forEach(function(s) {
          if (!s.disabled) s.checked = parent.checked;
        });
      });

      // Enfants → parent : si tous décochés, décocher parent ; sinon cocher
      subs.forEach(function(s) {
        s.addEventListener("change", function() {
          const anyChecked = subs.some(function(x) { return x.checked; });
          parent.checked = anyChecked;
        });
      });
    }

    syncParent("adv_roads", ["adv_roads_principal", "adv_roads_secondaire", "adv_roads_chemin"]);
    syncParent("adv_zones", ["adv_zones_eau", "adv_zones_remblais", "adv_zones_effondrement", "adv_zones_inaccessible"]);
    // 🆕 v1.9.3-A1.a : sync parent ↔ enfants pour les structures
    syncParent("adv_structures", ["adv_structures_pilier-1", "adv_structures_pilier-2", "adv_structures_mur", "adv_structures_front-1", "adv_structures_front-2"]);

    // Synchro parent Points ↔ tags (dynamique : la liste varie selon les points)
    const tagsList = _listerTagsPoints(_compter().points);
    const tagSubIds = tagsList.map(function(item) {
      return "adv_points_tag_" + _slugTagId(item.tag);
    });
    if (tagSubIds.length > 0) {
      syncParent("adv_points", tagSubIds);
    }
  }

  // ---------- ONGLET CONVERSION ----------
  // Wrapper : choisit l'UI selon le sens courant + ajoute le toggle de direction
  function _renderConversion() {
    return `
      <div class="kta-conv-sens-wrap">
        <button class="kta-conv-sens-btn ${_convDirection === "ed2data" ? "active" : ""}" data-conv-dir="ed2data" type="button">
          <span class="kta-conv-sens-label">${t("export.conv.dirEd2dataLabel")}</span>
          <span class="kta-conv-sens-desc">${t("export.conv.dirEd2dataDesc")}</span>
        </button>
        <button class="kta-conv-sens-btn ${_convDirection === "data2ed" ? "active" : ""}" data-conv-dir="data2ed" type="button">
          <span class="kta-conv-sens-label">${t("export.conv.dirData2edLabel")}</span>
          <span class="kta-conv-sens-desc">${t("export.conv.dirData2edDesc")}</span>
        </button>
      </div>
      ${_convDirection === "ed2data" ? _renderConvSession2Data() : _renderConvData2Session()}
    `;
  }

  // Sens 1 : session courante → fichiers data layer (logique existante)
  function _renderConvSession2Data() {
    const d = _compter();
    const tagsList = _listerTagsPoints(d.points);

    // ⚠️ Filtre les roads de type "itinerary" (calculées par Pathfinder, pas
    // de vraies roads exportables). Comptage par type pour les sous-checkboxes
    // de filtre fin (cohérent avec l'export image avancé).
    const roadsExportables = (d.roads || []).filter(function(r) { return r.type !== "itinerary"; });
    const roadCountByType = _trierParType(roadsExportables, ["principal", "secondaire", "chemin"]);
    const zoneCountByType = _trierParType(d.zones || [],    ["eau", "remblais", "effondrement", "inaccessible"]);
    // 🆕 v1.9.3-A1.a : comptage structures pour l'UI Conversion
    const structureCountByType = _trierParType(d.structures || [], ["pilier-1", "pilier-2", "mur", "front-1", "front-2"]);

    function row(id, label, count, defaultChecked) {
      const disabled = count === 0 ? " disabled" : "";
      const checked = (count > 0 && defaultChecked) ? " checked" : "";
      const dim = count === 0 ? "opacity:0.4;" : "";
      return `<label class="kta-ses-cb-row" style="${dim}">
        <input type="checkbox" id="${id}"${checked}${disabled}>
        <span>${label} <span class="kta-ses-count">(${count})</span></span>
      </label>`;
    }

    function rowTypeSub(id, label, count, defaultChecked) {
      const disabled = count === 0 ? " disabled" : "";
      const checked  = (count > 0 && defaultChecked) ? " checked" : "";
      const dim      = count === 0 ? "opacity:0.4;" : "";
      return `<label class="kta-ses-cb-row kta-ses-cb-sub" style="${dim}">
        <input type="checkbox" id="${id}"${checked}${disabled}>
        <span>${label} <span class="kta-ses-count">(${count})</span></span>
      </label>`;
    }

    function rowTagSub(prefix, item, defaultChecked) {
      const safe = _slugTagId(item.tag);
      const id = prefix + safe;
      const checked = defaultChecked ? " checked" : "";
      const iconUrl = item.isUntagged ? null : _iconePourTag(item.tag);
      const iconHtml = iconUrl
        ? '<img src="' + iconUrl + '" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin-right:4px;">'
        : (item.isUntagged ? '<span style="opacity:0.5;margin-right:4px;">∅</span>' : '<span style="opacity:0.5;margin-right:4px;">🏷️</span>');
      const label = item.isUntagged ? t("export.untagged") : _escapeHtml(item.tag);
      return `<label class="kta-ses-cb-row kta-ses-cb-sub">
        <input type="checkbox" id="${id}"${checked}>
        <span>${iconHtml}${label} <span class="kta-ses-count">(${item.count})</span></span>
      </label>`;
    }

    let pointsTagsHtml = "";
    if (tagsList.length > 0) {
      pointsTagsHtml = tagsList.map(function(item) {
        return rowTagSub("conv_points_tag_", item, true);
      }).join("");
    }

    // Sub-cases types route (Principal / Secondaire / Chemin)
    const roadsTypesHtml =
      rowTypeSub("conv_roads_principal",  t("export.conv.roadsPrincipal"),  roadCountByType.principal.length,  true) +
      rowTypeSub("conv_roads_secondaire", t("export.conv.roadsSecondaire"), roadCountByType.secondaire.length, true) +
      rowTypeSub("conv_roads_chemin",     t("export.conv.roadsChemin"),     roadCountByType.chemin.length,     true);

    // Sub-cases types zone (Eau / Remblais / Effondrement / Inaccessible)
    const zonesTypesHtml =
      rowTypeSub("conv_zones_eau",          t("export.conv.zonesEau"),          zoneCountByType.eau.length,          true) +
      rowTypeSub("conv_zones_remblais",     t("export.conv.zonesRemblais"),     zoneCountByType.remblais.length,     true) +
      rowTypeSub("conv_zones_effondrement", t("export.conv.zonesEffondrement"), zoneCountByType.effondrement.length, true) +
      rowTypeSub("conv_zones_inaccessible", t("export.conv.zonesInaccessible"), zoneCountByType.inaccessible.length, true);

    // 🆕 v1.9.3-A1.a + A1.b.2 : sub-cases structures (5 sous-types incl. fronts)
    const structuresTypesHtml =
      rowTypeSub("conv_structures_pilier-1", t("export.conv.structPilier1"), structureCountByType["pilier-1"].length, true) +
      rowTypeSub("conv_structures_pilier-2", t("export.conv.structPilier2"), structureCountByType["pilier-2"].length, true) +
      rowTypeSub("conv_structures_mur",      t("export.conv.structMur"),     structureCountByType["mur"].length,      true) +
      rowTypeSub("conv_structures_front-1",  t("export.conv.structFront1"),  structureCountByType["front-1"].length,  true) +
      rowTypeSub("conv_structures_front-2",  t("export.conv.structFront2"),  structureCountByType["front-2"].length,  true);

    return `
      <div class="kta-ses-intro">
        ${t("export.conv.s2dIntro")}
        <br><span style="color:#8892a4;">${t("export.conv.s2dIntroDetail")}</span>
      </div>

      <div class="kta-ses-section">
        <div class="kta-ses-section-title">${t("export.conv.s2dContentTitle")}</div>
        ${row("conv_points", t("export.conv.points"),  d.points.length, true)}
        ${pointsTagsHtml}
        ${row("conv_roads",  t("export.conv.roads"),          roadsExportables.length,  true)}
        ${roadsTypesHtml}
        ${row("conv_zones",  t("export.conv.zones"),            d.zones.length,  true)}
        ${zonesTypesHtml}
        ${row("conv_structures", t("export.conv.structures"),  (d.structures || []).length, true)}
        ${structuresTypesHtml}
      </div>

      <!-- 🆕 v1.9.3-B1d++ : section 📸 Photos pour la conversion session→data.
           Auto-cachée si 0 photo, peuplée en async via _majCompteurPhotosConvEd2Data.
           Filtrée selon les points effectivement convertis (cf. _exportConvSession2Data). -->
      <div class="kta-ses-photos-section" id="conv_ed2data_photos_section" style="display:none;">
        <div class="kta-ses-section-title">${t("export.conv.photosTitle")}</div>
        <label class="kta-ses-cb-row">
          <input type="checkbox" id="conv_ed2data_photos" checked>
          <span>
            ${t("export.conv.photosLabel")}
            <span class="kta-ses-count" id="conv_ed2data_photos_count">${t("export.loading")}</span>
          </span>
        </label>
        <p style="font-size:11.5px; color:#8892a4; font-style:italic; margin:6px 0 0 26px; line-height:1.4;">
          ${t("export.conv.photosHint")}
        </p>
      </div>

      <div class="kta-ses-section">
        <div class="kta-ses-section-title">${t("export.conv.granTitle")}</div>
        <label class="kta-ses-radio-row">
          <input type="radio" name="conv_gran" value="basic" checked>
          <span>${t("export.conv.granBasic")} <span class="kta-ses-radio-hint">${t("export.conv.granBasicHint")}</span></span>
        </label>
        <label class="kta-ses-radio-row">
          <input type="radio" name="conv_gran" value="fine">
          <span>${t("export.conv.granFine")} <span class="kta-ses-radio-hint">${t("export.conv.granFineHint")}</span></span>
        </label>
      </div>
    `;
  }

  // Sens 2 : fichier data layer uploadé → fichier session JSON (téléchargement)
  function _renderConvData2Session() {
    let apercu = "";
    let stats = null;

    if (_convUploadedJson) {
      const points     = Array.isArray(_convUploadedJson.data)         ? _convUploadedJson.data
                       : Array.isArray(_convUploadedJson.editorPoints) ? _convUploadedJson.editorPoints
                       : [];
      const roads      = Array.isArray(_convUploadedJson.roads)      ? _convUploadedJson.roads      : [];
      const zones      = Array.isArray(_convUploadedJson.zones)      ? _convUploadedJson.zones      : [];
      const structures = Array.isArray(_convUploadedJson.structures) ? _convUploadedJson.structures : [];
      // 🆕 v1.9.3-B1d++ : compteur photos si ZIP data layer avec photos/
      const nbPhotos = (_convUploadedPhotos && _convUploadedPhotos.length) || 0;
      stats = { points: points.length, roads: roads.length, zones: zones.length, structures: structures.length, photos: nbPhotos };
      const photosBadge = nbPhotos > 0
        ? '<div>' + t("export.conv.d2sPhotos", { n: nbPhotos, s: nbPhotos > 1 ? "s" : "" }) + '</div>'
        : '';
      apercu = `
        <div class="kta-ses-section">
          <div class="kta-ses-section-title">${t("export.conv.d2sApercuTitle")}</div>
          <div class="kta-ses-summary">
            <div>✏️ ${t("export.conv.d2sPoints", { n: stats.points, s: stats.points > 1 ? "s" : "" })}</div>
            <div>🛣️ ${t("export.conv.d2sRoads", { n: stats.roads, s: stats.roads > 1 ? "s" : "" })}</div>
            <div>⬛ ${t("export.conv.d2sZones", { n: stats.zones, s: stats.zones > 1 ? "s" : "" })}</div>
            <div>🏛️ ${t("export.conv.d2sStructures", { n: stats.structures, s: stats.structures > 1 ? "s" : "" })}</div>
            ${photosBadge}
          </div>
        </div>
      `;
    }

    return `
      <div class="kta-ses-intro">
        ${t("export.conv.d2sIntro")}
        <br><span style="color:#8892a4;">${t("export.conv.d2sIntroDetail")}</span>
      </div>

      <div class="kta-ses-section">
        <div class="kta-ses-section-title">${t("export.conv.d2sSourceTitle")}</div>
        <div class="kta-conv-drop" id="kta-conv-d2e-drop">
          <span id="kta-conv-d2e-drop-label">${_convUploadedName ? t("export.conv.d2sDropLoaded", { name: _escapeHtml(_convUploadedName) }) : t("export.conv.d2sDropEmpty")}</span>
          <!-- 🆕 v1.9.3-B1d++ : accepte aussi .zip (data layer avec photos) -->
          <input type="file" id="kta-conv-d2e-file" accept=".json,.zip,application/json,application/zip" style="display:none">
        </div>
      </div>

      ${apercu}

      <div id="kta-conv-d2e-erreur" class="kta-conv-erreur" style="display:none;"></div>
    `;
  }

  // Listeners parent ↔ tags pour Conversion (post-DOM)
  function _attacherListenersConversion() {
    if (!_modal || _activeTab !== "conversion") return;

    // Toggle de direction (ed2data ↔ data2ed)
    _modal.querySelectorAll(".kta-conv-sens-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const dir = btn.dataset.convDir;
        if (dir && dir !== _convDirection) {
          _convDirection = dir;
          _renderTab();
        }
      });
    });

    // Mode data2ed : drop zone + file picker
    if (_convDirection === "data2ed") {
      const dropZone  = document.getElementById("kta-conv-d2e-drop");
      const fileInput = document.getElementById("kta-conv-d2e-file");
      const labelEl   = document.getElementById("kta-conv-d2e-drop-label");
      const erreurEl  = document.getElementById("kta-conv-d2e-erreur");

      if (dropZone && fileInput) {
        dropZone.addEventListener("click", function() { fileInput.click(); });
        dropZone.addEventListener("dragover",  function(e) { e.preventDefault(); dropZone.classList.add("dragover"); });
        dropZone.addEventListener("dragleave", function()  { dropZone.classList.remove("dragover"); });
        dropZone.addEventListener("drop", function(e) {
          e.preventDefault(); dropZone.classList.remove("dragover");
          const f = e.dataTransfer.files[0];
          // 🆕 v1.9.3-B1d++ : accepte aussi .zip (data layer avec photos)
          const okExt = f && (/\.(json|zip)$/i).test(f.name);
          if (okExt) _chargerFichierData2Ed(f);
          else if (erreurEl) { erreurEl.textContent = t("export.err.fichierType"); erreurEl.style.display = "block"; }
        });
        fileInput.addEventListener("change", function() {
          if (fileInput.files[0]) _chargerFichierData2Ed(fileInput.files[0]);
        });
      }
      // Si aucun fichier chargé → désactive le bouton Télécharger
      const dlBtn = document.getElementById("kta-ses-download");
      if (dlBtn) dlBtn.disabled = !_convUploadedJson;
      return; // pas de syncParent à brancher dans ce mode
    }

    // Mode ed2data : réactive le bouton Télécharger
    const dlBtn = document.getElementById("kta-ses-download");
    if (dlBtn) dlBtn.disabled = false;

    function syncParent(parentId, subIds) {
      const parent = document.getElementById(parentId);
      const subs = subIds.map(function(id) { return document.getElementById(id); }).filter(Boolean);
      if (!parent || subs.length === 0) return;
      parent.addEventListener("change", function() {
        subs.forEach(function(s) { if (!s.disabled) s.checked = parent.checked; });
      });
      subs.forEach(function(s) {
        s.addEventListener("change", function() {
          parent.checked = subs.some(function(x) { return x.checked; });
        });
      });
    }

    const tagsList = _listerTagsPoints(_compter().points);
    const tagSubIds = tagsList.map(function(item) {
      return "conv_points_tag_" + _slugTagId(item.tag);
    });
    if (tagSubIds.length > 0) {
      syncParent("conv_points", tagSubIds);
    }

    // Sync parent ↔ sub-checkboxes pour types road et zone
    syncParent("conv_roads", ["conv_roads_principal", "conv_roads_secondaire", "conv_roads_chemin"]);
    syncParent("conv_zones", ["conv_zones_eau",       "conv_zones_remblais",   "conv_zones_effondrement", "conv_zones_inaccessible"]);
    // 🆕 v1.9.3-A1.a : sync parent ↔ enfants structures dans Conversion
    syncParent("conv_structures", ["conv_structures_pilier-1", "conv_structures_pilier-2", "conv_structures_mur", "conv_structures_front-1", "conv_structures_front-2"]);
  }

  // Charge un fichier .json ou .zip pour le sens data2ed, parse + re-render
  // l'onglet pour afficher l'aperçu.
  // 🆕 v1.9.3-B1d++ : support des ZIP data layer (avec ou sans photos/).
  //   - Si .json → flow historique (1 seul fichier data layer)
  //   - Si .zip  → merge des multiples .json data layer + extraction photos/
  function _chargerFichierData2Ed(file) {
    _convUploadedPhotos = null;  // reset pour éviter un état stale
    const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip"
                  || file.type === "application/x-zip-compressed";

    if (isZip) {
      _chargerZipData2Ed(file);
      return;
    }

    // JSON pur — flow historique
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const json = JSON.parse(e.target.result);
        if (typeof json !== "object" || json === null) throw new Error(t("export.err.jsonInvalide"));
        const hasPoints = Array.isArray(json.data) || Array.isArray(json.editorPoints);
        const hasRoads  = Array.isArray(json.roads);
        const hasZones  = Array.isArray(json.zones);
        if (!hasPoints && !hasRoads && !hasZones) {
          throw new Error(t("export.err.jsonNoFields"));
        }
        _convUploadedJson = json;
        _convUploadedName = file.name;
        _renderTab(); // re-render pour afficher l'aperçu + activer le bouton
      } catch(err) {
        _showConvErreur("❌ " + (err.message || err));
      }
    };
    reader.readAsText(file);
  }

  // 🆕 v1.9.3-B1d++ : helper d'erreur conv data2ed (factorisé)
  function _showConvErreur(msg) {
    const erreurEl = document.getElementById("kta-conv-d2e-erreur");
    if (erreurEl) {
      erreurEl.textContent = msg;
      erreurEl.style.display = "block";
    }
    _convUploadedJson = null;
    _convUploadedName = "";
    _convUploadedPhotos = null;
    const dlBtn = document.getElementById("kta-ses-download");
    if (dlBtn) dlBtn.disabled = true;
  }

  // 🆕 v1.9.3-B1d++ : charge un ZIP data layer (multi-fichiers ou pas) +
  // extrait les photos si présentes.
  // Format ZIP attendu :
  //   ├── points.json | roads.json | zones.json | structure.json
  //   │     (granularité basic)
  //   OU
  //   ├── points.json | roads_principal.json | roads_secondaire.json | ...
  //   │     (granularité fine)
  //   └── photos/
  //        ├── _index.json
  //        └── <photoId>.<ext>
  function _chargerZipData2Ed(file) {
    if (typeof JSZip === "undefined") {
      _showConvErreur(t("export.err.jszipKo"));
      return;
    }
    JSZip.loadAsync(file).then(function(zip) {
      // Étape 1 : merge tous les *.json à la racine en un seul objet
      // _convUploadedJson. Chaque fichier individuel apporte ses propres
      // champs (data, roads, zones, structures) qu'on cumule.
      const merged = {
        type: "devmap-data-merged",
        version: "1.0",
        data: [],
        roads: [],
        zones: [],
        structures: []
      };

      const jsonFiles = [];
      zip.forEach(function(relPath, entry) {
        if (entry.dir) return;
        if (relPath.indexOf("/") >= 0) return;  // ignore les sous-dossiers (photos/)
        if (!/\.json$/i.test(relPath)) return;
        jsonFiles.push(entry);
      });

      if (jsonFiles.length === 0) {
        throw new Error(t("export.err.zipNoJson"));
      }

      // Promise.all pour parse tous les JSON en parallèle
      const parsePromises = jsonFiles.map(function(entry) {
        return entry.async("string").then(function(txt) {
          try {
            return JSON.parse(txt);
          } catch(e) {
            console.warn("[Conv ZIP] " + entry.name + " : JSON invalide, ignoré :", e);
            return null;
          }
        });
      });

      return Promise.all(parsePromises).then(function(parsedArr) {
        parsedArr.forEach(function(json) {
          if (!json || typeof json !== "object") return;
          // Points : peut être dans .data ou .editorPoints
          if (Array.isArray(json.data) && json.data.length > 0) {
            merged.data = merged.data.concat(json.data);
          } else if (Array.isArray(json.editorPoints) && json.editorPoints.length > 0) {
            merged.data = merged.data.concat(json.editorPoints);
          }
          if (Array.isArray(json.roads))      merged.roads      = merged.roads.concat(json.roads);
          if (Array.isArray(json.zones))      merged.zones      = merged.zones.concat(json.zones);
          if (Array.isArray(json.structures)) merged.structures = merged.structures.concat(json.structures);
        });

        const hasContent = merged.data.length > 0 || merged.roads.length > 0
                        || merged.zones.length > 0 || merged.structures.length > 0;
        if (!hasContent) {
          throw new Error(t("export.err.zipDataVide"));
        }

        // Étape 2 : extraire les photos (si dossier photos/_index.json)
        const indexFile = zip.file("photos/_index.json");
        if (!indexFile) {
          // Pas de photos → on s'arrête là
          _convUploadedJson = merged;
          _convUploadedName = file.name;
          _convUploadedPhotos = null;
          _renderTab();
          return;
        }
        return indexFile.async("string").then(function(idxText) {
          let idxObj;
          try { idxObj = JSON.parse(idxText); }
          catch(e) { throw new Error(t("export.err.zipIndexCorrompu", { msg: e.message })); }
          const idxMap = (idxObj && idxObj.photos) || {};
          const photoIds = Object.keys(idxMap);
          if (photoIds.length === 0) {
            _convUploadedJson = merged;
            _convUploadedName = file.name;
            _convUploadedPhotos = null;
            _renderTab();
            return;
          }
          // Charge chaque blob en parallèle
          const blobPromises = photoIds.map(function(pid) {
            const info = idxMap[pid] || {};
            const filename = "photos/" + (info.file || (pid + ".jpg"));
            const f = zip.file(filename);
            if (!f) {
              console.warn("[Conv ZIP] Photo manquante :", filename);
              return null;
            }
            return f.async("blob").then(function(blob) {
              return {
                id:      pid,
                pointId: info.pointId,
                mime:    info.mime || blob.type || "image/jpeg",
                size:    info.size || blob.size,
                blob:    blob
              };
            });
          });
          return Promise.all(blobPromises).then(function(arr) {
            _convUploadedJson = merged;
            _convUploadedName = file.name;
            _convUploadedPhotos = arr.filter(function(p) { return p !== null; });
            _renderTab();
          });
        });
      });
    }).catch(function(err) {
      console.error("[Conv ZIP]", err);
      _showConvErreur("❌ " + (err.message || err));
    });
  }

  // Re-render avec listeners post-DOM
  const _origRenderTab = _renderTab;
  _renderTab = function() {
    _origRenderTab();
    setTimeout(_attacherListenersAdvanced, 0);
    setTimeout(_attacherListenersConversion, 0);
  };

  // ========== EXÉCUTION DE L'EXPORT ==========
  function _executerExport() {
    if (_activeTab === "full")              _exportFull();
    else if (_activeTab === "advanced")     _exportAdvanced();
    else if (_activeTab === "conversion")   _exportConversion();
    else if (_activeTab === "fusion")       _exportFusion();
    else if (_activeTab === "extern") {
      // v1.14.1 — dispatch selon format choisi (radio pill)
      if (_externFormat === "gpx") _exportGpxViaExtern();
      else                          _exportKmz();
    }
  }

  // ========================================================
  // 📸 PHOTOS — helper de collecte pour les exports (v1.9.3-B1d)
  // ========================================================
  // Collecte TOUTES les photos en IDB pour le plan courant, avec leur
  // pointId associé. Retourne Promise<{ photos: Array<{id, blob, mime, pointId, size}>,
  // totalSize: number }>. Si MyKTAMapPhotos indispo ou aucune photo, retourne
  // un payload vide (le caller continue normalement).
  //
  // Filtre optionnel `pointIdsSet` : ne retourne que les photos des points
  // listés (utilisé pour les exports filtrés type Avancé qui ne prennent
  // qu'une partie des points). Si null → toutes les photos du plan.
  function _collecterPhotosPlan(pointIdsSet) {
    if (!window.MyKTAMapPhotos) {
      return Promise.resolve({ photos: [], totalSize: 0 });
    }
    const planId = window._currentLoadedPlanId || "default";
    return window.MyKTAMapPhotos.getAllPhotosForPlan(planId).then(function(arr) {
      const filtered = pointIdsSet
        ? arr.filter(function(r) { return pointIdsSet.has(String(r.pointId)); })
        : arr;
      let totalSize = 0;
      const photos = filtered.map(function(rec) {
        totalSize += rec.size || (rec.blob && rec.blob.size) || 0;
        return {
          id:      rec.id,
          blob:    rec.blob,
          mime:    rec.mime || "image/jpeg",
          pointId: rec.pointId,
          size:    rec.size || (rec.blob && rec.blob.size) || 0
        };
      });
      return { photos: photos, totalSize: totalSize };
    }).catch(function(e) {
      console.warn("[SessionExport] _collecterPhotosPlan erreur :", e);
      return { photos: [], totalSize: 0 };
    });
  }

  // Détermine l'extension de fichier depuis un mime type photo.
  function _extDepuisMime(mime) {
    if (!mime) return "jpg";
    if (mime.indexOf("png")  >= 0) return "png";
    if (mime.indexOf("webp") >= 0) return "webp";
    if (mime.indexOf("gif")  >= 0) return "gif";
    return "jpg";
  }

  // Format human-readable d'une taille en bytes (Ko / Mo).
  function _formatBytes(n) {
    if (!n || n < 0) return "0 Ko";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " Ko";
    return (n / (1024 * 1024)).toFixed(1) + " Mo";
  }
  // Expose pour les autres modules / l'UI (counter de la modale)
  if (typeof window !== "undefined") window._kta_formatBytes = _formatBytes;

  // Packe un payload session + des photos dans un ZIP. Retourne Promise<Blob>.
  // Structure du ZIP :
  //   /session.json                  ← payload session (format devmap-session)
  //   /photos/<photoId>.<ext>        ← 1 fichier par photo (blob direct)
  //   /photos/_index.json            ← mapping photoId → pointId pour le restore
  //
  // L'index est redondant avec le pointId qu'on PEUT mettre dans les records
  // de editorPoints (cf. _enrichirPointsAvecPhotos), mais le garde séparé
  // permet un restore robuste même si l'user édite session.json à la main
  // et change des ids. Le restore IDB lit l'index en priorité.
  // 📄 v1.69.0 : `historePdfs` = TABLEAU de documents (chacun avec son `zipName`
  // déjà dédoublonné côté _exportFull). Un objet unique reste accepté par
  // sécurité si un appelant tiers n'a pas suivi.
  function _packerZipSession(payload, photos, filename, historePdfs) {
    if (typeof JSZip === "undefined") {
      alert(t("export.err.compressionIndispo"));
      return Promise.reject(new Error("JSZip indisponible"));
    }
    const zip = new JSZip();
    zip.file("session.json", JSON.stringify(payload, null, 2));

    if (photos && photos.length > 0) {
      const photosFolder = zip.folder("photos");
      const idx = {};
      photos.forEach(function(p) {
        const ext = _extDepuisMime(p.mime);
        const name = p.id + "." + ext;
        photosFolder.file(name, p.blob);
        idx[p.id] = {
          pointId: p.pointId,
          mime:    p.mime,
          size:    p.size,
          file:    name
        };
      });
      photosFolder.file("_index.json", JSON.stringify({
        version: 1,
        photos:  idx
      }, null, 2));
    }

    // 🆕 v1.34.29 — PDF Mode Histoire de session (importé par l'user via la
    // modale 📖). On le pose dans `mode-histoire/<name>` du ZIP. La référence
    // est déjà inscrite dans `payload.historeSessionPdf` côté _exportFull.
    const _docs = Array.isArray(historePdfs) ? historePdfs : (historePdfs ? [historePdfs] : []);
    if (_docs.length > 0) {
      const histoireFolder = zip.folder("mode-histoire");
      _docs.forEach(function(d) {
        if (!d || !d.blob) return;
        histoireFolder.file(d.zipName || d.name || "histoire.pdf", d.blob);
      });
    }

    return zip.generateAsync({ type: "blob" }).then(function(blob) {
      _telechargerBlob(blob, filename);
      return blob;
    });
  }

  // 🔒 v1.63.0 (A8) — Strip EXIF pour l'export anonymisé : chaque photo est
  // RE-ENCODÉE via canvas (photos.js > compressBlob, qui ne retourne plus
  // jamais le blob original) → métadonnées EXIF (dont GPS) garanties
  // absentes. FAIL-CLOSED : une photo qui ne peut pas être ré-encodée est
  // EXCLUE de l'export — jamais de blob original dans un ZIP anonymisé.
  function _stripperExifPhotos(pack) {
    if (!window.MyKTAMapPhotos || typeof window.MyKTAMapPhotos.compressBlob !== "function") {
      console.warn("[SessionExport] Module photos absent — photos exclues de l'export anonymisé (fail-closed)");
      return Promise.resolve({ photos: [], totalSize: 0 });
    }
    return Promise.all(pack.photos.map(function(p) {
      return window.MyKTAMapPhotos.compressBlob(p.blob, {})
        .then(function(b) {
          return { id: p.id, blob: b, mime: b.type || "image/jpeg", pointId: p.pointId, size: b.size };
        })
        .catch(function(e) {
          console.warn("[SessionExport] Strip EXIF impossible pour", p.id, "— photo EXCLUE (fail-closed) :", e);
          return null;
        });
    })).then(function(arr) {
      const photos = arr.filter(Boolean);
      let total = 0;
      photos.forEach(function(p) { total += p.size; });
      const exclues = pack.photos.length - photos.length;
      if (exclues > 0) console.warn("[SessionExport] " + exclues + " photo(s) exclue(s) de l'export anonymisé (re-encodage impossible)");
      console.log("[SessionExport] Strip EXIF : " + photos.length + " photo(s) ré-encodée(s) pour l'export anonymisé");
      return { photos: photos, totalSize: total };
    });
  }

  // Marque chaque editorPoint avec un array `photos: [photoId, ...]` listant
  // les photos qui lui sont rattachées. Permet un viewer "rapide" qui sait
  // qu'un point a N photos sans relire l'index.
  function _enrichirPointsAvecPhotos(points, photos) {
    if (!points || !photos || photos.length === 0) return points;
    const parPoint = {};
    photos.forEach(function(p) {
      const k = String(p.pointId);
      if (!parPoint[k]) parPoint[k] = [];
      parPoint[k].push(p.id);
    });
    return points.map(function(pt) {
      const ids = parPoint[String(pt.id || "")];
      if (!ids || ids.length === 0) return pt;
      const clone = Object.assign({}, pt);
      clone.photos = ids;
      return clone;
    });
  }

  // ========================================================
  // 🛡️ v1.31.7 F1 — ANONYMISATION POUR PARTAGE PUBLIC
  // ========================================================
  // Substitue les noms POI / roads / zones / structures par des codes
  // séquentiels (emoji + #N) et vide les notes/descriptions, retire le
  // tracker GPS et le profil user.
  //
  // Objectif : permettre à un cataphile/spéléo de partager un plan utile
  // (structure + coords + tags) sans exposer ses repérages personnels (nom
  // de POI sensibles, notes opérationnelles, historique de présence).
  //
  // Le destinataire qui connaît la zone peut toujours coordonner ("celui
  // qu'on appelle 💎 POI #3") — la traçabilité humaine reste possible mais
  // ne fuite plus dans l'archive numérique.
  //
  // 1:1 préservé : x, y, level, tags, type. Reconstructibles par le ré-import.
  // Strippé : id, nom, label, description, profondeur, date_update,
  //           tracker, photos (= EXIF), user/author.
  // Marqué : session.anonymized = true + session.anonymizedAt = ISO.
  // 🔒 v1.63.0 (A8) : accepte un 2e param `photos` (records de
  // _collecterPhotosPlan, déjà strippés EXIF par _stripperExifPhotos).
  // Les ids photo sont renommés (`photo-anon-N`, zip-safe), le pointId de
  // chaque photo est remappé vers le CODE anonymisé du point, et les points
  // anonymisés récupèrent leur liste `photos` — la liaison photo↔point
  // survit à l'anonymisation sans fuiter les ids d'origine.
  function _anonymiserSession(session, photos) {
    // Mapping emoji par tag (built-in connus + fallback "🎯")
    // ⚠️ Synchroniser avec TAGS_BUILTIN si nouveau tag ajouté.
    const EMOJI_PAR_TAG = {
      aeration: "💨", pa: "🕳️", siphon: "💧",
      effondrement: "⚠️", incertain: "❓",
      chaufferette: "🔥", baffle: "🚧",
      eau: "💧", lampe: "🔦", echelle: "🪜",
      fissure: "💔", entree: "🚪", sortie: "🚪",
      explosif: "💥", chantier: "🏗️",
      gem: "💎", graff: "🎨", photo: "📷"
    };
    function _emojiPour(tag) {
      const t = String(tag || "").toLowerCase();
      return EMOJI_PAR_TAG[t] || "🎯";
    }

    // 1. editorPoints — séquence par tag (cohérent avec coordination terrain)
    // 🔒 v1.63.0 : idMap id d'origine → code anonymisé (remappage photos)
    const idMap = {};
    if (Array.isArray(session.editorPoints)) {
      const counterByTag = {};
      session.editorPoints = session.editorPoints.map(function(p) {
        const firstTag = (Array.isArray(p.tags) && p.tags.length) ? p.tags[0] : "";
        const emoji   = _emojiPour(firstTag);
        const key     = firstTag || "_notag";
        counterByTag[key] = (counterByTag[key] || 0) + 1;
        const code = emoji + " POI #" + counterByTag[key];
        if (p.id) idMap[String(p.id)] = code;
        const out  = {
          id:    code,
          nom:   code,
          x:     p.x,
          y:     p.y,
          tags:  Array.isArray(p.tags) ? p.tags.slice() : [],
          etat:  "Non inspectée",  // valeur neutre par défaut
          description: "",
          profondeur:  null,
          source:      "editor"
        };
        if (typeof p.level === "number") out.level = p.level;
        return out;
      });
    }

    // 🔒 v1.63.0 (A8) : photos incluses dans l'export anonymisé (blobs déjà
    // strippés EXIF en amont). Renommage zip-safe + remappage vers les codes
    // anonymisés + ré-attache des listes `photos` sur les points anonymisés.
    if (Array.isArray(photos) && photos.length > 0) {
      let n = 0;
      photos.forEach(function(p) {
        n++;
        p.id      = "photo-anon-" + n;
        p.pointId = idMap[String(p.pointId)] || "";
        p.mime    = p.mime || "image/jpeg";
      });
      session.editorPoints = _enrichirPointsAvecPhotos(session.editorPoints, photos);
    }

    // 2. roads — séquence globale
    if (Array.isArray(session.roads)) {
      let n = 0;
      session.roads = session.roads.map(function(r) {
        n++;
        const code = "🛣️ Tracé #" + n;
        const out = {
          id:     code,
          type:   r.type,                       // type préservé (principal/secondaire/etc.)
          points: r.points,                     // géométrie préservée
          label:  code,                         // standardise sur label
          description: ""
        };
        if (typeof r.level === "number") out.level = r.level;
        // jonction : préserve fromLevel/toLevel (= graphe pathfinder, anonyme)
        if (Number.isInteger(r.fromLevel)) out.fromLevel = r.fromLevel;
        if (Number.isInteger(r.toLevel))   out.toLevel   = r.toLevel;
        return out;
      });
    }

    // 3. zones — séquence globale
    if (Array.isArray(session.zones)) {
      let n = 0;
      session.zones = session.zones.map(function(z) {
        n++;
        const code = "⬛ Zone #" + n;
        const out = {
          id:     code,
          type:   z.type,
          points: z.points,
          nom:    code,
          description: ""
        };
        if (typeof z.level === "number") out.level = z.level;
        return out;
      });
    }

    // 4. structures — séquence globale
    if (Array.isArray(session.structures)) {
      let n = 0;
      session.structures = session.structures.map(function(s) {
        n++;
        const code = "🏛️ Struct #" + n;
        const out = {
          id:     code,
          type:   s.type,
          points: s.points,
          nom:    code,
          description: ""
        };
        if (typeof s.level === "number") out.level = s.level;
        return out;
      });
    }

    // 5. tracker → retiré entièrement (geo-historique daté = très révélateur)
    delete session.tracker;

    // 6. profil user / author (rarement présent dans export session, mais
    //    on nettoie défensivement au cas où un futur champ serait ajouté)
    delete session.user;
    delete session.userProfile;
    delete session.author;

    // 7. compteurs photos (info récap) — retirés seulement si pas de photos
    // (🔒 v1.63.0 : photos strippées EXIF désormais incluables → les
    // compteurs calculés en amont sur le pack strippé restent justes)
    if (!Array.isArray(photos) || photos.length === 0) {
      delete session.photosCount;
      delete session.photosTotalKB;
    }

    // 🆕 v1.34.29 : Mode Histoire (note libre + PDF session)
    delete session.noteLibre;
    delete session.historeSessionPdf;
    delete session.historeSessionPdfs;   // 📄 v1.69.0 (multi-documents)

    // 8. marqueur d'anonymisation pour audit côté destinataire
    session.anonymized   = true;
    session.anonymizedAt = new Date().toISOString();

    return session;
  }

  // ---------- FULL ----------
  // 🆕 v1.34.29 — Helper async pour lire le PDF Histoire de session depuis
  // IDB `myktamap_histoire_pdfs` (cf js/modeHistoire.js v1.34.20+). Retourne
  // { blob, name } ou null si absent. Ouverture/fermeture IDB ad-hoc — pas
  // d'optimisation cache car export est un one-shot.
  // 📄 v1.69.0 — MULTI-DOCUMENTS. Retourne un TABLEAU [{blob, name}] (vide si
  // aucun). Deux pièges corrigés ici :
  //   ① l'ouverture était figée sur `open(name, 1)` : depuis le passage du store
  //      en v2 (keyPath `id` + index `by_plan`), ça déclenchait une VersionError
  //      → le PDF disparaissait SILENCIEUSEMENT des exports ;
  //   ② `get(planId)` ne marche plus (la clé est l'id du document) → lecture via
  //      l'index `by_plan`.
  // On ouvre SANS version pour suivre celle qui existe, et le fallback
  // onupgradeneeded s'aligne sur le schéma v2 (sinon modeHistoire hériterait
  // d'une base au mauvais schéma).
  function _lirePdfsHistoireSession() {
    if (!window.indexedDB) return Promise.resolve([]);
    const planId = window._currentLoadedPlanId || "default";
    return new Promise(function(resolve) {
      try {
        const req = indexedDB.open("myktamap_histoire_pdfs");
        req.onupgradeneeded = function(e) {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("pdfs")) {
            const st = db.createObjectStore("pdfs", { keyPath: "id" });
            st.createIndex("by_plan", "planId", { unique: false });
          }
        };
        req.onsuccess = function() {
          const db = req.result;
          if (!db.objectStoreNames.contains("pdfs")) {
            try { db.close(); } catch(e) {}
            resolve([]);
            return;
          }
          try {
            const st = db.transaction("pdfs", "readonly").objectStore("pdfs");
            // Base encore en v1 (l'user n'a pas rouvert le Mode Histoire depuis
            // la mise à jour) : pas d'index, la clé EST le planId.
            if (!st.indexNames.contains("by_plan")) {
              const g = st.get(planId);
              g.onsuccess = function() {
                const rec = g.result;
                try { db.close(); } catch(e) {}
                resolve((rec && rec.blob) ? [{ blob: rec.blob, name: rec.name || "histoire.pdf" }] : []);
              };
              g.onerror = function() { try { db.close(); } catch(e) {} resolve([]); };
              return;
            }
            const req2 = st.index("by_plan").getAll(IDBKeyRange.only(String(planId)));
            req2.onsuccess = function() {
              const arr = (req2.result || []).filter(function(r) { return r && r.blob; });
              arr.sort(function(a, b) { return (a.addedAt || 0) - (b.addedAt || 0); });
              try { db.close(); } catch(e) {}
              resolve(arr.map(function(r) { return { blob: r.blob, name: r.name || "histoire.pdf" }; }));
            };
            req2.onerror = function() { try { db.close(); } catch(e) {} resolve([]); };
          } catch(e) { try { db.close(); } catch(e2) {} resolve([]); }
        };
        req.onerror = function() { resolve([]); };
      } catch(e) {
        resolve([]);
      }
    });
  }

  // 🆕 v1.34.29 — Helper pour lire la note libre Mode Histoire depuis
  // localStorage `myktamap_note_libre_<planId>` (cf js/modeHistoire.js).
  // Retourne la chaîne (potentiellement vide) ou null si jamais sauvée.
  function _lireNoteLibreSession() {
    try {
      const planId = window._currentLoadedPlanId || "default";
      const v = localStorage.getItem("myktamap_note_libre_" + planId);
      return (v && v.length > 0) ? v : null;
    } catch(e) {
      return null;
    }
  }

  function _exportFull() {
    const d = _compter();
    // 🆕 v1.9.3-A1.a + A1.b.2.5 : structures + mesure comptent aussi
    // pour le test "session vide" (sinon un user qui n'a fait QUE de
    // la mesure verrait "session vide" alors qu'il a contenu).
    const mesureLen     = (d.mesure        || []).length;
    // 🆕 v1.12.0-fix : surface aussi prise en compte pour le test "session vide"
    const mesureSurfLen = (d.mesureSurface || []).length;
    // 🆕 v1.34.29 — Mode Histoire (note libre + PDF session) compte aussi
    // pour le test "session vide" : si l'user n'a QUE pris des notes ou
    // importé un PDF Histoire, c'est légitime à exporter.
    const noteLibre = _lireNoteLibreSession();
    const hasNoteLibre = !!(noteLibre && noteLibre.length > 0);
    if (d.points.length === 0 && d.roads.length === 0 && d.zones.length === 0
        && (d.structures || []).length === 0 && mesureLen === 0 && mesureSurfLen === 0
        && !hasNoteLibre) {
      // Note : on ne peut pas check le PDF Histoire ici (async). On accepte
      // un cas edge : user qui n'aurait QUE un PDF Histoire (rien d'autre)
      // verrait "session vide". OK pour MVP (cas marginal).
      alert(t("export.err.fullVide"));
      return;
    }

    // 🆕 v1.9.3-B1d : checkbox "Inclure les photos" (default ON si photos présentes).
    const inclurePhotosCb = document.getElementById("full_photos");
    const inclurePhotos   = inclurePhotosCb ? inclurePhotosCb.checked : false;

    // 🆕 v1.31.7 F1 : toggle anonymisation pour partage public.
    // Si actif → force exclusion des photos (EXIF non strippé en MVP) et
    // applique la substitution des labels sur le payload session.
    const anonymizeCb = document.getElementById("full_anonymize");
    const anonymize   = !!(anonymizeCb && anonymizeCb.checked);

    // Collecte des photos (async — on encapsule tout dans la chaîne Promise).
    // 🔒 v1.63.0 (A8) : l'anonymisation n'exclut PLUS les photos — elles
    // sont ré-encodées (strip EXIF/GPS) par _stripperExifPhotos plus bas.
    const photosPromise = inclurePhotos
      ? _collecterPhotosPlan(null)
      : Promise.resolve({ photos: [], totalSize: 0 });

    // 🆕 v1.34.29 — Collecte Mode Histoire (note libre localStorage + PDF
    // session IDB) en parallèle des photos. Si anonymize ON, on skip tout
    // (la note libre peut contenir des infos perso, le PDF aussi).
    const histoirePromise = anonymize
      ? Promise.resolve({ note: null, pdfs: [] })
      : _lirePdfsHistoireSession().then(function(pdfs) {
          return { note: _lireNoteLibreSession(), pdfs: pdfs || [] };
        });

    Promise.all([photosPromise, histoirePromise]).then(function(results) {
      // 🔒 v1.63.0 (A8) : anonymize + photos → strip EXIF AVANT toute
      // construction du payload (fail-closed : photo non ré-encodable exclue).
      const stripPromise = (anonymize && results[0].photos.length > 0)
        ? _stripperExifPhotos(results[0])
        : Promise.resolve(results[0]);
      return stripPromise.then(function(pack) { return [pack, results[1]]; });
    }).then(function(results) {
      const pack = results[0];
      const histoire = results[1];
      const photos = pack.photos;
      // Enrichit les points avec leur liste de photoIds (pour viewer rapide
      // et debug à la main du JSON par l'user).
      const editorPointsEnriched = _enrichirPointsAvecPhotos(d.points, photos);

      const session = {
        type: "devmap-session",
        version: "1.0",
        date_export: new Date().toISOString(),
        editorPoints: editorPointsEnriched,
        roads:        d.roads,
        zones:        d.zones,
        // 🆕 v1.9.3-A1.a : structures (piliers + murs) dans l'export Full
        structures:   d.structures || [],
        // 🆕 v1.9.3-A1.b.2.5 : mesure dans l'export Full (objet avec points
        // pour cohérence avec le format attendu en import).
        measure:      { points: d.mesure || [] },
        // 🆕 v1.12.0-fix : mesure de surface dans l'export Full
        measureSurface: { points: d.mesureSurface || [] },
        // 🆕 v1.48.0 (KARMA) : LÉGENDE CUSTOM → session AUTOPORTANTE. Les types
        // custom (zones/tracés/tags/structures inventés par l'user) gardent
        // label+couleur+icône à l'import, même sur un ZIP vierge. Miroir de
        // SessionPersist (qui embarquait déjà getSessionState au reload).
        customLegend: (window.LegendCustomization && window.LegendCustomization.getSessionState)
                        ? window.LegendCustomization.getSessionState() : null,
        // 🌀 v1.57.0 : liaisons inter-plan du plan courant (registre central
        // myktamap_interplan_links_v1) → session AUTOPORTANTE cross-appareil.
        // Réinjectées au registre à l'import (fusion par id, cf.
        // interfaceImportExport.js). Ids de plans déterministes → portables.
        interPlanLinks: (window.InterPlanLinks && window._currentLoadedPlanId)
                          ? window.InterPlanLinks.getLinksForPlan(window._currentLoadedPlanId) : []
      };

      // 🆕 v1.21.2 (KARMA "tu enrengister dans export session le tracker ?
      // si non fait le, ignoré et supprimé lors d'une conversion data layer") :
      // tracker GPS dans l'export Full → permet de transporter l'historique
      // multi-sessions (heatmap + replay cross-appareil). On embed :
      //   - position : pose courante du marker (objet ou null)
      //   - path     : polyline runtime visible Leaflet (rendu carte session)
      //   - timeline : timeline temporelle datée [{x,y,t,deltaMs,type,level?}]
      //                ← survit aux reloads depuis v1.21.2 SessionPersist
      //   - startTs  : timestamp UNIX du startTracking
      // Champ totalement absent si timeline vide ET pas de path runtime
      // (= user n'a jamais tracké) → rétrocompat absolue avec anciens
      // imports devmap-session pré-v1.21.2 (ignoré silencieusement).
      const _hasTracker = (d.trackerOk || (d.trackerPath || []).length > 0 ||
                           (d.trackerTimeline || []).length > 0);
      if (_hasTracker) {
        session.tracker = {
          position: d.trackerOk ? (window.getTrackingPosition && window.getTrackingPosition() || null) : null,
          path:     d.trackerPath || [],
          timeline: d.trackerTimeline || [],
          startTs:  d.trackerStartTs  || null
        };
      }
      // 🆕 v1.9.3-B1d : info récap photos dans le JSON pour aider l'import
      // (le re-import sait combien attendre).
      if (photos.length > 0) {
        session.photosCount    = photos.length;
        session.photosTotalKB  = Math.round(pack.totalSize / 1024);
      }

      // 🆕 v1.34.29 — Mode Histoire embarqué dans la session.
      // `noteLibre` est inline dans session.json (texte simple, généralement
      // < quelques KB). `historeSessionPdf` pointe vers un fichier dans le
      // ZIP (chemin `mode-histoire/<name>`) car les PDFs sont des binaires
      // qu'on ne veut pas base64-encoder dans le JSON.
      // À l'import, sessionImporter.js (v1.34.30+) restaure :
      //   - note libre → localStorage `myktamap_note_libre_<currentPlanId>`
      //   - PDF        → IDB `myktamap_histoire_pdfs.put({planId, blob, name})`
      // Si anonymize ON, `histoire.note` et `histoire.pdf` sont null (skip plus haut).
      if (histoire.note && histoire.note.length > 0) {
        session.noteLibre = histoire.note;
      }
      // 📄 v1.69.0 — N documents possibles. `historeSessionPdfs` = tableau
      // (nouveau) ; `historeSessionPdf` = premier document, CONSERVÉ pour que
      // les versions antérieures relisent au moins un PDF (rétrocompat).
      // Les noms sont dédoublonnés : deux fichiers homonymes s'écraseraient
      // dans le dossier ZIP.
      if (histoire.pdfs && histoire.pdfs.length > 0) {
        const vus = {};
        histoire.pdfs.forEach(function(p) {
          let n = p.name || "histoire.pdf";
          if (vus[n]) {
            const pt = n.lastIndexOf(".");
            const base = (pt > 0) ? n.slice(0, pt) : n;
            const ext  = (pt > 0) ? n.slice(pt) : "";
            n = base + "-" + (vus[p.name || "histoire.pdf"] + 1) + ext;
          }
          vus[p.name || "histoire.pdf"] = (vus[p.name || "histoire.pdf"] || 0) + 1;
          p.zipName = n;
        });
        session.historeSessionPdfs = histoire.pdfs.map(function(p) {
          return { name: p.zipName, file: "mode-histoire/" + p.zipName };
        });
        session.historeSessionPdf = session.historeSessionPdfs[0];
      }

      // 🆕 v1.31.7 F1 : applique l'anonymisation APRÈS construction du
      // payload — comme ça la logique d'inclusion (tracker, photos…)
      // reste identique, on mute juste le résultat avant download.
      // 🔒 v1.63.0 (A8) : les photos (déjà strippées EXIF) sont passées pour
      // renommage zip-safe + remappage vers les codes anonymisés.
      if (anonymize) {
        _anonymiserSession(session, photos);
      }

      // Préfixe du nom de fichier : "session-anon-…" quand anonymisé
      // pour rappeler au destinataire que le payload est anonymisé.
      const fnPrefix = anonymize ? "session-anon" : "session";

      // 🆕 v1.34.29 — Force ZIP si PDF Histoire présent (le blob ne tient pas
      // dans un JSON pur). La note libre seule reste compatible JSON pur car
      // c'est du texte inline.
      const hasHistoirePdf = !!(histoire.pdfs && histoire.pdfs.length > 0);

      if (photos.length > 0 || hasHistoirePdf) {
        // Bundle ZIP : session.json + photos/ + mode-histoire/<pdf>
        // 🔒 v1.63.0 (A8) : ce chemin est désormais POSSIBLE avec anonymize
        // ON — les photos y sont garanties strippées EXIF (re-encodées,
        // fail-closed) et renommées photo-anon-N. Le PDF Histoire, lui,
        // reste exclu de l'anonymisation (contenu perso non nettoyable).
        _packerZipSession(session, photos, _filename(fnPrefix, "zip"), histoire.pdfs)
          .then(function() { _fermer(); })
          .catch(function(err) {
            console.error("[SessionExport] _packerZipSession :", err);
            alert(t("export.err.zipCreation", { err: err.message || err }));
          });
      } else {
        // Pas de photos ni PDF → JSON pur (rétro-compat absolue).
        // La note libre, si présente, reste inline dans session.json.
        _telechargerJSON(session, _filename(fnPrefix));
        _fermer();
      }
    });
  }

  // ---------- AVANCÉ ----------
  function _exportAdvanced() {
    const d = _compter();
    const incPoints = document.getElementById("adv_points")?.checked;
    const incTracker = document.getElementById("adv_tracker")?.checked;
    // 🆕 v1.9.3-A1.a : checkbox pour structures (optionnel, default ON
    // si la checkbox n'existe pas encore dans l'UI → fallback inclus).
    const incStructuresCb = document.getElementById("adv_structures");
    const incStructures = incStructuresCb ? incStructuresCb.checked : true;

    const roadTypes = ["principal", "secondaire", "chemin"].filter(function(t) {
      return document.getElementById("adv_roads_" + t)?.checked;
    });
    const zoneTypes = ["eau", "remblais", "effondrement", "inaccessible"].filter(function(t) {
      return document.getElementById("adv_zones_" + t)?.checked;
    });
    // 🆕 v1.9.3-A1.a : sous-types structures filtables. Si aucune checkbox
    // par type n'existe encore dans l'UI (= UI A1.a minimal), on inclut
    // les 3 sous-types par défaut.
    const structureTypes = ["pilier-1", "pilier-2", "mur", "front-1", "front-2"].filter(function(t) {
      const cb = document.getElementById("adv_structures_" + t);
      return cb ? cb.checked : true;
    });

    // 🪜 v169 (Karma_dev) : jonctions interniveau toujours préservées dans
    // l'export Avancé (= bridges du graphe pathfinder, non négociables). Sans
    // ce bypass, le filter `roadTypes.indexOf(r.type) >= 0` les retirerait
    // silencieusement car "jonction" n'est PAS dans roadTypes (qui ne liste
    // que principal/secondaire/chemin). Idem dans Conversion plus bas.
    //
    // 🆕 v1.21.1 (audit fix #5) : bypass parallèle pour les types `cust-*`
    // (entrées custom Légende dessinables). Sans ce bypass, les roads/zones/
    // structures custom étaient SILENCIEUSEMENT droppées de l'export Avancé.
    // Symétrique au fix KMZ export #2.
    function _isCustom(t) { return typeof t === "string" && t.indexOf("cust-") === 0; }
    const filteredRoads = (d.roads || []).filter(function(r) {
      if (r.type === "jonction") return true;     // bypass jonction
      if (_isCustom(r.type))     return true;     // 🆕 bypass customs
      return roadTypes.indexOf(r.type) >= 0;
    });
    const filteredZones = (d.zones || []).filter(function(z) {
      if (_isCustom(z.type))     return true;     // 🆕 bypass customs
      return zoneTypes.indexOf(z.type) >= 0;
    });
    // 🆕 v1.9.3-A1.a : filtrage structures par type coché.
    const filteredStructures = incStructures
      ? (d.structures || []).filter(function(s) {
          if (_isCustom(s.type)) return true;     // 🆕 bypass customs
          return structureTypes.indexOf(s.type) >= 0;
        })
      : [];

    // Filtrer les points par tags cochés
    let filteredPoints = [];
    if (incPoints) {
      const tagsList = _listerTagsPoints(d.points);
      const sel = _lireTagsCoches("adv_points_tag_", tagsList);
      filteredPoints = _filtrerPointsParTags(d.points, sel.tagsCoches, sel.untaggedCoche);
    }

    const _hasTrkData = (d.trackerOk
                         || (d.trackerPath || []).length > 0
                         || (d.trackerTimeline || []).length > 0);
    const tracker = (incTracker && _hasTrkData) ? {
      position: d.trackerOk ? (window.getTrackingPosition && window.getTrackingPosition() || null) : null,
      path:     d.trackerPath || [],
      timeline: d.trackerTimeline || [],
      startTs:  d.trackerStartTs || null
    } : null;

    // 🆕 v1.9.3-A1.b.2.5 : checkbox mesure (UI fallback ON si absente)
    const incMesureCb = document.getElementById("adv_mesure");
    const incMesure = incMesureCb ? incMesureCb.checked : true;
    const mesurePts = incMesure ? (d.mesure || []) : [];
    // 🆕 v1.12.0-fix : checkbox mesure surface (UI fallback ON si absente).
    // Polygone valide à partir de 3 sommets → cap à 0 si en-dessous.
    const incMesureSurfCb = document.getElementById("adv_mesure_surface");
    const incMesureSurf = incMesureSurfCb ? incMesureSurfCb.checked : true;
    const mesureSurfPts = (incMesureSurf && (d.mesureSurface || []).length >= 3) ? (d.mesureSurface || []) : [];

    const total = filteredPoints.length + filteredRoads.length + filteredZones.length
                + filteredStructures.length + mesurePts.length + mesureSurfPts.length + (tracker ? 1 : 0);
    if (total === 0) {
      alert(t("export.err.advVide"));
      return;
    }

    const fmt = document.querySelector('input[name="adv_format"]:checked')?.value || "single";

    // 🆕 v1.9.3-B1d+ : photos. Filtre par les points effectivement exportés
    // (= filteredPoints). Si l'user a décoché les points, ou qu'aucun point
    // exporté n'a de photo, le pack sera vide → comportement strictement v1.9.2.
    const inclurePhotosCb = document.getElementById("adv_photos");
    const inclurePhotos   = inclurePhotosCb ? inclurePhotosCb.checked : false;

    const pointIdsSet = inclurePhotos && filteredPoints.length > 0
      ? new Set(filteredPoints.map(function(p) { return String(p.id || ""); }))
      : null;
    const photosPromise = (inclurePhotos && pointIdsSet)
      ? _collecterPhotosPlan(pointIdsSet)
      : Promise.resolve({ photos: [], totalSize: 0 });

    photosPromise.then(function(pack) {
      const photos = pack.photos;
      // Enrichit les points filtrés avec leur liste de photoIds (utile en
      // single mode où l'user peut re-importer + voir les photos dans les
      // popups). On mute filteredPoints en place via le helper qui clone.
      const enrichedPoints = _enrichirPointsAvecPhotos(filteredPoints, photos);

      if (fmt === "single") {
        // 1 seul fichier session (JSON ou ZIP selon présence photos)
        const session = {
          type: "devmap-session",
          version: "1.0",
          date_export: new Date().toISOString()
        };
        if (enrichedPoints.length)     session.editorPoints = enrichedPoints;
        if (filteredRoads.length)      session.roads        = filteredRoads;
        if (filteredZones.length)      session.zones        = filteredZones;
        // 🆕 v1.9.3-A1.a : structures dans le JSON Avancé (single file)
        if (filteredStructures.length) session.structures   = filteredStructures;
        // 🆕 v1.9.3-A1.b.2.5 : mesure dans le JSON Avancé
        if (mesurePts.length)          session.measure        = { points: mesurePts };
        // 🆕 v1.12.0-fix : mesure de surface dans le JSON Avancé
        if (mesureSurfPts.length)      session.measureSurface = { points: mesureSurfPts };
        if (tracker)                   session.tracker        = tracker;
        // 🆕 v1.48.0 : légende custom si non vide → session autoportante.
        if (window.LegendCustomization && window.LegendCustomization.getSessionState &&
            window.LegendCustomization.isSessionStateEmpty && !window.LegendCustomization.isSessionStateEmpty()) {
          session.customLegend = window.LegendCustomization.getSessionState();
        }
        // 🌀 v1.57.0 : liaisons inter-plan du plan courant (si non vide)
        if (window.InterPlanLinks && window._currentLoadedPlanId) {
          const _ipl = window.InterPlanLinks.getLinksForPlan(window._currentLoadedPlanId);
          if (_ipl.length > 0) session.interPlanLinks = _ipl;
        }
        if (photos.length > 0) {
          session.photosCount   = photos.length;
          session.photosTotalKB = Math.round(pack.totalSize / 1024);
        }

        if (photos.length > 0) {
          // Bundle ZIP : session.json + photos/ (= même structure que Full ZIP)
          _packerZipSession(session, photos, _filename("session", "zip"))
            .then(function() { _fermer(); })
            .catch(function(err) {
              console.error("[SessionExport] _packerZipSession Avancé :", err);
              alert(t("export.err.zipCreation", { err: err.message || err }));
            });
        } else {
          // Pas de photos → JSON pur (rétrocompat absolue)
          _telechargerJSON(session, _filename("session"));
          _fermer();
        }
      } else {
        // ZIP multi-fichiers — chaque catégorie dans un fichier session séparé
        // + dossier photos/ si photos cochées
        _genererZipAdvanced(enrichedPoints, filteredRoads, filteredZones, filteredStructures, mesurePts, mesureSurfPts, tracker, photos);
      }
    });
  }

  function _genererZipAdvanced(points, roads, zones, structures, mesurePts, mesureSurfPts, tracker, photos) {
    if (typeof JSZip === "undefined") {
      alert(t("export.err.compressionIndispo"));
      return;
    }
    const zip = new JSZip();
    const now = new Date().toISOString();

    function file(name, payload) {
      const obj = Object.assign({ type: "devmap-session", version: "1.0", date_export: now }, payload);
      zip.file(name, JSON.stringify(obj, null, 2));
    }

    if (points.length)     file("session_points.json",     { editorPoints: points });
    if (roads.length)      file("session_roads.json",      { roads: roads });
    if (zones.length)      file("session_zones.json",      { zones: zones });
    // 🆕 v1.9.3-A1.a : fichier dédié pour les structures dans le ZIP Avancé
    if (structures.length) file("session_structures.json", { structures: structures });
    // 🆕 v1.9.3-A1.b.2.5 : fichier dédié pour la mesure dans le ZIP Avancé
    if (mesurePts && mesurePts.length) file("session_measure.json", { measure: { points: mesurePts } });
    // 🆕 v1.12.0-fix : fichier dédié pour la mesure de surface dans le ZIP Avancé
    if (mesureSurfPts && mesureSurfPts.length) file("session_measureSurface.json", { measureSurface: { points: mesureSurfPts } });
    if (tracker)           file("session_tracker.json",    { tracker: tracker });

    // 🆕 v1.9.3-B1d+ : dossier photos/ + _index.json (même format que le
    // ZIP Full bundle). Permet au re-import de retrouver les blobs +
    // remapper le pointId si l'user a renommé un point depuis.
    if (photos && photos.length > 0) {
      const photosFolder = zip.folder("photos");
      const idx = {};
      photos.forEach(function(p) {
        const ext  = _extDepuisMime(p.mime);
        const name = p.id + "." + ext;
        photosFolder.file(name, p.blob);
        idx[p.id] = {
          pointId: p.pointId,
          mime:    p.mime,
          size:    p.size,
          file:    name
        };
      });
      photosFolder.file("_index.json", JSON.stringify({
        version: 1,
        photos:  idx
      }, null, 2));
    }

    zip.generateAsync({ type: "blob" }).then(function(blob) {
      _telechargerBlob(blob, _filename("session", "zip"));
      _fermer();
    }).catch(function(e) {
      console.error("[SessionExport] ZIP :", e);
      alert(t("export.err.zipCreationGeneric"));
    });
  }

  // ---------- CONVERSION ----------
  // Dispatcher selon le sens choisi
  function _exportConversion() {
    if (_convDirection === "data2ed") return _exportConvData2Session();
    return _exportConvSession2Data();
  }

  // Sens 1 : session courante → fichiers data layer (logique existante renommée)
  function _exportConvSession2Data() {
    const d = _compter();
    const incPoints = document.getElementById("conv_points")?.checked;
    const incRoads  = document.getElementById("conv_roads")?.checked;
    const incZones  = document.getElementById("conv_zones")?.checked;
    // 🆕 v1.9.3-A1.a : structures dans la conversion session → data layer.
    // Default ON si la checkbox n'existe pas encore (A1.a UI minimal).
    const incStructuresCb = document.getElementById("conv_structures");
    const incStructures = incStructuresCb ? incStructuresCb.checked : true;
    const gran = document.querySelector('input[name="conv_gran"]:checked')?.value || "basic";

    // Filtrer les points par tags cochés
    let filteredPoints = [];
    if (incPoints) {
      const tagsList = _listerTagsPoints(d.points);
      const sel = _lireTagsCoches("conv_points_tag_", tagsList);
      filteredPoints = _filtrerPointsParTags(d.points, sel.tagsCoches, sel.untaggedCoche);
    }

    // Filtrer les roads par type coché (Principal / Secondaire / Chemin) +
    // exclure le type "itinerary" qui n'a rien à faire dans un export data layer.
    const roadTypesActifs = {
      principal:  document.getElementById("conv_roads_principal")?.checked  ?? true,
      secondaire: document.getElementById("conv_roads_secondaire")?.checked ?? true,
      chemin:     document.getElementById("conv_roads_chemin")?.checked     ?? true
    };
    const filteredRoads = incRoads
      ? (d.roads || []).filter(function(r) {
          if (r.type === "itinerary") return false;
          // 🪜 v169 (Karma_dev) : jonctions interniveau toujours préservées
          // dans la conversion → data layer (bridges essentiels du graphe
          // pathfinder, non filtrables par type principal/secondaire/chemin).
          if (r.type === "jonction") return true;
          return roadTypesActifs[r.type] !== false;
        })
      : [];

    // Filtrer les zones par type coché (Eau / Remblais / Effondrement / Inaccessible)
    const zoneTypesActifs = {
      eau:          document.getElementById("conv_zones_eau")?.checked          ?? true,
      remblais:     document.getElementById("conv_zones_remblais")?.checked     ?? true,
      effondrement: document.getElementById("conv_zones_effondrement")?.checked ?? true,
      inaccessible: document.getElementById("conv_zones_inaccessible")?.checked ?? true
    };
    const filteredZones = incZones
      ? (d.zones || []).filter(function(z) { return zoneTypesActifs[z.type] !== false; })
      : [];

    // 🆕 v1.9.3-A1.a + A1.b.2 : filtrage structures par type (5 sous-types
    // incl. fronts). v1.20.0-fix1 : front-1 et front-2 étaient absents de
    // ce dict → toujours inclus quoi que coche l'user (bug silencieux car
    // structureTypesActifs[type] = undefined !== false = true). Maintenant
    // les checkboxes UI sont respectées pour les 5 sous-types.
    const structureTypesActifs = {
      "pilier-1": document.getElementById("conv_structures_pilier-1")?.checked ?? true,
      "pilier-2": document.getElementById("conv_structures_pilier-2")?.checked ?? true,
      "mur":      document.getElementById("conv_structures_mur")?.checked      ?? true,
      "front-1":  document.getElementById("conv_structures_front-1")?.checked  ?? true,
      "front-2":  document.getElementById("conv_structures_front-2")?.checked  ?? true
    };
    const filteredStructures = incStructures
      ? (d.structures || []).filter(function(s) { return structureTypesActifs[s.type] !== false; })
      : [];

    const total = filteredPoints.length + filteredRoads.length + filteredZones.length
                + filteredStructures.length;
    if (total === 0) {
      alert(t("export.err.convVide"));
      return;
    }

    // 🆕 v1.9.3-B1d++ : photos. Filtre par points effectivement convertis.
    // Si N=0 ou case décochée → pack vide, comportement strictement v1.9.2.
    const inclurePhotosCb = document.getElementById("conv_ed2data_photos");
    const inclurePhotos   = inclurePhotosCb ? inclurePhotosCb.checked : false;
    const pointIdsSet = inclurePhotos && filteredPoints.length > 0
      ? new Set(filteredPoints.map(function(p) { return String(p.id || ""); }))
      : null;
    const photosPromise = (inclurePhotos && pointIdsSet)
      ? _collecterPhotosPlan(pointIdsSet)
      : Promise.resolve({ photos: [], totalSize: 0 });

    photosPromise.then(function(pack) {
      const photos = pack.photos;
      // Enrichit les points filtrés avec les photoIds → utile pour qu'un
      // re-import (data→session) puisse reconnecter les photos aux points
      // par lookup de point.photos[].
      const enrichedPoints = _enrichirPointsAvecPhotos(filteredPoints, photos);

      if (gran === "basic") {
      // Granularité basique : 1 fichier par catégorie (max 4)
      const files = [];
      if (enrichedPoints.length) {
        files.push({ name: "points.json", payload: { data: enrichedPoints } });
      }
      if (filteredRoads.length) {
        files.push({ name: "roads.json", payload: { data: [], roads: filteredRoads } });
      }
      if (filteredZones.length) {
        files.push({ name: "zones.json", payload: { data: [], zones: filteredZones } });
      }
      // 🆕 v1.9.3-A1.a : 4e catégorie en granularité basique
      if (filteredStructures.length) {
        files.push({ name: "structure.json", payload: { data: [], structures: filteredStructures } });
      }
      _telechargerConversionFiles(files, photos);
    } else {
      // Granularité fine : par type
      const files = [];

      if (enrichedPoints.length) {
        // Points : un seul fichier (les tags sont multiples → séparation ambigüe).
        // Utilise enrichedPoints pour préserver `photos: [photoIds]` même en
        // granularité fine.
        files.push({ name: "points.json", payload: { data: enrichedPoints } });
      }

      if (filteredRoads.length) {
        // 🪜 v169 (Karma_dev) : inclure "jonction" dans la granularité fine
        // pour ne pas perdre les bridges interniveau (sans ça, _trierParType
        // les listerait dans le bucket "_ignored" et ils seraient drop).
        const byType = _trierParType(filteredRoads, ["principal", "secondaire", "chemin", "jonction"]);
        ["principal", "secondaire", "chemin", "jonction"].forEach(function(t) {
          if (byType[t].length) {
            files.push({ name: "roads_" + t + ".json", payload: { data: [], roads: byType[t] } });
          }
        });
        _emettreTypesRestants(byType.autres, "roads", "roads", files);
      }

      if (filteredZones.length) {
        const byType = _trierParType(filteredZones, ["eau", "remblais", "effondrement", "inaccessible"]);
        ["eau", "remblais", "effondrement", "inaccessible"].forEach(function(t) {
          if (byType[t].length) {
            files.push({ name: "zones_" + t + ".json", payload: { data: [], zones: byType[t] } });
          }
        });
        _emettreTypesRestants(byType.autres, "zones", "zones", files);
      }

      // 🆕 v1.9.3-A1.a : structures en granularité fine, 1 fichier par
      // sous-type (pilier-1 / pilier-2 / mur). Format de payload :
      // { data: [], structures: [...] } pour rester un data layer valide
      // chargeable directement comme structure.json.
      if (filteredStructures.length) {
        const byType = _trierParType(filteredStructures, ["pilier-1", "pilier-2", "mur", "front-1", "front-2"]);
        ["pilier-1", "pilier-2", "mur", "front-1", "front-2"].forEach(function(t) {
          if (byType[t].length) {
            files.push({ name: "structures_" + t + ".json", payload: { data: [], structures: byType[t] } });
          }
        });
        _emettreTypesRestants(byType.autres, "structures", "structures", files);
      }

      _telechargerConversionFiles(files, photos);
    }
    });  // fin photosPromise.then
  }

  // Sens 2 : fichier data layer uploadé → fichier session JSON (ou ZIP si photos)
  function _exportConvData2Session() {
    if (!_convUploadedJson) {
      alert(t("export.err.convNoSource"));
      return;
    }
    const j = _convUploadedJson;
    const points = Array.isArray(j.data)         ? j.data
                 : Array.isArray(j.editorPoints) ? j.editorPoints
                 : [];
    const roads  = Array.isArray(j.roads) ? j.roads : [];
    const zones  = Array.isArray(j.zones) ? j.zones : [];
    // 🆕 v1.9.3-A1.a : structures dans le sens data layer → session.
    // Rétrocompat : fichiers data layer pré-A1.a n'ont pas `structures`
    // → tableau vide, pas de breakage.
    const structures = Array.isArray(j.structures) ? j.structures : [];

    if (points.length === 0 && roads.length === 0 && zones.length === 0
        && structures.length === 0) {
      alert(t("export.err.convSourceVide"));
      return;
    }

    const session = {
      type:        "devmap-session",
      version:     "1.0",
      date_export: new Date().toISOString()
    };
    if (points.length)     session.editorPoints = points;
    if (roads.length)      session.roads        = roads;
    if (zones.length)      session.zones        = zones;
    if (structures.length) session.structures   = structures;

    // 🆕 v1.9.3-B1d++ : si l'input ZIP contenait des photos, on les
    // ré-emballe dans un ZIP session de sortie (= même format que l'export
    // Full ZIP de B1.d.α). Le re-import session "📥 Importer une session"
    // saura les restaurer en IDB automatiquement.
    const hasPhotos = _convUploadedPhotos && _convUploadedPhotos.length > 0;
    const baseName = (_convUploadedName || "data").replace(/\.(json|zip)$/i, "");

    if (hasPhotos) {
      // Adapt _convUploadedPhotos {id, pointId, mime, size, blob} → format
      // attendu par _packerZipSession (= ce qui sort de _collecterPhotosPlan).
      const photosForPack = _convUploadedPhotos.map(function(p) {
        return {
          id:      p.id,
          blob:    p.blob,
          mime:    p.mime,
          pointId: p.pointId,
          size:    p.size
        };
      });
      // Ajoute photosCount/TotalKB pour cohérence avec l'export Full
      session.photosCount   = photosForPack.length;
      session.photosTotalKB = Math.round(photosForPack.reduce(function(s, p) {
        return s + (p.size || 0);
      }, 0) / 1024);

      _packerZipSession(session, photosForPack, baseName + "_session.zip")
        .then(function() { _fermer(); })
        .catch(function(err) {
          console.error("[SessionExport] Conv ZIP session sortie :", err);
          alert(t("export.err.zipSessionCreation", { err: err.message || err }));
        });
    } else {
      // Pas de photos → JSON pur (rétrocompat absolue)
      _telechargerJSON(session, baseName + "_session.json");
      _fermer();
    }
  }

  // 🆕 v1.9.3-B1d++ : param `photos` optionnel pour embarquer les blobs
  // photos dans le ZIP de conversion. Format identique au session ZIP
  // (B1.d.α) → photos/_index.json + photos/<photoId>.<ext>. Permet au
  // re-import data→session de reconnecter les photos automatiquement.
  // 🐛 v1.76.0 (F2) — LA LÉGENDE VOYAGE AVEC LE CALQUE.
  // Jusqu'ici seul l'ID du type partait (`cust-abc123`), jamais sa DÉFINITION.
  // Conséquence : on régénérait un plan avec le calque, on l'ouvrait, et les
  // tracés custom sortaient en BLANC, les zones en gris remblais, les
  // structures en bleu mur — sans même une ligne dans ≡ Légende, puisque le
  // panneau ne liste que les entrées connues et ne regarde jamais les objets
  // dessinés. Aucun chemin d'UI ne permettait de réparer.
  //
  // On n'embarque QUE ce que le fichier référence réellement : un calque de
  // 3 tracés ne doit pas traîner les 40 entrées de légende de la session.
  function _legendePourPayload(payload) {
    const LC = window.LegendCustomization;
    if (!LC || typeof LC.getSessionState !== "function") return null;
    let etat;
    try { etat = LC.getSessionState(); } catch(e) { return null; }
    if (!etat) return null;

    // Types réellement présents, par catégorie de légende.
    const parCat = { traces: new Set(), zones: new Set(), structures: new Set() };
    (payload.roads      || []).forEach(function(o) { if (o && o.type) parCat.traces.add(o.type); });
    (payload.zones      || []).forEach(function(o) { if (o && o.type) parCat.zones.add(o.type); });
    (payload.structures || []).forEach(function(o) { if (o && o.type) parCat.structures.add(o.type); });

    const idsUtilises = new Set();
    Object.keys(parCat).forEach(function(cat) {
      parCat[cat].forEach(function(tp) { if (String(tp).indexOf("cust-") === 0) idsUtilises.add(tp); });
    });

    // Les entrées CUSTOM référencées, avec leur définition complète.
    const customEntries = (etat.customEntries || []).filter(function(e) {
      return e && idsUtilises.has(e.id);
    });

    // Les personnalisations de types BUILT-IN présents (libellé renommé,
    // couleur choisie, masquage). Restreintes aux types du fichier.
    function _sousEnsemble(map) {
      const out = {};
      Object.keys(map || {}).forEach(function(k) {
        const sep = k.indexOf(".");
        if (sep < 0) return;
        const cat = k.slice(0, sep), tp = k.slice(sep + 1);
        if (parCat[cat] && parCat[cat].has(tp)) out[k] = map[k];
      });
      return out;
    }
    const labels = _sousEnsemble(etat.labels);
    const hidden = _sousEnsemble(etat.hidden);
    const colors = _sousEnsemble(etat.colors);

    if (!customEntries.length && !Object.keys(labels).length &&
        !Object.keys(hidden).length && !Object.keys(colors).length) return null;

    return {
      schemaVersion: etat.schemaVersion,
      labels: labels, hidden: hidden, colors: colors,
      customEntries: customEntries
    };
  }

  function _telechargerConversionFiles(files, photos) {
    if (files.length === 0) {
      alert(t("export.err.convRien"));
      return;
    }
    const now = new Date().toISOString();
    const hasPhotos = Array.isArray(photos) && photos.length > 0;

    // Wrap en format devmap-data + légende embarquée (F2).
    // Par FICHIER et non une fois pour toutes : un data layer doit rester
    // exploitable seul, sorti de son ZIP.
    let nbAvecLegende = 0;
    files.forEach(function(f) {
      const leg = _legendePourPayload(f.payload);
      if (leg) nbAvecLegende++;
      f.payload = Object.assign(
        { type: "devmap-data", version: "1.0", date_export: now },
        f.payload,
        leg ? { customLegend: leg } : {}
      );
    });
    if (nbAvecLegende > 0) {
      console.log("[SessionExport] légende embarquée dans " + nbAvecLegende + "/" + files.length + " fichier(s)");
    }

    // Cas le plus simple : 1 seul fichier, pas de photos → JSON direct (rétrocompat)
    if (files.length === 1 && !hasPhotos) {
      _telechargerJSON(files[0].payload, files[0].name);
      _fermer();
      return;
    }

    // Sinon (>1 fichier OU avec photos) → ZIP
    if (typeof JSZip === "undefined") {
      alert(t("export.err.compressionIndispo"));
      return;
    }
    const zip = new JSZip();
    files.forEach(function(f) {
      zip.file(f.name, JSON.stringify(f.payload, null, 2));
    });

    // 🆕 v1.9.3-B1d++ : dossier photos/ + _index.json. Format identique
    // au session ZIP (B1.d.α) pour cohérence et symétrie au re-import.
    if (hasPhotos) {
      const photosFolder = zip.folder("photos");
      const idx = {};
      photos.forEach(function(p) {
        const ext  = _extDepuisMime(p.mime);
        const name = p.id + "." + ext;
        photosFolder.file(name, p.blob);
        idx[p.id] = {
          pointId: p.pointId,
          mime:    p.mime,
          size:    p.size,
          file:    name
        };
      });
      photosFolder.file("_index.json", JSON.stringify({
        version: 1,
        photos:  idx
      }, null, 2));
    }

    zip.generateAsync({ type: "blob" }).then(function(blob) {
      _telechargerBlob(blob, _filename("data", "zip"));
      _fermer();
    }).catch(function(e) {
      console.error("[SessionExport] Conversion ZIP :", e);
      alert(t("export.err.zipCreationGeneric"));
    });
  }

  // ========================================================
  // 🔗 FUSION DE DATALAYERS (v1.55.0)
  // ========================================================
  // Ingère N fichiers data layer (.json ou .zip), concatène par CATÉGORIE
  // (data/roads/zones/structures) et ressort un fichier par type. Réutilise
  // _telechargerConversionFiles (sortie ZIP identique au sens session→data).

  // Merge PUR : concatène les 4 tableaux de N objets data layer + détecte les
  // ids POI en double (concat brut conservé, alerte seulement). Pas de DOM.
  function _mergeDatalayerObjects(jsons) {
    const merged = { data: [], roads: [], zones: [], structures: [] };
    (jsons || []).forEach(function(json) {
      if (!json || typeof json !== "object") return;
      // Points : .data (data layer) ou .editorPoints (export session)
      if (Array.isArray(json.data) && json.data.length) {
        merged.data = merged.data.concat(json.data);
      } else if (Array.isArray(json.editorPoints) && json.editorPoints.length) {
        merged.data = merged.data.concat(json.editorPoints);
      }
      if (Array.isArray(json.roads))      merged.roads      = merged.roads.concat(json.roads);
      if (Array.isArray(json.zones))      merged.zones      = merged.zones.concat(json.zones);
      if (Array.isArray(json.structures)) merged.structures = merged.structures.concat(json.structures);
    });
    // Détection des ids POI en double (alerte ; concat brut conservé)
    const seen = Object.create(null);
    const dupIds = [];
    merged.data.forEach(function(p) {
      const id = (p && p.id != null) ? String(p.id) : null;
      if (id == null) return;
      if (seen[id]) { if (dupIds.indexOf(id) < 0) dupIds.push(id); }
      else seen[id] = true;
    });
    merged.dupIds = dupIds;
    return merged;
  }

  // Lit un fichier .json → Promise<[{name, json}]> (tableau 0 ou 1 élément).
  function _fusionLireJson(f) {
    return new Promise(function(resolve) {
      const r = new FileReader();
      r.onload = function() {
        try {
          const json = JSON.parse(r.result);
          if (json && typeof json === "object") resolve([{ name: f.name, json: json }]);
          else resolve([]);
        } catch(e) {
          console.warn("[Fusion] JSON invalide ignoré :", f.name, e);
          resolve([]);
        }
      };
      r.onerror = function() { resolve([]); };
      r.readAsText(f);
    });
  }

  // Lit un .zip → Promise<[{name, json}]> (chaque .json racine = 1 entrée).
  function _fusionLireZip(f) {
    if (typeof JSZip === "undefined") return Promise.resolve([]);
    return JSZip.loadAsync(f).then(function(zip) {
      const entries = [];
      zip.forEach(function(relPath, entry) {
        if (entry.dir) return;
        if (relPath.indexOf("/") >= 0) return;       // ignore sous-dossiers (photos/)
        if (!/\.json$/i.test(relPath)) return;
        entries.push(entry);
      });
      return Promise.all(entries.map(function(entry) {
        return entry.async("string").then(function(txt) {
          try {
            const j = JSON.parse(txt);
            return (j && typeof j === "object") ? { name: f.name + "/" + entry.name, json: j } : null;
          } catch(e) { return null; }
        });
      })).then(function(arr) { return arr.filter(Boolean); });
    }).catch(function(e) {
      console.warn("[Fusion] ZIP illisible :", f.name, e);
      return [];
    });
  }

  // Ajoute N fichiers (FileList) aux inputs, re-merge, re-render.
  function _fusionAjouterFichiers(fileList) {
    const files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    const erreurEl = document.getElementById("kta-fusion-erreur");
    if (erreurEl) erreurEl.style.display = "none";

    const proms = files.map(function(f) {
      if (/\.zip$/i.test(f.name))  return _fusionLireZip(f);
      if (/\.json$/i.test(f.name)) return _fusionLireJson(f);
      return Promise.resolve([]);  // type non géré
    });
    Promise.all(proms).then(function(results) {
      const added = results.reduce(function(a, b) { return a.concat(b); }, []);
      if (!added.length) {
        if (erreurEl) { erreurEl.textContent = t("export.fusion.errNoValid"); erreurEl.style.display = "block"; }
        return;
      }
      _fusionInputs = _fusionInputs.concat(added);
      _fusionMerged = _mergeDatalayerObjects(_fusionInputs.map(function(x) { return x.json; }));
      _renderTab();
    });
  }

  function _renderFusion() {
    const m = _fusionMerged;

    let listeHtml = "";
    if (_fusionInputs.length) {
      listeHtml = _fusionInputs.map(function(f) {
        const j = f.json || {};
        const nbP = (Array.isArray(j.data) && j.data.length) ? j.data.length
                  : (Array.isArray(j.editorPoints) ? j.editorPoints.length : 0);
        const nbR = Array.isArray(j.roads) ? j.roads.length : 0;
        const nbZ = Array.isArray(j.zones) ? j.zones.length : 0;
        const nbS = Array.isArray(j.structures) ? j.structures.length : 0;
        const cats = [];
        if (nbP) cats.push("✏️ " + nbP);
        if (nbR) cats.push("🛣️ " + nbR);
        if (nbZ) cats.push("⬛ " + nbZ);
        if (nbS) cats.push("🏛️ " + nbS);
        return '<div class="kta-fusion-file"><span class="kta-fusion-file-name">' + _escapeHtml(f.name) +
               '</span><span class="kta-fusion-file-cats">' + (cats.join(" · ") || "∅") + '</span></div>';
      }).join("");
    }

    const filesSection = _fusionInputs.length
      ? `<div class="kta-ses-section">
           <div class="kta-ses-section-title">${t("export.fusion.filesTitle", { n: _fusionInputs.length })}
             <button id="kta-fusion-clear" class="kta-fusion-clear-btn" type="button">${t("export.fusion.clear")}</button>
           </div>
           <div class="kta-fusion-list">${listeHtml}</div>
         </div>`
      : "";

    let apercuHtml = "";
    if (m) {
      const dupHtml = (m.dupIds && m.dupIds.length)
        ? `<div class="kta-fusion-warn">⚠️ ${t("export.fusion.dupWarn", { n: m.dupIds.length })}</div>`
        : "";
      apercuHtml = `
        <div class="kta-ses-section">
          <div class="kta-ses-section-title">${t("export.fusion.apercuTitle")}</div>
          <div class="kta-ses-summary">
            <div>✏️ ${t("export.conv.d2sPoints",     { n: m.data.length,       s: m.data.length > 1 ? "s" : "" })}</div>
            <div>🛣️ ${t("export.conv.d2sRoads",      { n: m.roads.length,      s: m.roads.length > 1 ? "s" : "" })}</div>
            <div>⬛ ${t("export.conv.d2sZones",      { n: m.zones.length,      s: m.zones.length > 1 ? "s" : "" })}</div>
            <div>🏛️ ${t("export.conv.d2sStructures", { n: m.structures.length, s: m.structures.length > 1 ? "s" : "" })}</div>
          </div>
          ${dupHtml}
        </div>`;
    }

    return `
      <div class="kta-ses-intro">
        ${t("export.fusion.intro")}
        <br><span style="color:#8892a4;">${t("export.fusion.introDetail")}</span>
      </div>

      <div class="kta-ses-section">
        <div class="kta-ses-section-title">${t("export.fusion.sourceTitle")}</div>
        <div class="kta-conv-drop" id="kta-fusion-drop">
          <span>${t("export.fusion.dropEmpty")}</span>
          <input type="file" id="kta-fusion-file" accept=".json,.zip,application/json,application/zip" multiple style="display:none">
        </div>
      </div>

      ${filesSection}
      ${apercuHtml}

      <div id="kta-fusion-erreur" class="kta-conv-erreur" style="display:none;"></div>
    `;
  }

  function _bindFusion() {
    if (!_modal || _activeTab !== "fusion") return;
    const dropZone  = document.getElementById("kta-fusion-drop");
    const fileInput = document.getElementById("kta-fusion-file");

    if (dropZone && fileInput) {
      dropZone.addEventListener("click", function() { fileInput.click(); });
      dropZone.addEventListener("dragover",  function(e) { e.preventDefault(); dropZone.classList.add("dragover"); });
      dropZone.addEventListener("dragleave", function()  { dropZone.classList.remove("dragover"); });
      dropZone.addEventListener("drop", function(e) {
        e.preventDefault(); dropZone.classList.remove("dragover");
        _fusionAjouterFichiers(e.dataTransfer.files);
      });
      fileInput.addEventListener("change", function() { _fusionAjouterFichiers(fileInput.files); });
    }

    const clearBtn = document.getElementById("kta-fusion-clear");
    if (clearBtn) clearBtn.addEventListener("click", function() {
      _fusionInputs = [];
      _fusionMerged = null;
      _renderTab();
    });

    // Bouton Télécharger désactivé tant qu'aucun contenu fusionné.
    const dlBtn = document.getElementById("kta-ses-download");
    if (dlBtn) dlBtn.disabled = !_fusionMerged;
  }

  // Export : un fichier data layer par catégorie non vide → ZIP (réutilise
  // _telechargerConversionFiles, format identique au sens session→data layer).
  function _exportFusion() {
    const m = _fusionMerged;
    if (!m || (!m.data.length && !m.roads.length && !m.zones.length && !m.structures.length)) {
      alert(t("export.fusion.errVide"));
      return;
    }
    const files = [];
    if (m.data.length)       files.push({ name: "points.json",    payload: { data: m.data } });
    if (m.roads.length)      files.push({ name: "roads.json",     payload: { data: [], roads: m.roads } });
    if (m.zones.length)      files.push({ name: "zones.json",     payload: { data: [], zones: m.zones } });
    if (m.structures.length) files.push({ name: "structure.json", payload: { data: [], structures: m.structures } });
    _telechargerConversionFiles(files, []);
  }

  // ========== UTILITAIRES ==========
  function _escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  function _filename(prefix, ext) {
    ext = ext || "json";
    const planName = (window.PLAN_CONFIG?.plan?.name || "plan").replace(/[^a-z0-9_-]/gi, "_");
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return prefix + "_" + planName + "_" + yyyy + mm + dd + "." + ext;
  }

  function _telechargerJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    _telechargerBlob(blob, filename);
  }

  function _telechargerBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }

  function _fermer() {
    if (_modal) _modal.remove();
    _modal = null;
    // Reset de l'état de la conversion data2ed pour la prochaine ouverture
    _convUploadedJson = null;
    _convUploadedName = "";
    _convUploadedPhotos = null;  // 🆕 v1.9.3-B1d++
    // 🔗 reset fusion datalayers (v1.55.0)
    _fusionInputs = [];
    _fusionMerged = null;
    // 🌍 v169 (Karma_dev) : reset mode clic carte KMZ si actif
    if (_kmzClickActive) _kmzDesactiverModeClic();
  }

  // =========================================================================
  // 🌍 ONGLET KMZ (depuis v169 / Karma_dev)
  // =========================================================================
  // Export geolocalise pour Google Earth / OsmAnd / Locus / Avenza.
  // Calibrage 2 points (plan + GPS) → transformation affine 2D → KMZ.
  // Cf. js/kmzExport.js pour le moteur (math + generateur KML + zip).
  // =========================================================================

  // Etat interne onglet KMZ (mode clic carte pour saisir x/y d'un point)
  // _kmzClickTarget = "A" | "B" | null — quel point on est en train de saisir
  let _kmzClickActive = false;
  let _kmzClickHandler = null;
  let _kmzClickTarget = null;

  // Helper : récupère l'ID du plan courant (pour la clé localStorage du calibrage)
  function _kmzCurrentPlanId() {
    return window._currentLoadedPlanId || "default";
  }

  // Slug CSS-safe pour un tag (id checkbox)
  function _kmzSlugTag(tag) {
    return String(tag).replace(/[^a-z0-9_-]/gi, "_");
  }

  // Liste les tags presents dans une collection de points
  // Renvoie [{tag, count, isUntagged}] trie alpha, "__untagged__" en queue
  function _kmzListerTags(points) {
    const counts = {};
    let untagged = 0;
    (points || []).forEach(function(p) {
      const tags = Array.isArray(p.tags) ? p.tags.filter(function(t) { return t && String(t).trim(); }) : [];
      if (tags.length === 0) untagged++;
      else tags.forEach(function(t) {
        const k = String(t);
        counts[k] = (counts[k] || 0) + 1;
      });
    });
    const list = Object.keys(counts).sort().map(function(t) {
      return { tag: t, count: counts[t], isUntagged: false };
    });
    if (untagged > 0) list.push({ tag: "__untagged__", count: untagged, isUntagged: true });
    return list;
  }

  // URL d'icone pour un tag (lookup _iconMap → resolution Leaflet)
  // v174 : check _kta_iconUrl (divIcon) avant options.iconUrl (icon classique)
  function _kmzIconePourTag(tag) {
    if (!window._iconMap || !window._iconMap[tag]) return null;
    const ic = window._iconMap[tag];
    return ic._kta_iconUrl || (ic.options && ic.options.iconUrl) || null;
  }

  // Collecte unifiee des stats KMZ (session + embedded) pour generer les
  // sous-cases avec compteurs et icones, comme l'export PNG mode avance.
  // Reutilise les memes getters que _exportKmz pour rester strictement coherent.
  function _kmzCollecterStats() {
    // === Points : session + data layers ===
    const sessionPts = (window.getEditorPoints ? window.getEditorPoints() : []) || [];
    const dataLayerPts = [];
    if (Array.isArray(window._ktaDataMarkers)) {
      window._ktaDataMarkers.forEach(function(m) {
        if (!m) return;
        dataLayerPts.push({ tags: Array.isArray(m._ktaTags) ? m._ktaTags : [] });
      });
    }
    const allPts = sessionPts.concat(dataLayerPts);
    const tagsList = _kmzListerTags(allPts);

    // === Roads : session + embedded ===
    const sessionRoads = (window.getRoads ? window.getRoads() : []) || [];
    const embeddedRoads = (typeof window.getAllEmbeddedRoads === "function")
      ? window.getAllEmbeddedRoads() : [];
    const allRoads = sessionRoads.concat(embeddedRoads);
    const roadsByType = {
      principal:  allRoads.filter(function(r) { return r.type === "principal";  }).length,
      secondaire: allRoads.filter(function(r) { return r.type === "secondaire"; }).length,
      chemin:     allRoads.filter(function(r) { return r.type === "chemin";     }).length,
      jonction:   allRoads.filter(function(r) { return r.type === "jonction";   }).length,
      itinerary:  allRoads.filter(function(r) { return r.type === "itinerary";  }).length
    };

    // === Zones : session + embedded ===
    const sessionZones = (window.getZones ? window.getZones() : []) || [];
    const embeddedZones = (typeof window.getAllEmbeddedZones === "function")
      ? window.getAllEmbeddedZones() : [];
    const allZones = sessionZones.concat(embeddedZones);
    const zonesByType = {
      eau:          allZones.filter(function(z) { return z.type === "eau";          }).length,
      remblais:     allZones.filter(function(z) { return z.type === "remblais";     }).length,
      effondrement: allZones.filter(function(z) { return z.type === "effondrement"; }).length,
      inaccessible: allZones.filter(function(z) { return z.type === "inaccessible"; }).length
    };

    // === Structures : session + embedded (v1.9.3-A1.b.1) ===
    const sessionStructures = (window.getStructures ? window.getStructures() : []) || [];
    const embeddedStructures = (typeof window.getAllEmbeddedStructures === "function")
      ? window.getAllEmbeddedStructures() : [];
    const allStructures = sessionStructures.concat(embeddedStructures);
    const structuresByType = {
      "pilier-1": allStructures.filter(function(s) { return s.type === "pilier-1"; }).length,
      "pilier-2": allStructures.filter(function(s) { return s.type === "pilier-2"; }).length,
      "mur":      allStructures.filter(function(s) { return s.type === "mur";      }).length,
      // 🆕 v1.9.3-A1.b.2 : compteurs fronts pour stats KMZ
      "front-1":  allStructures.filter(function(s) { return s.type === "front-1";  }).length,
      "front-2":  allStructures.filter(function(s) { return s.type === "front-2";  }).length
    };

    return {
      pointsTotal:     allPts.length,
      tagsList:        tagsList,
      roadsByType:     roadsByType,
      zonesByType:     zonesByType,
      structuresByType: structuresByType
    };
  }

  // Sync visuelle parent ↔ enfants (parent coche / decoche tous les enfants,
  // enfants au moins 1 coche le parent). Replique le pattern _syncAnnotParent
  // de exporter.js pour le mode avance PNG.
  function _kmzSyncParent(parentId, childIds) {
    const parent = document.getElementById(parentId);
    if (!parent) return;
    const children = childIds.map(function(id) { return document.getElementById(id); }).filter(Boolean);
    if (children.length === 0) return;

    parent.addEventListener("change", function() {
      children.forEach(function(c) { if (!c.disabled) c.checked = parent.checked; });
    });
    children.forEach(function(c) {
      c.addEventListener("change", function() {
        const anyChecked = children.some(function(x) { return x.checked; });
        parent.checked = anyChecked;
      });
    });
  }

  // ---------- RENDU CALIBRAGE COMMUN KMZ/GPX (v1.14.1) ----------
  // Le calibrage GPS 2 points est partagé entre KMZ et GPX : on le saisit
  // une seule fois, peu importe le format de sortie choisi.
  function _renderCalibrageCommun() {
    const planId = _kmzCurrentPlanId();
    const saved  = (window.KmzExport && window.KmzExport.getCalibration)
                    ? window.KmzExport.getCalibration(planId) : null;
    const pA     = (saved && saved.pointA) || { x: "", y: "", lat: "", lng: "" };
    const pB     = (saved && saved.pointB) || { x: "", y: "", lat: "", lng: "" };

    // 🆕 hotfix21 — Recompose "lat, lng" pour input combiné. Rétrocompat :
    // une ancienne calibration sauvée avec lat/lng séparés → on les concatène
    // pour affichage, mais le stockage interne (KmzExport.setCalibration)
    // reste FLAT {x, y, lat, lng}.
    const _fmtCoords = (typeof window.formatGpsCoords === "function")
                        ? window.formatGpsCoords
                        : function(a, b) { return (Number.isFinite(a) && Number.isFinite(b)) ? (a + ", " + b) : ""; };
    const pAcoords = _fmtCoords(pA.lat, pA.lng);
    const pBcoords = _fmtCoords(pB.lat, pB.lng);

    return '' +
      // ===== Calibrage Point A =====
      '<div class="kta-kmz-section">' +
        '<div class="kta-kmz-section-titre">' + t("export.calib.pointATitre") + '</div>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">' + t("export.calib.planX") + '</label>' +
          '<input type="number" id="kmz_A_x" value="' + pA.x + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + t("export.calib.planY") + '</label>' +
          '<input type="number" id="kmz_A_y" value="' + pA.y + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + t("export.calib.gpsLatLng") + '</label>' +
          '<input type="text" id="kmz_A_coords" value="' + pAcoords + '" class="kta-cfg-input kta-kmz-input kta-gps-coords-input" inputmode="decimal" autocomplete="off" placeholder="48.8580, 2.2945">' +
        '</div>' +
        '<div class="kta-gps-coords-error" id="kmz_A_err" style="display:none;"></div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kmz_A_search" type="button">' + t("export.calib.searchBtn") + '</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kmz_A_click" type="button">' + t("export.calib.clickBtn") + '</button>' +
        '</div>' +
        '<div id="kmz_A_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
      '</div>' +

      // ===== Calibrage Point B =====
      '<div class="kta-kmz-section">' +
        '<div class="kta-kmz-section-titre">' + t("export.calib.pointBTitre") + '</div>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">' + t("export.calib.planX") + '</label>' +
          '<input type="number" id="kmz_B_x" value="' + pB.x + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + t("export.calib.planY") + '</label>' +
          '<input type="number" id="kmz_B_y" value="' + pB.y + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + t("export.calib.gpsLatLng") + '</label>' +
          '<input type="text" id="kmz_B_coords" value="' + pBcoords + '" class="kta-cfg-input kta-kmz-input kta-gps-coords-input" inputmode="decimal" autocomplete="off" placeholder="48.8520, 2.3050">' +
        '</div>' +
        '<div class="kta-gps-coords-error" id="kmz_B_err" style="display:none;"></div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kmz_B_search" type="button">' + t("export.calib.searchBtn") + '</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kmz_B_click" type="button">' + t("export.calib.clickBtn") + '</button>' +
        '</div>' +
        '<div id="kmz_B_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
      '</div>' +

      // ===== Apercu coins =====
      '<div class="kta-kmz-section">' +
        '<div class="kta-kmz-section-titre">' + t("export.calib.apercuTitre") + '</div>' +
        '<div id="kmz_apercu" class="kta-kmz-apercu">' +
          '<em style="color:#8892a4;">' + t("export.calib.apercuPrompt") + '</em>' +
        '</div>' +
      '</div>';
  }

  // ---------- RENDU OPTIONS KMZ (contenu + niveaux) ----------
  function _renderOptsKmz() {
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const niveauxBloc = mlOn
      ? '<div class="kta-kmz-section">' +
          '<div class="kta-kmz-section-titre">' + t("export.kmz.niveauxTitre") + '</div>' +
          '<p style="font-size:11.5px; color:#8892a4; margin:4px 0;">' +
            t("export.kmz.niveauxHint") +
          '</p>' +
          '<div id="kta-kmz-levels-chips" class="kta-kmz-chips"></div>' +
        '</div>'
      : '';
    return _kmzRenderContenu(mlOn) + niveauxBloc;
  }

  // ---------- RENDU ONGLET UNIFIÉ "📡 Export externe" (v1.14.1) ----------
  // Fusionne les anciens onglets KMZ + GPX : 1 saisie de calibrage GPS,
  // puis sélecteur de format (pills) qui toggle les options spécifiques.
  function _renderExtern() {
    const fmt = (_externFormat === "gpx") ? "gpx" : "kmz";
    const introFmt = (fmt === "kmz")
      ? t("export.extern.descKmz")
      : t("export.extern.descGpx");

    return '' +
      '<div class="kta-ses-intro">' +
        t("export.extern.intro") +
      '</div>' +

      // 🆕 v1.26.1 — Banner cohérence échelle px/m ↔ géoréf GPS (si applicable)
      ((typeof window.renderBannerCoherenceEchelle === "function")
        ? window.renderBannerCoherenceEchelle(_kmzCurrentPlanId(), { context: "export" })
        : "") +

      // ===== Calibrage GPS commun =====
      _renderCalibrageCommun() +

      // ===== Sélecteur de format =====
      '<div class="kta-kmz-section">' +
        '<div class="kta-kmz-section-titre">' + t("export.extern.outputTitle") + '</div>' +
        '<div class="kta-ses-format-pills" role="tablist">' +
          '<button type="button" class="kta-ses-fmt-pill ' + (fmt === "kmz" ? "active" : "") + '" data-fmt="kmz" role="tab" aria-selected="' + (fmt === "kmz") + '">🌍 KMZ</button>' +
          '<button type="button" class="kta-ses-fmt-pill ' + (fmt === "gpx" ? "active" : "") + '" data-fmt="gpx" role="tab" aria-selected="' + (fmt === "gpx") + '">📤 GPX</button>' +
        '</div>' +
        '<p class="kta-ses-fmt-desc" id="kta-extern-fmt-desc">' + introFmt + '</p>' +
      '</div>' +

      // ===== Options KMZ (visible si fmt=kmz) =====
      '<div id="kta-extern-opts-kmz" class="kta-extern-opts"' + (fmt === "kmz" ? '' : ' style="display:none;"') + '>' +
        _renderOptsKmz() +
      '</div>' +

      // ===== Options GPX (visible si fmt=gpx) =====
      '<div id="kta-extern-opts-gpx" class="kta-extern-opts"' + (fmt === "gpx" ? '' : ' style="display:none;"') + '>' +
        _renderOptsGpx() +
      '</div>';
  }

  // ---------- Handlers du sélecteur de format (pills KMZ/GPX) ----------
  function _bindExternFmtHandlers() {
    if (!_modal) return;
    const pills = _modal.querySelectorAll(".kta-ses-fmt-pill");
    pills.forEach(function(p) {
      p.addEventListener("click", function() {
        const f = p.dataset.fmt;
        if (f !== "kmz" && f !== "gpx") return;
        _externFormat = f;
        try { localStorage.setItem(_EXTERN_FMT_KEY, f); } catch(e) {}
        // Toggle pills
        pills.forEach(function(pp) {
          const on = pp.dataset.fmt === f;
          pp.classList.toggle("active", on);
          pp.setAttribute("aria-selected", on ? "true" : "false");
        });
        // Toggle options + maj desc
        const optsKmz = document.getElementById("kta-extern-opts-kmz");
        const optsGpx = document.getElementById("kta-extern-opts-gpx");
        if (optsKmz) optsKmz.style.display = (f === "kmz") ? "" : "none";
        if (optsGpx) optsGpx.style.display = (f === "gpx") ? "" : "none";
        const desc = document.getElementById("kta-extern-fmt-desc");
        if (desc) {
          desc.innerHTML = (f === "kmz")
            ? t("export.extern.descKmz")
            : t("export.extern.descGpx");
        }
      });
    });
  }

  // ---------- RENDU SECTION CONTENU (sous-cases par tag/type) ----------
  function _kmzRenderContenu(mlOn) {
    const stats = _kmzCollecterStats();

    // Helper : ligne parent ou simple checkbox.
    // count = null → pas de compteur affiché, checkbox toujours enabled
    //                (cas image : pas de notion de "X items à exporter")
    // count = 0    → grisée + désactivée + dim 50% (rien à exporter pour cette
    //                catégorie, donc on bloque la coche)
    // count > 0    → normale, cochée si checked=true
    function row(id, label, count, checked) {
      const hasCount = (count !== null && count !== undefined);
      const isZero   = hasCount && count === 0;
      const disabled = isZero ? "disabled" : "";
      const dim      = isZero ? "opacity:0.5;" : "";
      // Cochée si checked=true ET (pas de compteur OU compteur > 0)
      const isChecked= (checked && !isZero) ? "checked" : "";
      const cnt      = hasCount ? ' <span style="color:#8892a4;">(' + count + ')</span>' : '';
      return '<label class="kta-ses-cb-row" style="' + dim + '">' +
               '<input type="checkbox" id="' + id + '" ' + isChecked + ' ' + disabled + '>' +
               '<span>' + label + cnt + '</span>' +
             '</label>';
    }

    // Helper : sous-case indentee (enfant d'une parent)
    function rowSub(id, label, count, checked) {
      const disabled = count === 0 ? "disabled" : "";
      const dim      = count === 0 ? "opacity:0.5;" : "";
      const isChecked= (count > 0 && checked) ? "checked" : "";
      return '<label class="kta-ses-cb-row" style="' + dim + 'margin-left:24px;font-size:12px;padding:3px 4px;">' +
               '<input type="checkbox" id="' + id + '" ' + isChecked + ' ' + disabled + '>' +
               '<span>' + label + ' <span style="color:#8892a4;">(' + count + ')</span></span>' +
             '</label>';
    }

    // Sous-cases dynamiques pour les tags de points (avec icones quand dispo)
    let pointsTagsHtml = "";
    if (stats.tagsList.length > 0) {
      pointsTagsHtml = stats.tagsList.map(function(item) {
        const safeTag = _kmzSlugTag(item.tag);
        const iconUrl = item.isUntagged ? null : _kmzIconePourTag(item.tag);
        const iconHtml = iconUrl
          ? '<img src="' + iconUrl + '" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;margin-right:4px;">'
          : (item.isUntagged ? '<span style="opacity:0.5;margin-right:4px;">∅</span>' : '<span style="opacity:0.5;margin-right:4px;">🏷️</span>');
        const label = item.isUntagged ? t("export.untagged") : item.tag;
        return '<label class="kta-ses-cb-row" style="margin-left:24px;font-size:12px;padding:3px 4px;">' +
                 '<input type="checkbox" id="kmz_inc_points_tag_' + safeTag + '" data-tag="' + item.tag + '" checked>' +
                 '<span>' + iconHtml + label + ' <span style="color:#8892a4;">(' + item.count + ')</span></span>' +
               '</label>';
      }).join("");
    }

    const rByT = stats.roadsByType;
    const zByT = stats.zonesByType;
    // 🆕 v1.9.3-A1.b.1 : compteur structures pour stats KMZ
    const sByT = stats.structuresByType || { "pilier-1": 0, "pilier-2": 0, "mur": 0, "front-1": 0, "front-2": 0 };
    const roadsTotal = rByT.principal + rByT.secondaire + rByT.chemin;
    const zonesTotal = zByT.eau + zByT.remblais + zByT.effondrement + zByT.inaccessible;
    const structuresTotal = sByT["pilier-1"] + sByT["pilier-2"] + sByT["mur"]
                          + (sByT["front-1"] || 0) + (sByT["front-2"] || 0);

    return '<div class="kta-kmz-section">' +
        '<div class="kta-kmz-section-titre">' + t("export.kmz.contentTitle") + '</div>' +

        // --- Image + opacite ---
        row("kmz_inc_image", t("export.kmz.image"), null, true) +
        '<div class="kta-kmz-opacity-row" id="kmz_opacity_wrap" style="margin-left:24px;">' +
          '<label for="kmz_img_opacity" class="kta-kmz-opacity-lbl">' + t("export.kmz.opacite") + '</label>' +
          '<input type="range" id="kmz_img_opacity" min="0" max="100" step="5" value="60" class="kta-kmz-opacity-slider">' +
          '<span id="kmz_img_opacity_val" class="kta-kmz-opacity-val">60%</span>' +
        '</div>' +

        // --- Points + sous-cases par tag ---
        row("kmz_inc_points", t("export.kmz.points"), stats.pointsTotal, true) +
        pointsTagsHtml +

        // --- Tracés + sous-cases par type ---
        row("kmz_inc_roads", t("export.kmz.roads"), roadsTotal, true) +
        rowSub("kmz_inc_roads_principal",  t("export.kmz.roadsPrincipal"),  rByT.principal,  true) +
        rowSub("kmz_inc_roads_secondaire", t("export.kmz.roadsSecondaire"), rByT.secondaire, true) +
        rowSub("kmz_inc_roads_chemin",     t("export.kmz.roadsChemin"),     rByT.chemin,     true) +

        // --- Zones + sous-cases par type ---
        row("kmz_inc_zones", t("export.kmz.zones"), zonesTotal, true) +
        rowSub("kmz_inc_zones_eau",          t("export.kmz.zonesEau"),          zByT.eau,          true) +
        rowSub("kmz_inc_zones_remblais",     t("export.kmz.zonesRemblais"),     zByT.remblais,     true) +
        rowSub("kmz_inc_zones_effondrement", t("export.kmz.zonesEffondrement"), zByT.effondrement, true) +
        rowSub("kmz_inc_zones_inaccessible", t("export.kmz.zonesInaccessible"), zByT.inaccessible, true) +

        // --- 🆕 v1.9.3-A1.b.1 + A1.b.2 : Structures + 5 sous-types ---
        row("kmz_inc_structures", t("export.kmz.structures"), structuresTotal, true) +
        rowSub("kmz_inc_structures_pilier-1", t("export.kmz.structPilier1"), sByT["pilier-1"], true) +
        rowSub("kmz_inc_structures_pilier-2", t("export.kmz.structPilier2"), sByT["pilier-2"], true) +
        rowSub("kmz_inc_structures_mur",      t("export.kmz.structMur"),     sByT["mur"],      true) +
        rowSub("kmz_inc_structures_front-1",  t("export.kmz.structFront1"),  sByT["front-1"] || 0, true) +
        rowSub("kmz_inc_structures_front-2",  t("export.kmz.structFront2"),  sByT["front-2"] || 0, true) +

        // --- Jonctions (uniquement si multi-niveau) ---
        (mlOn ? row("kmz_inc_jonctions", t("export.kmz.jonctions"), rByT.jonction, rByT.jonction > 0) : '') +

        // --- Itineraire actif ---
        row("kmz_inc_iti", t("export.kmz.itineraire"), rByT.itinerary, rByT.itinerary > 0) +

        // 🆕 v1.18.0 — Légende plan-level (roundtrip MyKTAMap ↔ MyKTAMap).
        // Coche par défaut SI le plan a une customLegend. Si le plan est
        // « nu » (cascade défaut MKM), la case s'affiche grisée à 0 — pas
        // d'incident, juste rien à embarquer.
        (function() {
          const cl = window.PLAN_CONFIG && window.PLAN_CONFIG.customLegend;
          const hasCustomLegend = !!(cl && typeof cl === "object" &&
            ((cl.labels && Object.keys(cl.labels).length) ||
             (cl.hidden && (Array.isArray(cl.hidden) ? cl.hidden.length : Object.keys(cl.hidden).length)) ||
             (Array.isArray(cl.customEntries) && cl.customEntries.length)));
          return row("kmz_inc_legend",
                     t("export.kmz.legend"),
                     hasCustomLegend ? 1 : 0,
                     hasCustomLegend);
        })() +
      '</div>';
  }

  // ---------- BIND HANDLERS ----------
  function _bindKmzHandlers() {
    // Validation + aperçu coins à chaque changement de champ
    // 🆕 hotfix21 — lat/lng fusionnés dans "coords" → on listen aussi sur
    // l'input combiné pour rafraîchir l'aperçu en live.
    ["x", "y", "coords"].forEach(function(field) {
      ["A", "B"].forEach(function(letter) {
        const el = document.getElementById("kmz_" + letter + "_" + field);
        if (el) el.addEventListener("input", _kmzRafraichirApercu);
      });
    });

    // 🆕 hotfix21 — Validation live des inputs GPS combinés (border rouge +
    // message inline si format invalide). Idempotent : pas de duplication de
    // listeners si déjà attachés.
    if (typeof window.attacherGpsValidationCombo === "function") {
      window.attacherGpsValidationCombo(
        document.getElementById("kmz_A_coords"),
        { errorEl: document.getElementById("kmz_A_err") }
      );
      window.attacherGpsValidationCombo(
        document.getElementById("kmz_B_coords"),
        { errorEl: document.getElementById("kmz_B_err") }
      );
    }

    // 🆕 v1.26.1 — Bind bouton "📋 Copier" du banner cohérence échelle (si affiché)
    if (typeof window.attacherBoutonCopierEchelleGps === "function") {
      const modal = document.getElementById("kta-ses-modal") || document;
      window.attacherBoutonCopierEchelleGps(modal);
    }

    // Boutons "🔍 Chercher un point" → autocomplete
    ["A", "B"].forEach(function(letter) {
      const btn = document.getElementById("kmz_" + letter + "_search");
      if (btn) btn.addEventListener("click", function() { _kmzOuvrirRecherche(letter); });
    });

    // Boutons "📍 Cliquer carte" → mode clic
    ["A", "B"].forEach(function(letter) {
      const btn = document.getElementById("kmz_" + letter + "_click");
      if (btn) btn.addEventListener("click", function() { _kmzActiverModeClic(letter); });
    });

    // Slider opacité image : maj du % en live + greying out si checkbox image décochée
    const sliderOp = document.getElementById("kmz_img_opacity");
    const sliderOpVal = document.getElementById("kmz_img_opacity_val");
    if (sliderOp && sliderOpVal) {
      sliderOp.addEventListener("input", function() {
        sliderOpVal.textContent = sliderOp.value + "%";
      });
    }
    const cbImg = document.getElementById("kmz_inc_image");
    const opWrap = document.getElementById("kmz_opacity_wrap");
    if (cbImg && opWrap) {
      const _majOpState = function() {
        if (cbImg.checked) opWrap.classList.remove("disabled");
        else               opWrap.classList.add("disabled");
      };
      cbImg.addEventListener("change", _majOpState);
      _majOpState();
    }

    // Sync parent ↔ enfants (pattern IMAGE AVANCE) — defer car les enfants
    // sont rendus dans le meme HTML et tous prets a ce stade.
    setTimeout(function() {
      _kmzSyncParent("kmz_inc_roads", ["kmz_inc_roads_principal", "kmz_inc_roads_secondaire", "kmz_inc_roads_chemin"]);
      _kmzSyncParent("kmz_inc_zones", ["kmz_inc_zones_eau", "kmz_inc_zones_remblais", "kmz_inc_zones_effondrement", "kmz_inc_zones_inaccessible"]);
      // 🆕 v1.9.3-A1.b.1 : sync parent ↔ enfants pour structures KMZ
      _kmzSyncParent("kmz_inc_structures", ["kmz_inc_structures_pilier-1", "kmz_inc_structures_pilier-2", "kmz_inc_structures_mur", "kmz_inc_structures_front-1", "kmz_inc_structures_front-2"]);
      // Points : sous-cases par tag, IDs = kmz_inc_points_tag_<slug>
      const tagCheckboxes = document.querySelectorAll('[id^="kmz_inc_points_tag_"]');
      const tagIds = Array.from(tagCheckboxes).map(function(cb) { return cb.id; });
      if (tagIds.length > 0) _kmzSyncParent("kmz_inc_points", tagIds);
    }, 0);

    // Premier rendu aperçu (si calibrage restauré)
    _kmzRafraichirApercu();

    // Chips niveaux si multiLevel ON
    _kmzRafraichirChipsNiveaux();
  }

  function _kmzLireCalib() {
    const get = function(id) {
      const v = document.getElementById(id);
      if (!v) return null;
      const n = parseFloat(v.value);
      return Number.isFinite(n) ? n : null;
    };
    // 🆕 hotfix21 — Lecture lat/lng depuis input combiné "lat, lng".
    // Si format invalide, retourne {lat:null, lng:null} (l'aperçu et la
    // validation au submit s'occupent du feedback utilisateur).
    const getCoords = function(id) {
      const el = document.getElementById(id);
      if (!el) return { lat: null, lng: null };
      const v = String(el.value || "").trim();
      if (v === "") return { lat: null, lng: null };
      const parsed = (typeof window.parseGpsCoords === "function")
                      ? window.parseGpsCoords(v) : null;
      if (!parsed) return { lat: null, lng: null };
      return { lat: parsed.lat, lng: parsed.lng };
    };
    const cA = getCoords("kmz_A_coords");
    const cB = getCoords("kmz_B_coords");
    const calib = {
      pointA: {
        x:   get("kmz_A_x"),   y:   get("kmz_A_y"),
        lat: cA.lat,           lng: cA.lng
      },
      pointB: {
        x:   get("kmz_B_x"),   y:   get("kmz_B_y"),
        lat: cB.lat,           lng: cB.lng
      }
    };
    // 📐 v1.73.0 — cette modale n'édite que A/B : on PRÉSERVE le pointC
    // stocké (saisi via ⚙️ Réglages ou le Générateur), sinon chaque save
    // KMZ écraserait silencieusement l'affine 3 points.
    try {
      const saved = (window.KmzExport && window.KmzExport.getCalibration)
                     ? window.KmzExport.getCalibration(_kmzCurrentPlanId()) : null;
      if (saved && saved.pointC) calib.pointC = saved.pointC;
    } catch(e) {}
    return calib;
  }

  function _kmzRafraichirApercu() {
    const target = document.getElementById("kmz_apercu");
    if (!target) return;
    const c = _kmzLireCalib();
    const ok = c.pointA.x != null && c.pointA.y != null &&
               c.pointA.lat != null && c.pointA.lng != null &&
               c.pointB.x != null && c.pointB.y != null &&
               c.pointB.lat != null && c.pointB.lng != null;
    if (!ok) {
      target.innerHTML = '<em style="color:#8892a4;">' + t("export.calib.apercuPromptFull") + '</em>';
      return;
    }
    if (!window.KmzExport) {
      target.innerHTML = '<em style="color:#cc0000;">' + t("export.calib.moduleKo") + '</em>';
      return;
    }
    let transform;
    try {
      transform = window.KmzExport.buildTransformCalib(c);   // 📐 v1.73.0 : pointC optionnel propagé (affine)
    } catch(e) {
      target.innerHTML = '<span style="color:#ff9933;">⚠️ ' + String(e.message || e) + '</span>';
      return;
    }
    const W = window.APP_CONFIG.imageWidth  || 0;
    const H = window.APP_CONFIG.imageHeight || 0;
    const cTL = window.KmzExport.planToGps(transform, 0, 0);
    const cTR = window.KmzExport.planToGps(transform, W, 0);
    const cBL = window.KmzExport.planToGps(transform, 0, H);
    const cBR = window.KmzExport.planToGps(transform, W, H);
    const cCenter = window.KmzExport.planToGps(transform, W/2, H/2);
    function fmt(ll) { return ll.lat.toFixed(6) + ", " + ll.lng.toFixed(6); }
    const gmapsUrl = "https://www.google.com/maps/@" + cCenter.lat + "," + cCenter.lng + ",17z";
    target.innerHTML =
      '<div class="kta-kmz-coins-grille">' +
        '<div>' + t("export.calib.cornerTL") + ' <code>' + fmt(cTL) + '</code></div>' +
        '<div>' + t("export.calib.cornerTR") + ' <code>' + fmt(cTR) + '</code></div>' +
        '<div>' + t("export.calib.cornerBL") + ' <code>' + fmt(cBL) + '</code></div>' +
        '<div>' + t("export.calib.cornerBR") + ' <code>' + fmt(cBR) + '</code></div>' +
      '</div>' +
      '<div style="margin-top:8px;">' +
        '<a href="' + gmapsUrl + '" id="kmz_apercu_gmaps_link" target="_blank" rel="noopener" style="color:#8cb4ff;">' + t("export.calib.gmapsLink") + '</a>' +
      '</div>' +
      '<div style="margin-top:6px; font-size:11.5px; color:#8892a4;">' +
        t("export.calib.scaleLabel") + ' <strong>' + transform.metresParPixel.toFixed(3) + ' m/px</strong>' +
        ' · ' + t("export.calib.rotationLabel") + ' <strong>' + (transform.rotation * 180 / Math.PI).toFixed(1) + '°</strong>' +
      '</div>';

    // Interception du clic Google Maps : ping internet avant ouverture pour
    // éviter une erreur navigateur sèche en mode offline (DNS_PROBE / ERR_NAME).
    // Le lien garde son target/rel pour le clic milieu/Ctrl+clic (ouvre direct
    // en nouvel onglet, le ping ne s'applique qu'au clic gauche standard).
    const linkGmaps = document.getElementById("kmz_apercu_gmaps_link");
    if (linkGmaps) {
      linkGmaps.addEventListener("click", function(e) {
        // Modificateurs (Ctrl/Cmd/Shift/middle-click) → laisser le navigateur ouvrir
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        const oldText = linkGmaps.textContent;
        linkGmaps.textContent = t("export.calib.gmapsChecking");
        linkGmaps.style.pointerEvents = "none";
        const _restore = function() {
          linkGmaps.textContent = oldText;
          linkGmaps.style.pointerEvents = "";
        };
        const pingFn = typeof window._pingInternet === "function"
          ? window._pingInternet
          : function() { return Promise.resolve(navigator.onLine !== false); };
        pingFn().then(function(online) {
          _restore();
          if (online) {
            window.open(gmapsUrl, "_blank", "noopener");
          } else {
            const msg = t("export.calib.gmapsOffline");
            if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
              window.OOMGuard.showToast(msg, "warn");
            } else {
              alert(msg);
            }
          }
        });
      });
    }
  }

  function _kmzRafraichirChipsNiveaux() {
    const el = document.getElementById("kta-kmz-levels-chips");
    if (!el) return;
    const avail = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.availableLevels))
                   ? window.APP_CONFIG.availableLevels.slice() : [0];
    avail.sort(function(a, b) { return a - b; });
    el.innerHTML = avail.map(function(lvl) {
      return '<label class="kta-kmz-chip-niveau"><input type="checkbox" data-level="' + lvl + '" checked> ' + t("export.kmz.niveauChip", { lvl: lvl }) + '</label>';
    }).join("");
  }

  // ---------- AUTOCOMPLETE RECHERCHE ----------
  function _kmzOuvrirRecherche(letter) {
    const res = document.getElementById("kmz_" + letter + "_search_results");
    if (!res) return;
    res.style.display = "block";
    res.innerHTML = '<input type="text" id="kmz_' + letter + '_search_q" class="kta-cfg-input" placeholder="' + t("export.search.placeholder") + '" style="width:100%; margin-bottom:6px;"><div id="kmz_' + letter + '_search_list"></div>';
    const input = document.getElementById("kmz_" + letter + "_search_q");
    const list  = document.getElementById("kmz_" + letter + "_search_list");
    input.focus();
    let debTimer = null;
    input.addEventListener("input", function() {
      const q = input.value.trim();
      if (debTimer) clearTimeout(debTimer);
      if (!q || !window.SearchPoints || typeof window.SearchPoints.findByQuery !== "function") {
        list.innerHTML = "";
        return;
      }
      debTimer = setTimeout(async function() {
        let results = [];
        try { results = await window.SearchPoints.findByQuery(q) || []; } catch(e) {}
        if (input.value.trim() !== q) return;
        if (results.length === 0) {
          list.innerHTML = '<div class="kta-kmz-search-empty">' + t("export.search.empty", { q: q }) + '</div>';
          return;
        }
        list.innerHTML = results.slice(0, 10).map(function(it, i) {
          const p = it.point;
          const nom = p.nom || p.id || t("export.search.point");
          // Méta : ID (s'il diffère du nom) + coord plan en plus petit
          const metaParts = [];
          if (p.id && p.id !== nom) metaParts.push(p.id);
          if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
            metaParts.push("x=" + p.x + ", y=" + p.y);
          }
          const meta = metaParts.length > 0
            ? '<span class="kta-kmz-search-meta">(' + metaParts.join(" · ") + ')</span>'
            : '';
          return '<div class="kta-kmz-search-item" data-idx="' + i + '">' +
                   '<strong>' + nom + '</strong>' + meta +
                 '</div>';
        }).join("");
        list.querySelectorAll(".kta-kmz-search-item").forEach(function(row, i) {
          row.addEventListener("click", function() {
            const p = results[i].point;
            document.getElementById("kmz_" + letter + "_x").value = p.x;
            document.getElementById("kmz_" + letter + "_y").value = p.y;
            res.style.display = "none";
            _kmzRafraichirApercu();
          });
        });
      }, 150);
    });
  }

  // ---------- MODE CLIC CARTE ----------
  function _kmzActiverModeClic(letter) {
    if (!window.map) return;
    _kmzDesactiverModeClic();  // si un autre était actif
    _kmzClickActive = true;
    _kmzClickTarget = letter;
    _kmzClickHandler = function(e) {
      const x = e.latlng.lng;
      const y = APP_CONFIG.imageHeight - e.latlng.lat;
      document.getElementById("kmz_" + letter + "_x").value = Math.round(x * 100) / 100;
      document.getElementById("kmz_" + letter + "_y").value = Math.round(y * 100) / 100;
      _kmzDesactiverModeClic();
      if (_modal) _modal.style.display = "";
      _kmzRafraichirApercu();
    };
    window.map.on("click", _kmzClickHandler);
    if (_modal) _modal.style.display = "none";
    // Floater minimal pour indiquer le mode actif
    const fl = document.createElement("div");
    fl.id = "kta-kmz-click-floater";
    fl.className = "kta-iti-floater";
    fl.innerHTML = '<span class="kta-iti-floater-icon">📍</span><span class="kta-iti-floater-msg">' + t("export.click.floaterMsg", { letter: letter }) + '</span><button class="kta-btn kta-btn-ghost" id="kmz_click_cancel" type="button">' + t("export.click.cancel") + '</button>';
    document.body.appendChild(fl);
    document.getElementById("kmz_click_cancel").addEventListener("click", function() {
      _kmzDesactiverModeClic();
      if (_modal) _modal.style.display = "";
    });
  }

  function _kmzDesactiverModeClic() {
    if (!_kmzClickActive) return;
    _kmzClickActive = false;
    _kmzClickTarget = null;
    if (window.map && _kmzClickHandler) window.map.off("click", _kmzClickHandler);
    _kmzClickHandler = null;
    const fl = document.getElementById("kta-kmz-click-floater");
    if (fl) fl.remove();
  }

  // ---------- EXPORT KMZ ----------
  async function _exportKmz() {
    if (!window.KmzExport) {
      alert(t("export.err.kmzModuleKo"));
      return;
    }
    const c = _kmzLireCalib();
    if (c.pointA.x == null || c.pointA.y == null || c.pointA.lat == null || c.pointA.lng == null ||
        c.pointB.x == null || c.pointB.y == null || c.pointB.lat == null || c.pointB.lng == null) {
      alert(t("export.err.calib8Champs"));
      return;
    }
    // Build transform (avec validations bloquantes)
    let transform;
    try {
      transform = window.KmzExport.buildTransformCalib(c);   // 📐 v1.73.0 : pointC optionnel propagé (affine)
    } catch(e) {
      alert(t("export.err.calibInvalide", { msg: e.message }));
      return;
    }
    // Persistance
    window.KmzExport.setCalibration(_kmzCurrentPlanId(), c);

    // Collecte des données session
    const d = _compter();

    // Filtre niveaux (chips si multiLevel ON, sinon null = tous)
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    let levels = null;
    if (mlOn) {
      levels = new Set();
      document.querySelectorAll('#kta-kmz-levels-chips input[type="checkbox"]:checked').forEach(function(cb) {
        const lvl = parseInt(cb.dataset.level, 10);
        if (Number.isInteger(lvl)) levels.add(lvl);
      });
      if (levels.size === 0) levels = null;
    }

    // Image plan (Blob) + nom de fichier — résolu via RUNTIME_ASSETS si dispo
    let imageBlob = null;
    let imageFilename = null;
    const inclImage = document.getElementById("kmz_inc_image")?.checked;
    if (inclImage && window.PLAN_CONFIG?.plan?.baseImage) {
      const baseImagePath = window.PLAN_CONFIG.plan.baseImage;
      const fullPath = baseImagePath.indexOf("/") >= 0 ? baseImagePath : ("data/" + baseImagePath);
      imageFilename = baseImagePath;
      // Tentative 1 : RUNTIME_ASSETS (cas ZIP local)
      if (window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[fullPath]) {
        const asset = window.RUNTIME_ASSETS[fullPath];
        if (asset.file instanceof Blob) imageBlob = asset.file;
        else if (asset.url) {
          try { const r = await fetch(asset.url); if (r.ok) imageBlob = await r.blob(); } catch(e) {}
        }
      }
      // Tentative 2 : fetch direct (cas plan serveur)
      if (!imageBlob) {
        try { const r = await fetch(fullPath); if (r.ok) imageBlob = await r.blob(); } catch(e) {}
      }
      if (!imageBlob) {
        console.warn("[KMZ] Image plan introuvable → KMZ généré sans GroundOverlay");
        imageFilename = null;
      }
    }

    // Icônes embedded : 1 PNG par tag rencontré dans les points.
    // v174 : check _kta_iconUrl (divIcon scaledMarkers) avant options.iconUrl
    const iconsToEmbed = {};
    if (window._iconMap) {
      // On embed TOUTES les icônes connues — c'est ~30 Ko au total et plus simple
      Object.keys(window._iconMap).forEach(function(tag) {
        const icObj = window._iconMap[tag];
        if (!icObj) return;
        const url = icObj._kta_iconUrl || (icObj.options && icObj.options.iconUrl);
        if (url) iconsToEmbed[tag] = url;
      });
    }
    if (window.iconeDefault) {
      const defUrl = window.iconeDefault._kta_iconUrl ||
                     (window.iconeDefault.options && window.iconeDefault.options.iconUrl);
      if (defUrl) iconsToEmbed["default"] = defUrl;
    }

    // Génération KMZ
    const btnDl = document.getElementById("kta-ses-download");
    if (btnDl) { btnDl.disabled = true; btnDl.textContent = t("export.btn.generatingKmz"); }
    try {
      // Collecte des points editor + data layers
      const editorPoints = d.points || [];
      // Data layer points : on lit _ktaDataMarkers et on reconstruit {x, y, nom, tags, level}
      const dataLayerPoints = [];
      if (Array.isArray(window._ktaDataMarkers)) {
        window._ktaDataMarkers.forEach(function(m) {
          if (!m || !m.getLatLng) return;
          const ll = m.getLatLng();
          dataLayerPoints.push({
            x:     ll.lng,
            y:     APP_CONFIG.imageHeight - ll.lat,
            nom:   m._ktaNom || "",
            tags:  Array.isArray(m._ktaTags) ? m._ktaTags : [],
            level: Number.isInteger(m._ktaLevel) ? m._ktaLevel : 0
          });
        });
      }
      const allPoints = editorPoints.concat(dataLayerPoints);

      // 🛣️ Roads : session + embedded data layers
      // Sans ça, un plan dont les tracés sont définis dans les JSON data layers
      // (chemin.json, puits.json, etc.) ne sortait qu'avec ses tracés session.
      // getAllEmbeddedRoads = TOUTES les roads embedded (visibles ET masquées),
      // cohérent avec Pathfinder + Distance totale (cf. CLAUDE.md §15).
      const sessionRoads = d.roads || [];
      const embeddedRoads = (typeof window.getAllEmbeddedRoads === "function")
        ? window.getAllEmbeddedRoads()
        : [];
      const allRoads = sessionRoads.concat(embeddedRoads);

      // ⬛ Zones : session + embedded data layers (symétrique aux roads)
      // Nouveau getter window.getAllEmbeddedZones (v169 Karma_dev) qui mappe
      // _ktaDataPolygons vers le format {type, points, level} de getZones().
      const sessionZones = d.zones || [];
      const embeddedZones = (typeof window.getAllEmbeddedZones === "function")
        ? window.getAllEmbeddedZones()
        : [];
      const allZones = sessionZones.concat(embeddedZones);

      // 🏛️ Structures : session + embedded data layers (symétrique zones).
      // 🆕 v1.9.3-A1.b.1 : inclus dans le KMZ avec leurs propres styles
      // (cf. kmzExport.js > STYLES_KML > structure_*). Rétrocompat OK :
      // si pas de structures (legacy build / plan sans structure.json),
      // l'export skip silencieusement le Folder Structures.
      const sessionStructures = d.structures || [];
      const embeddedStructures = (typeof window.getAllEmbeddedStructures === "function")
        ? window.getAllEmbeddedStructures()
        : [];
      const allStructures = sessionStructures.concat(embeddedStructures);

      // Opacité image : slider 0-100% → passé en pourcent au générateur
      const opSlider = document.getElementById("kmz_img_opacity");
      const imageOpacity = opSlider ? Math.max(0, Math.min(100, parseInt(opSlider.value, 10) || 60)) : 60;

      // === Lecture des sous-cases granulaires (pattern IMAGE AVANCE) ===
      // Sets de filtrage par type/tag : si la Set est non-null, le generateur
      // ne garde QUE les items du Set. Si null = parent decoche = drop total.
      // Si Set vide = parent coche mais aucun enfant = drop total (cas degenere).

      // Tags points : on lit toutes les sous-cases [id^="kmz_inc_points_tag_"]
      let pointTagsSet = null;
      const pointsParent = document.getElementById("kmz_inc_points");
      if (pointsParent && pointsParent.checked) {
        pointTagsSet = new Set();
        document.querySelectorAll('[id^="kmz_inc_points_tag_"]').forEach(function(cb) {
          if (cb.checked && cb.dataset && cb.dataset.tag) pointTagsSet.add(cb.dataset.tag);
        });
      }

      // Types roads : 3 sous-cases (principal/secondaire/chemin)
      let roadTypesSet = null;
      const roadsParent = document.getElementById("kmz_inc_roads");
      if (roadsParent && roadsParent.checked) {
        roadTypesSet = new Set();
        ["principal", "secondaire", "chemin"].forEach(function(t) {
          const cb = document.getElementById("kmz_inc_roads_" + t);
          if (cb && cb.checked) roadTypesSet.add(t);
        });
      }

      // Types zones : 4 sous-cases (eau/remblais/effondrement/inaccessible)
      let zoneTypesSet = null;
      const zonesParent = document.getElementById("kmz_inc_zones");
      if (zonesParent && zonesParent.checked) {
        zoneTypesSet = new Set();
        ["eau", "remblais", "effondrement", "inaccessible"].forEach(function(t) {
          const cb = document.getElementById("kmz_inc_zones_" + t);
          if (cb && cb.checked) zoneTypesSet.add(t);
        });
      }

      // 🆕 v1.9.3-A1.b.1 : Types structures (3 sous-cases). Si parent
      // décoché → null (drop total). Si pas de checkbox UI encore (= UI
      // KMZ pas mise à jour), fallback Set complet "tout inclus" pour
      // ne pas perdre les structures silencieusement.
      let structureTypesSet = null;
      const structuresParent = document.getElementById("kmz_inc_structures");
      if (structuresParent) {
        if (structuresParent.checked) {
          structureTypesSet = new Set();
          ["pilier-1", "pilier-2", "mur", "front-1", "front-2"].forEach(function(t) {
            const cb = document.getElementById("kmz_inc_structures_" + t);
            if (cb && cb.checked) structureTypesSet.add(t);
          });
        }
      } else {
        // Pas de checkbox UI → tout inclus par défaut (rétrocompat A1.b.1
        // avant ajout des checkboxes UI dans la modale KMZ)
        structureTypesSet = new Set(["pilier-1", "pilier-2", "mur", "front-1", "front-2"]);
      }

      // 🆕 v1.21.1 (audit fix #2) : enrichissement des Sets avec les types
      // custom (cust-XYZ) rencontrés dans les items. Sans ça, les roads/zones/
      // structures custom (dessinables via éditeur Légende, cf §31.6 CLAUDE.md)
      // étaient SILENCIEUSEMENT droppées du KMZ car les Sets ne contiennent que
      // les types built-in. Décision design : si l'user a coché le parent
      // (Roads/Zones/Structures), TOUS les customs partent — pas de UI dédiée
       // pour cocher/décocher les customs individuels (= bonne par défaut).
      function _addCustsToSet(set, items) {
        if (!set || !Array.isArray(items)) return;
        items.forEach(function(it) {
          if (it && typeof it.type === "string" && it.type.indexOf("cust-") === 0) {
            set.add(it.type);
          }
        });
      }
      _addCustsToSet(roadTypesSet,      allRoads);
      _addCustsToSet(zoneTypesSet,      allZones);
      _addCustsToSet(structureTypesSet, allStructures);

      console.log("[KMZ] Contenu :",
        allPoints.length, "points,",
        allRoads.length, "roads (" + sessionRoads.length + " session +", embeddedRoads.length, "embedded),",
        allZones.length, "zones (" + sessionZones.length + " session +", embeddedZones.length, "embedded),",
        allStructures.length, "structures (" + sessionStructures.length + " session +", embeddedStructures.length, "embedded)");
      console.log("[KMZ] Filtres :",
        "pointTags=", pointTagsSet ? Array.from(pointTagsSet) : "null",
        "roadTypes=", roadTypesSet ? Array.from(roadTypesSet) : "null",
        "zoneTypes=", zoneTypesSet ? Array.from(zoneTypesSet) : "null",
        "structureTypes=", structureTypesSet ? Array.from(structureTypesSet) : "null");

      const kmzBlob = await window.KmzExport.genererKmz({
        planName:    (window.PLAN_CONFIG?.plan?.name)    || "Plan MyKTAMap",
        planVersion: (window.PLAN_CONFIG?.plan?.version) || "",
        planAuthor:  (window.PLAN_CONFIG?.plan?.author)  || "KARMA",
        imageW:      window.APP_CONFIG.imageWidth,
        imageH:      window.APP_CONFIG.imageHeight,
        transform:   transform,
        imageOpacity: imageOpacity,    // 0-100 (% d'opacité du GroundOverlay)
        include: {
          image:      inclImage,
          points:     !!pointTagsSet,       // true si parent coche
          roads:      !!roadTypesSet,
          zones:      !!zoneTypesSet,
          // 🆕 v1.9.3-A1.b.1 : flag parent pour les structures (true si
          // le Set existe et est non-vide — sinon drop tout le folder
          // Structures dans le KMZ).
          structures: !!structureTypesSet && structureTypesSet.size > 0,
          jonctions:  mlOn && document.getElementById("kmz_inc_jonctions")?.checked,
          itineraire: document.getElementById("kmz_inc_iti")?.checked,
          dataLayers: true,
          // Sets de filtrage granulaire (null = pas de filtre, Set = whitelist)
          pointTagsSet: pointTagsSet,
          roadTypesSet: roadTypesSet,
          zoneTypesSet: zoneTypesSet,
          // 🆕 v1.9.3-A1.b.1 : whitelist sous-types structures
          structureTypesSet: structureTypesSet
        },
        levels:        levels,
        data: {
          editorPoints: allPoints,
          roads:        allRoads,
          zones:        allZones,
          // 🆕 v1.9.3-A1.b.1 : session + embedded structures concaténées
          structures:   allStructures
        },
        imageBlob:     imageBlob,
        imageFilename: imageFilename,
        iconsToEmbed:  iconsToEmbed,
        // 🆕 v1.18.0 — Légende plan-level (roundtrip MyKTAMap ↔ MyKTAMap).
        // Embed `PLAN_CONFIG.customLegend` dans un fichier annexe
        // `myktamap-extras.json` du KMZ ZIP. Lu par kmzImport.js au ré-import
        // → injecté dans plan-config.json > plan.customLegend du ZIP MyKTAMap
        // reconstruit. Les apps tierces (Google Earth, OsmAnd) ignorent ce
        // fichier inconnu sans broncher. Skip si checkbox décochée ou si le
        // plan courant n'a pas de customLegend (rien à embarquer).
        planCustomLegend: (function() {
          const inclLegend = !!document.getElementById("kmz_inc_legend")?.checked;
          if (!inclLegend) return null;
          const cl = window.PLAN_CONFIG && window.PLAN_CONFIG.customLegend;
          if (!cl || typeof cl !== "object") return null;
          return cl;
        })()
      });

      // Téléchargement
      const url = URL.createObjectURL(kmzBlob);
      const a = document.createElement("a");
      const planName = (window.PLAN_CONFIG?.plan?.name) || "plan";
      a.href = url;
      a.download = "MyKTAMap_" + planName.replace(/[^a-z0-9]+/gi, "_") + "_" + new Date().toISOString().slice(0, 10) + ".kmz";
      a.click();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

      _fermer();
    } catch(e) {
      console.error("[KMZ] Erreur génération :", e);
      alert(t("export.err.kmzGeneration", { err: e.message || e }));
    } finally {
      if (btnDl) { btnDl.disabled = false; btnDl.textContent = t("export.btn.download"); }
    }
  }

  // ============================================================
  // 📤 GPX EXPORT — v1.14.0 (refactor v1.14.1 : options seules, calibrage
  // partagé via onglet unifié "📡 Export externe")
  // ============================================================
  function _renderOptsGpx() {
    const sessionPoints = window.getEditorPoints ? (window.getEditorPoints() || []) : [];
    const sessionRoads  = window.getRoads        ? (window.getRoads()        || []) : [];
    const embeddedPts   = window.getAllEmbeddedPoints ? (window.getAllEmbeddedPoints() || []) : [];
    const tracesNonIti  = sessionRoads.filter(function(r) { return r && r.type !== "itinerary"; });
    const itiCount      = sessionRoads.filter(function(r) { return r && r.type === "itinerary"; }).length;

    return (
      '<div class="kta-ses-section">' +
        '<div class="kta-ses-section-title">' + t("export.gpx.contentTitle") + '</div>' +
        '<label class="kta-ses-cb-row">' +
          '<input type="checkbox" id="gpx_points" checked>' +
          '<span>' + t("export.gpx.pointsSession") + ' <span class="kta-ses-count">(' + sessionPoints.length + ')</span></span>' +
        '</label>' +
        '<label class="kta-ses-cb-row">' +
          '<input type="checkbox" id="gpx_embedded" ' + (embeddedPts.length > 0 ? "checked" : "disabled") + '>' +
          '<span>' + t("export.gpx.pointsEmbedded") + ' <span class="kta-ses-count">(' + embeddedPts.length + ')</span></span>' +
        '</label>' +
        '<label class="kta-ses-cb-row">' +
          '<input type="checkbox" id="gpx_roads" checked>' +
          '<span>' + t("export.gpx.roadsSession") + ' <span class="kta-ses-count">(' + tracesNonIti.length + ')</span></span>' +
        '</label>' +
        '<label class="kta-ses-cb-row" style="' + (itiCount === 0 ? "opacity:0.5;" : "") + '">' +
          '<input type="checkbox" id="gpx_iti" ' + (itiCount === 0 ? "disabled" : "") + '>' +
          '<span>' + t("export.gpx.itineraire") + ' <span class="kta-ses-count">(' + itiCount + ')</span></span>' +
        '</label>' +
        // 🆕 v1.18.1 — Légende plan-level (roundtrip MyKTAMap ↔ MyKTAMap via GPX).
        // Symétrique de la checkbox KMZ v1.18.0. Cochée par défaut SI le plan
        // a une customLegend non-vide, grisée à 0 sinon. Embed dans
        // <extensions><myktamap:customLegend> sous <metadata> GPX standard.
        // Ignoré par les apps tierces (TopoDroid, OsmAnd…), parsé par gpxIO.
        (function() {
          const cl = window.PLAN_CONFIG && window.PLAN_CONFIG.customLegend;
          const has = !!(cl && typeof cl === "object" &&
            ((cl.labels && Object.keys(cl.labels).length) ||
             (cl.hidden && (Array.isArray(cl.hidden) ? cl.hidden.length : Object.keys(cl.hidden).length)) ||
             (Array.isArray(cl.customEntries) && cl.customEntries.length)));
          return '<label class="kta-ses-cb-row" style="' + (has ? "" : "opacity:0.5;") + '">' +
            '<input type="checkbox" id="gpx_legend" ' + (has ? "checked" : "disabled") + '>' +
            '<span>' + t("export.gpx.legend") + ' ' +
              '<span class="kta-ses-count">(' + (has ? 1 : 0) + ')</span></span>' +
          '</label>';
        })() +
      '</div>' +
      '<div class="kta-ses-summary" style="margin-top:14px;">' +
        t("export.gpx.formatLine") +
        '<br>' +
        t("export.gpx.roundtripLine") +
      '</div>'
    );
  }

  // Sauvegarde le calibrage saisi dans le formulaire (réutilise les mêmes
  // inputs kmz_A_x... que l'export KMZ), puis lance GpxIO.exporter.
  // Le calibrage est ainsi partagé entre les deux formats.
  function _exportGpxViaExtern() {
    if (!window.KmzExport) {
      alert(t("export.err.kmzModuleKo"));
      return;
    }
    if (!window.GpxIO) {
      alert(t("export.err.gpxModuleKo"));
      return;
    }
    // 1) Valider + persister calibrage (même validation que _exportKmz)
    const c = _kmzLireCalib();
    if (c.pointA.x == null || c.pointA.y == null || c.pointA.lat == null || c.pointA.lng == null ||
        c.pointB.x == null || c.pointB.y == null || c.pointB.lat == null || c.pointB.lng == null) {
      alert(t("export.err.calib8Champs"));
      return;
    }
    try {
      window.KmzExport.buildTransformCalib(c);   // 📐 v1.73.0 : pointC optionnel propagé (affine)
    } catch(e) {
      alert(t("export.err.calibInvalide", { msg: e.message }));
      return;
    }
    window.KmzExport.setCalibration(_kmzCurrentPlanId(), c);

    // 2) Lire les options GPX
    const incPoints   = document.getElementById("gpx_points")   && document.getElementById("gpx_points").checked;
    const incEmbedded = document.getElementById("gpx_embedded") && document.getElementById("gpx_embedded").checked;
    const incRoads    = document.getElementById("gpx_roads")    && document.getElementById("gpx_roads").checked;
    const incIti      = document.getElementById("gpx_iti")      && document.getElementById("gpx_iti").checked;
    // 🆕 v1.18.1 — Roundtrip légende plan-level (symétrique KMZ v1.18.0).
    // Embed dans <extensions><myktamap:customLegend> sous <metadata> GPX.
    const incLegend   = document.getElementById("gpx_legend")   && document.getElementById("gpx_legend").checked;

    const btnDl = document.getElementById("kta-ses-download");
    if (btnDl) { btnDl.disabled = true; btnDl.textContent = t("export.btn.generating"); }

    try {
      const r = window.GpxIO.exporter({
        incPoints:   !!incPoints,
        incEmbedded: !!incEmbedded,
        incRoads:    !!incRoads,
        incIti:      !!incIti,
        // 🆕 v1.18.1 — Légende plan-level via <extensions> GPX standard.
        // Skip si checkbox décochée OU si pas de customLegend dans le plan.
        planCustomLegend: (function() {
          if (!incLegend) return null;
          const cl = window.PLAN_CONFIG && window.PLAN_CONFIG.customLegend;
          if (!cl || typeof cl !== "object") return null;
          return cl;
        })()
      });
      if (!r.ok) {
        alert(t("export.err.gpxImpossible", { msg: r.msg }));
      } else {
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast(
            t("export.gpx.exported", { wpts: r.counts.wpts, trks: r.counts.trks }),
            "info"
          );
        }
        _fermer();
      }
    } catch(e) {
      console.error("[GPX] Erreur export :", e);
      alert(t("export.err.gpxGeneration", { err: e.message || e }));
    } finally {
      if (btnDl) { btnDl.disabled = false; btnDl.textContent = t("export.btn.download"); }
    }
  }

})();
