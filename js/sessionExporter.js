/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// sessionExporter.js — modale d'export de session, un onglet par fenêtre : Complet (tout, tracker compris),
// Avancé (sélection fine, 1 fichier ou ZIP), Conversion (session ↔ calque devmap-data), Fusion de calques,
// Export externe (KMZ / GPX / GeoJSON, calibrage GPS 2 points commun).
// Expose : window.ouvrirExportSessionModal(initialTab, solo, opts), window._kta_formatBytes
// Dépend de : KmzExport, GeojsonExport, GpxIO, MyKTAMapPhotos, KtaUid, JSZip, I18n
// 🔒 Export anonymisé : _anonymiserSession + _stripperExifPhotos, fail-closed sur les photos.
// Garde-fous : scripts/check-export-anonyme.js, scripts/check-legend-roundtrip.js, scripts/check-photos.js
// Doc : docs/architecture/exports.md

(function() {
  "use strict";

  // Résout au RENDU (jamais au load) ; clé brute si le dico est absent.
  function t(key, params) {
    return (window.I18n && typeof window.I18n.t === "function")
      ? window.I18n.t(key, params)
      : key;
  }

  // « Rien à exporter » : toast warn important, visible même en mode Silence (décision produit).
  function _avertirRienAExporter(msg) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(msg, "warn", { important: true });
    } else {
      window.ktaAlerte(msg);
    }
  }

  let _modal = null;
  // Filtre d'export (onglets Complet et Avancé) : période et/ou auteur. Remis à zéro à chaque ouverture.
  let _filtre = { du: "", au: "", auteur: "" };
  // 🔒 Export limité par l'installation (plan d'un autre compte, window.ktaExportLimite) : pseudo IMPOSÉ au filtre
  // auteur, non modifiable ; les copies de calque (`_srcCalque`) ne partent jamais. null = export libre.
  let _auteurImpose = null;
  let _activeTab = "full"; // "full" | "advanced" | "conversion" | "extern" | "fusion"

  // Fusion de calques : _fusionInputs = [{name, json}] ; _fusionMerged = résultat + dupIds (alerte seulement).
  let _fusionInputs = [];
  let _fusionMerged = null;
  // Titre de la modale par onglet (chaque tuile du lanceur ouvre sa fenêtre sur un seul onglet).
  const _TITRES_SOLO = {
    full: "export.solo.full", advanced: "export.solo.advanced", extern: "export.solo.extern",
    conversion: "export.solo.conversion", fusion: "tabledit.source.fusion"
  };
  let _onEchap = null; // écouteur Échap de la modale ouverte (retiré à toute fermeture)
  // Format KMZ / GPX / GeoJSON imposé par la tuile du lanceur : pas de sélecteur de format, le titre le nomme.
  const _FORMATS_EXTERNES = ["kmz", "gpx", "geojson"];
  let _formatImpose = null;

  // Onglet Export externe : dernier format choisi, persisté.
  const _EXTERN_FMT_KEY = "myktamap_extern_format_v1";
  let _externFormat = (function() {
    try {
      const v = localStorage.getItem(_EXTERN_FMT_KEY);
      return (_FORMATS_EXTERNES.indexOf(v) >= 0) ? v : "kmz";
    } catch(e) { return "kmz"; }
  })();

  // État de l'onglet Conversion (bidirectionnel)
  let _convDirection      = "ed2data"; // "ed2data" (session→data) | "data2ed" (data→session)
  let _convUploadedJson   = null;      // JSON parsé du fichier uploadé (mode data2ed)
  let _convUploadedName   = "";        // nom du fichier uploadé (mode data2ed)
  let _convUploadedPhotos = null;      // Array<{id, pointId, mime, size, blob}>
                                       // si l'input est un ZIP data layer avec photos/, sinon null

  // ── Styles ──────────────
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

      .kta-ses-content {
        padding: 18px;
        overflow-y: auto;
        flex: 1;
      }

      .kta-ses-intro {
        font-size: 13px;
        color: var(--kta-texte-2);
        margin-bottom: 16px;
        line-height: 1.5;
      }

      .kta-ses-section {
        margin-bottom: 18px;
      }
      .kta-ses-section-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--kta-interaction);
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
        color: var(--kta-texte);
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
        color: var(--kta-texte-3);
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
        color: var(--kta-texte);
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
        color: var(--kta-texte-3);
        font-size: 12px;
        margin-left: 4px;
      }

      .kta-ses-summary {
        background: rgba(140,180,255,0.06);
        border: 1px solid rgba(140,180,255,0.18);
        border-radius: 6px;
        padding: 12px 14px;
        font-size: 13px;
        color: var(--kta-texte-2);
        line-height: 1.7;
      }
      .kta-ses-summary strong {
        color: var(--kta-texte);
      }
      .kta-ses-summary .kta-ses-zero {
        color: var(--kta-texte-3);
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
        color: var(--kta-texte-2);
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
        color: var(--kta-interaction);
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
        color: var(--kta-texte-3);
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
        border: 1px solid var(--kta-bordure);
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
        color: var(--kta-texte-2);
        transition: background 0.12s;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px;
      }
      .kta-kmz-search-item:hover {
        background: rgba(140,180,255,0.14);
        color: var(--kta-texte);
      }
      .kta-kmz-search-item strong {
        color: var(--kta-interaction);
        font-weight: 600;
      }
      .kta-kmz-search-item .kta-kmz-search-meta {
        color: var(--kta-texte-3);
        font-size: 11px;
      }
      .kta-kmz-search-empty {
        padding: 8px 10px;
        color: var(--kta-texte-3);
        font-style: italic;
        font-size: 12px;
        text-align: center;
      }
      .kta-kmz-apercu {
        padding: 8px 10px;
        background: rgba(0,0,0,0.20);
        border-radius: 4px;
        font-size: 12px;
        color: var(--kta-texte-2);
      }
      .kta-kmz-coins-grille {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 12px;
      }
      .kta-kmz-coins-grille code {
        font-size: 11px;
        color: var(--kta-accent-texte);
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
        color: var(--kta-texte-2);
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
        color: var(--kta-texte-2);
      }
      /* 15/10/2026 — choix de netteté KMZ : la liste ne déborde jamais (capture iPhone : 870 px de large,
         tout le contenu décalé à gauche), fond sombre de la charte au lieu du blanc natif. */
      .kta-kmz-nettete {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 6px 0 0 24px;
        min-width: 0;
        max-width: calc(100% - 24px);
      }
      .kta-kmz-nettete select {
        flex: 1;
        min-width: 0;
        max-width: 100%;
        background: var(--kta-fond);
        color: var(--kta-texte);
        border: 1px solid rgba(140,180,255,0.35);
        border-radius: 6px;
        padding: 4px 6px;
        font-size: 12px;
        text-overflow: ellipsis;
      }
      .kta-kmz-nettete select:disabled { opacity: 0.5; }
      body.kta-theme-light .kta-kmz-nettete select,
      html.kta-theme-light .kta-kmz-nettete select { background: #fff; color: #1a1f2e; border-color: rgba(0,0,0,0.2); }
      .kta-extern-opts[data-fmt="geojson"] [data-kmz-seul="1"] { display: none; }
      .kta-kmz-opacity-row.disabled {
        opacity: 0.4;
        pointer-events: none;
      }
      .kta-kmz-opacity-lbl {
        color: var(--kta-texte-3);
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
        color: var(--kta-accent-texte);
        min-width: 36px;
        text-align: right;
      }

      /* 📡 v1.14.1 — Sélecteur de format (KMZ/GPX) en pills segmentées */
      .kta-ses-format-pills {
        display: flex;
        gap: 4px;
        padding: 4px;
        background: rgba(0,0,0,0.25);
        border: 1px solid var(--kta-bordure);
        border-radius: 8px;
        margin-bottom: 8px;
      }
      .kta-ses-fmt-pill {
        flex: 1;
        padding: 8px 12px;
        background: transparent;
        color: var(--kta-texte-3);
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-family: inherit;
        font-weight: 600;
        transition: all 0.12s;
      }
      .kta-ses-fmt-pill:hover {
        color: var(--kta-texte-2);
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
        color: var(--kta-texte);
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
      .kta-fusion-file-name { color: var(--kta-texte-2); word-break: break-all; }
      .kta-fusion-file-cats { color: var(--kta-texte-3); white-space: nowrap; }
      .kta-fusion-clear-btn { float: right; background: none; border: 1px solid #8892a4;
        color: var(--kta-texte-2); border-radius: 6px; padding: 1px 8px; font-size: 0.8em; cursor: pointer; }
      .kta-fusion-clear-btn:hover { border-color: #ff8c8c; color: var(--kta-erreur); }
      .kta-fusion-warn { margin-top: 8px; padding: 8px 10px; border-radius: 6px;
        background: rgba(244,197,66,0.12); border: 1px solid rgba(244,197,66,0.4);
        color: var(--kta-accent-texte); font-size: 0.86em; }
      .kta-ses-filtre { margin: 0 0 12px; padding: 8px 10px; border: 1px solid #2a3144; border-radius: 8px; }
      .kta-ses-filtre-titre { font-weight: 700; color: var(--kta-accent-texte); margin-bottom: 6px; font-size: 0.92em; }
      .kta-ses-filtre-ligne { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; font-size: 0.9em; }
      /* 15/10/2026 (capture iPhone) : « Du » / « au » en noir sur fond sombre, dates et bouton en blanc natif. */
      .kta-ses-filtre-ligne label { display: flex; align-items: center; gap: 6px; color: var(--kta-texte-2); min-width: 0; }
      .kta-ses-filtre-ligne input, .kta-ses-filtre-ligne select {
        background: var(--kta-fond); color: var(--kta-texte); border: 1px solid rgba(140,180,255,0.35); border-radius: 6px;
        padding: 4px 6px; font: inherit; color-scheme: dark; min-width: 0; max-width: 100%; min-height: 30px;
      }
      .kta-ses-filtre-ligne input[type="date"] { width: 10em; }
      .kta-ses-filtre-ligne .kta-ses-btn { padding: 6px 12px; }
      body.kta-theme-light .kta-ses-filtre-ligne label, html.kta-theme-light .kta-ses-filtre-ligne label { color: #3a4254; }
      body.kta-theme-light .kta-ses-filtre-ligne input, html.kta-theme-light .kta-ses-filtre-ligne input,
      body.kta-theme-light .kta-ses-filtre-ligne select, html.kta-theme-light .kta-ses-filtre-ligne select {
        background: #fff; color: #1a1f2e; border-color: rgba(0,0,0,0.2); color-scheme: light;
      }
      .kta-ses-filtre-bilan { margin-top: 6px; font-size: 0.82em; color: var(--kta-texte-3); }
    `;
    document.head.appendChild(s);
  }

  // Légende des types qu'un contenu de calque référence ({ data, roads, zones, structures } → état de légende ou
  // null) : même sous-ensemble que la conversion, pour l'assistant « Mettre à jour le plan » (js/majPlan.js).
  window.ktaLegendePourCalque = function(payload) { return _legendePourPayload(payload || {}); };

  // ── Entrée publique ──────────────
  // ouvrirExportSessionModal(initialTab, solo, opts)
  //   initialTab  : "full" (défaut) | "advanced" | "extern" | "conversion" | "fusion"
  //   solo        : sans effet (signature conservée) — la fenêtre montre toujours un seul onglet, titre propre
  //   opts.format : "kmz" | "gpx" | "geojson" → onglet extern ouvert sur ce format, sans sélecteur de format
  window.ouvrirExportSessionModal = function(initialTab, solo, opts) {
    const TABS = ["full", "advanced", "conversion", "fusion", "extern"];
    const tab = (typeof initialTab === "string" && TABS.indexOf(initialTab) >= 0) ? initialTab : "full";
    // Verrou de l'installation : la SESSION seulement (complet, avancé, conversion). Export externe (KMZ / GPX)
    // et Fusion (fichiers téléversés) passent. Complet et Avancé savent se limiter à un auteur ; la conversion non.
    if (tab === "full" || tab === "advanced" || tab === "conversion") {
      if (typeof window.ktaExportPlanRefuse === "function" &&
          window.ktaExportPlanRefuse({ limitePermise: tab !== "conversion" })) return;
    }
    _injecterStyles();
    if (_modal) _fermer();
    _auteurImpose = ((tab === "full" || tab === "advanced") && typeof window.ktaExportLimite === "function")
      ? (window.ktaExportLimite() || null) : null;
    _filtre = { du: "", au: "", auteur: _auteurImpose || "" };
    // initialTab optionnel (ex. "fusion" depuis l'Éditeur de données) ; défaut "full".
    _activeTab = tab;
    const fmt = opts && opts.format;
    _formatImpose = (tab === "extern" && _FORMATS_EXTERNES.indexOf(fmt) >= 0) ? fmt : null;
    if (_FORMATS_EXTERNES.indexOf(fmt) >= 0) _externFormat = fmt;
    _afficherModal();
  };


  // ── Filtre (période / auteur) ──────────────
  function _filtreActif() {
    return (_activeTab === "full" || _activeTab === "advanced") &&
      !!(_auteurImpose || _filtre.du || _filtre.au || _filtre.auteur);
  }
  function _auteurDe(o) {
    const X = window.KtaExtensions;
    const a = (X && typeof X.auteurObjet === "function" && o && o.uid) ? X.auteurObjet(o.uid) : null;
    return a && a.createur ? a.createur : null;
  }
  function _horodatage(o) {
    const v = o && o.updatedAt;
    if (typeof v === "number" && isFinite(v)) return v;
    const p = Date.parse(v || (o && o.date_update) || "");
    return isFinite(p) ? p : null;
  }
  // Un objet sans date (ou sans auteur connu) n'est pas retenu par un filtre qui porte sur ce critère :
  // on ne peut pas affirmer qu'il en fait partie.
  function _garder(o) {
    if (!o) return false;
    if (_filtre.du || _filtre.au) {
      const ts = _horodatage(o);
      if (ts === null) return false;
      if (_filtre.du && ts < new Date(_filtre.du + "T00:00:00").getTime()) return false;
      if (_filtre.au && ts > new Date(_filtre.au + "T23:59:59.999").getTime()) return false;
    }
    if (_auteurImpose) {
      // Une copie de calque est le contenu du plan, pas un ajout, quel que soit l'auteur que la synchro lui prête.
      if (o._srcCalque !== undefined || _auteurDe(o) !== _auteurImpose) return false;
    } else if (_filtre.auteur && _auteurDe(o) !== _filtre.auteur) return false;
    return true;
  }
  // Photos à embarquer : celles des points retenus quand un filtre agit (sinon celles d'objets écartés
  // partiraient), toutes sinon (null).
  function _idsPhotosRetenues(points) {
    return _filtreActif() ? _idsPhotosDe(points) : null;
  }
  // Clés de photos de ces points : une photo est rangée sous l'uid du point, ou sous son nom (anciennes).
  function _idsPhotosDe(points) {
    return new Set([].concat.apply([], (points || []).map(function(p) {
      return p.uid ? [String(p.uid), String(p.id || "")] : [String(p.id || "")];
    })));
  }
  function _filtrer(liste) {
    const l = Array.isArray(liste) ? liste : [];
    return _filtreActif() ? l.filter(_garder) : l;
  }
  function _brut() {
    return [].concat(window.getEditorPoints ? (window.getEditorPoints() || []) : [],
      window.getRoads ? (window.getRoads() || []).filter(function(r) { return r && r.type !== "itinerary"; }) : [],
      window.getZones ? (window.getZones() || []) : [], window.getStructures ? (window.getStructures() || []) : []);
  }
  function _htmlFiltre() {
    const X = window.KtaExtensions;
    const parAuteur = !!(X && typeof X.aPrise === "function" && X.aPrise("auteurObjet"));
    const tous = _brut();
    let optAuteurs = "";
    if (_auteurImpose) {
      const nom = window.ktaEsc(_auteurImpose);
      optAuteurs = '<option value="' + nom + '" selected>' + nom + '</option>';
    } else if (parAuteur) {
      const noms = {};
      tous.forEach(function(o) { const a = _auteurDe(o); if (a) noms[a] = true; });
      optAuteurs = '<option value="">' + window.ktaEsc(t("export.filtre.tous")) + '</option>' +
        Object.keys(noms).sort(function(a, b) { return a.localeCompare(b); }).map(function(n) {
          return '<option value="' + window.ktaEsc(n) + '"' + (n === _filtre.auteur ? " selected" : "") + '>' + window.ktaEsc(n) + '</option>';
        }).join("");
    }
    const retenus = _filtreActif() ? tous.filter(_garder).length : tous.length;
    return '<div class="kta-ses-filtre" id="kta-ses-filtre">' +
        '<div class="kta-ses-filtre-titre">🔎 ' + window.ktaEsc(t("export.filtre.titre")) + '</div>' +
        '<div class="kta-ses-filtre-ligne">' +
          '<label>' + window.ktaEsc(t("export.filtre.du")) + ' <input type="date" id="ses_filtre_du" value="' + window.ktaEsc(_filtre.du) + '"></label>' +
          '<label>' + window.ktaEsc(t("export.filtre.au")) + ' <input type="date" id="ses_filtre_au" value="' + window.ktaEsc(_filtre.au) + '"></label>' +
          ((parAuteur || _auteurImpose) ? '<label>' + window.ktaEsc(t("export.filtre.auteur")) +
            ' <select id="ses_filtre_auteur"' + (_auteurImpose ? ' disabled' : '') + '>' + optAuteurs +
            '</select></label>' : '') +
          ((_filtre.du || _filtre.au || (_filtre.auteur && !_auteurImpose)) ? '<button type="button" class="kta-ses-btn kta-ses-btn-secondary" id="ses_filtre_raz">' + window.ktaEsc(t("export.filtre.raz")) + '</button>' : '') +
        '</div>' +
        (_auteurImpose ? '<div class="kta-ses-filtre-bilan kta-tx-warn" id="ses_filtre_impose">🔒 ' +
          window.ktaEsc(t("export.filtre.impose")) + '</div>' : '') +
        '<div class="kta-ses-filtre-bilan">' + window.ktaEsc(_filtreActif()
          ? t("export.filtre.retenus", { n: retenus, total: tous.length }) : "") + '</div>' +
      '</div>';
  }
  function _brancherFiltre(modal) {
    modal.addEventListener("change", function(e) {
      const id = e.target && e.target.id;
      if (id === "ses_filtre_du") _filtre.du = e.target.value || "";
      else if (id === "ses_filtre_au") _filtre.au = e.target.value || "";
      else if (id === "ses_filtre_auteur") { if (!_auteurImpose) _filtre.auteur = e.target.value || ""; }
      else return;
      _renderTab();
    });
    modal.addEventListener("click", function(e) {
      if (!e.target || e.target.id !== "ses_filtre_raz") return;
      _filtre = { du: "", au: "", auteur: _auteurImpose || "" };
      _renderTab();
    });
  }

  // ── Comptages ──────────────
  function _compter() {
    return {
      // Annotations filtrées par période / auteur (onglets Complet et Avancé seulement).
      points:    _filtrer(window.getEditorPoints  ? window.getEditorPoints()  : []),
      roads:     _filtrer(window.getRoads         ? window.getRoads()         : []),
      zones:     _filtrer(window.getZones         ? window.getZones()         : []),
      structures: _filtrer(window.getStructures   ? window.getStructures()    : []),
      // Mesure de distance incluse : elle doit se retrouver d'une session ou d'un appareil à l'autre.
      mesure:        window.getMeasurePoints        ? window.getMeasurePoints()        : [],
      // Mesure de surface persistée à part : sans ce champ, le polygone se perd au réimport.
      mesureSurface: window.getMeasurePointsSurface ? window.getMeasurePointsSurface() : [],
      trackerOk: !!(window.getTrackingPosition && window.getTrackingPosition()),
      trackerPath: window.getTrackingPath ? window.getTrackingPath() : [],
      // Timeline datée complète + startTs (heatmap / replay multi-appareils), en plus de trackerPath (rendu).
      // Exclue de la conversion data layer (ed2data), format en lecture seule.
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

  // Déversoir du bucket `autres` : `_trierParType` y range tout type non built-in. 🩸 Sans un fichier par type
  // restant, les objets d'un type CUSTOM disparaissent en silence de l'export fin. Groupement sur le type BRUT
  // (deux types ne fusionnent jamais) ; seul le nom de fichier est assaini.
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

  // Tags présents avec leur compte (un point multi-tags compte dans chacun ; « (sans tag) » à part).
  // Retourne [{ tag, count, isUntagged }] trié, sans tag à la fin.
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

    const list = Object.keys(tagCounts).sort(function(a, b) { return a.localeCompare(b); }).map(function(t) {
      return { tag: t, count: tagCounts[t], isUntagged: false };
    });
    if (untaggedCount > 0) {
      list.push({ tag: "__untagged__", count: untaggedCount, isUntagged: true });
    }
    return list;
  }

  // Un point passe si AU MOINS UN de ses tags est coché, ou s'il n'a pas de tag et que untaggedCoche.
  function _filtrerPointsParTags(points, tagsCoches, untaggedCoche) {
    return (points || []).filter(function(p) {
      const tags = Array.isArray(p.tags) ? p.tags.filter(function(t) { return t && String(t).trim(); }) : [];
      if (tags.length === 0) return untaggedCoche;
      return tags.some(function(t) { return tagsCoches.has(String(t)); });
    });
  }

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

  function _slugTagId(tag) {
    return String(tag).replace(/[^a-z0-9_-]/gi, "_");
  }

  // Icône d'un tag : PLAN_CONFIG.icons[tag] puis _iconMap[tag].
  function _iconePourTag(tag) {
    const planIcons = (window.PLAN_CONFIG && window.PLAN_CONFIG.icons) || {};
    if (planIcons[tag]) return planIcons[tag];
    const entry = window._iconMap && window._iconMap[tag];
    if (!entry) return null;
    // entry peut être un L.divIcon (scaledMarkers) : lire _kta_iconUrl
    return entry._kta_iconUrl || (entry.options && entry.options.iconUrl) || null;
  }

  // ── Affichage de la modale ──────────────
  function _afficherModal() {
    const modal = document.createElement("div");
    modal.id = "kta-session-export-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = `
      <div class="kta-readme-modal-boite">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">${t(_formatImpose ? "export.solo." + _formatImpose
                                                     : _TITRES_SOLO[_activeTab])}</span>
          <button class="kta-panneau-close" id="kta-ses-close">✕</button>
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
    _brancherFiltre(modal);

    document.getElementById("kta-ses-close").addEventListener("click", _fermer);
    document.getElementById("kta-ses-cancel").addEventListener("click", _fermer);
    modal.addEventListener("click", function(e) { if (e.target === modal) _fermer(); });
    // Un seul écouteur Échap, retiré par _fermer() quelle que soit la façon de fermer.
    _detacherEchap();
    // Pendant le « clic carte » du calibrage KMZ/GPX (modale masquée), Échap annule seulement ce choix : la
    // fenêtre revient avec les points déjà saisis, comme le bouton Annuler du floater.
    _onEchap = function(e) {
      if (e.key !== "Escape" || !_modal) return;
      if (_kmzClickActive) {
        _kmzDesactiverModeClic();
        _modal.style.display = "";
        return;
      }
      _fermer();
    };
    document.addEventListener("keydown", _onEchap);

    document.getElementById("kta-ses-download").addEventListener("click", _executerExport);

    _renderTab();
  }

  // ── Rendu des onglets ──────────────
  function _renderTab() {
    if (!_modal) return;

    const c = document.getElementById("kta-ses-content");
    if (!c) return;

    // Télécharger réactivé à chaque changement d'onglet ; Conversion data→session et Fusion le désactivent
    // tant que rien n'est chargé.
    const _dlBtnReset = document.getElementById("kta-ses-download");
    if (_dlBtnReset) _dlBtnReset.disabled = false;

    if (_activeTab === "full") {
      c.innerHTML = _renderFull();
      // Compteur photos async (IDB) ; la section reste cachée sans photo.
      setTimeout(_majCompteurPhotosFull, 0);
    }
    else if (_activeTab === "advanced") {
      c.innerHTML = _renderAdvanced();
      setTimeout(_majCompteurPhotosAdvanced, 0);
    }
    else if (_activeTab === "conversion") {
      c.innerHTML = _renderConversion();
      // Sens session→data seulement (en data→session la section n'est pas dans le DOM).
      setTimeout(_majCompteurPhotosConvEd2Data, 0);
    }
    else if (_activeTab === "extern") {
      c.innerHTML = _renderExtern();
      setTimeout(_bindKmzHandlers, 0);
      setTimeout(_bindExternFmtHandlers, 0);
    }
    else if (_activeTab === "fusion") {
      c.innerHTML = _renderFusion();
      setTimeout(_bindFusion, 0);
    }
  }

  // Compteur photos de l'onglet Complet, format « (N · X Mo) » ; section cachée sans photo.
  function _majCompteurPhotosFull() {
    const section = document.getElementById("full_photos_section");
    const counter = document.getElementById("full_photos_count");
    const cb      = document.getElementById("full_photos");
    if (!section || !counter) return;
    _collecterPhotosPlan(_idsPhotosRetenues(_compter().points)).then(function(pack) {
      if (pack.photos.length === 0) {
        section.style.display = "none";
        if (cb) cb.checked = false;
        return;
      }
      section.style.display = "block";
      counter.textContent = "(" + pack.photos.length + " · " + _formatBytes(pack.totalSize) + ")";
    });
  }

  // Compteur photos de l'onglet Avancé : total du plan (un « max ») ; le filtre par points se fait à
  // l'enregistrement (_exportAdvanced).
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

  // Compteur photos de la conversion session→data : un « max », réduit par le filtre points/tags.
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

  // ── Onglet Complet ──────────────
  function _renderFull() {
    const d = _compter();
    // Section Photos : « Chargement… » puis compteur rempli en async (_kta_majCompteurPhotosFull).
    return _htmlFiltre() + `
      <div class="kta-ses-summary">
        <div>✏️ ${t("export.full.points", { n: d.points.length, s: d.points.length > 1 ? "s" : "" })}</div>
        <div>🛣️ ${t("export.full.roads", { n: d.roads.length, s: d.roads.length > 1 ? "s" : "" })}</div>
        <div>⬛ ${t("export.full.zones", { n: d.zones.length, s: d.zones.length > 1 ? "s" : "" })}</div>
        <div>🏛️ ${t("export.full.structures", { n: (d.structures || []).length, s: (d.structures || []).length > 1 ? "s" : "" })}</div>
        <div>🧭 ${t("export.full.tracker", { n: (d.trackerTimeline || []).length, s: (d.trackerTimeline || []).length > 1 ? "s" : "" })}</div>
      </div>

      <div class="kta-ses-photos-section" id="full_photos_section" style="display:none;">
        <label class="kta-ses-cb-row" style="margin-top:8px;">
          <input type="checkbox" id="full_photos" checked>
          <span>
            ${t("export.full.photosLabel")}
            <span class="kta-ses-count" id="full_photos_count">${t("export.loading")}</span>
          </span>
        </label>
        <p style="font-size:11.5px; color:var(--kta-texte-3); font-style:italic; margin:6px 0 0 26px; line-height:1.4;">
          ${t("export.full.photosHint")}
        </p>
      </div>

      <!-- 🆕 v1.31.7 F1 : toggle anonymisation pour partage public -->
      <div class="kta-ses-anonymize-section" style="margin-top:14px; padding-top:10px; border-top:1px solid var(--kta-bordure);">
        <label class="kta-ses-cb-row">
          <input type="checkbox" id="full_anonymize">
          <span>${t("export.full.anonymizeLabel")}</span>
        </label>
        <p style="font-size:11.5px; color:var(--kta-texte-3); font-style:italic; margin:6px 0 0 26px; line-height:1.4;">
          ${t("export.full.anonymizeHint")}
        </p>
      </div>
    `;
  }

  // ── Onglet Avancé ──────────────
  function _renderAdvanced() {
    const d = _compter();
    const roadsByType = _trierParType(d.roads, ["principal", "secondaire", "chemin"]);
    const zonesByType = _trierParType(d.zones, ["eau", "remblais", "effondrement", "inaccessible"]);
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

    return _htmlFiltre() + `
      <div class="kta-ses-section">
        <div class="kta-ses-section-title">${t("export.adv.contentTitle")}</div>

        ${row("adv_points", t("export.adv.points"), d.points.length, true)}
        ${pointsTagsHtml}

        ${row("adv_roads", t("export.adv.roads"), d.roads.length, true)}
        ${rowSub("adv_roads_principal",  _lp("traces", "principal", t("export.adv.roadsPrincipal")),  roadsByType.principal.length,  true)}
        ${rowSub("adv_roads_secondaire", _lp("traces", "secondaire", t("export.adv.roadsSecondaire")), roadsByType.secondaire.length, true)}
        ${rowSub("adv_roads_chemin",     _lp("traces", "chemin", t("export.adv.roadsChemin")),     roadsByType.chemin.length,     true)}

        ${row("adv_zones", t("export.adv.zones"), d.zones.length, true)}
        ${rowSub("adv_zones_eau",          _lp("zones", "eau", t("export.adv.zonesEau")),           zonesByType.eau.length,          true)}
        ${rowSub("adv_zones_remblais",     _lp("zones", "remblais", t("export.adv.zonesRemblais")),      zonesByType.remblais.length,     true)}
        ${rowSub("adv_zones_effondrement", _lp("zones", "effondrement", t("export.adv.zonesEffondrement")),  zonesByType.effondrement.length, true)}
        ${rowSub("adv_zones_inaccessible", _lp("zones", "inaccessible", t("export.adv.zonesInaccessible")),  zonesByType.inaccessible.length, true)}

        ${row("adv_structures", t("export.adv.structures"), (d.structures || []).length, true)}
        ${rowSub("adv_structures_pilier-1", _lp("structures", "pilier-1", t("export.adv.structPilier1")),     structuresByType["pilier-1"].length, true)}
        ${rowSub("adv_structures_pilier-2", _lp("structures", "pilier-2", t("export.adv.structPilier2")),     structuresByType["pilier-2"].length, true)}
        ${rowSub("adv_structures_mur",      _lp("structures", "mur", t("export.adv.structMur")),         structuresByType["mur"].length,      true)}
        ${rowSub("adv_structures_front-1",  _lp("structures", "front-1", t("export.adv.structFront1")),      structuresByType["front-1"].length,  true)}
        ${rowSub("adv_structures_front-2",  _lp("structures", "front-2", t("export.adv.structFront2")),      structuresByType["front-2"].length,  true)}

        ${row("adv_mesure",        t("export.adv.mesureDistance"), (d.mesure || []).length,        (d.mesure || []).length > 0)}
        ${row("adv_mesure_surface",t("export.adv.mesureSurface"),  (d.mesureSurface || []).length, (d.mesureSurface || []).length >= 3)}

        ${(function() {
          // Tracker activable s'il y a une timeline, un path runtime ou une position courante.
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
        <p style="font-size:11.5px; color:var(--kta-texte-3); font-style:italic; margin:6px 0 0 26px; line-height:1.4;">
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

  // Cohérence parent / sous-cases
  function _attacherListenersAdvanced() {
    if (!_modal || _activeTab !== "advanced") return;

    function syncParent(parentId, subIds) {
      const parent = document.getElementById(parentId);
      const subs = subIds.map(function(id) { return document.getElementById(id); }).filter(Boolean);
      if (!parent || subs.length === 0) return;

      parent.addEventListener("change", function() {
        subs.forEach(function(s) {
          if (!s.disabled) s.checked = parent.checked;
        });
      });

      subs.forEach(function(s) {
        s.addEventListener("change", function() {
          const anyChecked = subs.some(function(x) { return x.checked; });
          parent.checked = anyChecked;
        });
      });
    }

    syncParent("adv_roads", ["adv_roads_principal", "adv_roads_secondaire", "adv_roads_chemin"]);
    syncParent("adv_zones", ["adv_zones_eau", "adv_zones_remblais", "adv_zones_effondrement", "adv_zones_inaccessible"]);
    syncParent("adv_structures", ["adv_structures_pilier-1", "adv_structures_pilier-2", "adv_structures_mur", "adv_structures_front-1", "adv_structures_front-2"]);

    // Points ↔ tags : la liste varie selon les points
    const tagsList = _listerTagsPoints(_compter().points);
    const tagSubIds = tagsList.map(function(item) {
      return "adv_points_tag_" + _slugTagId(item.tag);
    });
    if (tagSubIds.length > 0) {
      syncParent("adv_points", tagSubIds);
    }
  }

  // ── Onglet Conversion ──────────────
  function _renderConversion() {
    // Sans plan affiché (Éditeur de données ouvert depuis l'accueil), pas de session : seul
    // « data layer → session » a un sens.
    if (typeof window.ktaPlanAffiche === "function" && !window.ktaPlanAffiche()) {
      _convDirection = "data2ed";
      return _renderConvData2Session();
    }
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

  // Sens 1 : session courante → fichiers data layer
  function _renderConvSession2Data() {
    const d = _compter();
    const tagsList = _listerTagsPoints(d.points);

    // ⚠️ Les roads "itinerary" (calculées par Pathfinder) ne sont pas exportables.
    const roadsExportables = (d.roads || []).filter(function(r) { return r.type !== "itinerary"; });
    const roadCountByType = _trierParType(roadsExportables, ["principal", "secondaire", "chemin"]);
    const zoneCountByType = _trierParType(d.zones || [],    ["eau", "remblais", "effondrement", "inaccessible"]);
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

    const roadsTypesHtml =
      rowTypeSub("conv_roads_principal",  t("export.conv.roadsPrincipal"),  roadCountByType.principal.length,  true) +
      rowTypeSub("conv_roads_secondaire", t("export.conv.roadsSecondaire"), roadCountByType.secondaire.length, true) +
      rowTypeSub("conv_roads_chemin",     t("export.conv.roadsChemin"),     roadCountByType.chemin.length,     true);

    const zonesTypesHtml =
      rowTypeSub("conv_zones_eau",          t("export.conv.zonesEau"),          zoneCountByType.eau.length,          true) +
      rowTypeSub("conv_zones_remblais",     t("export.conv.zonesRemblais"),     zoneCountByType.remblais.length,     true) +
      rowTypeSub("conv_zones_effondrement", t("export.conv.zonesEffondrement"), zoneCountByType.effondrement.length, true) +
      rowTypeSub("conv_zones_inaccessible", t("export.conv.zonesInaccessible"), zoneCountByType.inaccessible.length, true);

    const structuresTypesHtml =
      rowTypeSub("conv_structures_pilier-1", t("export.conv.structPilier1"), structureCountByType["pilier-1"].length, true) +
      rowTypeSub("conv_structures_pilier-2", t("export.conv.structPilier2"), structureCountByType["pilier-2"].length, true) +
      rowTypeSub("conv_structures_mur",      t("export.conv.structMur"),     structureCountByType["mur"].length,      true) +
      rowTypeSub("conv_structures_front-1",  t("export.conv.structFront1"),  structureCountByType["front-1"].length,  true) +
      rowTypeSub("conv_structures_front-2",  t("export.conv.structFront2"),  structureCountByType["front-2"].length,  true);

    return `
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
        <p style="font-size:11.5px; color:var(--kta-texte-3); font-style:italic; margin:6px 0 0 26px; line-height:1.4;">
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
      // Compteur photos si ZIP data layer avec photos/
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

  // Écouteurs Conversion (post-DOM)
  function _attacherListenersConversion() {
    if (!_modal || _activeTab !== "conversion") return;

    _modal.querySelectorAll(".kta-conv-sens-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const dir = btn.dataset.convDir;
        if (dir && dir !== _convDirection) {
          _convDirection = dir;
          _renderTab();
        }
      });
    });

    if (_convDirection === "data2ed") {
      const dropZone  = document.getElementById("kta-conv-d2e-drop");
      const fileInput = document.getElementById("kta-conv-d2e-file");
      const erreurEl  = document.getElementById("kta-conv-d2e-erreur");

      if (dropZone && fileInput) {
        dropZone.addEventListener("click", function() { fileInput.click(); });
        dropZone.addEventListener("dragover",  function(e) { e.preventDefault(); dropZone.classList.add("dragover"); });
        dropZone.addEventListener("dragleave", function()  { dropZone.classList.remove("dragover"); });
        dropZone.addEventListener("drop", function(e) {
          e.preventDefault(); dropZone.classList.remove("dragover");
          const f = e.dataTransfer.files[0];
          const okExt = f && (/\.(json|zip)$/i).test(f.name);
          if (okExt) _chargerFichierData2Ed(f);
          else if (erreurEl) { erreurEl.textContent = t("export.err.fichierType"); erreurEl.style.display = "block"; }
        });
        fileInput.addEventListener("change", function() {
          if (fileInput.files[0]) _chargerFichierData2Ed(fileInput.files[0]);
        });
      }
      const dlBtn = document.getElementById("kta-ses-download");
      if (dlBtn) dlBtn.disabled = !_convUploadedJson;
      return; // pas de syncParent à brancher dans ce mode
    }

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

    syncParent("conv_roads", ["conv_roads_principal", "conv_roads_secondaire", "conv_roads_chemin"]);
    syncParent("conv_zones", ["conv_zones_eau",       "conv_zones_remblais",   "conv_zones_effondrement", "conv_zones_inaccessible"]);
    syncParent("conv_structures", ["conv_structures_pilier-1", "conv_structures_pilier-2", "conv_structures_mur", "conv_structures_front-1", "conv_structures_front-2"]);
  }

  // Charge un .json (un calque) ou un .zip (plusieurs .json + photos/) pour le sens data2ed, puis re-rend.
  function _chargerFichierData2Ed(file) {
    _convUploadedPhotos = null;  // reset pour éviter un état stale
    const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip"
                  || file.type === "application/x-zip-compressed";

    if (isZip) {
      _chargerZipData2Ed(file);
      return;
    }

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

  // ZIP data layer attendu : *.json à la racine (points, roads, zones, structure, ou un fichier par type en
  // granularité fine) + photos/_index.json et photos/<photoId>.<ext> facultatifs.
  function _chargerZipData2Ed(file) {
    if (typeof JSZip === "undefined") {
      _showConvErreur(t("export.err.jszipKo"));
      return;
    }
    JSZip.loadAsync(file).then(function(zip) {
      // Étape 1 : les *.json de la racine se cumulent dans _convUploadedJson.
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

        // Étape 2 : photos (si photos/_index.json)
        const indexFile = zip.file("photos/_index.json");
        if (!indexFile) {
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
                blob:    blob,
                fiche:   info.fiche || null,
                createdAt: info.createdAt,
                priseLe: info.priseLe
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

  const _origRenderTab = _renderTab;
  _renderTab = function() {
    _origRenderTab();
    setTimeout(_attacherListenersAdvanced, 0);
    setTimeout(_attacherListenersConversion, 0);
  };

  // ── Exécution de l'export ──────────────
  function _executerExport() {
    if (_activeTab === "full")              _exportFull();
    else if (_activeTab === "advanced")     _exportAdvanced();
    else if (_activeTab === "conversion")   _exportConversion();
    else if (_activeTab === "fusion")       _exportFusion();
    else if (_activeTab === "extern") {
      if (_externFormat === "gpx")          _exportGpxViaExtern();
      else if (_externFormat === "geojson") _exportGeojson();
      else                                  _exportKmz();
    }
  }

  // ── Photos : collecte pour les exports ──────────────
  // Promise<{ photos: [{id, blob, mime, pointId, size}], totalSize }> ; payload vide si le module est absent.
  // `pointIdsSet` (facultatif) : seulement les photos de ces points (exports filtrés) ; null = tout le plan.
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
          size:    rec.size || (rec.blob && rec.blob.size) || 0,
          fiche:   rec.fiche || null,   // cf _entreeIndexPhoto
          createdAt: rec.createdAt || null,
          priseLe: rec.priseLe || null
        };
      });
      return { photos: photos, totalSize: totalSize };
    }).catch(function(e) {
      console.warn("[SessionExport] _collecterPhotosPlan erreur :", e);
      return { photos: [], totalSize: 0 };
    });
  }

  function _extDepuisMime(mime) {
    if (!mime) return "jpg";
    if (mime.indexOf("png")  >= 0) return "png";
    if (mime.indexOf("webp") >= 0) return "webp";
    if (mime.indexOf("gif")  >= 0) return "gif";
    return "jpg";
  }

  function _formatBytes(n) {
    if (!n || n < 0) return "0 Ko";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " Ko";
    return (n / (1024 * 1024)).toFixed(1) + " Mo";
  }
  if (typeof window !== "undefined") window._kta_formatBytes = _formatBytes;

  // Entrée de photos/_index.json — UN SEUL format pour Complet, Avancé et Conversion. La fiche du point (nom,
  // position, niveau, type) voyage : une photo dont le point a disparu reste récupérable après réimport.
  // `createdAt` (ms, ajout sur l'appareil) et `priseLe` (EXIF de la prise de vue, photos.js) voyagent aussi : la
  // date reste À CÔTÉ du fichier, qui n'a plus d'EXIF. Champs facultatifs (les anciens ZIP se relisent).
  // 🔒 Jamais en export anonymisé : _stripperExifPhotos ne recopie ni la fiche ni les dates (une date situe un
  // passage), _anonymiserSession retire la fiche.
  function _entreeIndexPhoto(p, name) {
    const e = { pointId: p.pointId, mime: p.mime, size: p.size, file: name };
    if (p.fiche && typeof p.fiche === "object") e.fiche = p.fiche;
    if (Number.isFinite(p.createdAt) && p.createdAt > 0) e.createdAt = p.createdAt;
    if (typeof p.priseLe === "string" && p.priseLe) e.priseLe = p.priseLe;
    return e;
  }

  // Packe session + photos dans un ZIP → Promise<Blob> : /session.json, /photos/<photoId>.<ext>,
  // /photos/_index.json (photoId → pointId). L'index, redondant avec les points, garde le restore robuste si
  // session.json est édité à la main ; il est lu en priorité. `historePdfs` = TABLEAU de documents (zipName déjà
  // dédoublonné par _exportFull) ; un objet unique reste accepté.
  function _packerZipSession(payload, photos, filename, historePdfs) {
    if (typeof JSZip === "undefined") {
      window.ktaAlerte(t("export.err.compressionIndispo"), { type: "erreur" });
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
        idx[p.id] = _entreeIndexPhoto(p, name);
      });
      photosFolder.file("_index.json", JSON.stringify({
        version: 1,
        photos:  idx
      }, null, 2));
    }

    // PDF Mode Histoire → `mode-histoire/<name>` (référence déjà posée dans payload.historeSessionPdf).
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

  // 🔒 Strip EXIF de l'export anonymisé : chaque photo est RE-ENCODÉE (photos.js > compressBlob ne rend jamais
  // le blob original). FAIL-CLOSED : une photo non ré-encodable est EXCLUE, jamais livrée brute.
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

  // Pose sur chaque point `photos: [photoId, …]` (savoir qu'un point a N photos sans relire l'index).
  function _enrichirPointsAvecPhotos(points, photos) {
    if (!points || !photos || photos.length === 0) return points;
    const parPoint = {};
    photos.forEach(function(p) {
      const k = String(p.pointId);
      if (!parPoint[k]) parPoint[k] = [];
      parPoint[k].push(p.id);
    });
    return points.map(function(pt) {
      // photos rangées sous l'uid du point, puis sous son nom.
      const parUid = pt.uid ? (parPoint[String(pt.uid)] || []) : [];
      const parNom = parPoint[String(pt.id || "")] || [];
      const ids = parUid.concat(parNom.filter(function(id) { return parUid.indexOf(id) < 0; }));
      if (!ids || ids.length === 0) return pt;
      const clone = Object.assign({}, pt);
      clone.photos = ids;
      return clone;
    });
  }

  // ── Anonymisation pour partage public ──────────────
  // Noms POI / roads / zones / structures → codes séquentiels (tag + #N), notes vidées, tracker et profil
  // retirés : partager la structure sans exposer ses repérages.
  // Gardé : x, y, level, tags, type, niveaux / accroches d'un passage. Retiré : id, nom, label, description,
  // profondeur, date_update, tracker, user/author. Marqué : session.anonymized + anonymizedAt.
  // 🔒 `photos` (déjà strippées EXIF) : ids renommés `photo-anon-N`, pointId remappé vers le code anonymisé.
  function _anonymiserSession(session, photos) {
    // 1. editorPoints — séquence par tag. 🔒 idMap : id d'origine → code (remappage photos)
    const idMap = {};
    if (Array.isArray(session.editorPoints)) {
      const counterByTag = {};
      session.editorPoints = session.editorPoints.map(function(p) {
        const firstTag = (Array.isArray(p.tags) && p.tags.length) ? p.tags[0] : "";
        const key     = firstTag || "_notag";
        counterByTag[key] = (counterByTag[key] || 0) + 1;
        // Le TAG entre dans le code : un code commun à plusieurs tags donnerait des ids en double et des
        // photos rattachées au mauvais point.
        const code = "📍 POI " + (firstTag ? firstTag + " " : "") + "#" + counterByTag[key];
        if (p.id) idMap[String(p.id)] = code;
        if (p.uid) idMap[String(p.uid)] = code;   // photos rangées sous l'uid
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
        // Passage entre niveaux : géométrie du relevé (niveaux reliés, raccords), rien d'identifiant.
        if (Array.isArray(p.niveaux)) out.niveaux = p.niveaux.slice();
        if (Array.isArray(p.accroches)) out.accroches = p.accroches.map(function(a) {
          return { level: a.level, x: a.x, y: a.y };
        });
        return out;
      });
    }

    // 🔒 Photos (strippées EXIF en amont) : renommage zip-safe, remappage, listes `photos` rattachées.
    if (Array.isArray(photos) && photos.length > 0) {
      let n = 0;
      photos.forEach(function(p) {
        n++;
        p.id      = "photo-anon-" + n;
        p.pointId = idMap[String(p.pointId)] || "";
        delete p.fiche;   // 📸 nom réel + position du point : jamais dans un export anonymisé
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

    // 6. profil user / author (défensif)
    delete session.user;
    delete session.userProfile;
    delete session.author;

    // 7. compteurs photos : retirés seulement s'il n'y a pas de photo
    if (!Array.isArray(photos) || photos.length === 0) {
      delete session.photosCount;
      delete session.photosTotalKB;
    }

    // 🔒 Liaisons inter-plan : chaque côté porte les VRAIS noms du plan et du point. Retirées entièrement.
    delete session.interPlanLinks;
    // Traces de suppression : leurs uid relieraient le fichier à la session d'origine.
    delete session.tombstones;

    // Mode Histoire (note libre + PDF session)
    delete session.noteLibre;
    delete session.historeSessionPdf;
    delete session.historeSessionPdfs;   // (multi-documents)

    // 8. marqueur d'anonymisation
    session.anonymized   = true;
    session.anonymizedAt = new Date().toISOString();

    return session;
  }

  // ── Export Complet ──────────────
  // PDF Mode Histoire du plan (IDB `myktamap_histoire_pdfs`) → TABLEAU [{blob, name}] (vide si aucun).
  // 🩸 Ouvrir SANS version : un `open(name, 1)` sur la base v2 lève une VersionError et le PDF disparaît en
  // silence. Lecture par l'index `by_plan` (la clé est l'id du document) ; onupgradeneeded s'aligne sur le
  // schéma v2 pour ne pas léguer une base au mauvais schéma à modeHistoire.
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
            // Base encore en v1 (Mode Histoire pas rouvert) : pas d'index, la clé EST le planId.
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

  // Note libre Mode Histoire (localStorage `myktamap_note_libre_<planId>`) : chaîne, ou null si jamais sauvée.
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
    // Le test « session vide » compte aussi structures, mesures et Mode Histoire.
    const mesureLen     = (d.mesure        || []).length;
    const mesureSurfLen = (d.mesureSurface || []).length;
    const noteLibre = _lireNoteLibreSession();
    const hasNoteLibre = !!(noteLibre && noteLibre.length > 0);
    // 🩸 Une sortie tracker seule (on a marché, rien annoté) n'est pas « vide ».
    const trackerLen = (d.trackerTimeline || []).length;
    if (d.points.length === 0 && d.roads.length === 0 && d.zones.length === 0
        && (d.structures || []).length === 0 && mesureLen === 0 && mesureSurfLen === 0
        && trackerLen === 0 && !hasNoteLibre) {
      // Le PDF Histoire (async) n'est pas testé ici : une session qui n'aurait QUE lui paraît vide (cas marginal).
      _avertirRienAExporter(t("export.err.fullVide"));
      return;
    }

    const inclurePhotosCb = document.getElementById("full_photos");
    const inclurePhotos   = inclurePhotosCb ? inclurePhotosCb.checked : false;

    // Anonymisation pour partage public (substitution des labels sur le payload).
    const anonymizeCb = document.getElementById("full_anonymize");
    const anonymize   = !!(anonymizeCb && anonymizeCb.checked);

    // 🔒 L'anonymisation garde les photos : elles sont ré-encodées (strip EXIF/GPS) plus bas.
    const idsPhotos = _idsPhotosRetenues(d.points);
    const photosPromise = (inclurePhotos && !(idsPhotos && idsPhotos.size === 0))
      ? _collecterPhotosPlan(idsPhotos)
      : Promise.resolve({ photos: [], totalSize: 0 });

    // Mode Histoire (note + PDF) collecté en parallèle ; ignoré en anonymisé (contenu personnel).
    const histoirePromise = anonymize
      ? Promise.resolve({ note: null, pdfs: [] })
      : _lirePdfsHistoireSession().then(function(pdfs) {
          return { note: _lireNoteLibreSession(), pdfs: pdfs || [] };
        });

    Promise.all([photosPromise, histoirePromise]).then(function(results) {
      // 🔒 Anonymisé + photos : strip EXIF AVANT tout payload (fail-closed).
      const stripPromise = (anonymize && results[0].photos.length > 0)
        ? _stripperExifPhotos(results[0])
        : Promise.resolve(results[0]);
      return stripPromise.then(function(pack) { return [pack, results[1]]; });
    }).then(function(results) {
      const pack = results[0];
      const histoire = results[1];
      const photos = pack.photos;
      const editorPointsEnriched = _enrichirPointsAvecPhotos(d.points, photos);

      const session = {
        type: "devmap-session",
        version: "1.0",
        date_export: new Date().toISOString(),
        editorPoints: editorPointsEnriched,
        roads:        d.roads,
        zones:        d.zones,
        structures:   d.structures || [],
        measure:      { points: d.mesure || [] },
        measureSurface: { points: d.mesureSurface || [] },
        // Légende custom → session AUTOPORTANTE (types gardent libellé, couleur, icône même sur un ZIP vierge).
        customLegend: (window.LegendCustomization && window.LegendCustomization.getSessionState)
                        ? window.LegendCustomization.getSessionState() : null,
        // Liaisons inter-plan du plan courant, réinjectées au registre à l'import (fusion par id). Ids de plans
        // déterministes : la liaison reste valable sur un autre appareil qui a le même plan.
        interPlanLinks: (window.InterPlanLinks && window._currentLoadedPlanId)
                          ? window.InterPlanLinks.getLinksForPlan(window._currentLoadedPlanId) : [],
        // Traces de suppression : un réimport ne ressuscite pas un objet supprimé. Jamais en anonymisé.
        tombstones: window.KtaUid ? window.KtaUid.getTombstones() : []
      };
      // 🔒 Export limité à ses ajouts : ni les traces (suppressions de tout le monde), ni les liaisons du plan.
      if (_auteurImpose) {
        delete session.tombstones;
        delete session.interPlanLinks;
      }

      // Tracker : position (marker), path (polyline runtime), timeline datée [{x,y,t,deltaMs,type,level?}],
      // startTs. Champ absent si ni timeline ni path (rien tracké) : les anciens imports l'ignorent.
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
      // Récap photos : l'import sait combien attendre.
      if (photos.length > 0) {
        session.photosCount    = photos.length;
        session.photosTotalKB  = Math.round(pack.totalSize / 1024);
      }

      // Mode Histoire : `noteLibre` inline (texte) ; les PDF vont dans `mode-histoire/<name>` du ZIP (pas de
      // base64 dans le JSON). Restauration : interfaceImportExport.js > ouvrirImportSession.
      if (histoire.note && histoire.note.length > 0) {
        session.noteLibre = histoire.note;
      }
      // `historeSessionPdfs` = tableau ; `historeSessionPdf` = premier document, gardé pour les anciennes versions.
      // Noms dédoublonnés : deux homonymes s'écraseraient dans le ZIP.
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

      // Anonymisation APRÈS construction du payload (la logique d'inclusion reste la même).
      if (anonymize) {
        _anonymiserSession(session, photos);
      }

      const fnPrefix = anonymize ? "session-anon" : "session";

      // ZIP forcé si un PDF Histoire est présent (binaire) ; la note libre tient dans le JSON.
      const hasHistoirePdf = !!(histoire.pdfs && histoire.pdfs.length > 0);

      if (photos.length > 0 || hasHistoirePdf) {
        // ZIP : session.json + photos/ + mode-histoire/. 🔒 En anonymisé, photos re-encodées et renommées
        // photo-anon-N ; le PDF Histoire reste exclu (non nettoyable).
        _packerZipSession(session, photos, _filename(fnPrefix, "zip"), histoire.pdfs)
          .then(function() { _fermer(); })
          .catch(function(err) {
            console.error("[SessionExport] _packerZipSession :", err);
            window.ktaAlerte(t("export.err.zipCreation", { err: err.message || err }), { type: "erreur" });
          });
      } else {
        // Ni photo ni PDF → JSON pur ; la note libre reste inline.
        _telechargerJSON(session, _filename(fnPrefix));
        _fermer();
      }
    });
  }

  // ── Export Avancé ──────────────
  function _exportAdvanced() {
    const d = _compter();
    const incPoints = document.getElementById("adv_points")?.checked;
    const incTracker = document.getElementById("adv_tracker")?.checked;
    // Case absente de l'UI → structures incluses.
    const incStructuresCb = document.getElementById("adv_structures");
    const incStructures = incStructuresCb ? incStructuresCb.checked : true;

    const roadTypes = ["principal", "secondaire", "chemin"].filter(function(t) {
      return document.getElementById("adv_roads_" + t)?.checked;
    });
    const zoneTypes = ["eau", "remblais", "effondrement", "inaccessible"].filter(function(t) {
      return document.getElementById("adv_zones_" + t)?.checked;
    });
    const structureTypes = ["pilier-1", "pilier-2", "mur", "front-1", "front-2"].filter(function(t) {
      const cb = document.getElementById("adv_structures_" + t);
      return cb ? cb.checked : true;
    });

    // 🩸 Jonctions et types `cust-*` toujours gardés : `roadTypes` ne liste que principal/secondaire/chemin, le
    // filtre les retirerait en silence (jonction = pont du graphe pathfinder). Idem dans Conversion et KMZ.
    function _isCustom(t) { return typeof t === "string" && t.indexOf("cust-") === 0; }
    const filteredRoads = (d.roads || []).filter(function(r) {
      if (r.type === "jonction") return true;     // bypass jonction
      if (_isCustom(r.type))     return true;     // bypass customs
      return roadTypes.indexOf(r.type) >= 0;
    });
    const filteredZones = (d.zones || []).filter(function(z) {
      if (_isCustom(z.type))     return true;     // bypass customs
      return zoneTypes.indexOf(z.type) >= 0;
    });
    const filteredStructures = incStructures
      ? (d.structures || []).filter(function(s) {
          if (_isCustom(s.type)) return true;     // bypass customs
          return structureTypes.indexOf(s.type) >= 0;
        })
      : [];

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

    // Cases mesure : absentes de l'UI → incluses
    const incMesureCb = document.getElementById("adv_mesure");
    const incMesure = incMesureCb ? incMesureCb.checked : true;
    const mesurePts = incMesure ? (d.mesure || []) : [];
    // Surface : polygone valide à partir de 3 sommets.
    const incMesureSurfCb = document.getElementById("adv_mesure_surface");
    const incMesureSurf = incMesureSurfCb ? incMesureSurfCb.checked : true;
    const mesureSurfPts = (incMesureSurf && (d.mesureSurface || []).length >= 3) ? (d.mesureSurface || []) : [];

    const total = filteredPoints.length + filteredRoads.length + filteredZones.length
                + filteredStructures.length + mesurePts.length + mesureSurfPts.length + (tracker ? 1 : 0);
    if (total === 0) {
      _avertirRienAExporter(t("export.err.advVide"));
      return;
    }

    const fmt = document.querySelector('input[name="adv_format"]:checked')?.value || "single";

    // Photos des seuls points exportés (pack vide si aucun).
    const inclurePhotosCb = document.getElementById("adv_photos");
    const inclurePhotos   = inclurePhotosCb ? inclurePhotosCb.checked : false;

    const pointIdsSet = inclurePhotos && filteredPoints.length > 0
      ? _idsPhotosDe(filteredPoints)
      : null;
    const photosPromise = (inclurePhotos && pointIdsSet)
      ? _collecterPhotosPlan(pointIdsSet)
      : Promise.resolve({ photos: [], totalSize: 0 });

    photosPromise.then(function(pack) {
      const photos = pack.photos;
      // Pose les photoIds sur les points filtrés (clone via le helper).
      const enrichedPoints = _enrichirPointsAvecPhotos(filteredPoints, photos);

      if (fmt === "single") {
        const session = {
          type: "devmap-session",
          version: "1.0",
          date_export: new Date().toISOString()
        };
        if (enrichedPoints.length)     session.editorPoints = enrichedPoints;
        if (filteredRoads.length)      session.roads        = filteredRoads;
        if (filteredZones.length)      session.zones        = filteredZones;
        if (filteredStructures.length) session.structures   = filteredStructures;
        if (mesurePts.length)          session.measure        = { points: mesurePts };
        if (mesureSurfPts.length)      session.measureSurface = { points: mesureSurfPts };
        if (tracker)                   session.tracker        = tracker;
        if (window.LegendCustomization && window.LegendCustomization.getSessionState &&
            window.LegendCustomization.isSessionStateEmpty && !window.LegendCustomization.isSessionStateEmpty()) {
          session.customLegend = window.LegendCustomization.getSessionState();
        }
        if (window.InterPlanLinks && window._currentLoadedPlanId && !_auteurImpose) {
          const _ipl = window.InterPlanLinks.getLinksForPlan(window._currentLoadedPlanId);
          if (_ipl.length > 0) session.interPlanLinks = _ipl;
        }
        if (photos.length > 0) {
          session.photosCount   = photos.length;
          session.photosTotalKB = Math.round(pack.totalSize / 1024);
        }

        if (photos.length > 0) {
          _packerZipSession(session, photos, _filename("session", "zip"))
            .then(function() { _fermer(); })
            .catch(function(err) {
              console.error("[SessionExport] _packerZipSession Avancé :", err);
              window.ktaAlerte(t("export.err.zipCreation", { err: err.message || err }), { type: "erreur" });
            });
        } else {
          _telechargerJSON(session, _filename("session"));
          _fermer();
        }
      } else {
        // ZIP multi-fichiers : un fichier session par catégorie (+ photos/)
        _genererZipAdvanced(enrichedPoints, filteredRoads, filteredZones, filteredStructures, mesurePts, mesureSurfPts, tracker, photos);
      }
    });
  }

  function _genererZipAdvanced(points, roads, zones, structures, mesurePts, mesureSurfPts, tracker, photos) {
    if (typeof JSZip === "undefined") {
      window.ktaAlerte(t("export.err.compressionIndispo"), { type: "erreur" });
      return;
    }
    const zip = new JSZip();
    const now = new Date().toISOString();

    function file(name, payload) {
      const obj = Object.assign({ type: "devmap-session", version: "1.0", date_export: now }, payload);
      zip.file(name, JSON.stringify(obj, null, 2));
    }

    // Légende dans un fichier DÉDIÉ du ZIP multi-fichiers. ⚠️ Format en export SEUL (aucun importeur ne lit
    // `session_*.json` ; `_parseSessionZip` attend `session.json`) : sans elle, l'archive contient des types
    // `cust-…` sans leur définition. Fichier à part : elle survit à une session sans point.
    (function() {
      const LC = window.LegendCustomization;
      if (!LC || typeof LC.getSessionState !== "function") return;
      if (typeof LC.isSessionStateEmpty === "function" && LC.isSessionStateEmpty()) return;
      try { file("session_legend.json", { customLegend: LC.getSessionState() }); }
      catch(e) { console.warn("[SessionExport] légende non embarquée dans le ZIP :", e); }
    })();

    if (points.length)     file("session_points.json",     { editorPoints: points });
    if (roads.length)      file("session_roads.json",      { roads: roads });
    if (zones.length)      file("session_zones.json",      { zones: zones });
    if (structures.length) file("session_structures.json", { structures: structures });
    if (mesurePts && mesurePts.length) file("session_measure.json", { measure: { points: mesurePts } });
    if (mesureSurfPts && mesureSurfPts.length) file("session_measureSurface.json", { measureSurface: { points: mesureSurfPts } });
    if (tracker)           file("session_tracker.json",    { tracker: tracker });

    // photos/ + _index.json, même format que le ZIP Complet (remappage si un point a été renommé).
    if (photos && photos.length > 0) {
      const photosFolder = zip.folder("photos");
      const idx = {};
      photos.forEach(function(p) {
        const ext  = _extDepuisMime(p.mime);
        const name = p.id + "." + ext;
        photosFolder.file(name, p.blob);
        idx[p.id] = _entreeIndexPhoto(p, name);
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
      window.ktaAlerte(t("export.err.zipCreationGeneric"));
    });
  }

  // ── Conversion ──────────────
  function _exportConversion() {
    if (_convDirection === "data2ed") return _exportConvData2Session();
    return _exportConvSession2Data();
  }

  // Sens 1 : session courante → fichiers data layer
  function _exportConvSession2Data() {
    const d = _compter();
    const incPoints = document.getElementById("conv_points")?.checked;
    const incRoads  = document.getElementById("conv_roads")?.checked;
    const incZones  = document.getElementById("conv_zones")?.checked;
    const incStructuresCb = document.getElementById("conv_structures");
    const incStructures = incStructuresCb ? incStructuresCb.checked : true;
    const gran = document.querySelector('input[name="conv_gran"]:checked')?.value || "basic";

    let filteredPoints = [];
    if (incPoints) {
      const tagsList = _listerTagsPoints(d.points);
      const sel = _lireTagsCoches("conv_points_tag_", tagsList);
      filteredPoints = _filtrerPointsParTags(d.points, sel.tagsCoches, sel.untaggedCoche);
    }

    // Roads par type coché ; "itinerary" n'a rien à faire dans un data layer.
    const roadTypesActifs = {
      principal:  document.getElementById("conv_roads_principal")?.checked  ?? true,
      secondaire: document.getElementById("conv_roads_secondaire")?.checked ?? true,
      chemin:     document.getElementById("conv_roads_chemin")?.checked     ?? true
    };
    const filteredRoads = incRoads
      ? (d.roads || []).filter(function(r) {
          if (r.type === "itinerary") return false;
          // 🩸 Jonctions toujours gardées (ponts du graphe pathfinder, non filtrables par type).
          if (r.type === "jonction") return true;
          return roadTypesActifs[r.type] !== false;
        })
      : [];

    const zoneTypesActifs = {
      eau:          document.getElementById("conv_zones_eau")?.checked          ?? true,
      remblais:     document.getElementById("conv_zones_remblais")?.checked     ?? true,
      effondrement: document.getElementById("conv_zones_effondrement")?.checked ?? true,
      inaccessible: document.getElementById("conv_zones_inaccessible")?.checked ?? true
    };
    const filteredZones = incZones
      ? (d.zones || []).filter(function(z) { return zoneTypesActifs[z.type] !== false; })
      : [];

    // Structures par type : les 5 sous-types (fronts compris) doivent figurer dans ce dict, sinon
    // `undefined !== false` les inclut quoi qu'on coche.
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
      _avertirRienAExporter(t("export.err.convVide"));
      return;
    }

    // Photos des seuls points convertis (pack vide si aucun ou case décochée).
    const inclurePhotosCb = document.getElementById("conv_ed2data_photos");
    const inclurePhotos   = inclurePhotosCb ? inclurePhotosCb.checked : false;
    const pointIdsSet = inclurePhotos && filteredPoints.length > 0
      ? _idsPhotosDe(filteredPoints)
      : null;
    const photosPromise = (inclurePhotos && pointIdsSet)
      ? _collecterPhotosPlan(pointIdsSet)
      : Promise.resolve({ photos: [], totalSize: 0 });

    photosPromise.then(function(pack) {
      const photos = pack.photos;
      // photoIds sur les points : le réimport data→session reconnecte les photos par point.photos[].
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
      // 4e catégorie en granularité basique
      if (filteredStructures.length) {
        files.push({ name: "structure.json", payload: { data: [], structures: filteredStructures } });
      }
      _telechargerConversionFiles(files, photos);
    } else {
      // Granularité fine : par type
      const files = [];

      if (enrichedPoints.length) {
        // Points : un seul fichier (tags multiples → séparation ambiguë), enrichedPoints garde `photos`.
        files.push({ name: "points.json", payload: { data: enrichedPoints } });
      }

      if (filteredRoads.length) {
        // 🩸 "jonction" incluse en granularité fine, sinon _trierParType la range dans "_ignored" et elle se perd.
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

      // Structures en granularité fine : un fichier par sous-type, payload { data: [], structures: [...] }
      // (data layer valide, chargeable comme structure.json).
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
      window.ktaAlerte(t("export.err.convNoSource"));
      return;
    }
    const j = _convUploadedJson;
    const points = Array.isArray(j.data)         ? j.data
                 : Array.isArray(j.editorPoints) ? j.editorPoints
                 : [];
    const roads  = Array.isArray(j.roads) ? j.roads : [];
    const zones  = Array.isArray(j.zones) ? j.zones : [];
    // Anciens data layers sans `structures` → tableau vide.
    const structures = Array.isArray(j.structures) ? j.structures : [];

    if (points.length === 0 && roads.length === 0 && zones.length === 0
        && structures.length === 0) {
      _avertirRienAExporter(t("export.err.convSourceVide"));
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

    // Photos du ZIP d'entrée ré-emballées dans un ZIP session (format Complet) : l'import session les restaure.
    const hasPhotos = _convUploadedPhotos && _convUploadedPhotos.length > 0;
    const baseName = (_convUploadedName || "data").replace(/\.(json|zip)$/i, "");

    if (hasPhotos) {
      // Adapte _convUploadedPhotos au format de _collecterPhotosPlan attendu par _packerZipSession.
      const photosForPack = _convUploadedPhotos.map(function(p) {
        return {
          id:      p.id,
          blob:    p.blob,
          mime:    p.mime,
          pointId: p.pointId,
          size:    p.size,
          fiche:   p.fiche || null,
          createdAt: p.createdAt,
          priseLe: p.priseLe
        };
      });
      session.photosCount   = photosForPack.length;
      session.photosTotalKB = Math.round(photosForPack.reduce(function(s, p) {
        return s + (p.size || 0);
      }, 0) / 1024);

      _packerZipSession(session, photosForPack, baseName + "_session.zip")
        .then(function() { _fermer(); })
        .catch(function(err) {
          console.error("[SessionExport] Conv ZIP session sortie :", err);
          window.ktaAlerte(t("export.err.zipSessionCreation", { err: err.message || err }), { type: "erreur" });
        });
    } else {
      // Pas de photos → JSON pur (rétrocompat absolue)
      _telechargerJSON(session, baseName + "_session.json");
      _fermer();
    }
  }

  // `photos` (facultatif) : embarquées au format du ZIP session (photos/_index.json + blobs).
  // 🩸 La légende voyage avec le calque : sans la DÉFINITION des types `cust-…`, un plan régénéré affiche
  // tracés en blanc, zones en gris, structures en bleu, sans moyen de réparer depuis ≡ Légende. Seuls les types
  // que le fichier référence sont embarqués.
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
      const builtins = (typeof window.ktaStyleBuiltins === "function") ? window.ktaStyleBuiltins(cat) : [];
      parCat[cat].forEach(function(tp) {
        // Tout type NON built-in est candidat (pas seulement `cust-`) : une entrée liée à un type brut doit
        // voyager aussi, sinon l'aller-retour la perd.
        if (builtins.indexOf(tp) === -1) idsUtilises.add(tp);
      });
    });

    // Les entrées CUSTOM référencées, avec leur définition complète.
    const customEntries = (etat.customEntries || []).filter(function(e) {
      return e && idsUtilises.has(e.id);
    });

    // Personnalisations des types BUILT-IN présents (libellé, couleur, masquage).
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
    const labels  = _sousEnsemble(etat.labels);
    const hidden  = _sousEnsemble(etat.hidden);
    const colors  = _sousEnsemble(etat.colors);
    const borders = _sousEnsemble(etat.borders);

    if (!customEntries.length && !Object.keys(labels).length &&
        !Object.keys(hidden).length && !Object.keys(colors).length &&
        !Object.keys(borders).length) return null;

    return {
      schemaVersion: etat.schemaVersion,
      labels: labels, hidden: hidden, colors: colors, borders: borders,
      customEntries: customEntries
    };
  }

  // Légende exportée en KMZ / GPX = celle qu'on voit : session ET plan, la SESSION prime (même cascade que
  // l'affichage). 🩸 Les types créés sur le terrain vivent dans la session (l'éditeur ≡ Légende n'écrit que là) :
  // lire `PLAN_CONFIG.customLegend` seul grise la case pour tout le monde.
  // Libellé de case avec pastille RÉSOLUE (comme exporter.js > _lp : l'émoji des libellés i18n est figé).
  function _lp(cat, key, label) {
    return (typeof window.ktaLabelAvecPastille === "function")
             ? window.ktaLabelAvecPastille(cat, key, label) : label;
  }

  function _legendeCompleteAExporter() {
    const plan = (window.PLAN_CONFIG && window.PLAN_CONFIG.customLegend) || null;
    const LC = window.LegendCustomization;
    let sess = null;
    if (LC && typeof LC.getSessionState === "function") {
      try { sess = LC.getSessionState(); } catch(e) { sess = null; }
    }
    if (!plan && !sess) return null;

    const out = { labels: {}, hidden: {}, colors: {}, borders: {}, customEntries: [] };
    function _fusionner(src) {
      if (!src || typeof src !== "object") return;
      ["labels", "hidden", "colors", "borders"].forEach(function(champ) {
        const m = src[champ];
        if (!m || typeof m !== "object" || Array.isArray(m)) return;
        Object.keys(m).forEach(function(k) { out[champ][k] = m[k]; });
      });
      const ids = new Set(out.customEntries.map(function(e) { return e && e.id; }));
      (Array.isArray(src.customEntries) ? src.customEntries : []).forEach(function(e) {
        if (!e || !e.id || ids.has(e.id)) return;
        ids.add(e.id);
        out.customEntries.push(e);
      });
    }
    _fusionner(plan);
    _fusionner(sess);   // en second : la session écrase le plan, comme à l'écran

    if (!Object.keys(out.labels).length && !Object.keys(out.hidden).length &&
        !Object.keys(out.colors).length && !out.customEntries.length) return null;
    return out;
  }

  function _telechargerConversionFiles(files, photos) {
    if (files.length === 0) {
      _avertirRienAExporter(t("export.err.convRien"));
      return;
    }
    const now = new Date().toISOString();
    const hasPhotos = Array.isArray(photos) && photos.length > 0;

    // Wrap devmap-data + légende embarquée, par FICHIER : un data layer reste exploitable sorti du ZIP.
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

    // 1 seul fichier sans photo → JSON direct
    if (files.length === 1 && !hasPhotos) {
      _telechargerJSON(files[0].payload, files[0].name);
      _fermer();
      return;
    }

    if (typeof JSZip === "undefined") {
      window.ktaAlerte(t("export.err.compressionIndispo"), { type: "erreur" });
      return;
    }
    const zip = new JSZip();
    files.forEach(function(f) {
      zip.file(f.name, JSON.stringify(f.payload, null, 2));
    });

    // photos/ + _index.json, même format que le ZIP session.
    if (hasPhotos) {
      const photosFolder = zip.folder("photos");
      const idx = {};
      photos.forEach(function(p) {
        const ext  = _extDepuisMime(p.mime);
        const name = p.id + "." + ext;
        photosFolder.file(name, p.blob);
        idx[p.id] = _entreeIndexPhoto(p, name);
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
      window.ktaAlerte(t("export.err.zipCreationGeneric"));
    });
  }

  // ── Fusion de calques ──────────────
  // N fichiers data layer (.json / .zip) concaténés par catégorie, un fichier par type en sortie
  // (_telechargerConversionFiles). Merge PUR, sans DOM ; ids POI en double = alerte seulement.
  function _mergeDatalayerObjects(jsons) {
    // Fusion PAR UID (KtaUid.fusionnerCalques, partagée avec le Générateur) : un objet présent dans plusieurs
    // fichiers n'est pas dupliqué, le plus récent gagne, une suppression postérieure l'emporte. Repli : concaténation.
    if (window.KtaUid && typeof window.KtaUid.fusionnerCalques === "function") {
      const f = window.KtaUid.fusionnerCalques(jsons);
      const mergedU = { data: f.data, roads: f.roads, zones: f.zones, structures: f.structures,
                        fusionnes: f.fusionnes, supprimes: f.supprimes };
      const seenU = Object.create(null), dupU = [];
      mergedU.data.forEach(function(p) {
        const id = (p && p.id != null) ? String(p.id) : null;
        if (id == null) return;
        if (seenU[id]) { if (dupU.indexOf(id) < 0) dupU.push(id); } else seenU[id] = true;
      });
      mergedU.dupIds = dupU;   // même NOM, uid différents : deux objets réels, alerte seulement
      return mergedU;
    }
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
    // Ids POI en double (alerte ; concaténation conservée)
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

    const dlBtn = document.getElementById("kta-ses-download");
    if (dlBtn) dlBtn.disabled = !_fusionMerged;
  }

  // Export : un fichier data layer par catégorie non vide → ZIP (format du sens session→data layer).
  function _exportFusion() {
    const m = _fusionMerged;
    if (!m || (!m.data.length && !m.roads.length && !m.zones.length && !m.structures.length)) {
      _avertirRienAExporter(t("export.fusion.errVide"));
      return;
    }
    const files = [];
    if (m.data.length)       files.push({ name: "points.json",    payload: { data: m.data } });
    if (m.roads.length)      files.push({ name: "roads.json",     payload: { data: [], roads: m.roads } });
    if (m.zones.length)      files.push({ name: "zones.json",     payload: { data: [], zones: m.zones } });
    if (m.structures.length) files.push({ name: "structure.json", payload: { data: [], structures: m.structures } });
    _telechargerConversionFiles(files, []);
  }

  // ── Utilitaires ──────────────
  function _escapeHtml(s) { return window.ktaEsc(s); }

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

  function _detacherEchap() {
    if (_onEchap) document.removeEventListener("keydown", _onEchap);
    _onEchap = null;
  }

  function _fermer() {
    if (_modal) _modal.remove();
    _modal = null;
    _detacherEchap();
    _convUploadedJson = null;
    _convUploadedName = "";
    _convUploadedPhotos = null;
    _fusionInputs = [];
    _fusionMerged = null;
    // Sortie du mode clic carte KMZ s'il est actif
    if (_kmzClickActive) _kmzDesactiverModeClic();
  }

  // ── Export externe KMZ / GPX ──────────────
  // Calibrage 2 points (plan + GPS) → transformation affine 2D. Moteur : js/kmzExport.js.

  // Mode clic carte : _kmzClickTarget = "A" | "B" | null (point en cours de saisie)
  let _kmzClickActive = false;
  let _kmzClickHandler = null;
  let _kmzClickTarget = null;

  function _kmzCurrentPlanId() {
    return window._currentLoadedPlanId || "default";
  }

  function _kmzSlugTag(tag) {
    return String(tag).replace(/[^a-z0-9_-]/gi, "_");
  }

  // Tags présents → [{tag, count, isUntagged}] trié, "__untagged__" en queue
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
    const list = Object.keys(counts).sort(function(a, b) { return a.localeCompare(b); }).map(function(t) {
      return { tag: t, count: counts[t], isUntagged: false };
    });
    if (untagged > 0) list.push({ tag: "__untagged__", count: untagged, isUntagged: true });
    return list;
  }

  // Icône d'un tag : _kta_iconUrl (divIcon) avant options.iconUrl
  function _kmzIconePourTag(tag) {
    if (!window._iconMap || !window._iconMap[tag]) return null;
    const ic = window._iconMap[tag];
    return ic._kta_iconUrl || (ic.options && ic.options.iconUrl) || null;
  }

  // Statistiques KMZ (session + calques embarqués) pour les sous-cases ; mêmes getters que _exportKmz.
  function _kmzCollecterStats() {
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

    const sessionRoads = (window.getRoads ? window.getRoads() : []) || [];
    const embeddedRoads = (typeof window.getAllEmbeddedRoads === "function")
      ? window.getAllEmbeddedRoads() : [];
    const allRoads = sessionRoads.concat(embeddedRoads);
    const roadsByType = {
      principal:  allRoads.filter(function(r) { return r.type === "principal";  }).length,
      secondaire: allRoads.filter(function(r) { return r.type === "secondaire"; }).length,
      chemin:     allRoads.filter(function(r) { return r.type === "chemin";     }).length,
      jonction:   allRoads.filter(function(r) { return r.type === "jonction";   }).length,
      itinerary:  allRoads.filter(function(r) { return r.type === "itinerary";  }).length,
      autres:     _kmzNbAutres(allRoads, ["principal", "secondaire", "chemin", "jonction", "itinerary"])
    };

    const sessionZones = (window.getZones ? window.getZones() : []) || [];
    const embeddedZones = (typeof window.getAllEmbeddedZones === "function")
      ? window.getAllEmbeddedZones() : [];
    const allZones = sessionZones.concat(embeddedZones);
    const zonesByType = {
      eau:          allZones.filter(function(z) { return z.type === "eau";          }).length,
      remblais:     allZones.filter(function(z) { return z.type === "remblais";     }).length,
      effondrement: allZones.filter(function(z) { return z.type === "effondrement"; }).length,
      inaccessible: allZones.filter(function(z) { return z.type === "inaccessible"; }).length,
      autres:       _kmzNbAutres(allZones, ["eau", "remblais", "effondrement", "inaccessible"])
    };

    const sessionStructures = (window.getStructures ? window.getStructures() : []) || [];
    const embeddedStructures = (typeof window.getAllEmbeddedStructures === "function")
      ? window.getAllEmbeddedStructures() : [];
    const allStructures = sessionStructures.concat(embeddedStructures);
    const structuresByType = {
      "pilier-1": allStructures.filter(function(s) { return s.type === "pilier-1"; }).length,
      "pilier-2": allStructures.filter(function(s) { return s.type === "pilier-2"; }).length,
      "mur":      allStructures.filter(function(s) { return s.type === "mur";      }).length,
      "front-1":  allStructures.filter(function(s) { return s.type === "front-1";  }).length,
      "front-2":  allStructures.filter(function(s) { return s.type === "front-2";  }).length,
      autres:     _kmzNbAutres(allStructures, ["pilier-1", "pilier-2", "mur", "front-1", "front-2"])
    };

    return {
      pointsTotal:     allPts.length,
      tagsList:        tagsList,
      roadsByType:     roadsByType,
      zonesByType:     zonesByType,
      structuresByType: structuresByType
    };
  }

  // Objets d'un type hors intégrés (`cust-…` ou id brut d'un calque, « Bas ») : sans sous-case, ils partent avec
  // leur famille (cf _exportKmzInterne > _ajouterTypesHorsIntegres) et comptent donc dans son total.
  function _kmzNbAutres(items, integres) {
    return (items || []).filter(function(it) {
      return it && typeof it.type === "string" && it.type && integres.indexOf(it.type) === -1;
    }).length;
  }

  // Parent ↔ enfants : le parent coche/décoche tous les enfants, un enfant coché coche le parent.
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

  // ── Rendu du calibrage commun KMZ / GPX (saisi une seule fois) ──────────────
  function _renderCalibrageCommun() {
    const planId = _kmzCurrentPlanId();
    const saved  = (window.KmzExport && window.KmzExport.getCalibration)
                    ? window.KmzExport.getCalibration(planId) : null;
    const pA     = (saved && saved.pointA) || { x: "", y: "", lat: "", lng: "" };
    const pB     = (saved && saved.pointB) || { x: "", y: "", lat: "", lng: "" };

    // Champ combiné « lat, lng » ; une calibration ancienne (lat/lng séparés) est recomposée pour l'affichage.
    // Le stockage (KmzExport.setCalibration) reste à plat {x, y, lat, lng}.
    const _fmtCoords = (typeof window.formatGpsCoords === "function")
                        ? window.formatGpsCoords
                        : function(a, b) { return (Number.isFinite(a) && Number.isFinite(b)) ? (a + ", " + b) : ""; };
    const pAcoords = _fmtCoords(pA.lat, pA.lng);
    const pBcoords = _fmtCoords(pB.lat, pB.lng);

    return '' +
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

      '<div class="kta-kmz-section">' +
        '<div class="kta-kmz-section-titre">' + t("export.calib.apercuTitre") + '</div>' +
        '<div id="kmz_apercu" class="kta-kmz-apercu">' +
          '<em style="color:var(--kta-texte-3);">' + t("export.calib.apercuPrompt") + '</em>' +
        '</div>' +
      '</div>';
  }

  // ── Rendu des options KMZ (contenu + niveaux) ──────────────
  function _renderOptsKmz() {
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const niveauxBloc = mlOn
      ? '<div class="kta-kmz-section">' +
          '<div class="kta-kmz-section-titre">' + t("export.kmz.niveauxTitre") + '</div>' +
          '<div id="kta-kmz-levels-chips" class="kta-kmz-chips"></div>' +
        '</div>'
      : '';
    return _kmzRenderContenu(mlOn) + niveauxBloc;
  }

  // ── Rendu de l'onglet Export externe : calibrage commun puis sélecteur de format ──────────────
  function _renderExtern() {
    const fmt = (_FORMATS_EXTERNES.indexOf(_externFormat) >= 0) ? _externFormat : "kmz";
    const introFmt = _descFormat(fmt);

    return '' +
      ((typeof window.renderBannerCoherenceEchelle === "function")
        ? window.renderBannerCoherenceEchelle(_kmzCurrentPlanId(), { context: "export" })
        : "") +

      _renderCalibrageCommun() +

      // Sélecteur de format (absent quand la tuile du lanceur l'a déjà choisi)
      '<div class="kta-kmz-section"' + (_formatImpose ? ' style="display:none;"' : '') + '>' +
        '<div class="kta-kmz-section-titre">' + t("export.extern.outputTitle") + '</div>' +
        '<div class="kta-ses-format-pills" role="tablist">' +
          '<button type="button" class="kta-ses-fmt-pill ' + (fmt === "kmz" ? "active" : "") + '" data-fmt="kmz" role="tab" aria-selected="' + (fmt === "kmz") + '">🌍 KMZ</button>' +
          '<button type="button" class="kta-ses-fmt-pill ' + (fmt === "gpx" ? "active" : "") + '" data-fmt="gpx" role="tab" aria-selected="' + (fmt === "gpx") + '">📤 GPX</button>' +
          '<button type="button" class="kta-ses-fmt-pill ' + (fmt === "geojson" ? "active" : "") + '" data-fmt="geojson" role="tab" aria-selected="' + (fmt === "geojson") + '">🧭 GeoJSON</button>' +
        '</div>' +
      '</div>' +
      '<p class="kta-ses-fmt-desc" id="kta-extern-fmt-desc">' + introFmt + '</p>' +

      // GeoJSON : MÊMES cases que le KMZ (familles, types, niveaux), sans l'image ni la légende (data-kmz-seul).
      '<div id="kta-extern-opts-kmz" class="kta-extern-opts" data-fmt="' + fmt + '"' +
        ((fmt === "kmz" || fmt === "geojson") ? '' : ' style="display:none;"') + '>' +
        _renderOptsKmz() +
      '</div>' +
      '<div id="kta-extern-opts-geojson" class="kta-extern-opts"' + (fmt === "geojson" ? '' : ' style="display:none;"') + '>' +
        _renderOptsGeojson() +
      '</div>' +

      '<div id="kta-extern-opts-gpx" class="kta-extern-opts"' + (fmt === "gpx" ? '' : ' style="display:none;"') + '>' +
        _renderOptsGpx() +
      '</div>';
  }

  function _descFormat(fmt) {
    return t(fmt === "gpx" ? "export.extern.descGpx"
           : fmt === "geojson" ? "export.extern.descGeojson" : "export.extern.descKmz");
  }

  // ── Options GeoJSON : la projection (les cases de contenu sont celles du KMZ) ──────────────
  function _renderOptsGeojson() {
    return '<div class="kta-kmz-section">' +
        '<div class="kta-kmz-section-titre">' + t("export.geojson.projTitre") + '</div>' +
        '<label class="kta-ses-cb-row"><input type="radio" name="geojson_proj" value="2154">' +
          '<span>' + t("export.geojson.projL93") + '</span></label>' +
        '<label class="kta-ses-cb-row"><input type="radio" name="geojson_proj" value="4326" checked>' +
          '<span>' + t("export.geojson.projWgs84") + '</span></label>' +
        '<p class="kta-ses-fmt-desc" style="margin-top:6px;">' + t("export.geojson.projAide") + '</p>' +
      '</div>';
  }

  // ── Sélecteur de format (pills KMZ / GPX / GeoJSON) ──────────────
  function _bindExternFmtHandlers() {
    if (!_modal) return;
    const pills = _modal.querySelectorAll(".kta-ses-fmt-pill");
    pills.forEach(function(p) {
      p.addEventListener("click", function() {
        const f = p.dataset.fmt;
        if (_FORMATS_EXTERNES.indexOf(f) < 0) return;
        _externFormat = f;
        try { localStorage.setItem(_EXTERN_FMT_KEY, f); } catch(e) {}
        pills.forEach(function(pp) {
          const on = pp.dataset.fmt === f;
          pp.classList.toggle("active", on);
          pp.setAttribute("aria-selected", on ? "true" : "false");
        });
        const optsKmz = document.getElementById("kta-extern-opts-kmz");
        const optsGpx = document.getElementById("kta-extern-opts-gpx");
        const optsGeo = document.getElementById("kta-extern-opts-geojson");
        if (optsKmz) {
          optsKmz.style.display = (f === "kmz" || f === "geojson") ? "" : "none";
          optsKmz.setAttribute("data-fmt", f);
        }
        if (optsGpx) optsGpx.style.display = (f === "gpx") ? "" : "none";
        if (optsGeo) optsGeo.style.display = (f === "geojson") ? "" : "none";
        const desc = document.getElementById("kta-extern-fmt-desc");
        if (desc) desc.innerHTML = _descFormat(f);
      });
    });
  }

  // ── Section Contenu (sous-cases par tag / type) ──────────────
  function _kmzRenderContenu(mlOn) {
    const stats = _kmzCollecterStats();

    // Ligne parent ou case simple. count = null : pas de compteur, toujours active ; count = 0 : grisée et
    // désactivée ; count > 0 : normale.
    function row(id, label, count, checked) {
      const hasCount = (count !== null && count !== undefined);
      const isZero   = hasCount && count === 0;
      const disabled = isZero ? "disabled" : "";
      const dim      = isZero ? "opacity:0.5;" : "";
      const isChecked= (checked && !isZero) ? "checked" : "";
      const cnt      = hasCount ? ' <span style="color:var(--kta-texte-3);">(' + count + ')</span>' : '';
      return '<label class="kta-ses-cb-row" style="' + dim + '">' +
               '<input type="checkbox" id="' + id + '" ' + isChecked + ' ' + disabled + '>' +
               '<span>' + label + cnt + '</span>' +
             '</label>';
    }

    function rowSub(id, label, count, checked) {
      const disabled = count === 0 ? "disabled" : "";
      const dim      = count === 0 ? "opacity:0.5;" : "";
      const isChecked= (count > 0 && checked) ? "checked" : "";
      return '<label class="kta-ses-cb-row" style="' + dim + 'margin-left:24px;font-size:12px;padding:3px 4px;">' +
               '<input type="checkbox" id="' + id + '" ' + isChecked + ' ' + disabled + '>' +
               '<span>' + label + ' <span style="color:var(--kta-texte-3);">(' + count + ')</span></span>' +
             '</label>';
    }

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
                 '<span>' + iconHtml + label + ' <span style="color:var(--kta-texte-3);">(' + item.count + ')</span></span>' +
               '</label>';
      }).join("");
    }

    const rByT = stats.roadsByType;
    const zByT = stats.zonesByType;
    const sByT = stats.structuresByType || { "pilier-1": 0, "pilier-2": 0, "mur": 0, "front-1": 0, "front-2": 0 };
    // 🩸 Les types hors intégrés comptent : un plan dont les structures sont toutes personnalisées aurait un
    // total à 0, donc une case grisée, et ses structures ne partiraient pas.
    const roadsTotal = rByT.principal + rByT.secondaire + rByT.chemin + (rByT.autres || 0);
    const zonesTotal = zByT.eau + zByT.remblais + zByT.effondrement + zByT.inaccessible + (zByT.autres || 0);
    const structuresTotal = sByT["pilier-1"] + sByT["pilier-2"] + sByT["mur"]
                          + (sByT["front-1"] || 0) + (sByT["front-2"] || 0) + (sByT.autres || 0);

    return '<div class="kta-kmz-section">' +
        '<div class="kta-kmz-section-titre">' + t("export.kmz.contentTitle") + '</div>' +

        '<div data-kmz-seul="1">' +
        row("kmz_inc_image", t("export.kmz.image"), null, true) +
        '<div class="kta-kmz-opacity-row" id="kmz_opacity_wrap" style="margin-left:24px;">' +
          '<label for="kmz_img_opacity" class="kta-kmz-opacity-lbl">' + t("export.kmz.opacite") + '</label>' +
          '<input type="range" id="kmz_img_opacity" min="0" max="100" step="5" value="60" class="kta-kmz-opacity-slider">' +
          '<span id="kmz_img_opacity_val" class="kta-kmz-opacity-val">60%</span>' +
        '</div>' +
        // Plan tuilé : une MOSAÏQUE de quelques grandes images (≤ 4 096 px) au lieu des tuiles — Google Earth sur
        // iPhone n'affiche pas les tuiles d'un grand plan. Cochée par défaut, netteté au choix.
        (_tilingManifest() && _tilingManifest().version === 2
          ? '<div id="kmz_img_unique_wrap" style="margin-left:24px;font-size:12px;padding:3px 4px;">' +
              '<label class="kta-ses-cb-row" style="padding:0;">' +
                '<input type="checkbox" id="kmz_img_unique" checked>' +
                '<span>' + t("export.kmz.imageUnique") + ' <span style="color:var(--kta-texte-3);">' + t("export.kmz.imageUniqueAide") + '</span></span>' +
              '</label>' +
              '<label class="kta-kmz-nettete">' + '<span class="kta-kmz-opacity-lbl">' + t("export.kmz.nettete") + '</span>' +
                '<select id="kmz_img_nettete">' +
                  '<option value="4096">' + t("export.kmz.nettete1") + '</option>' +
                  '<option value="8192" selected>' + t("export.kmz.nettete4") + '</option>' +
                  '<option value="16384">' + t("export.kmz.nettete16") + '</option>' +
                '</select>' +
              '</label>' +
            '</div>'
          : '') +
        '</div>' +

        row("kmz_inc_points", t("export.kmz.points"), stats.pointsTotal, true) +
        pointsTagsHtml +

        row("kmz_inc_roads", t("export.kmz.roads"), roadsTotal, true) +
        rowSub("kmz_inc_roads_principal",  _lp("traces", "principal", t("export.kmz.roadsPrincipal")),  rByT.principal,  true) +
        rowSub("kmz_inc_roads_secondaire", _lp("traces", "secondaire", t("export.kmz.roadsSecondaire")), rByT.secondaire, true) +
        rowSub("kmz_inc_roads_chemin",     _lp("traces", "chemin", t("export.kmz.roadsChemin")),     rByT.chemin,     true) +

        row("kmz_inc_zones", t("export.kmz.zones"), zonesTotal, true) +
        rowSub("kmz_inc_zones_eau",          _lp("zones", "eau", t("export.kmz.zonesEau")),          zByT.eau,          true) +
        rowSub("kmz_inc_zones_remblais",     _lp("zones", "remblais", t("export.kmz.zonesRemblais")),     zByT.remblais,     true) +
        rowSub("kmz_inc_zones_effondrement", _lp("zones", "effondrement", t("export.kmz.zonesEffondrement")), zByT.effondrement, true) +
        rowSub("kmz_inc_zones_inaccessible", _lp("zones", "inaccessible", t("export.kmz.zonesInaccessible")), zByT.inaccessible, true) +

        // Structures + 5 sous-types
        row("kmz_inc_structures", t("export.kmz.structures"), structuresTotal, true) +
        rowSub("kmz_inc_structures_pilier-1", _lp("structures", "pilier-1", t("export.kmz.structPilier1")), sByT["pilier-1"], true) +
        rowSub("kmz_inc_structures_pilier-2", _lp("structures", "pilier-2", t("export.kmz.structPilier2")), sByT["pilier-2"], true) +
        rowSub("kmz_inc_structures_mur",      _lp("structures", "mur", t("export.kmz.structMur")),     sByT["mur"],      true) +
        rowSub("kmz_inc_structures_front-1",  _lp("structures", "front-1", t("export.kmz.structFront1")),  sByT["front-1"] || 0, true) +
        rowSub("kmz_inc_structures_front-2",  _lp("structures", "front-2", t("export.kmz.structFront2")),  sByT["front-2"] || 0, true) +

        (mlOn ? row("kmz_inc_jonctions", t("export.kmz.jonctions"), rByT.jonction, rByT.jonction > 0) : '') +

        row("kmz_inc_iti", t("export.kmz.itineraire"), rByT.itinerary, rByT.itinerary > 0) +

        // Légende (aller-retour MyKTAMap ↔ MyKTAMap) : cochée si une légende existe, sinon grisée à 0.
        (function() {
          // Plan ET session (cf. _legendeCompleteAExporter) : les types créés depuis ≡ Légende vivent dans la session.
          const hasCustomLegend = !!_legendeCompleteAExporter();
          return '<div data-kmz-seul="1">' + row("kmz_inc_legend",
                     t("export.kmz.legend"),
                     hasCustomLegend ? 1 : 0,
                     hasCustomLegend) + '</div>';
        })() +
      '</div>';
  }

  // ── Écouteurs ──────────────
  function _bindKmzHandlers() {
    // Validation + aperçu des coins à chaque changement (champ combiné « coords » compris)
    ["x", "y", "coords"].forEach(function(field) {
      ["A", "B"].forEach(function(letter) {
        const el = document.getElementById("kmz_" + letter + "_" + field);
        if (el) el.addEventListener("input", _kmzRafraichirApercu);
      });
    });

    // Validation live des champs GPS combinés (bordure rouge + message). Idempotent.
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

    // Bouton « Copier » de la bannière de cohérence d'échelle
    if (typeof window.attacherBoutonCopierEchelleGps === "function") {
      // La bannière vit dans le contenu de l'onglet (pas dans la modale).
      const zone = document.getElementById("kta-ses-content") || document;
      window.attacherBoutonCopierEchelleGps(zone);
    }

    ["A", "B"].forEach(function(letter) {
      const btn = document.getElementById("kmz_" + letter + "_search");
      if (btn) btn.addEventListener("click", function() { _kmzOuvrirRecherche(letter); });
    });

    ["A", "B"].forEach(function(letter) {
      const btn = document.getElementById("kmz_" + letter + "_click");
      if (btn) btn.addEventListener("click", function() { _kmzActiverModeClic(letter); });
    });

    // Opacité : % en direct, grisé si l'image est décochée
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
      const uniWrap = document.getElementById("kmz_img_unique_wrap");
      const _majOpState = function() {
        if (cbImg.checked) opWrap.classList.remove("disabled");
        else               opWrap.classList.add("disabled");
        if (uniWrap) uniWrap.style.opacity = cbImg.checked ? "" : "0.4";
        const uniCb = document.getElementById("kmz_img_unique"), net = document.getElementById("kmz_img_nettete");
        if (uniCb && net) net.disabled = !uniCb.checked;
      };
      const uniCbE = document.getElementById("kmz_img_unique");
      if (uniCbE) uniCbE.addEventListener("change", _majOpState);
      cbImg.addEventListener("change", _majOpState);
      _majOpState();
    }

    // Parent ↔ enfants, différé : les enfants sont dans le même HTML.
    setTimeout(function() {
      _kmzSyncParent("kmz_inc_roads", ["kmz_inc_roads_principal", "kmz_inc_roads_secondaire", "kmz_inc_roads_chemin"]);
      _kmzSyncParent("kmz_inc_zones", ["kmz_inc_zones_eau", "kmz_inc_zones_remblais", "kmz_inc_zones_effondrement", "kmz_inc_zones_inaccessible"]);
      _kmzSyncParent("kmz_inc_structures", ["kmz_inc_structures_pilier-1", "kmz_inc_structures_pilier-2", "kmz_inc_structures_mur", "kmz_inc_structures_front-1", "kmz_inc_structures_front-2"]);
      // Points : IDs kmz_inc_points_tag_<slug>
      const tagCheckboxes = document.querySelectorAll('[id^="kmz_inc_points_tag_"]');
      const tagIds = Array.from(tagCheckboxes).map(function(cb) { return cb.id; });
      if (tagIds.length > 0) _kmzSyncParent("kmz_inc_points", tagIds);
    }, 0);

    _kmzRafraichirApercu();

    _kmzRafraichirChipsNiveaux();
  }

  function _kmzLireCalib() {
    const get = function(id) {
      const v = document.getElementById(id);
      if (!v) return null;
      const n = parseFloat(v.value);
      return Number.isFinite(n) ? n : null;
    };
    // Lit le champ combiné « lat, lng » ; format invalide → {lat:null, lng:null} (feedback par l'aperçu).
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
    // 🩸 Cette modale n'édite que A/B : le pointC stocké (Réglages, Générateur) est PRÉSERVÉ, sinon chaque
    // enregistrement écraserait l'affine 3 points. Le modèle aussi : même calage historique → gardé tel quel,
    // tout autre calage → "local" (KmzExport.modeleSaisie).
    try {
      const saved = (window.KmzExport && window.KmzExport.getCalibration)
                     ? window.KmzExport.getCalibration(_kmzCurrentPlanId()) : null;
      if (saved && saved.pointC) calib.pointC = saved.pointC;
      const mod = (typeof window.KmzExport.modeleSaisie === "function")
        ? window.KmzExport.modeleSaisie(saved, calib) : null;
      if (mod) calib.modele = mod;
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
      target.innerHTML = '<em style="color:var(--kta-texte-3);">' + t("export.calib.apercuPromptFull") + '</em>';
      return;
    }
    if (!window.KmzExport) {
      target.innerHTML = '<em style="color:var(--kta-erreur);">' + t("export.calib.moduleKo") + '</em>';
      return;
    }
    let transform;
    try {
      transform = window.KmzExport.buildTransformCalib(c);   // pointC optionnel propagé (affine)
    } catch(e) {
      target.innerHTML = '<span style="color:var(--kta-avert);">⚠️ ' + String(e.message || e) + '</span>';
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
        '<a href="' + gmapsUrl + '" id="kmz_apercu_gmaps_link" target="_blank" rel="noopener" style="color:var(--kta-interaction);">' + t("export.calib.gmapsLink") + '</a>' +
      '</div>' +
      '<div style="margin-top:6px; font-size:11.5px; color:var(--kta-texte-3);">' +
        t("export.calib.scaleLabel") + ' <strong>' + transform.metresParPixel.toFixed(3) + ' m/px</strong>' +
        ' · ' + t("export.calib.rotationLabel") + ' <strong>' + (transform.rotation * 180 / Math.PI).toFixed(1) + '°</strong>' +
      '</div>';

    // Clic Google Maps : ping internet avant ouverture (pas d'erreur navigateur sèche hors ligne). Clic milieu /
    // Ctrl+clic ouvrent directement.
    const linkGmaps = document.getElementById("kmz_apercu_gmaps_link");
    if (linkGmaps) {
      linkGmaps.addEventListener("click", function(e) {
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
              window.ktaAlerte(msg);
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

  // ── Recherche (autocomplete) ──────────────
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
          list.innerHTML = '<div class="kta-kmz-search-empty">' + t("export.search.empty", { q: window.ktaEsc(q) }) + '</div>';
          return;
        }
        list.innerHTML = results.slice(0, 10).map(function(it, i) {
          const p = it.point;
          const nom = p.nom || p.id || t("export.search.point");
          const metaParts = [];
          if (p.id && p.id !== nom) metaParts.push(p.id);
          if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
            metaParts.push("x=" + p.x + ", y=" + p.y);
          }
          const meta = metaParts.length > 0
            ? '<span class="kta-kmz-search-meta">(' + window.ktaEsc(metaParts.join(" · ")) + ')</span>'
            : '';
          return '<div class="kta-kmz-search-item" data-idx="' + i + '">' +
                   '<strong>' + window.ktaEsc(nom) + '</strong>' + meta +
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

  // ── Mode clic carte ──────────────
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

  // ── Export KMZ ──────────────
  // Image du GroundOverlay réduite sous la limite de texture de Google Earth (cible 4096 px : limites GPU,
  // canvas ≤ 64 Mo) → { blob, w, h, source } ou null.
  //   1. Plan V2 : niveau z le plus fin qui tient, tuiles (512 px) assemblées ; l'image géante n'est JAMAIS
  //      décodée. Le padding noir des tuiles de bord est clippé.
  //   2. Non-V2 : décodage + downscale, seulement jusqu'à 16 384 px (RAM ; Skia plafonne à 32 767) ; sinon null.
  // Manifest tiling à la RACINE de PLAN_CONFIG (comme osmView) ; la forme .plan est tolérée.
  function _tilingManifest() {
    return (window.PLAN_CONFIG && window.PLAN_CONFIG.tiling) ||
           (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.tiling) || null;
  }

  // Blob d'une tuile V2 (RUNTIME_ASSETS + extraction lazy, repli HTTP pour un plan serveur) ou null.
  async function _blobTuile(path) {
    const asset = window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[path];
    if (asset) {
      if (!asset.file && asset._zipPath && typeof window._extractLazyAsset === "function") {
        try { await window._extractLazyAsset(path); } catch (e) {}
      }
      if (asset.file instanceof Blob) return asset.file;
      if (asset.url) { try { const r = await fetch(asset.url); if (r.ok) return await r.blob(); } catch (e) {} }
    }
    // 🩸 Le repli HTTP doit partir de la racine du plan (demandée à tiling.js) : un chemin relatif résout à la
    // racine du site → 404, zéro tuile, et repli silencieux sur l'image basse définition.
    try {
      const racine = (typeof window.ktaRacineTuilesServeur === "function")
        ? window.ktaRacineTuilesServeur(window.PLAN_CONFIG) : null;
      if (racine) {
        const r = await fetch(racine + path.replace(/^data\/tiles/, ""));
        if (r.ok) return await r.blob();
      }
    } catch (e) {}
    try { const r = await fetch(path); if (r.ok) return await r.blob(); } catch (e) {}
    return null;
  }

  // SUPEROVERLAY : toute la pyramide V2 tuile par tuile dans le KMZ (Region/Lod : Google Earth n'affiche que le
  // niveau adapté au zoom). Tuiles BRUTES, sauf celles des bords, rognées à l'emprise (leur padding noir ferait
  // des bandes sombres). Rend { tileSize, ext, levels: [{z, cols, rows, tiles: [...]}] } ou null.
  async function _collecterPyramidePourSuperoverlay() {
    const tiling = _tilingManifest();
    if (!tiling || tiling.version !== 2) return null;
    const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
    const TILE = tiling.tileSize || 512;
    const ext = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(tiling) : "jpg";
    const zMin = Number.isInteger(tiling.minNativeZoom) ? tiling.minNativeZoom : -3;
    const zMax = Number.isInteger(tiling.maxNativeZoom) ? tiling.maxNativeZoom : 0;
    const levels = [];
    let total = 0;
    for (let z = zMin; z <= zMax; z++) {
      const scale = Math.pow(2, -z);
      const lvlW = Math.ceil(W / scale), lvlH = Math.ceil(H / scale);
      const cols = Math.ceil(lvlW / TILE), rows = Math.ceil(lvlH / TILE);
      const tiles = [];
      for (let k = 1; k <= rows; k++) {
        for (let col = 0; col < cols; col++) {
          let blob = await _blobTuile("data/tiles/z" + z + "/x" + col + "_y" + (-k) + "." + ext);
          if (!blob) continue;   // tuile manquante : trou plutôt qu'échec total
          // Rognage des tuiles de BORD. ⚠️ Orientation (cf _genererTuilesV2) : k=1 = bande du BAS ; la tuile
          // PARTIELLE est celle du HAUT (k = rows), contenu collé en BAS (padding au-dessus) → sy = TILE − utile.
          // Horizontal : contenu à gauche, padding à droite → sx = 0.
          const utileW = Math.min(TILE, lvlW - col * TILE);
          const utileH = (lvlH - (k - 1) * TILE) - Math.max(0, lvlH - k * TILE);
          if (utileW < TILE || utileH < TILE) {
            try {
              const bmp = await createImageBitmap(blob);
              const cv = document.createElement("canvas");
              cv.width = utileW; cv.height = utileH;
              cv.getContext("2d").drawImage(bmp, 0, TILE - utileH, utileW, utileH, 0, 0, utileW, utileH);
              bmp.close();
              const rognee = await new Promise(function(res) { cv.toBlob(res, "image/jpeg", 0.85); });
              cv.width = cv.height = 0;
              if (rognee) blob = rognee;
            } catch (e) { /* rognage raté : tuile brute, bande noire tolérée */ }
          }
          tiles.push({ kmzPath: "tiles/z" + z + "/x" + col + "_y" + k + ".jpg", blob: blob, col: col, k: k });
          total++;
        }
      }
      levels.push({ z: z, cols: cols, rows: rows, tiles: tiles });
    }
    if (total === 0) return null;
    console.log("[KMZ] Superoverlay : " + total + " tuiles collectées (" + levels.length + " niveaux)");
    return { tileSize: TILE, ext: ext, levels: levels };
  }

  // MOSAÏQUE : le plan entier en quelques grandes images (≤ MORCEAU px de côté : 16,7 Mpx = plafond d'un canvas
  // iPhone), recomposées depuis la pyramide V2 — jamais l'image d'origine (~1,6 Go à décoder pour 400 Mpx).
  // Pas de Region/Lod : Google Earth sur iPhone n'affiche pas les tuiles d'un superoverlay. CIBLE = plus grand
  // côté voulu ; on part du niveau le moins fin qui l'atteint. Placement des tuiles comme
  // _collecterPyramidePourSuperoverlay. Rend { mosaique: true, w, h, levels: [{ z, tiles: [{ kmzPath, blob,
  // nx0, ny0, nx1, ny1 }] }] } (n… = pixels NATIFS couverts) ou null.
  async function _composerMosaique(CIBLE) {
    const MORCEAU = 4096;
    const tiling = _tilingManifest();
    if (!tiling || tiling.version !== 2) return null;
    const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
    const TILE = tiling.tileSize || 512;
    const ext = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(tiling) : "jpg";
    const zMin = Number.isInteger(tiling.minNativeZoom) ? tiling.minNativeZoom : -3;
    const zMax = Number.isInteger(tiling.maxNativeZoom) ? tiling.maxNativeZoom : 0;
    let z = zMin;
    while (z < zMax && Math.max(W, H) / Math.pow(2, -z) < CIBLE) z++;
    const scale = Math.pow(2, -z);
    const lvlW = Math.ceil(W / scale), lvlH = Math.ceil(H / scale);
    const f = Math.min(1, CIBLE / Math.max(lvlW, lvlH));
    const outW = Math.round(lvlW * f), outH = Math.round(lvlH * f);
    const cols = Math.ceil(outW / MORCEAU), rows = Math.ceil(outH / MORCEAU);
    const tCols = Math.ceil(lvlW / TILE), tRows = Math.ceil(lvlH / TILE);
    const tiles = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const ox0 = i * MORCEAU, oy0 = j * MORCEAU;
        const ox1 = Math.min(outW, ox0 + MORCEAU), oy1 = Math.min(outH, oy0 + MORCEAU);
        const cv = document.createElement("canvas");
        cv.width = ox1 - ox0; cv.height = oy1 - oy0;
        const ctx = cv.getContext("2d");
        let posees = 0;
        for (let k = 1; k <= tRows; k++) {
          const ty0 = (lvlH - k * TILE) * f, ty1 = ty0 + TILE * f;
          if (ty1 <= oy0 || ty0 >= oy1) continue;
          for (let col = 0; col < tCols; col++) {
            const tx0 = col * TILE * f, tx1 = tx0 + TILE * f;
            if (tx1 <= ox0 || tx0 >= ox1) continue;
            const blob = await _blobTuile("data/tiles/z" + z + "/x" + col + "_y" + (-k) + "." + ext);
            if (!blob) continue;   // tuile manquante : un trou plutôt qu'un échec
            try {
              const bmp = await createImageBitmap(blob);
              ctx.drawImage(bmp, tx0 - ox0, ty0 - oy0, TILE * f, TILE * f);
              bmp.close();
              posees++;
            } catch (e) { /* tuile illisible : trou */ }
          }
        }
        if (posees) {
          const out = await new Promise(function(res) { cv.toBlob(res, "image/jpeg", 0.85); });
          if (out) {
            tiles.push({ kmzPath: "files/plan_" + (j + 1) + "_" + (i + 1) + ".jpg", blob: out, col: i, k: j + 1,
              nx0: ox0 / outW * W, ny0: oy0 / outH * H, nx1: ox1 / outW * W, ny1: oy1 / outH * H });
          }
        }
        cv.width = cv.height = 0;
      }
    }
    if (!tiles.length) return null;
    console.log("[KMZ] Mosaïque : niveau z" + z + " → " + outW + "×" + outH + " en " + tiles.length + " image(s)");
    return { mosaique: true, w: outW, h: outH, tileSize: MORCEAU, levels: [{ z: 0, tiles: tiles }] };
  }

  // Repli NON-V2 : downscale sous la limite de texture de Google Earth → { blob, w, h, source } ou null.
  async function _reduireImagePourGoogleEarth(imageBlob, dims) {
    const CIBLE = 4096;

    if (Math.max(dims.width, dims.height) > 16384) return null;   // Skia/RAM : on ne tente même pas
    try {
      const bmp = await createImageBitmap(imageBlob);
      const ratio = Math.min(CIBLE / bmp.width, CIBLE / bmp.height);
      const w = Math.round(bmp.width * ratio), h = Math.round(bmp.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const out = await new Promise(function(res) { canvas.toBlob(res, "image/jpeg", 0.85); });
      canvas.width = canvas.height = 0;
      return out ? { blob: out, w: w, h: h, source: "downscale direct" } : null;
    } catch (eDS) {
      console.warn("[KMZ] Downscale direct impossible :", eDS);
      return null;
    }
  }

  async function _exportKmz() {
    // La collecte d'un gros plan prend plusieurs secondes : bouton verrouillé + libellé d'attente + toast.
    // try/finally : le bouton revit quoi qu'il arrive.
    const btnDl = document.getElementById("kta-ses-download");
    const btnTexteAvant = btnDl ? btnDl.textContent : null;
    if (btnDl) { btnDl.disabled = true; btnDl.textContent = "⏳ " + window.I18n.t("kmz.gen.enCours"); }
    if (window.OOMGuard && window.OOMGuard.showToast) {
      window.OOMGuard.showToast(window.I18n.t("kmz.gen.enCoursToast"), "info");
    }
    try {
      await _exportKmzInterne();
    } finally {
      if (btnDl) { btnDl.disabled = false; btnDl.textContent = btnTexteAvant; }
    }
  }

  // Sélection de l'onglet Export externe (cases KMZ, partagées par le GeoJSON) : objets de la session ET des
  // calques de données, filtres par tag / type, niveaux cochés → forme { include, levels, data } de
  // KmzExport.genererKml / GeojsonExport.generer.
  function _kmzSelection() {
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
    const d = _compter();
    const editorPoints = d.points || [];
    // Points des calques : _ktaDataMarkers → {x, y, nom, tags, level}
    const dataLayerPoints = [];
    if (Array.isArray(window._ktaDataMarkers)) {
      window._ktaDataMarkers.forEach(function(m) {
        if (!m || !m.getLatLng) return;
        const ll = m.getLatLng();
        const pt = {
          x:     ll.lng,
          y:     APP_CONFIG.imageHeight - ll.lat,
          nom:   m._ktaNom || "",
          tags:  Array.isArray(m._ktaTags) ? m._ktaTags : [],
          level: Number.isInteger(m._ktaLevel) ? m._ktaLevel : 0,
          description: m._ktaDescription || "",
          uid:   m._ktaUid || null
        };
        // Passage entre niveaux d'un calque : exporté dans le dossier de chacun de ses niveaux.
        if (Array.isArray(m._ktaNiveauxSrc)) pt.niveaux = m._ktaNiveauxSrc;
        dataLayerPoints.push(pt);
      });
    }
    const allPoints = editorPoints.concat(dataLayerPoints);

    // Roads : session + calques embarqués. getAllEmbeddedRoads = TOUTES (visibles ET masquées), comme le
    // Pathfinder et la distance totale.
    const sessionRoads = d.roads || [];
    const embeddedRoads = (typeof window.getAllEmbeddedRoads === "function")
      ? window.getAllEmbeddedRoads()
      : [];
    const allRoads = sessionRoads.concat(embeddedRoads);

    // Zones : session + calques (getAllEmbeddedZones → format {type, points, level} de getZones()).
    const sessionZones = d.zones || [];
    const embeddedZones = (typeof window.getAllEmbeddedZones === "function")
      ? window.getAllEmbeddedZones()
      : [];
    const allZones = sessionZones.concat(embeddedZones);

    // Structures : session + calques, styles kmzExport.js > STYLES_KML > structure_* ; sans structure, le
    // dossier Structures est omis.
    const sessionStructures = d.structures || [];
    const embeddedStructures = (typeof window.getAllEmbeddedStructures === "function")
      ? window.getAllEmbeddedStructures()
      : [];
    const allStructures = sessionStructures.concat(embeddedStructures);

    // Sous-cases : Set non-null = whitelist ; null (parent décoché) ou Set vide = rien.

    let pointTagsSet = null;
    const pointsParent = document.getElementById("kmz_inc_points");
    if (pointsParent && pointsParent.checked) {
      pointTagsSet = new Set();
      document.querySelectorAll('[id^="kmz_inc_points_tag_"]').forEach(function(cb) {
        if (cb.checked && cb.dataset && cb.dataset.tag) pointTagsSet.add(cb.dataset.tag);
      });
    }

    let roadTypesSet = null;
    const roadsParent = document.getElementById("kmz_inc_roads");
    if (roadsParent && roadsParent.checked) {
      roadTypesSet = new Set();
      ["principal", "secondaire", "chemin"].forEach(function(t) {
        const cb = document.getElementById("kmz_inc_roads_" + t);
        if (cb && cb.checked) roadTypesSet.add(t);
      });
    }

    let zoneTypesSet = null;
    const zonesParent = document.getElementById("kmz_inc_zones");
    if (zonesParent && zonesParent.checked) {
      zoneTypesSet = new Set();
      ["eau", "remblais", "effondrement", "inaccessible"].forEach(function(t) {
        const cb = document.getElementById("kmz_inc_zones_" + t);
        if (cb && cb.checked) zoneTypesSet.add(t);
      });
    }

    // Types structures : parent décoché → null ; pas de case dans l'UI → Set complet (rien perdu en silence).
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
      structureTypesSet = new Set(["pilier-1", "pilier-2", "mur", "front-1", "front-2"]);
    }

    // 🩸 Types hors intégrés ajoutés aux Sets, sinon ils disparaissent du KMZ : `cust-…` ET id brut d'un calque
    // (« Bas », relevé SIG) — filtrer sur `cust-` perdait ces derniers. Parent coché → ils partent TOUS, sans
    // case dédiée (décision produit).
    function _ajouterTypesHorsIntegres(set, items, integres) {
      if (!set || !Array.isArray(items)) return;
      items.forEach(function(it) {
        if (it && typeof it.type === "string" && it.type && integres.indexOf(it.type) === -1) set.add(it.type);
      });
    }
    _ajouterTypesHorsIntegres(roadTypesSet, allRoads, ["principal", "secondaire", "chemin", "jonction", "itinerary"]);
    _ajouterTypesHorsIntegres(zoneTypesSet, allZones, ["eau", "remblais", "effondrement", "inaccessible"]);
    _ajouterTypesHorsIntegres(structureTypesSet, allStructures, ["pilier-1", "pilier-2", "mur", "front-1", "front-2"]);

    return {
      mlOn: mlOn,
      levels: levels,
      include: {
        points:     !!pointTagsSet,       // parent coché
        roads:      !!roadTypesSet,
        zones:      !!zoneTypesSet,
        // Structures : Set existant et non vide (sinon pas de dossier)
        structures: !!structureTypesSet && structureTypesSet.size > 0,
        jonctions:  mlOn && !!document.getElementById("kmz_inc_jonctions")?.checked,
        itineraire: !!document.getElementById("kmz_inc_iti")?.checked,
        dataLayers: true,
        pointTagsSet: pointTagsSet,
        roadTypesSet: roadTypesSet,
        zoneTypesSet: zoneTypesSet,
        structureTypesSet: structureTypesSet
      },
      data: { editorPoints: allPoints, roads: allRoads, zones: allZones, structures: allStructures }
    };
  }

  async function _exportKmzInterne() {
    if (!window.KmzExport) {
      window.ktaAlerte(t("export.err.kmzModuleKo"), { type: "erreur" });
      return;
    }
    const c = _kmzLireCalib();
    if (c.pointA.x == null || c.pointA.y == null || c.pointA.lat == null || c.pointA.lng == null ||
        c.pointB.x == null || c.pointB.y == null || c.pointB.lat == null || c.pointB.lng == null) {
      window.ktaAlerte(t("export.err.calib8Champs"));
      return;
    }
    let transform;
    try {
      transform = window.KmzExport.buildTransformCalib(c);   // pointC optionnel propagé (affine)
    } catch(e) {
      window.ktaAlerte(t("export.err.calibInvalide", { msg: e.message }), { type: "erreur" });
      return;
    }
    window.KmzExport.setCalibration(_kmzCurrentPlanId(), c);

    const sel = _kmzSelection();
    const levels = sel.levels;

    let imageBlob = null;
    let imageFilename = null;
    // ⚠️ Déclaré au niveau de imageBlob : genererKmz le lit hors du bloc if(inclImage).
    let tilesOverlay = null;   // superoverlay V2 (ou null)
    const inclImage = document.getElementById("kmz_inc_image")?.checked;
    if (inclImage && window.PLAN_CONFIG?.plan?.baseImage) {
      const baseImagePath = window.PLAN_CONFIG.plan.baseImage;
      const fullPath = baseImagePath.indexOf("/") >= 0 ? baseImagePath : ("data/" + baseImagePath);
      imageFilename = baseImagePath;
      if (window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[fullPath]) {
        const asset = window.RUNTIME_ASSETS[fullPath];
        if (asset.file instanceof Blob) imageBlob = asset.file;
        else if (asset.url) {
          try { const r = await fetch(asset.url); if (r.ok) imageBlob = await r.blob(); } catch(e) {}
        }
      }
      if (!imageBlob) {
        try { const r = await fetch(fullPath); if (r.ok) imageBlob = await r.blob(); } catch(e) {}
      }
      if (!imageBlob) {
        console.warn("[KMZ] Image plan introuvable → KMZ généré sans GroundOverlay");
        imageFilename = null;
      }

      // 🩸 Google Earth TRONQUE en silence les textures au-delà de sa limite GPU (~8-16 K px). Au-delà de
      // GE_MAX px : plan V2 → superoverlay (ou mosaïque) ; non-V2 décodable → downscale ; au-delà de
      // 16 384 px (non tenté, cf _reduireImagePourGoogleEarth) → on le DIT et on demande.
      if (imageBlob && typeof window.ktaLireDimensionsEntete === "function") {
        try {
          const _dims = window.ktaLireDimensionsEntete(await imageBlob.slice(0, 1048576).arrayBuffer());
          const _GE_MAX = 8192;
          if (_dims && Math.max(_dims.width, _dims.height) > _GE_MAX) {
            // Plan V2 : SUPEROVERLAY pleine résolution au lieu d'une image composée floue ; « Grandes images »
            // cochée → mosaïque lisible par Google Earth sur mobile.
            const uniqueVoulue = !!document.getElementById("kmz_img_unique")?.checked;
            const cible = Number.parseInt(document.getElementById("kmz_img_nettete")?.value, 10) || 8192;
            const unique = uniqueVoulue ? await _composerMosaique(cible) : null;
            if (unique) {
              tilesOverlay = unique;
              imageBlob = null;
              imageFilename = null;
              if (window.OOMGuard && window.OOMGuard.showToast) {
                window.OOMGuard.showToast(window.I18n.t("kmz.geOverlay.unique",
                  { n: unique.levels[0].tiles.length, w: unique.w, h: unique.h }), "info");
              }
            }
            if (!unique) tilesOverlay = await _collecterPyramidePourSuperoverlay();
            if (tilesOverlay && !unique) {
              const nbT = tilesOverlay.levels.reduce(function(s, l) { return s + l.tiles.length; }, 0);
              imageBlob = null;
              imageFilename = null;
              if (window.OOMGuard && window.OOMGuard.showToast) {
                window.OOMGuard.showToast(window.I18n.t("kmz.geOverlay.superoverlay", { n: nbT }), "info");
              }
            }
            const reduit = (tilesOverlay || unique) ? null : await _reduireImagePourGoogleEarth(imageBlob, _dims);
            if (reduit) {
              console.log("[KMZ] Overlay réduit pour Google Earth :", _dims.width + "×" + _dims.height,
                          "→", reduit.w + "×" + reduit.h, "(" + reduit.source + ")");
              imageBlob = reduit.blob;
              imageFilename = "plan_overlay.jpg";
              if (window.OOMGuard && window.OOMGuard.showToast) {
                window.OOMGuard.showToast(window.I18n.t("kmz.geOverlay.reduit", { w: reduit.w, h: reduit.h }), "info");
              }
            } else if (!tilesOverlay && !unique) {
              // Irréductible (image géante non-V2) : choix explicite, jamais d'erreur silencieuse.
              const continuer = await window.ktaConfirm(
                window.I18n.t("kmz.geOverlay.tronque", { w: _dims.width, h: _dims.height }),
                { titre: "🌍 Google Earth", okLabel: window.I18n.t("kmz.geOverlay.okQuandMeme"),
                  cancelLabel: window.I18n.t("kmz.geOverlay.annuler") });
              if (!continuer) {
                if (window.OOMGuard && window.OOMGuard.showToast) {
                  window.OOMGuard.showToast(window.I18n.t("kmz.geOverlay.exportAnnule"), "warn");
                }
                return;
              }
            }
          }
        } catch (eGE) {
          console.warn("[KMZ] Vérification taille overlay échouée (export inchangé) :", eGE);
        }
      }
    }

    // Icônes embarquées : _kta_iconUrl (divIcon scaledMarkers) avant options.iconUrl
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

    const btnDl = document.getElementById("kta-ses-download");
    if (btnDl) { btnDl.disabled = true; btnDl.textContent = t("export.btn.generatingKmz"); }
    try {
      const opSlider = document.getElementById("kmz_img_opacity");
      const imageOpacity = opSlider ? Math.max(0, Math.min(100, parseInt(opSlider.value, 10) || 60)) : 60;
      const pointTagsSet = sel.include.pointTagsSet, roadTypesSet = sel.include.roadTypesSet;
      const zoneTypesSet = sel.include.zoneTypesSet, structureTypesSet = sel.include.structureTypesSet;

      console.log("[KMZ] Contenu :", sel.data.editorPoints.length, "points,", sel.data.roads.length, "roads,",
        sel.data.zones.length, "zones,", sel.data.structures.length, "structures (session + calques)");
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
        include:       Object.assign({ image: inclImage }, sel.include),
        levels:        levels,
        data:          sel.data,
        imageBlob:     imageBlob,
        tilesOverlay:  tilesOverlay,   // superoverlay V2 (ou null)
        imageFilename: imageFilename,
        iconsToEmbed:  iconsToEmbed,
        // Légende (aller-retour) → fichier annexe `myktamap-extras.json` du KMZ, ignoré par les apps tierces.
        // Au réimport, kmzImport.js la pose dans plan-config > plan.customLegend. Omis si case décochée ou
        // légende vide.
        planCustomLegend: (function() {
          const inclLegend = !!document.getElementById("kmz_inc_legend")?.checked;
          if (!inclLegend) return null;
          // Plan + session fusionnés (la session prime, comme à l'écran).
          return _legendeCompleteAExporter();
        })()
      });

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
      window.ktaAlerte(t("export.err.kmzGeneration", { err: e.message || e }), { type: "erreur" });
    } finally {
      if (btnDl) { btnDl.disabled = false; btnDl.textContent = t("export.btn.download"); }
    }
  }

  // ── Export GeoJSON (calibrage et cases du KMZ, projection au choix) ──────────────
  function _exportGeojson() {
    if (!window.KmzExport || !window.GeojsonExport) {
      window.ktaAlerte(t("export.err.kmzModuleKo"), { type: "erreur" });
      return;
    }
    const c = _kmzLireCalib();
    if (c.pointA.x == null || c.pointA.y == null || c.pointA.lat == null || c.pointA.lng == null ||
        c.pointB.x == null || c.pointB.y == null || c.pointB.lat == null || c.pointB.lng == null) {
      window.ktaAlerte(t("export.err.calib8Champs"));
      return;
    }
    let transform;
    try {
      transform = window.KmzExport.buildTransformCalib(c);
    } catch(e) {
      window.ktaAlerte(t("export.err.calibInvalide", { msg: e.message }), { type: "erreur" });
      return;
    }
    window.KmzExport.setCalibration(_kmzCurrentPlanId(), c);
    const choix = _modal && _modal.querySelector('input[name="geojson_proj"]:checked');
    const epsg = (choix && choix.value === "2154") ? 2154 : 4326;
    try {
      const sel = _kmzSelection();
      const planName = (window.PLAN_CONFIG?.plan?.name) || "plan";
      const fc = window.GeojsonExport.generer({ transform: transform, epsg: epsg, planName: planName,
                                                include: sel.include, levels: sel.levels, data: sel.data });
      if (!fc.features.length) { _avertirRienAExporter(t("export.geojson.vide")); return; }
      const blob = new Blob([JSON.stringify(fc)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = window.GeojsonExport.nomFichier(planName, epsg);
      a.click();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(t("export.geojson.exporte", { n: fc.features.length,
          proj: epsg === 4326 ? "WGS84" : "Lambert 93" }), "success");
      }
      _fermer();
    } catch(e) {
      console.error("[GeoJSON] Erreur génération :", e);
      window.ktaAlerte(t("export.geojson.erreur", { err: e.message || e }), { type: "erreur" });
    }
  }

  // ── Export GPX (options seules ; calibrage partagé avec KMZ) ──────────────
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
        // Légende (aller-retour via GPX) : <extensions><myktamap:customLegend> sous <metadata>, ignorée par les
        // apps tierces, lue par gpxIO. Cochée si une légende existe, sinon grisée à 0.
        (function() {
          // Plan ET session : la légende de terrain vit dans la session.
          const has = !!_legendeCompleteAExporter();
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

  // Persiste le calibrage du formulaire (mêmes champs kmz_A_x… que le KMZ), puis GpxIO.exporter.
  function _exportGpxViaExtern() {
    if (!window.KmzExport) {
      window.ktaAlerte(t("export.err.kmzModuleKo"), { type: "erreur" });
      return;
    }
    if (!window.GpxIO) {
      window.ktaAlerte(t("export.err.gpxModuleKo"), { type: "erreur" });
      return;
    }
    const c = _kmzLireCalib();
    if (c.pointA.x == null || c.pointA.y == null || c.pointA.lat == null || c.pointA.lng == null ||
        c.pointB.x == null || c.pointB.y == null || c.pointB.lat == null || c.pointB.lng == null) {
      window.ktaAlerte(t("export.err.calib8Champs"));
      return;
    }
    try {
      window.KmzExport.buildTransformCalib(c);   // pointC optionnel propagé (affine)
    } catch(e) {
      window.ktaAlerte(t("export.err.calibInvalide", { msg: e.message }), { type: "erreur" });
      return;
    }
    window.KmzExport.setCalibration(_kmzCurrentPlanId(), c);

    const incPoints   = document.getElementById("gpx_points")   && document.getElementById("gpx_points").checked;
    const incEmbedded = document.getElementById("gpx_embedded") && document.getElementById("gpx_embedded").checked;
    const incRoads    = document.getElementById("gpx_roads")    && document.getElementById("gpx_roads").checked;
    const incIti      = document.getElementById("gpx_iti")      && document.getElementById("gpx_iti").checked;
    const incLegend   = document.getElementById("gpx_legend")   && document.getElementById("gpx_legend").checked;

    const btnDl = document.getElementById("kta-ses-download");
    if (btnDl) { btnDl.disabled = true; btnDl.textContent = t("export.btn.generating"); }

    try {
      const r = window.GpxIO.exporter({
        incPoints:   !!incPoints,
        incEmbedded: !!incEmbedded,
        incRoads:    !!incRoads,
        incIti:      !!incIti,
        // Légende via <extensions> GPX ; omise si case décochée ou légende vide.
        planCustomLegend: (function() {
          if (!incLegend) return null;
          // Plan + session fusionnés (la session prime, comme à l'écran).
          return _legendeCompleteAExporter();
        })()
      });
      if (!r.ok) {
        window.ktaAlerte(t("export.err.gpxImpossible", { msg: r.msg }), { type: "erreur" });
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
      window.ktaAlerte(t("export.err.gpxGeneration", { err: e.message || e }), { type: "erreur" });
    } finally {
      if (btnDl) { btnDl.disabled = false; btnDl.textContent = t("export.btn.download"); }
    }
  }

})();
