/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// tableEditor.js — édite en tableau un JSON (calque ou session), le plan en cours ou un ZIP importé ;
//   héberge aussi la conversion de résolution et le dédoublonnage de sommets.
// Expose : window.ouvrirTableEditor.
// ⚠️ Calques de données : export seulement. Un fichier de SESSION s'applique en direct par « Appliquer à la session »
//   (points, tracés, zones, structures : KtaConvertir.appliquerTableau, un seul chemin) : seules les cellules
//   modifiées s'appliquent, mêmes chemins que la fiche, une entrée ⏪, type inconnu refusé.
// ⚠️ Plan PARTAGÉ (KtaExtensions.importPartage) : un objet retiré reçoit une trace de suppression (sinon il revient
//   du serveur) ; s'il en retire, il faut `remplacer` de la prise, et une confirmation chiffrée.
// Plan multi-niveau : colonne « level » toujours présente, en liste (niveaux du plan + niveau actuel).
// 🩸 uid/updatedAt ne sont jamais des colonnes ; « Dupliquer » donne un uid neuf (js/ktaUid.js).
// Garde-fous : scripts/check-resolution-convert.js, scripts/check-uid.js, scripts/check-calque-session.js

(function() {
  "use strict";

  let _modal      = null;
  let _data       = [];           // tableau d'objets (lignes éditées : points OU roads/zones/structures)
  let _colonnes   = [];           // colonnes détectées
  let _modifie    = false;        // flag modifs non sauvées
  let _selection  = new Set();    // indices sélectionnés
  let _tri        = { col: null, asc: true };
  let _filtre     = "";
  // Tableau édité : "data" | "editorPoints" (points x/y/tags) ou "roads" | "zones" | "structures"
  // (type/note/niveau éditables, géométrie `points` en lecture seule).
  let _kind       = null;
  let _format     = null;         // alias historique : "data" | "editorPoints" (rétro-compat interne)
  let _sourceObj  = null;         // objet JSON COMPLET du fichier source (pour re-sérialiser sans perdre les autres tableaux)
  let _sourceMeta = {};           // fileName (téléchargement + titre)
  let _filtreTimer = null;
  let _lastSelectedIdx = null;    // pour shift-click
  // Ligne → copie telle que chargée : « Appliquer à la session » n'applique que les cellules modifiées depuis.
  // Ligne ajoutée ou dupliquée : pas d'origine (c'est un ajout).
  let _origines   = new WeakMap();

  var _ARRAYS_EDITABLES = [
    { key: "data",         emoji: "📍", points: true  },
    { key: "editorPoints", emoji: "📍", points: true  },
    { key: "roads",        emoji: "🛣️", points: false },
    { key: "zones",        emoji: "⬛", points: false },
    { key: "structures",   emoji: "🏗️", points: false }
  ];
  function _estPoints()  { return _kind === "data" || _kind === "editorPoints"; }
  // Fichier de session (export « devmap-session », ou porteur de editorPoints) : ses tableaux s'appliquent en direct.
  function _sourceEstSession() {
    return !!(_sourceObj && (_sourceObj.type === "devmap-session" || Array.isArray(_sourceObj.editorPoints)));
  }
  function _estSession() { return _kind === "editorPoints" || (!_estPoints() && _sourceEstSession()); }
  // Niveaux du plan affiché s'il est multi-niveau, sinon null (pas de liste, pas de colonne imposée).
  // 🩸 APP_CONFIG garde multiLevel du dernier plan après le retour à l'accueil : le plan affiché tranche.
  function _niveauxPlan() {
    const c = window.APP_CONFIG;
    if (!c || c.multiLevel !== true) return null;
    if (typeof window.ktaPlanAffiche === "function" && !window.ktaPlanAffiche()) return null;
    return (Array.isArray(c.availableLevels) && c.availableLevels.length) ? c.availableLevels : [0];
  }
  // Liste d'une cellule : niveaux du plan + `actuel`, triés. 🩸 `actuel` toujours proposé, même hors liste, comme la
  // fiche (utils.js > ktaNiveauxProposes) : sinon la liste afficherait un autre niveau que celui de l'objet.
  function _niveauxProposes(actuel) {
    const base = _niveauxPlan();
    if (!base) return null;
    const vus = {};
    return base.concat([actuel]).filter(function(n) {
      if (!Number.isInteger(n) || vus[n]) return false;
      vus[n] = true;
      return true;
    }).sort(function(a, b) { return a - b; });
  }
  // Jonction (fromLevel / toLevel) et itinéraire n'ont pas de niveau unique : cellule en lecture seule.
  function _sansNiveau(p) { return !_estPoints() && !!p && (p.type === "jonction" || p.type === "itinerary"); }
  function _catTypes() { return (_kind === "roads") ? "traces" : _kind; }   // zones / structures = mêmes clés
  // Types connus de la légende (canon + customs) pour la colonne `type`, ou [] (points, légende absente).
  function _typesConnus() {
    if (_estPoints()) return [];
    const cat = _catTypes();
    const out = (typeof window.ktaStyleBuiltins === "function") ? window.ktaStyleBuiltins(cat).slice() : [];
    if (window.LegendCustomization && typeof window.LegendCustomization.listCustomEntries === "function") {
      try {
        window.LegendCustomization.listCustomEntries(cat).forEach(function(e) { if (e && e.id) out.push(e.id); });
      } catch(e) {}
    }
    return out;
  }
  function _valTri(p, col) {
    return (col === "level" && !Number.isInteger(p.level) && !_sansNiveau(p)) ? 0 : p[col];
  }
  function _prefixeUid() {
    return _kind === "roads" ? "rd" : _kind === "zones" ? "zn" : _kind === "structures" ? "st" : "pt";
  }
  function _toucher(obj) { if (window.KtaUid && obj) window.KtaUid.touch(obj); }
  // La carte source a déjà son icône : l'emoji de tête de la clé i18n est retiré ici seulement.
  function _sansIcone(s) { return String(s).replace(/^[^\p{L}\p{N}]+/u, ""); }

  function _injecterStyles() {
    if (document.getElementById("kta-tbl-styles")) return;
    const s = document.createElement("style");
    s.id = "kta-tbl-styles";
    s.textContent = `
      /* 🆕 v1.9.2-fix14 (KARMA "même concept pour Éditeur tableau") :
         on retire le width fixe 1100px → la modale utilise les tailles
         de .kta-readme-modal-boite (mobile : min(960px, 96vw),
         PC : 1400/1700/2000px selon palier — cf. style.css fix13).
         La règle de base ici sert juste à neutraliser un éventuel
         override de width fixe ailleurs : on laisse la base CSS gérer. */
      #kta-tbl-modal .kta-readme-modal-boite { display:flex; flex-direction:column; }
      #kta-tbl-modal .kta-readme-modal-corps { display:flex; flex-direction:column; flex:1; min-height:0; padding-bottom:0; }

      .kta-tbl-toolbar {
        display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
        padding: 10px 0; border-bottom: 1px solid var(--kta-bordure);
      }
      .kta-tbl-toolbar input[type="text"] {
        flex: 1; min-width: 200px;
      }
      .kta-tbl-info {
        font-size: 12px; color: var(--kta-texte-3);
        padding: 8px 0;
      }
      .kta-tbl-info .modif {
        color: #ffd28a; font-weight: 600;
      }

      .kta-tbl-wrap {
        flex: 1; min-height: 0;
        overflow: auto;
        border: 1px solid var(--kta-bordure);
        border-radius: 6px;
        background: rgba(255,255,255,0.02);
      }
      .kta-tbl {
        width: 100%; border-collapse: collapse; font-size: 13px;
      }
      .kta-tbl th {
        position: sticky; top: 0; z-index: 2;
        background: var(--kta-surface); color: var(--kta-interaction);
        padding: 8px 10px; text-align: left; font-weight: 600;
        cursor: pointer; user-select: none;
        border-bottom: 1px solid rgba(140,180,255,0.2);
        white-space: nowrap;
      }
      .kta-tbl th.col-check { width: 30px; cursor: default; }
      .kta-tbl th .tri-arrow { font-size: 10px; opacity: 0.6; margin-left: 4px; }
      .kta-tbl th:hover { background: #20263a; }

      .kta-tbl tbody tr {
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .kta-tbl tbody tr:hover { background: rgba(140,180,255,0.04); }
      .kta-tbl tbody tr.kta-tbl-selected { background: rgba(140,180,255,0.1); }
      .kta-tbl tbody td {
        padding: 6px 10px;
        color: var(--kta-texte-2);
        vertical-align: middle;
      }
      .kta-tbl td.col-check {
        text-align: center;
      }
      .kta-tbl td.col-readonly {
        color: var(--kta-texte-3); cursor: not-allowed;
        background: rgba(255,255,255,0.02);
      }
      .kta-tbl td.col-error {
        background: rgba(255,80,80,0.15);
        position: relative;
      }
      .kta-tbl td.col-error::after {
        content: "⚠";
        position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
        color: #ff8888; font-size: 12px;
      }
      .kta-tbl td.editing {
        padding: 0;
      }
      .kta-tbl td.editing input, .kta-tbl td.editing select {
        width: 100%; box-sizing: border-box;
        padding: 6px 10px;
        background: #2a3145;
        color: #e8eaf0;
        border: 2px solid #8cb4ff;
        outline: none;
        font-size: 13px;
        font-family: inherit;
      }

      /* Tags chips */
      .kta-tag-chip {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 6px; margin: 1px 2px;
        background: rgba(140,180,255,0.15);
        border: 1px solid rgba(140,180,255,0.3);
        border-radius: 10px;
        font-size: 11px; color: var(--kta-texte-2);
      }
      .kta-tag-chip-x {
        cursor: pointer; color: #ff8888; font-weight: bold;
      }
      .kta-tag-chip-x:hover { color: #ff4444; }
      .kta-tag-add {
        font-size: 11px; color: var(--kta-interaction); cursor: pointer;
        padding: 2px 6px; border: 1px dashed rgba(140,180,255,0.4);
        border-radius: 10px; margin: 1px 2px;
      }
      .kta-tag-add:hover { background: rgba(140,180,255,0.1); }

      /* Dropdown tags */
      .kta-tag-dropdown {
        position: fixed;
        background: var(--kta-surface);
        border: 1px solid rgba(140,180,255,0.4);
        border-radius: 6px;
        padding: 6px;
        /* 🐛 v1.48.x — la modale éditeur est à z-index 99999 (.kta-readme-modal-overlay)
           → un z-index 10000 ouvrait le dropdown DERRIÈRE la modale (invisible). Passé
           au-dessus du tier modales/sous-modales (99999/100001) pour être cliquable. */
        z-index: 100002;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        max-height: 280px; overflow-y: auto;
        min-width: 200px;
      }
      .kta-tag-option {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 8px; cursor: pointer;
        border-radius: 4px;
        font-size: 12px;
      }
      .kta-tag-option:hover { background: rgba(140,180,255,0.1); }
      .kta-tag-option.selected { background: rgba(140,180,255,0.18); }
      .kta-tag-option img {
        width: 22px; height: 22px; object-fit: contain;
        background: rgba(255,255,255,0.05); border-radius: 3px;
      }
      .kta-tag-option .check {
        margin-left: auto; color: var(--kta-interaction);
      }
      .kta-tag-create {
        border-top: 1px solid var(--kta-bordure);
        margin-top: 4px; padding-top: 4px;
      }
      .kta-tag-create input {
        width: 100%; box-sizing: border-box;
        padding: 4px 8px;
        background: rgba(255,255,255,0.06);
        color: var(--kta-texte);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 4px;
        font-size: 12px;
      }

      /* Footer actions */
      .kta-tbl-footer {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 0;
        gap: 10px;
      }
      .kta-tbl-selection-info {
        font-size: 13px; color: var(--kta-texte-2);
      }

      /* Drop zone import */
      .kta-tbl-drop {
        border: 2px dashed rgba(140,180,255,0.3);
        border-radius: 8px;
        padding: 30px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        color: var(--kta-texte-2);
      }
      .kta-tbl-drop:hover, .kta-tbl-drop.dragover {
        background: rgba(140,180,255,0.06);
        border-color: rgba(140,180,255,0.5);
        color: var(--kta-texte);
      }

      /* Avertissement gros volume */
      .kta-tbl-warn-big {
        background: rgba(255,180,80,0.1);
        border: 1px solid rgba(255,180,80,0.3);
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 12px;
        color: #ffd28a;
        margin-bottom: 8px;
      }

      /* 🆕 Écran d'accueil — 3 sources */
      /* margin-bottom : le corps de la modale est forcé en padding-bottom:0
         (utile pour la vue tableau pleine hauteur) → sans cette marge, la
         dernière carte colle au bas de la modale (cf. screen KARMA v1.48.0). */
      .kta-tbl-sources { display:flex; flex-direction:column; gap:10px; margin-top:4px; margin-bottom:24px; }
      .kta-tbl-source-card {
        display:flex; align-items:center; gap:14px;
        padding:14px 16px; text-align:left;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(140,180,255,0.2);
        border-radius: 8px; cursor:pointer; transition: all 0.15s;
        color:var(--kta-texte); font-family:inherit;
      }
      .kta-tbl-source-card:hover:not([disabled]) {
        background: rgba(140,180,255,0.08);
        border-color: rgba(140,180,255,0.5);
      }
      .kta-tbl-source-card[disabled] { opacity:0.45; cursor:not-allowed; }
      .kta-tbl-source-ico { font-size:28px; line-height:1; flex:0 0 auto; }
      .kta-tbl-source-txt { display:flex; flex-direction:column; gap:2px; }
      .kta-tbl-source-titre { font-weight:600; font-size:14px; }
      .kta-tbl-source-hint { font-size:12px; color:var(--kta-texte-3); line-height:1.4; }

      /* 🆕 Sélecteur de calque */
      .kta-tbl-entries { display:flex; flex-direction:column; gap:8px; margin-top:4px; max-height:60vh; overflow:auto; }
      .kta-tbl-entry {
        display:flex; align-items:center; gap:12px;
        padding:11px 14px; text-align:left;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 7px; cursor:pointer; transition: all 0.15s;
        color:var(--kta-texte); font-family:inherit;
      }
      .kta-tbl-entry:hover { background: rgba(140,180,255,0.08); border-color: rgba(140,180,255,0.45); }
      .kta-tbl-entry-ico { font-size:20px; flex:0 0 auto; }
      .kta-tbl-entry-label { font-weight:600; font-size:13px; flex:1; }
      .kta-tbl-entry-count { font-size:12px; color:var(--kta-interaction); }
      .kta-tbl-entry-file { font-size:11px; color:var(--kta-texte-3); }

      /* 🆕 Note "datalayer = export only" dans le menu sauvegarde */
      .kta-tbl-gen-note {
        background: rgba(140,180,255,0.08);
        border: 1px solid rgba(140,180,255,0.25);
        border-radius: 6px; padding:8px 12px; margin-top:4px;
        font-size:12px; color:#a8b8d8; line-height:1.5;
      }
    `;
    document.head.appendChild(s);
  }

  window.ouvrirTableEditor = function() {
    _injecterStyles();
    if (_modal) { _modal.remove(); _modal = null; }
    _afficherAccueil();
  };

  // ── Sources ──────────────────────────────
  function _basename(path) {
    return String(path || "").split(/[\\/]/).pop().split("?")[0] || "";
  }
  function _escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // Tableaux éditables non vides de `obj` ; l'objet COMPLET est gardé pour re-sérialiser sans perte.
  function _collecterEntreesEditables(obj, baseLabel, fileName, entries) {
    if (!obj || typeof obj !== "object") return;
    _ARRAYS_EDITABLES.forEach(function(def) {
      var arr = obj[def.key];
      if (Array.isArray(arr) && arr.length > 0) {
        entries.push({
          kind: def.key, emoji: def.emoji, points: def.points,
          label: baseLabel, count: arr.length,
          fileName: fileName, sourceObj: obj
        });
      }
    });
  }

  function _afficherAccueil(errMsg) {
    if (_modal) { _modal.remove(); _modal = null; }
    // 🩸 PLAN_CONFIG survit au retour à l'accueil : sans ce test, « plan en cours » mènerait à un plan
    // qui n'est plus affiché (gotchas.md § PLAN_CONFIG).
    var planAffiche = (typeof window.ktaPlanAffiche === "function") ? window.ktaPlanAffiche() : true;
    var planDispo = planAffiche && !!(window.PLAN_CONFIG && Array.isArray(window.PLAN_CONFIG.dataLayers) && window.PLAN_CONFIG.dataLayers.length);
    var modal = document.createElement("div");
    modal.id = "kta-tbl-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = `
      <div class="kta-readme-modal-boite" style="max-width:560px; width:auto; height:auto; max-height:90vh;">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">${window.I18n.t("tabledit.modal.titre")}</span>
          <button class="kta-panneau-close" id="kta-tbl-close-accueil">✕</button>
        </div>
        <div class="kta-readme-modal-corps">
          <div id="kta-tbl-accueil-err" class="kta-conv-erreur" style="display:${errMsg ? "block" : "none"}; margin-bottom:12px;">${errMsg ? _escapeHtml(errMsg) : ""}</div>
          <div class="kta-tbl-sources">
            ${planDispo ? `<button class="kta-tbl-source-card" id="kta-tbl-src-plan">
              <span class="kta-tbl-source-ico">🗺️</span>
              <span class="kta-tbl-source-txt">
                <span class="kta-tbl-source-titre">${window.I18n.t("tabledit.source.planCourant")}</span>
                <span class="kta-tbl-source-hint">${window.I18n.t("tabledit.source.planCourantHint")}</span>
              </span>
            </button>` : ""}
            <button class="kta-tbl-source-card" id="kta-tbl-src-zip">
              <span class="kta-tbl-source-ico">📦</span>
              <span class="kta-tbl-source-txt">
                <span class="kta-tbl-source-titre">${window.I18n.t("tabledit.source.zip")}</span>
                <span class="kta-tbl-source-hint">${window.I18n.t("tabledit.source.zipHint")}</span>
              </span>
            </button>
            <button class="kta-tbl-source-card" id="kta-tbl-src-json">
              <span class="kta-tbl-source-ico">📄</span>
              <span class="kta-tbl-source-txt">
                <span class="kta-tbl-source-titre">${window.I18n.t("tabledit.source.json")}</span>
                <span class="kta-tbl-source-hint">${window.I18n.t("tabledit.source.jsonHint")}</span>
              </span>
            </button>
            <!-- 🔗 v1.69.0 (allègement du HOME, demande KARMA) : « Fusionner des
                 datalayers » quitte l'accueil et rejoint les sources de l'éditeur
                 de données — c'est la même famille d'usage (manipuler des calques
                 JSON hors carte), et ça retire une icône de la home. -->
            <button class="kta-tbl-source-card" id="kta-tbl-src-fusion">
              <span class="kta-tbl-source-ico">🔗</span>
              <span class="kta-tbl-source-txt">
                <span class="kta-tbl-source-titre">${_sansIcone(window.I18n.t("tabledit.source.fusion"))}</span>
                <span class="kta-tbl-source-hint">${window.I18n.t("tabledit.source.fusionHint")}</span>
              </span>
            </button>
            <!-- 🔄 15/10/2026 (KARMA) : la Conversion session ↔ calques de données quitte la barre
                 d'onglets de l'export et vit ici, comme la Fusion (modale d'export en solo). -->
            <button class="kta-tbl-source-card" id="kta-tbl-src-conv">
              <span class="kta-tbl-source-ico">🔄</span>
              <span class="kta-tbl-source-txt">
                <span class="kta-tbl-source-titre">${_sansIcone(window.I18n.t("tabledit.source.conv"))}</span>
                <span class="kta-tbl-source-hint">${window.I18n.t("tabledit.source.convAide")}</span>
              </span>
            </button>
            <!-- 🔁 v1.76.2 (demande KARMA) : la conversion de résolution est
                 AUSSI une carte de cet accueil — clic → import JSON classique,
                 puis la dialog de conversion s'ouvre toute seule sur le
                 tableau (flag _resolAutoOpen consommé à l'ouverture). -->
            <button class="kta-tbl-source-card" id="kta-tbl-src-resol">
              <span class="kta-tbl-source-ico">🔁</span>
              <span class="kta-tbl-source-txt">
                <span class="kta-tbl-source-titre">${_sansIcone(window.I18n.t("tabledit.source.resol"))}</span>
                <span class="kta-tbl-source-hint">${window.I18n.t("tabledit.source.resolHint")}</span>
              </span>
            </button>
            <!-- 🧹 v1.77.0 (demande KARMA, suite au bug clic-carte multiplié) :
                 nettoyage des sommets dupliqués accumulés dans les fichiers. -->
            <button class="kta-tbl-source-card" id="kta-tbl-src-dedup">
              <span class="kta-tbl-source-ico">🧹</span>
              <span class="kta-tbl-source-txt">
                <span class="kta-tbl-source-titre">${_sansIcone(window.I18n.t("tabledit.source.dedup"))}</span>
                <span class="kta-tbl-source-hint">${window.I18n.t("tabledit.source.dedupHint")}</span>
              </span>
            </button>
          </div>
          <input type="file" id="kta-tbl-zip-input" accept=".zip,application/zip" style="display:none;">
        </div>
      </div>
    `;
    document.documentElement.appendChild(modal);
    _modal = modal;

    var fermer = function() { if (_modal) { _modal.remove(); _modal = null; } };
    document.getElementById("kta-tbl-close-accueil").addEventListener("click", fermer);
    modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });
    if (planDispo) document.getElementById("kta-tbl-src-plan").addEventListener("click", _listerDatalayersPlanCourant);
    document.getElementById("kta-tbl-src-json").addEventListener("click", _afficherImport);
    document.getElementById("kta-tbl-src-resol").addEventListener("click", _ouvrirConvertResolution);
    document.getElementById("kta-tbl-src-dedup").addEventListener("click", _ouvrirDedup);
    // Fusion et conversion : onglets de la modale d'export de session, ouverts en solo.
    document.getElementById("kta-tbl-src-fusion").addEventListener("click", function() {
      fermer();
      if (typeof window.ouvrirExportSessionModal === "function") {
        window.ouvrirExportSessionModal("fusion", true);
      } else {
        console.warn("[TableEditor] ouvrirExportSessionModal indisponible");
      }
    });
    document.getElementById("kta-tbl-src-conv").addEventListener("click", function() {
      fermer();
      if (typeof window.ouvrirExportSessionModal === "function") {
        window.ouvrirExportSessionModal("conversion", true);
      } else {
        console.warn("[TableEditor] ouvrirExportSessionModal indisponible");
      }
    });
    var zipInput = document.getElementById("kta-tbl-zip-input");
    document.getElementById("kta-tbl-src-zip").addEventListener("click", function() { zipInput.click(); });
    zipInput.addEventListener("change", function() { if (zipInput.files[0]) _traiterZipImporte(zipInput.files[0]); });
  }

  function _afficherChargement(msg) {
    if (_modal) { _modal.remove(); _modal = null; }
    var modal = document.createElement("div");
    modal.id = "kta-tbl-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = '<div class="kta-readme-modal-boite" style="max-width:420px; height:auto;">'
      + '<div class="kta-readme-modal-corps" style="padding:30px; text-align:center; color:var(--kta-texte-2);">'
      + '<div style="font-size:28px;">⏳</div><div style="margin-top:10px;">' + _escapeHtml(msg || "") + '</div>'
      + '</div></div>';
    document.documentElement.appendChild(modal);
    _modal = modal;
  }

  function _listerDatalayersPlanCourant() {
    var config = window.PLAN_CONFIG;
    if (!config || !Array.isArray(config.dataLayers) || !config.dataLayers.length) {
      _afficherAccueil(window.I18n.t("tabledit.err.planVide")); return;
    }
    _afficherChargement(window.I18n.t("tabledit.source.planCourant"));
    // `lc.file` est déjà une URL (config.js > getRuntimeAssetUrl) ; relu sans toucher à la carte.
    var jobs = config.dataLayers.map(function(lc) {
      return fetch(lc.file)
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(obj) { return { lc: lc, obj: obj }; })
        .catch(function() { return { lc: lc, obj: null }; });
    });
    Promise.all(jobs).then(function(results) {
      var entries = [];
      results.forEach(function(res) {
        if (res.obj) {
          var fname = (res.lc.id || "calque") + ".json";
          _collecterEntreesEditables(res.obj, res.lc.label || res.lc.id || fname, fname, entries);
        }
      });
      if (!entries.length) { _afficherAccueil(window.I18n.t("tabledit.err.planVide")); return; }
      var titre = "🗺️ " + ((config.plan && config.plan.name) ? config.plan.name : window.I18n.t("tabledit.source.planCourant"));
      _afficherSelecteurCalque(entries, titre);
    });
  }

  function _traiterZipImporte(file) {
    if (typeof JSZip === "undefined") { _afficherAccueil(window.I18n.t("tabledit.err.zipInvalide")); return; }
    _afficherChargement(window.I18n.t("tabledit.source.zip"));
    JSZip.loadAsync(file).then(function(zip) {
      var cfgMatches = zip.file(/(?:^|\/)plan-config\.json$/i);
      if (!cfgMatches || !cfgMatches.length) { var e = new Error("zipSansConfig"); e.code = "zipSansConfig"; throw e; }
      return cfgMatches[0].async("string").then(function(txt) {
        var config = JSON.parse(txt);
        var layers = Array.isArray(config.dataLayers) ? config.dataLayers : [];
        var jobs = layers.map(function(lc) {
          var f = null;
          if (lc.file) {
            f = zip.file(lc.file);
            if (!f) { var m = zip.file(new RegExp(_escapeRegex(_basename(lc.file)) + "$")); f = (m && m[0]) || null; }
          }
          if (!f) return Promise.resolve({ lc: lc, obj: null });
          return f.async("string").then(function(t) {
            try { return { lc: lc, obj: JSON.parse(t) }; } catch (e) { return { lc: lc, obj: null }; }
          });
        });
        return Promise.all(jobs);
      });
    }).then(function(results) {
      var entries = [];
      results.forEach(function(res) {
        if (res.obj) _collecterEntreesEditables(res.obj, res.lc.label || res.lc.id || _basename(res.lc.file), _basename(res.lc.file), entries);
      });
      if (!entries.length) { _afficherAccueil(window.I18n.t("tabledit.err.zipVide")); return; }
      _afficherSelecteurCalque(entries, "📦 " + (file.name || "ZIP"));
    }).catch(function(err) {
      console.error("[TableEditor] Import ZIP :", err);
      var key = (err && err.code) ? ("tabledit.err." + err.code) : "tabledit.err.zipInvalide";
      _afficherAccueil(window.I18n.t(key));
    });
  }

  function _afficherSelecteurCalque(entries, titre) {
    if (_modal) { _modal.remove(); _modal = null; }
    var rows = entries.map(function(e, i) {
      var noun = window.I18n.t("tabledit.kind." + e.kind);
      return '<button class="kta-tbl-entry" data-i="' + i + '">'
        + '<span class="kta-tbl-entry-ico">' + e.emoji + '</span>'
        + '<span class="kta-tbl-entry-label">' + _escapeHtml(e.label || noun) + '</span>'
        + '<span class="kta-tbl-entry-count">' + e.count + ' ' + _escapeHtml(noun) + '</span>'
        + '</button>';
    }).join("");
    var modal = document.createElement("div");
    modal.id = "kta-tbl-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = `
      <div class="kta-readme-modal-boite" style="max-width:560px; width:auto; height:auto; max-height:90vh;">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">${_escapeHtml(titre || window.I18n.t("tabledit.selecteur.titre"))}</span>
          <button class="kta-panneau-close" id="kta-tbl-sel-close">✕</button>
        </div>
        <div class="kta-readme-modal-corps">
          <p style="font-size:13px; color:var(--kta-texte-3); margin:0 0 12px; line-height:1.5;">${window.I18n.t("tabledit.selecteur.aide")}</p>
          <div class="kta-tbl-entries">${rows}</div>
          <div class="kta-conv-actions" style="margin-top:14px;">
            <button class="kta-btn kta-btn-ghost" id="kta-tbl-sel-retour">${window.I18n.t("tabledit.selecteur.retour")}</button>
          </div>
        </div>
      </div>
    `;
    document.documentElement.appendChild(modal);
    _modal = modal;
    var fermer = function() { if (_modal) { _modal.remove(); _modal = null; } };
    document.getElementById("kta-tbl-sel-close").addEventListener("click", fermer);
    document.getElementById("kta-tbl-sel-retour").addEventListener("click", function() { _afficherAccueil(); });
    modal.addEventListener("click", function(ev) { if (ev.target === modal) fermer(); });
    modal.querySelectorAll(".kta-tbl-entry").forEach(function(btn) {
      btn.addEventListener("click", function() { _chargerEntree(entries[parseInt(btn.dataset.i, 10)]); });
    });
  }

  function _chargerEntree(entry) {
    _sourceObj  = entry.sourceObj;
    _kind       = entry.kind;
    _format     = (entry.kind === "editorPoints") ? "editorPoints" : entry.kind; // alias interne
    _data       = (entry.sourceObj[entry.kind] || []).map(function(p) { return Object.assign({}, p); });
    _origines   = new WeakMap();
    _data.forEach(function(p) { _origines.set(p, JSON.parse(JSON.stringify(p))); });
    _sourceMeta = { fileName: entry.fileName || (entry.kind + ".json") };
    _modifie    = false;
    _selection  = new Set();
    _tri        = { col: null, asc: true };
    _filtre     = "";
    _colonnes   = _detecterColonnes(_data);
    _afficherTableau();
  }

  function _afficherImport() {
    // 🩸 L'accueil est retiré : resté dessous, il survivait au tableau et réapparaissait à sa fermeture.
    if (_modal) { _modal.remove(); _modal = null; }
    const modal = document.createElement("div");
    modal.id = "kta-tbl-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = `
      <div class="kta-readme-modal-boite" style="max-width:520px; width:auto; height:auto; max-height:90vh;">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">${window.I18n.t("tabledit.modal.titre")}</span>
          <button class="kta-panneau-close" id="kta-tbl-close-import">✕</button>
        </div>
        <div class="kta-readme-modal-corps">
          <div class="kta-tbl-drop" id="kta-tbl-drop">
            <div style="font-size:32px; opacity:0.6;">📂</div>
            <div style="margin-top:8px;">${window.I18n.t("tabledit.import.drop.titre")}</div>
            <div style="font-size:11px; opacity:0.6; margin-top:4px;">${window.I18n.t("tabledit.import.drop.sous")}</div>
            <input type="file" id="kta-tbl-file" accept=".json,application/json" style="display:none;">
          </div>

          <div id="kta-tbl-import-erreur" class="kta-conv-erreur" style="display:none;"></div>

          <div class="kta-conv-actions" style="margin-top:14px;">
            <button class="kta-btn kta-btn-ghost" id="kta-tbl-annuler-import">${window.I18n.t("tabledit.selecteur.retour")}</button>
          </div>
        </div>
      </div>
    `;
    document.documentElement.appendChild(modal);
    _modal = modal;

    const drop = document.getElementById("kta-tbl-drop");
    const fileInput = document.getElementById("kta-tbl-file");

    drop.addEventListener("click", function() { fileInput.click(); });
    fileInput.addEventListener("change", function() {
      if (fileInput.files[0]) _chargerFichier(fileInput.files[0]);
    });
    drop.addEventListener("dragover", function(e) { e.preventDefault(); drop.classList.add("dragover"); });
    drop.addEventListener("dragleave", function() { drop.classList.remove("dragover"); });
    drop.addEventListener("drop", function(e) {
      e.preventDefault(); drop.classList.remove("dragover");
      const f = e.dataTransfer.files[0];
      if (f && f.name.toLowerCase().endsWith(".json")) _chargerFichier(f);
      else _setErreurImport(window.I18n.t("tabledit.import.err.extension"));
    });

    const fermer = function() { if (_modal) { _modal.remove(); _modal = null; } };
    document.getElementById("kta-tbl-close-import").addEventListener("click", fermer);
    document.getElementById("kta-tbl-annuler-import").addEventListener("click", function() { _afficherAccueil(); });
    modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });
  }

  function _setErreurImport(msg) {
    const el = document.getElementById("kta-tbl-import-erreur");
    if (!el) return;
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }

  function _chargerFichier(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const json = JSON.parse(e.target.result);
        // Plusieurs tableaux éditables (une session) → sélecteur ; un seul → tableau direct.
        const entries = [];
        _collecterEntreesEditables(json, _basename(file.name), file.name, entries);
        if (!entries.length) throw new Error(window.I18n.t("tabledit.import.err.noData"));
        if (entries.length === 1) _chargerEntree(entries[0]);
        else _afficherSelecteurCalque(entries, "📄 " + file.name);
      } catch(err) {
        console.error(err);
        _setErreurImport("❌ " + (err.message || err));
      }
    };
    reader.readAsText(file);
  }

  // ── Tableau ──────────────────────────────
  function _detecterColonnes(data) {
    const set = new Set();
    data.forEach(function(p) {
      Object.keys(p).forEach(function(k) { set.add(k); });
    });
    // 🩸 L'identité n'est pas éditable : une cellule `uid` permettrait de casser l'identité d'un objet.
    set.delete("uid");
    set.delete("updatedAt");
    if (_niveauxPlan()) set.add("level");   // multi-niveau : toujours là, même sans aucun `level` (0 par défaut)
    // Ordre des clés courantes (level à côté de x/y) ; les autres suivent en queue.
    const ordreCourant = ["id", "type", "nom", "x", "y", "level", "tags", "etat", "description", "points", "profondeur", "date_update"];
    const ordonnees = [];
    ordreCourant.forEach(function(k) { if (set.has(k)) { ordonnees.push(k); set.delete(k); } });
    set.forEach(function(k) { ordonnees.push(k); });
    return ordonnees;
  }

  function _afficherTableau() {
    if (_modal) _modal.remove();
    const modal = document.createElement("div");
    modal.id = "kta-tbl-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = `
      <div class="kta-readme-modal-boite">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">${window.I18n.t("tabledit.editor.titre", { fichier: _escapeHtml(_sourceMeta.fileName) })}</span>
          <button class="kta-panneau-close" id="kta-tbl-close">✕</button>
        </div>
        <div class="kta-readme-modal-corps">

          <div class="kta-tbl-info" id="kta-tbl-info"></div>

          <div class="kta-tbl-toolbar">
            <input type="text" class="kta-cfg-input" id="kta-tbl-search" placeholder="${_escapeAttr(window.I18n.t("tabledit.editor.recherche"))}">
            ${_estPoints() ? `<button class="kta-btn kta-btn-ghost" id="kta-tbl-add">${window.I18n.t("tabledit.editor.ajouterLigne")}</button>
            <button class="kta-btn kta-btn-ghost" id="kta-tbl-preview">${window.I18n.t("tabledit.editor.voirCarte")}</button>` : ""}
          </div>

          ${_estPoints() ? "" : `<div class="kta-tbl-gen-note">${window.I18n.t("tabledit.geom.lecture")}</div>`}

          <div id="kta-tbl-warn-big-wrap"></div>

          <div class="kta-tbl-wrap">
            <table class="kta-tbl" id="kta-tbl-table">
              <thead></thead>
              <tbody></tbody>
            </table>
          </div>

          <div class="kta-tbl-footer">
            <div class="kta-tbl-selection-info" id="kta-tbl-selection-info">${window.I18n.t("tabledit.selection.zero")}</div>
            <div style="display:flex; gap:8px;">
              <button class="kta-btn kta-btn-ghost"   id="kta-tbl-duplicate" disabled>${window.I18n.t("tabledit.editor.dupliquer")}</button>
              <button class="kta-btn kta-btn-danger"  id="kta-tbl-delete"    disabled>${window.I18n.t("tabledit.editor.supprimer")}</button>
            </div>
          </div>

          <div class="kta-conv-actions" style="border-top:1px solid var(--kta-bordure); padding-top:12px;">
            <button class="kta-btn kta-btn-ghost"   id="kta-tbl-annuler">${window.I18n.t("tabledit.editor.annuler")}</button>
            <button class="kta-btn kta-btn-primary" id="kta-tbl-save">${window.I18n.t("tabledit.editor.sauvegarder")}</button>
          </div>
        </div>
      </div>
    `;
    document.documentElement.appendChild(modal);
    _modal = modal;

    _construireEntete();
    _construireCorps();
    _miseAJourInfos();

    document.getElementById("kta-tbl-close").addEventListener("click", _tenterFermer);
    document.getElementById("kta-tbl-annuler").addEventListener("click", _tenterFermer);
    modal.addEventListener("click", function(e) { if (e.target === modal) _tenterFermer(); });

    document.getElementById("kta-tbl-search").addEventListener("input", function(e) {
      if (_filtreTimer) clearTimeout(_filtreTimer);
      _filtreTimer = setTimeout(function() {
        _filtre = e.target.value.trim().toLowerCase();
        _construireCorps();
        _miseAJourInfos();
      }, 200);
    });

    var _btnAdd = document.getElementById("kta-tbl-add");
    if (_btnAdd) _btnAdd.addEventListener("click", _ajouterLigne);
    var _btnPrev = document.getElementById("kta-tbl-preview");
    if (_btnPrev) _btnPrev.addEventListener("click", _apercuCarte);
    document.getElementById("kta-tbl-delete").addEventListener("click", _supprimerSelection);
    document.getElementById("kta-tbl-duplicate").addEventListener("click", _dupliquerSelection);
    document.getElementById("kta-tbl-save").addEventListener("click", _menuSauvegarde);
  }

  function _construireEntete() {
    const thead = _modal.querySelector("thead");
    let html = "<tr>";
    html += '<th class="col-check"><input type="checkbox" id="kta-tbl-check-all"></th>';
    _colonnes.forEach(function(col) {
      let arrow = "";
      if (_tri.col === col) arrow = ' <span class="tri-arrow">' + (_tri.asc ? "▲" : "▼") + '</span>';
      html += '<th data-col="' + _escapeAttr(col) + '">' + _escapeHtml(col) + arrow + '</th>';
    });
    html += "</tr>";
    thead.innerHTML = html;

    thead.querySelectorAll("th[data-col]").forEach(function(th) {
      th.addEventListener("click", function() { _trierColonne(th.dataset.col); });
    });
    document.getElementById("kta-tbl-check-all").addEventListener("change", function(e) {
      const visibles = _indexVisibles();
      if (e.target.checked) visibles.forEach(function(i) { _selection.add(i); });
      else                  visibles.forEach(function(i) { _selection.delete(i); });
      _construireCorps();
      _miseAJourInfos();
    });
  }

  function _construireCorps() {
    const tbody = _modal.querySelector("tbody");
    const config = window.PLAN_CONFIG;
    const imgW = config?.plan?.imageWidth  || 0;
    const imgH = config?.plan?.imageHeight || 0;
    const typesConnus = _typesConnus();
    const niveauxPlan = _niveauxPlan();

    const warnWrap = document.getElementById("kta-tbl-warn-big-wrap");
    if (warnWrap) {
      if (_data.length > 1000) {
        warnWrap.innerHTML = '<div class="kta-tbl-warn-big">' + window.I18n.t("tabledit.warn.gros", { n: _data.length }) + '</div>';
      } else {
        warnWrap.innerHTML = "";
      }
    }

    let indices = _data.map(function(_, i) { return i; });
    if (_tri.col) {
      indices.sort(function(a, b) {
        const va = _valTri(_data[a], _tri.col);
        const vb = _valTri(_data[b], _tri.col);
        let cmp = 0;
        if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
        else cmp = String(va || "").localeCompare(String(vb || ""));
        return _tri.asc ? cmp : -cmp;
      });
    }

    if (_filtre) {
      indices = indices.filter(function(i) {
        const p = _data[i];
        return _colonnes.some(function(c) {
          const v = p[c];
          if (Array.isArray(v)) return v.join(",").toLowerCase().includes(_filtre);
          return String(v || "").toLowerCase().includes(_filtre);
        });
      });
    }

    let html = "";
    indices.forEach(function(idx) {
      const p = _data[idx];
      const isSel = _selection.has(idx);
      html += '<tr data-idx="' + idx + '"' + (isSel ? ' class="kta-tbl-selected"' : '') + '>';
      html += '<td class="col-check"><input type="checkbox" data-row-check="' + idx + '"' + (isSel ? " checked" : "") + '></td>';
      _colonnes.forEach(function(col) {
        const v = p[col];
        const ro = (col === "id" || col === "points" || (col === "level" && _sansNiveau(p)));
        let cls = "";
        if (ro) cls += "col-readonly";
        const typeInconnu = (col === "type" && typesConnus.length > 0 && v != null && v !== "" &&
                             typesConnus.indexOf(v) < 0);
        if (typeInconnu) cls += (cls ? " " : "") + "col-error";

        if (col === "x" && imgW && (v < 0 || v > imgW)) cls += (cls ? " " : "") + "col-error";
        if (col === "y" && imgH && (v < 0 || v > imgH)) cls += (cls ? " " : "") + "col-error";

        let contenu;
        if (col === "tags") {
          contenu = _renderTagsCellule(idx, v);
        } else if (col === "points") {
          contenu = window.I18n.t("tabledit.col.points", { n: Array.isArray(v) ? v.length : 0 });
        } else if (col === "level" && niveauxPlan && !_sansNiveau(p) && (v == null || Number.isInteger(v))) {
          contenu = _escapeHtml(window.ktaFormatNiveau(Number.isInteger(v) ? v : 0));
        } else if (Array.isArray(v)) {
          contenu = _escapeHtml(v.join(", "));
        } else if (v === undefined || v === null) {
          contenu = '<span style="opacity:0.4;">—</span>';
        } else {
          contenu = _escapeHtml(String(v));
        }

        const tooltip = (col === "x" && cls.includes("col-error")) ? ' title="' + _escapeAttr(window.I18n.t("tabledit.hors.x", { max: imgW })) + '"' :
                        (col === "y" && cls.includes("col-error")) ? ' title="' + _escapeAttr(window.I18n.t("tabledit.hors.y", { max: imgH })) + '"' :
                        typeInconnu ? ' title="' + _escapeAttr(window.I18n.t("tabledit.type.inconnu")) + '"' : "";

        html += '<td class="' + cls + '" data-col="' + _escapeAttr(col) + '" data-idx="' + idx + '"' + tooltip + '>' + contenu + '</td>';
      });
      html += "</tr>";
    });
    tbody.innerHTML = html;

    tbody.querySelectorAll("input[data-row-check]").forEach(function(cb) {
      cb.addEventListener("click", function(e) {
        const idx = parseInt(cb.dataset.rowCheck);

        if (e.shiftKey && _lastSelectedIdx !== null) {
          const visibles = _indexVisibles();
          const i1 = visibles.indexOf(_lastSelectedIdx);
          const i2 = visibles.indexOf(idx);
          if (i1 >= 0 && i2 >= 0) {
            const start = Math.min(i1, i2);
            const end   = Math.max(i1, i2);
            const target = cb.checked;
            for (let i = start; i <= end; i++) {
              if (target) _selection.add(visibles[i]);
              else        _selection.delete(visibles[i]);
            }
            _construireCorps();
            _miseAJourInfos();
            return;
          }
        }

        if (cb.checked) _selection.add(idx);
        else            _selection.delete(idx);
        _lastSelectedIdx = idx;
        _miseAJourInfos();
        const tr = cb.closest("tr");
        if (tr) tr.classList.toggle("kta-tbl-selected", cb.checked);
      });
    });

    tbody.querySelectorAll("td[data-col]").forEach(function(td) {
      td.addEventListener("click", function(e) {
        if (e.target.closest("input")) return;
        const col = td.dataset.col;
        if (col === "id" || col === "points") return; // lecture seule (id + géométrie)
        if (col === "level" && _sansNiveau(_data[parseInt(td.dataset.idx)])) return;
        if (col === "tags") {
          const removeBtn = e.target.closest("[data-tag-remove]");
          if (removeBtn) {
            const idx = parseInt(td.dataset.idx);
            const tagIdx = parseInt(removeBtn.dataset.tagRemove);
            _data[idx].tags = (_data[idx].tags || []).filter(function(_, i) { return i !== tagIdx; });
            _toucher(_data[idx]);
            _modifie = true;
            _construireCorps();
            _miseAJourInfos();
            return;
          }
          _afficherDropdownTags(td, parseInt(td.dataset.idx));
          return;
        }
        if (td.classList.contains("editing")) return;
        _editerCellule(td);
      });
    });
  }

  // ── Édition ──────────────────────────────
  function _editerCellule(td) {
    const idx = parseInt(td.dataset.idx);
    const col = td.dataset.col;
    const p = _data[idx];
    const valOrig = p[col];

    if (col === "level" && _niveauxPlan()) { _editerNiveau(td, idx); return; }
    const htmlOrig = td.innerHTML;
    td.classList.add("editing");

    const isNum = (col === "x" || col === "y" || col === "profondeur" || col === "level");
    const input = document.createElement("input");
    input.type = isNum ? "number" : "text";
    input.value = valOrig === undefined || valOrig === null ? "" : valOrig;
    if (isNum && col !== "profondeur") input.step = "1";

    // 🩸 Colonne `type` : une faute de frappe crée un objet orphelin, rendu en couleur de repli. Saisie libre
    // (un fichier téléchargé peut porter un type à venir) : une <datalist> propose les types valides (canon +
    // légende), un type hors liste passe la cellule en rouge et « Appliquer à la session » le REFUSE.
    let _typesValides = null;
    let _dlTypes = null;
    if (col === "type" && !_estPoints()) {
      const cat = _catTypes();
      _typesValides = _typesConnus();
      if (_typesValides.length) {
        _dlTypes = document.createElement("datalist");
        _dlTypes.id = "kta-te-types-" + cat;
        _typesValides.forEach(function(t) {
          const opt = document.createElement("option");
          opt.value = t;
          _dlTypes.appendChild(opt);
        });
        input.setAttribute("list", _dlTypes.id);
      }
    }

    td.innerHTML = "";
    // ⚠️ la datalist doit être (re)posée APRÈS le innerHTML="" qui vide la cellule
    if (_dlTypes) td.appendChild(_dlTypes);
    td.appendChild(input);
    input.focus();
    input.select();

    function valider() {
      // 🩸 Le re-rendu retire l'input, ce qui déclenche son blur : sans ce retrait, valider repart dans valider.
      input.removeEventListener("blur", valider);
      let nouvelle = input.value;
      if (isNum) {
        nouvelle = nouvelle === "" ? undefined : Number(nouvelle);
        if (isNaN(nouvelle)) nouvelle = undefined;
      } else {
        nouvelle = nouvelle === "" ? "" : nouvelle;
      }
      if (nouvelle !== valOrig) {
        p[col] = nouvelle;
        _toucher(p);
        _modifie = true;
        if (_typesValides && _typesValides.length && nouvelle &&
            _typesValides.indexOf(nouvelle) === -1) {
          console.warn("[TableEditor] type « " + nouvelle + " » inconnu de la légende — " +
                       "l'objet sera rendu en couleur de repli (cf. bandeau ⚠️ de ≡ Légende).");
        }
      }
      td.classList.remove("editing");
      _construireCorps();
      _miseAJourInfos();
    }

    function annuler() {
      td.classList.remove("editing");
      td.innerHTML = htmlOrig;
    }

    input.addEventListener("blur", valider);
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        valider();
        _focusVoisin(idx, col, "down");
      } else if (e.key === "Escape") {
        e.preventDefault();
        input.removeEventListener("blur", valider);
        annuler();
      } else if (e.key === "Tab") {
        e.preventDefault();
        valider();
        _focusVoisin(idx, col, e.shiftKey ? "left" : "right");
      }
    });
  }

  // Cellule « level » d'un plan multi-niveau : une liste, jamais une saisie libre.
  function _editerNiveau(td, idx) {
    const p = _data[idx];
    const actuel = Number.isInteger(p.level) ? p.level : 0;
    const sel = document.createElement("select");
    sel.setAttribute("aria-label", window.I18n.t("niveauObjet.label"));
    (_niveauxProposes(actuel) || [actuel]).forEach(function(n) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = window.I18n.t("niveauObjet.option", { n: window.ktaFormatNiveau(n) });
      if (n === actuel) opt.selected = true;
      sel.appendChild(opt);
    });
    td.classList.add("editing");
    td.innerHTML = "";
    td.appendChild(sel);
    sel.focus();
    let fini = false;
    function terminer(garder) {
      if (fini) return;
      fini = true;
      const n = parseInt(sel.value, 10);
      if (garder && Number.isInteger(n) && n !== actuel) {
        p.level = n;
        _toucher(p);
        _modifie = true;
      }
      td.classList.remove("editing");
      _construireCorps();
      _miseAJourInfos();
    }
    sel.addEventListener("change", function() { terminer(true); });
    sel.addEventListener("blur", function() { terminer(true); });
    sel.addEventListener("keydown", function(e) {
      if (e.key === "Escape") { e.preventDefault(); terminer(false); }
      else if (e.key === "Enter") { e.preventDefault(); terminer(true); _focusVoisin(idx, "level", "down"); }
      else if (e.key === "Tab") {
        e.preventDefault();
        terminer(true);
        _focusVoisin(idx, "level", e.shiftKey ? "left" : "right");
      }
    });
  }

  function _focusVoisin(idx, col, direction) {
    const visibles = _indexVisibles();
    const posLigne = visibles.indexOf(idx);
    const posCol = _colonnes.indexOf(col);
    let nIdx = idx, nCol = col;

    if (direction === "down" && posLigne < visibles.length - 1) nIdx = visibles[posLigne + 1];
    if (direction === "up"   && posLigne > 0)                   nIdx = visibles[posLigne - 1];
    if (direction === "right" && posCol < _colonnes.length - 1) nCol = _colonnes[posCol + 1];
    if (direction === "left"  && posCol > 0)                    nCol = _colonnes[posCol - 1];

    // "id" est en lecture seule : sauté.
    if (nCol === "id" && (direction === "right" || direction === "left")) {
      const newPos = direction === "right" ? _colonnes.indexOf(nCol) + 1 : _colonnes.indexOf(nCol) - 1;
      if (newPos >= 0 && newPos < _colonnes.length) nCol = _colonnes[newPos];
    }

    setTimeout(function() {
      const tdNext = _modal.querySelector('td[data-idx="' + nIdx + '"][data-col="' + _escapeAttr(nCol) + '"]');
      if (tdNext && nCol !== "id" && nCol !== "tags") _editerCellule(tdNext);
    }, 50);
  }

  // ── Étiquettes ──────────────────────────────
  function _renderTagsCellule(idx, tags) {
    if (!Array.isArray(tags)) tags = [];
    let html = "";
    tags.forEach(function(t, i) {
      html += '<span class="kta-tag-chip">' + _escapeHtml(t) +
              '<span class="kta-tag-chip-x" data-tag-remove="' + i + '" data-row="' + idx + '">×</span></span>';
    });
    html += '<span class="kta-tag-add" data-tag-add="' + idx + '">' + _escapeHtml(window.I18n.t("tabledit.tags.add")) + '</span>';
    return html;
  }

  function _afficherDropdownTags(anchor, idx) {
    const prev = document.getElementById("kta-tag-dd");
    if (prev) prev.remove();

    const config = window.PLAN_CONFIG || {};
    const icons = config.icons || {};
    const exclu = ["default", "track"];

    // Proposés : tags des icônes + tags déjà utilisés dans _data.
    const tagsExistants = new Set();
    Object.keys(icons).forEach(function(t) { if (!exclu.includes(t)) tagsExistants.add(t); });
    _data.forEach(function(p) {
      if (Array.isArray(p.tags)) p.tags.forEach(function(t) { tagsExistants.add(t); });
    });

    const tagsActifs = _data[idx].tags || [];

    const dd = document.createElement("div");
    dd.id = "kta-tag-dd";
    dd.className = "kta-tag-dropdown";

    let html = "";
    [...tagsExistants].sort(function(a, b) { return String(a).localeCompare(String(b)); }).forEach(function(t) {
      const isSelected = tagsActifs.includes(t);
      const iconUrl = icons[t];
      html += '<div class="kta-tag-option' + (isSelected ? " selected" : "") + '" data-tag="' + _escapeAttr(t) + '">';
      if (iconUrl) html += '<img src="' + _escapeAttr(iconUrl) + '">';
      else html += '<div style="width:22px; height:22px;"></div>';
      html += '<span>' + _escapeHtml(t) + '</span>';
      if (isSelected) html += '<span class="check">✓</span>';
      html += '</div>';
    });

    html += '<div class="kta-tag-create"><input type="text" id="kta-tag-new" placeholder="' + _escapeAttr(window.I18n.t("tabledit.tags.creer")) + '"></div>';
    dd.innerHTML = html;
    document.body.appendChild(dd);

    const rect = anchor.getBoundingClientRect();
    dd.style.left = rect.left + "px";
    dd.style.top  = (rect.bottom + 4) + "px";
    // 🩸 Liste gardée dans la zone visible (`visualViewport`, sinon innerWidth/innerHeight). En paysage
    // téléphone, ni dessous ni dessus ne logent ses 280 px : côté le plus spacieux, hauteur bornée
    // (défilement interne), `top` jamais au-dessus de l'écran.
    setTimeout(function() {
      const vv    = window.visualViewport || null;
      const vTop  = vv ? vv.offsetTop : 0;
      const vLeft = vv ? vv.offsetLeft : 0;
      const vH    = vv ? vv.height : window.innerHeight;
      const vW    = vv ? vv.width  : window.innerWidth;
      const MARGE = 8;
      const ddRect = dd.getBoundingClientRect();
      if (ddRect.right > vLeft + vW - MARGE) {
        dd.style.left = Math.max(vLeft + MARGE, vLeft + vW - ddRect.width - MARGE) + "px";
      }
      if (ddRect.bottom > vTop + vH - MARGE) {
        const placeDessous = (vTop + vH - MARGE) - (rect.bottom + 4);
        const placeDessus  = (rect.top - 4) - (vTop + MARGE);
        dd.style.boxSizing = "border-box";   // maxHeight = hauteur totale (padding + bordure compris)
        if (placeDessus > placeDessous) {
          const h = Math.min(ddRect.height, placeDessus);
          dd.style.maxHeight = h + "px";
          dd.style.top = Math.max(vTop + MARGE, rect.top - 4 - h) + "px";
        } else {
          const h = Math.min(ddRect.height, Math.max(80, placeDessous), vH - 2 * MARGE);
          dd.style.maxHeight = h + "px";
          dd.style.top = Math.max(vTop + MARGE, Math.min(rect.bottom + 4, vTop + vH - MARGE - h)) + "px";
        }
      }
    }, 0);

    dd.querySelectorAll("[data-tag]").forEach(function(opt) {
      opt.addEventListener("click", function() {
        const t = opt.dataset.tag;
        const tags = _data[idx].tags || [];
        const i = tags.indexOf(t);
        if (i >= 0) tags.splice(i, 1);
        else        tags.push(t);
        _data[idx].tags = tags;
        _toucher(_data[idx]);
        _modifie = true;
        _construireCorps();
        _miseAJourInfos();
        _afficherDropdownTags(_modal.querySelector('td[data-idx="' + idx + '"][data-col="tags"]'), idx);
      });
    });

    const newInput = document.getElementById("kta-tag-new");
    newInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        const t = newInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
        if (!t) return;
        const tags = _data[idx].tags || [];
        if (!tags.includes(t)) tags.push(t);
        _data[idx].tags = tags;
        _toucher(_data[idx]);
        _modifie = true;
        dd.remove();
        _construireCorps();
        _miseAJourInfos();
      } else if (e.key === "Escape") {
        dd.remove();
      }
    });

    setTimeout(function() {
      function onClicExt(e) {
        if (!dd.contains(e.target) && !anchor.contains(e.target)) {
          dd.remove();
          document.removeEventListener("click", onClicExt);
        }
      }
      document.addEventListener("click", onClicExt);
    }, 0);
  }

  function _trierColonne(col) {
    if (col === "tags") return; // tags pas triables
    if (_tri.col === col) {
      if (_tri.asc) _tri.asc = false;
      else _tri = { col: null, asc: true };
    } else {
      _tri = { col: col, asc: true };
    }
    _construireEntete();
    _construireCorps();
  }

  // ── Lignes ──────────────────────────────
  function _ajouterLigne() {
    const nouv = {};
    _colonnes.forEach(function(c) {
      if (c === "x" || c === "y" || c === "profondeur") nouv[c] = 0;
      else if (c === "tags") nouv[c] = [];
      else if (c === "level") {   // 🩸 jamais "" : un niveau est un entier (niveau actif, sinon 0)
        const a = window.APP_CONFIG && window.APP_CONFIG.activeLevel;
        nouv[c] = Number.isInteger(a) ? a : 0;
      }
      else nouv[c] = "";
    });
    if ("id" in nouv) nouv.id = "";
    if (window.KtaUid) window.KtaUid.touch(window.KtaUid.ensure(nouv, _prefixeUid()));
    _data.push(nouv);
    _modifie = true;
    _construireCorps();
    _miseAJourInfos();
    const wrap = _modal.querySelector(".kta-tbl-wrap");
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  async function _supprimerSelection() {
    if (_selection.size === 0) return;
    const n = _selection.size;
    if (!(await window.ktaConfirm(window.I18n.t("tabledit.confirm.supprimer", { n: n })))) return;
    const indices = [..._selection].sort(function(a, b) { return b - a; });
    indices.forEach(function(i) { _data.splice(i, 1); });
    _selection.clear();
    _modifie = true;
    _construireCorps();
    _miseAJourInfos();
  }

  function _dupliquerSelection() {
    if (_selection.size === 0) return;
    const indices = [..._selection].sort(function(a, b) { return a - b; });
    indices.forEach(function(i) {
      // 🩸 Uid NEUF : une copie JSON partagerait l'identité, et la fusion « le plus récent gagne » en
      // perdrait un.
      const copie = window.KtaUid ? window.KtaUid.cloneNeuf(_data[i], _prefixeUid())
                                  : JSON.parse(JSON.stringify(_data[i]));
      if (copie.id) copie.id = String(copie.id) + "_copie";
      _data.push(copie);
    });
    _selection.clear();
    _modifie = true;
    _construireCorps();
    _miseAJourInfos();
  }

  // ── Aperçu sur la carte ──────────────────────────────
  function _apercuCarte() {
    if (_selection.size === 0) {
      window.ktaAlerte(window.I18n.t("tabledit.preview.err.aucuneLigne"));
      return;
    }
    if (!window.map || !APP_CONFIG) {
      window.ktaAlerte(window.I18n.t("tabledit.preview.err.carteIndispo"), { type: "erreur" });
      return;
    }

    const points = [..._selection].map(function(i) { return _data[i]; })
      .filter(function(p) { return typeof p.x === "number" && typeof p.y === "number"; });
    if (points.length === 0) {
      window.ktaAlerte(window.I18n.t("tabledit.preview.err.coordsInvalides"));
      return;
    }

    // Masquée, pas supprimée : le bandeau de retour la réaffiche.
    _modal.style.display = "none";

    const tempLayer = L.layerGroup();
    points.forEach(function(p) {
      const m = L.circleMarker([APP_CONFIG.imageHeight - p.y, p.x], {
        radius: 14,
        color: "#ff8800",
        fillColor: "#ffaa00",
        fillOpacity: 0.5,
        weight: 3,
        className: "kta-tbl-pulse"
      });
      m.bindTooltip(p.nom || p.id || "?", { permanent: true, direction: "top" });
      tempLayer.addLayer(m);
    });
    tempLayer.addTo(window.map);

    const bounds = L.latLngBounds(points.map(function(p) {
      return [APP_CONFIG.imageHeight - p.y, p.x];
    }));
    window.map.fitBounds(bounds.pad(0.2));

    const banner = document.createElement("div");
    banner.id = "kta-tbl-preview-banner";
    banner.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.92); color:#fff; padding:12px 20px; border-radius:8px; font-size:14px; z-index:9999; box-shadow:0 4px 16px rgba(0,0,0,0.5); border:1px solid rgba(140,180,255,0.5); display:flex; gap:12px; align-items:center;";
    banner.innerHTML = `
      <span>${window.I18n.t("tabledit.preview.banner", { n: points.length })}</span>
      <button class="kta-btn kta-btn-primary" id="kta-tbl-preview-back" style="padding:6px 14px;">${window.I18n.t("tabledit.preview.retour")}</button>
    `;
    document.body.appendChild(banner);

    document.getElementById("kta-tbl-preview-back").addEventListener("click", function() {
      window.map.removeLayer(tempLayer);
      banner.remove();
      _modal.style.display = "";
    });
  }

  function _miseAJourInfos() {
    const infoEl = document.getElementById("kta-tbl-info");
    if (!infoEl) return;

    const config = window.PLAN_CONFIG;
    const imgW = config?.plan?.imageWidth  || 0;
    const imgH = config?.plan?.imageHeight || 0;
    let nbHorsLimite = 0;
    _data.forEach(function(p) {
      if (typeof p.x === "number" && imgW && (p.x < 0 || p.x > imgW)) nbHorsLimite++;
      else if (typeof p.y === "number" && imgH && (p.y < 0 || p.y > imgH)) nbHorsLimite++;
    });

    let html = window.I18n.t("tabledit.info.lignes", { n: _data.length });
    if (_filtre) {
      const visibles = _indexVisibles().length;
      html += window.I18n.t("tabledit.info.filtrees", { n: visibles });
    }
    if (nbHorsLimite > 0) {
      html += window.I18n.t("tabledit.info.horsPlan", { n: nbHorsLimite });
    }
    if (_modifie) html += window.I18n.t("tabledit.info.nonSauve");

    infoEl.innerHTML = html;

    const selEl = document.getElementById("kta-tbl-selection-info");
    if (selEl) {
      selEl.textContent = _selection.size === 0
        ? window.I18n.t("tabledit.selection.zero")
        : window.I18n.t(_selection.size > 1 ? "tabledit.selection.plusieurs" : "tabledit.selection.un", { n: _selection.size });
    }
    document.getElementById("kta-tbl-delete").disabled    = _selection.size === 0;
    document.getElementById("kta-tbl-duplicate").disabled = _selection.size === 0;
  }

  function _indexVisibles() {
    let indices = _data.map(function(_, i) { return i; });
    if (_tri.col) {
      indices.sort(function(a, b) {
        const va = _valTri(_data[a], _tri.col);
        const vb = _valTri(_data[b], _tri.col);
        let cmp = 0;
        if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
        else cmp = String(va || "").localeCompare(String(vb || ""));
        return _tri.asc ? cmp : -cmp;
      });
    }
    if (_filtre) {
      indices = indices.filter(function(i) {
        const p = _data[i];
        return _colonnes.some(function(c) {
          const v = p[c];
          if (Array.isArray(v)) return v.join(",").toLowerCase().includes(_filtre);
          return String(v || "").toLowerCase().includes(_filtre);
        });
      });
    }
    return indices;
  }

  function _escapeHtml(s) { return window.ktaEsc(s); }
  function _escapeAttr(s) { return window.ktaEsc(s); }

  // ── Fermeture et sauvegarde ──────────────────────────────
  function _tenterFermer() {
    if (!_modifie) {
      _modal.remove();
      _modal = null;
      return;
    }
    _confirmerSortie();
  }

  function _confirmerSortie() {
    const overlay = document.createElement("div");
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100001"; // au-dessus de .kta-readme-modal-overlay (z-index 99999)
    overlay.innerHTML = `
      <div class="kta-readme-modal-boite" style="max-width:420px; height:auto;">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">${window.I18n.t("tabledit.sortie.titre")}</span>
        </div>
        <div class="kta-readme-modal-corps">
          <p style="font-size:14px; color:var(--kta-texte-2); margin:0 0 16px; line-height:1.5;">
            ${window.I18n.t("tabledit.sortie.texte")}
          </p>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="kta-btn kta-btn-primary" id="conf-save">${window.I18n.t("tabledit.sortie.sauver")}</button>
            <button class="kta-btn kta-btn-danger"  id="conf-quit">${window.I18n.t("tabledit.sortie.quitter")}</button>
            <button class="kta-btn kta-btn-ghost"   id="conf-stay">${window.I18n.t("tabledit.sortie.continuer")}</button>
          </div>
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlay);

    document.getElementById("conf-save").addEventListener("click", function() {
      overlay.remove();
      _menuSauvegarde();
    });
    document.getElementById("conf-quit").addEventListener("click", function() {
      overlay.remove();
      _modal.remove();
      _modal = null;
    });
    document.getElementById("conf-stay").addEventListener("click", function() {
      overlay.remove();
    });
  }

  // ⚠️ Calques de données : export seulement (repasser par le Générateur) (décision produit). Seul un fichier de
  // SESSION s'applique en direct : points remplacés, tracés / zones / structures appliqués.
  function _menuSauvegarde() {
    const estSession = _estSession();

    const overlay = document.createElement("div");
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100001"; // au-dessus de .kta-readme-modal-overlay (z-index 99999)
    overlay.innerHTML = `
      <div class="kta-readme-modal-boite" style="max-width:480px; height:auto;">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">${window.I18n.t("tabledit.save.titre")}</span>
          <button class="kta-panneau-close" id="save-close">✕</button>
        </div>
        <div class="kta-readme-modal-corps">
          <p style="font-size:13px; color:var(--kta-texte-3); margin:0 0 14px; line-height:1.5;">
            ${window.I18n.t("tabledit.save.aide")}
          </p>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="kta-btn kta-btn-primary" id="save-dl">
              ${window.I18n.t("tabledit.save.telecharger")}
            </button>
            ${estSession ? `<button class="kta-btn kta-btn-ghost" id="save-session">${window.I18n.t("tabledit.save.appliquer")}</button>` : ""}
          </div>
          ${estSession ? "" : `<div class="kta-tbl-gen-note">${window.I18n.t("tabledit.save.datalayerNote")}</div>`}
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlay);

    document.getElementById("save-close").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });

    document.getElementById("save-dl").addEventListener("click", function() {
      _telecharger();
      _modifie = false;
      _miseAJourInfos();
      overlay.remove();
    });

    if (estSession) {
      document.getElementById("save-session").addEventListener("click", function() {
        overlay.remove();
        _appliquerSession().then(function(fait) {
          if (!fait) return;   // refus ou confirmation annulée : le tableau garde ses modifications
          _modifie = false;
          _miseAJourInfos();
        });
      });
    }
  }

  function _telecharger() {
    const obj = _construireObjetSortie();
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = _sourceMeta.fileName || (_kind || "data") + ".json";
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }

  // ⚠️ Objet source COMPLET, seul le tableau édité (_kind) est remplacé : aucun autre champ perdu.
  function _construireObjetSortie() {
    var base = (_sourceObj && typeof _sourceObj === "object") ? _sourceObj : {};
    var obj;
    try { obj = JSON.parse(JSON.stringify(base)); } catch (e) { obj = {}; }
    obj[_kind] = _data;
    return obj;
  }

  // Plan affiché partagé par une extension → { remplacer } ; sinon null (plan local : ni droit ni confirmation).
  function _partage() {
    if (typeof window.ktaPlanAffiche === "function" && !window.ktaPlanAffiche()) return null;
    const K = window.KtaExtensions;
    return (K && typeof K.importPartage === "function") ? K.importPartage(window._currentLoadedPlanId) : null;
  }

  function _origineDe(ligne) { return _origines.get(ligne) || null; }

  // Ligne fautive sélectionnée et amenée à l'écran : son numéro suit l'ordre du fichier, pas le tri affiché.
  function _montrerLigne(idx) {
    if (!_modal || !_data[idx]) return;
    _selection = new Set([idx]);
    _construireCorps();
    _miseAJourInfos();
    const tr = _modal.querySelector('tr[data-idx="' + idx + '"]');
    if (tr && tr.scrollIntoView) tr.scrollIntoView({ block: "center" });
  }

  // Un tableau d'un fichier de session → la session (KtaConvertir.appliquerTableau, points compris : seules les cellules
  // modifiées, type et niveau par les chemins de la fiche, une entrée ⏪). Un type inconnu, ou incompatible avec
  // l'objet, est REFUSÉ ici (le téléchargement garde la saisie libre). Plan partagé : retirer des objets exige
  // `remplacer` de la prise (relu au clic, sinon refus nommé), puis une confirmation chiffrée.
  // → Promise<bool> : true si la session a été modifiée (ou l'était déjà).
  function _appliquerSession() {
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return Promise.resolve(false);   // 🔒 lecture seule
    const KC = window.KtaConvertir;
    const planAffiche = (typeof window.ktaPlanAffiche === "function") ? window.ktaPlanAffiche() : true;
    if (!planAffiche || !KC || typeof KC.appliquerTableau !== "function") {
      window.ktaAlerte(window.I18n.t("tabledit.save.err.sessionIndispo"), { type: "erreur" });
      return Promise.resolve(false);
    }
    if (window.KtaUid) window.KtaUid.ensureAll(_data, _prefixeUid());
    // Points : la liste est fournie ici (KtaConvertir ne la nomme pas) ; ⚠️ setEditorPoints garde l'objet ENTIER.
    const famille = _estPoints() ? "points" : _kind;
    const acces = _estPoints() ? { lire: window.getEditorPoints, ecrire: window.setEditorPoints, categorie: "editorPoints" } : null;
    const options = function(o) { return Object.assign({ origine: _origineDe, acces: acces }, o || {}); };
    const sim = KC.appliquerTableau(famille, _data, options({ simuler: true }));
    if (!sim) return Promise.resolve(false);
    if (sim.erreur) {
      _montrerLigne(sim.erreur.ligne - 1);
      window.ktaAlerte(window.I18n.t("tabledit.apply." + sim.erreur.code,
        { ligne: sim.erreur.ligne, type: sim.erreur.type }), { type: "erreur" });
      return Promise.resolve(false);
    }
    const objets = window.I18n.t("tabledit.kind." + (_estPoints() ? "data" : _kind));
    const appliquer = function() {
      // Fiche des photos : points d'AVANT puis d'après (qui l'emportent) ; un point retiré garde la fiche de son
      // dernier état, ses photos restent « sans point ».
      const avantPts = _estPoints() ? JSON.parse(JSON.stringify(window.getEditorPoints() || [])) : null;
      const b = KC.appliquerTableau(famille, _data, options());   // recalculé : la synchro a pu passer pendant la question
      if (!b || b.erreur) return false;
      if (avantPts && (b.modifies + b.ajoutes + b.supprimes) && window.MyKTAMapPhotos &&
          window.MyKTAMapPhotos.majFichesPoints && window._currentLoadedPlanId) {
        window.MyKTAMapPhotos.majFichesPoints(window._currentLoadedPlanId, avantPts.concat(window.getEditorPoints() || []));
      }
      const msgOk = ((b.modifies + b.ajoutes + b.supprimes)
        ? window.I18n.t("tabledit.save.appliqueOk", b) : window.I18n.t("tabledit.save.rienAAppliquer")) +
        (b.ignores ? " " + window.I18n.t("tabledit.save.ignorees", { n: b.ignores }) : "");
      if (window.OOMGuard && window.OOMGuard.showToast) window.OOMGuard.showToast(msgOk, "success", { important: true });
      else window.ktaAlerte(msgOk);
      return true;
    };
    const partage = window.KtaUid ? _partage() : null;
    if (!partage || !sim.supprimes) return Promise.resolve(appliquer());
    // 🔒 Supprimer pour tous : permission relue maintenant (prise `importSession`, erreur = refus).
    if (!partage.remplacer) {
      window.ktaAlerte(window.I18n.t("tabledit.save.partage.refusObjets", { n: sim.supprimes, objets: objets }),
        { type: "erreur" });
      return Promise.resolve(false);
    }
    return window.ktaConfirm(window.I18n.t("tabledit.save.partage.confirmObjets", { n: sim.supprimes, objets: objets }), {
      titre: window.I18n.t("tabledit.save.partage.titreAppliquer"),
      okLabel: window.I18n.t("tabledit.save.partage.okAppliquer"), zIndex: 100003
    }).then(function(ok) { return ok ? appliquer() : false; });
  }

  // ── Convertir la résolution ──────────────────────────────
  // Migre des données d'un scan vers un autre. Trois modes : homothétie (résolutions), recalage sur
  // UNE paire de points (+ rotation du Nord), ou DEUX paires (échelle et rotation déduites, comme le
  // géoref 2 points). Tous remplissent une affine M = {a,b,c,d,e,f} : x' = a·x + b·y + e ; y' = c·x + d·y + f.

  function _matriceHomothetie(kX, kY) {
    return { a: kX, b: 0, c: 0, d: kY, e: 0, f: 0 };
  }

  // « 1 paire » : échelle + rotation θ (degrés, HORAIRE à l'écran comme northOffsetDeg), ancreA → ancreB
  // exactement. ⚠️ Repère image (y vers le bas) : [cos −sin ; sin cos] tourne dans le sens horaire visuel.
  function _matriceRecalage(kX, kY, thetaDeg, ancreA, ancreB) {
    if (!ancreA || !ancreB) return null;
    const t = ((Number(thetaDeg) || 0) * Math.PI) / 180;
    const co = Math.cos(t), si = Math.sin(t);
    const a = kX * co, b = -kY * si, c = kX * si, d = kY * co;
    return { a: a, b: b, c: c, d: d,
             e: ancreB.x - (a * ancreA.x + b * ancreA.y),
             f: ancreB.y - (c * ancreA.x + d * ancreA.y) };
  }

  // « 2 paires » : échelle UNIFORME et rotation déduites de A1→A2 et B1→B2, translation sur la paire 1.
  // null si une base fait moins de 10 px (transformation dégénérée).
  function _matriceDeuxPaires(A1, B1, A2, B2) {
    const dxA = A2.x - A1.x, dyA = A2.y - A1.y;
    const dxB = B2.x - B1.x, dyB = B2.y - B1.y;
    const lenA = Math.hypot(dxA, dyA), lenB = Math.hypot(dxB, dyB);
    if (lenA < 10 || lenB < 10) return null;
    const s = lenB / lenA;
    const theta = Math.atan2(dyB, dxB) - Math.atan2(dyA, dxA);
    const co = Math.cos(theta), si = Math.sin(theta);
    const a = s * co, b = -s * si, c = s * si, d = s * co;
    return { a: a, b: b, c: c, d: d,
             e: B1.x - (a * A1.x + b * A1.y),
             f: B1.y - (c * A1.x + d * A1.y),
             _s: s, _thetaDeg: theta * 180 / Math.PI };
  }

  // ⚠️ Fonction PURE, extraite et exécutée par check-resolution-convert.js : applique M à tous les champs
  // de coordonnées (docs/architecture/data-formats.md) et compte par tableau.
  function _transformerCoordsFichier(obj, M) {
    const compte = {};
    if (!obj || typeof obj !== "object" || !M) return compte;
    const r2 = function(v) { return Math.round(v * 100) / 100; };  // centipixel : assez fin, JSON propre
    const pt = function(p) {
      if (p && typeof p.x === "number" && typeof p.y === "number") {
        const x = p.x, y = p.y;
        p.x = r2(M.a * x + M.b * y + M.e);
        p.y = r2(M.c * x + M.d * y + M.f);
        return 1;
      }
      return 0;
    };
    ["data", "editorPoints"].forEach(function(k) {
      if (!Array.isArray(obj[k])) return;
      compte[k] = obj[k].reduce(function(n, row) { return n + pt(row); }, 0);
    });
    ["roads", "zones", "structures"].forEach(function(k) {
      if (!Array.isArray(obj[k])) return;
      compte[k] = 0;
      obj[k].forEach(function(g) {
        if (g && Array.isArray(g.points)) compte[k] += g.points.reduce(function(n, p) { return n + pt(p); }, 0);
      });
    });
    // 🩸 measure a DEUX formes : calque `{points:[…]}`, session `[…]`. measureSurface : tableau direct.
    ["measure", "measureSurface"].forEach(function(k) {
      const m = obj[k];
      if (!m) return;
      const arr = Array.isArray(m) ? m : (Array.isArray(m.points) ? m.points : null);
      if (arr) compte[k] = arr.reduce(function(n, p) { return n + pt(p); }, 0);
    });
    return compte;
  }

  // ── Dédoublonnage ──────────────────────────────
  // Fonction PURE : retire les sommets IDENTIQUES CONSÉCUTIFS (x, y, level) des géométries et mesures
  // (invisibles, ils gonflent sessions et exports). Les POI ne sont pas touchés (superposition légitime).
  // ⚠️ Un objet n'est supprimé QUE si le nettoyage l'a réduit sous son minimum (ligne < 2, polygone < 3) :
  // un objet déjà petit sans doublon reste (structure custom à 2 sommets).
  function _dedupliquerFichier(obj) {
    const bilan = { sommets: 0, objets: 0 };
    if (!obj || typeof obj !== "object") return bilan;
    const memes = function(a, b) {
      return a && b && a.x === b.x && a.y === b.y
        && (a.level === b.level || (a.level == null && b.level == null));
    };
    const nettoyer = function(points) {
      if (!Array.isArray(points) || points.length < 2) return points;
      const out = [points[0]];
      for (let i = 1; i < points.length; i++) {
        if (memes(points[i], out[out.length - 1])) { bilan.sommets++; continue; }
        out.push(points[i]);
      }
      return out;
    };
    ["roads", "zones", "structures"].forEach(function(k) {
      if (!Array.isArray(obj[k])) return;
      obj[k] = obj[k].filter(function(g) {
        if (!g || !Array.isArray(g.points)) return true;
        const avant = g.points.length;
        g.points = nettoyer(g.points);
        if (g.points.length === avant) return true;   // rien retiré → jamais supprimé
        const estLigne = (k === "roads")
          || (k === "structures" && !(typeof g.type === "string"
              && (g.type === "pilier-1" || g.type === "pilier-2" || g.type === "mur")));
        const min = (k === "zones") ? 3 : (estLigne ? 2 : 3);
        if (g.points.length < min) { bilan.objets++; return false; }
        return true;
      });
    });
    // Mêmes deux formes de mesure que dans _transformerCoordsFichier.
    ["measure", "measureSurface"].forEach(function(k) {
      const m = obj[k];
      if (!m) return;
      if (Array.isArray(m)) obj[k] = nettoyer(m);
      else if (Array.isArray(m.points)) m.points = nettoyer(m.points);
    });
    return bilan;
  }

  function _ouvrirDedup() {
    const t = function(k, p) { return window.I18n.t(k, p); };
    const sub = document.createElement("div");
    // 🩸 kta-readme-modal-overlay, PAS "kta-readme-modal" (classe inexistante → modale invisible).
    sub.className = "kta-readme-modal-overlay";
    sub.style.zIndex = "100001";
    sub.innerHTML = `
      <div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:90vh;">
        <div class="kta-readme-modal-entete">
          <span class="kta-readme-modal-titre">🧹 ${t("tabledit.dedup.titre")}</span>
          <button class="kta-panneau-close" id="kta-tbl-dedup-close">✕</button>
        </div>
        <div class="kta-readme-modal-corps" style="font-size:13px;">
          <p style="color:var(--kta-texte-3); margin:0 0 10px; line-height:1.5; font-size:11.5px;">ℹ️ ${t("tabledit.dedup.note")}</p>
          <div class="kta-cfg-label" style="font-weight:600;">${t("tabledit.dedup.fichiers")}</div>
          <label class="kta-btn kta-btn-ghost kta-btn-small" style="margin:4px 0; display:inline-block;">📄 ${t("tabledit.dedup.choisirFichiers")}
            <input type="file" id="kta-tbl-dedup-files" accept=".json,application/json" multiple style="display:none;">
          </label>
          <div id="kta-tbl-dedup-files-liste" style="font-size:12px; color:var(--kta-texte-2); margin:2px 0 6px;">${t("tabledit.dedup.aucunFichier")}</div>
          <div class="kta-conv-actions" style="margin-top:12px;">
            <button class="kta-btn kta-btn-ghost"   id="kta-tbl-dedup-annuler">${t("tabledit.editor.annuler")}</button>
            <button class="kta-btn kta-btn-primary" id="kta-tbl-dedup-go" disabled>🧹 ${t("tabledit.dedup.nettoyer")}</button>
          </div>
        </div>
      </div>`;
    document.documentElement.appendChild(sub);
    const $ = function(id) { return document.getElementById(id); };
    const fermer = function() { sub.remove(); };
    $("kta-tbl-dedup-close").addEventListener("click", fermer);
    $("kta-tbl-dedup-annuler").addEventListener("click", fermer);
    sub.addEventListener("click", function(e) { if (e.target === sub) fermer(); });

    let fichiers = [];
    $("kta-tbl-dedup-files").addEventListener("change", function(e) {
      fichiers = Array.prototype.slice.call(e.target.files || []);
      $("kta-tbl-dedup-files-liste").textContent = fichiers.length
        ? fichiers.map(function(f) { return f.name; }).join(" · ")
        : t("tabledit.dedup.aucunFichier");
      $("kta-tbl-dedup-go").disabled = !fichiers.length;
    });

    // Chaque fichier modifié est retéléchargé « <nom>_dedup.json » ; un fichier illisible n'arrête pas le lot.
    $("kta-tbl-dedup-go").addEventListener("click", function() {
      if (!fichiers.length) return;
      const bilans = [], echecs = [];
      let ok = 0, restants = fichiers.length;
      fichiers.forEach(function(f) {
        f.text().then(function(txt) {
          const obj = JSON.parse(txt);
          const b = _dedupliquerFichier(obj);
          if (b.sommets === 0 && b.objets === 0) {
            bilans.push(f.name + " → " + t("tabledit.dedup.propre"));
            return;
          }
          const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = f.name.replace(/\.json$/i, "") + "_dedup.json";
          a.click();
          setTimeout(function() { URL.revokeObjectURL(url); }, 4000);
          ok++;
          bilans.push(f.name + " → " + t("tabledit.dedup.bilan", {
            sommets: b.sommets,
            objets: b.objets ? t("tabledit.dedup.bilanObjets", { n: b.objets }) : ""
          }));
        }).catch(function() {
          echecs.push(f.name + " (" + t("tabledit.dedup.errLecture") + ")");
        }).finally(function() {
          restants--;
          if (restants === 0) {
            let msg = t("tabledit.dedup.okMulti", { ok: ok, detail: bilans.join("\n") || "—" });
            if (echecs.length) msg += "\n\n⚠️ " + t("tabledit.dedup.echecs", { n: echecs.length }) + "\n" + echecs.join("\n");
            window.ktaAlerte(msg).then(function() { if (ok) fermer(); });   // bilan lu avant la fermeture
          }
        });
      });
    });
  }

  function _ouvrirConvertResolution() {
    const w0 = (window.APP_CONFIG && window.APP_CONFIG.imageWidth)  || "";
    const h0 = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || "";
    const sub = document.createElement("div");
    // 🩸 Même piège de classe que ci-dessus.
    sub.className = "kta-readme-modal-overlay";
    sub.style.zIndex = "100001";
    const champRes = function(id, w, h, hint) {
      return `<div class="kta-planner-grille" style="margin:4px 0 2px;">
          <label class="kta-cfg-label" for="${id}_w">${window.I18n.t("tabledit.resol.largeur")}</label>
          <input class="kta-cfg-input" id="${id}_w" type="number" min="1" step="1" value="${w}">
          <label class="kta-cfg-label" for="${id}_h">${window.I18n.t("tabledit.resol.hauteur")}</label>
          <input class="kta-cfg-input" id="${id}_h" type="number" min="1" step="1" value="${h}">
        </div>
        <label class="kta-btn kta-btn-ghost kta-btn-small" style="margin:2px 0 8px; display:inline-block;">📷 ${window.I18n.t("tabledit.resol.depuisImage")}
          <input type="file" id="${id}_img" accept="image/*" style="display:none;">
        </label>
        ${hint ? `<span class="kta-planner-hint" style="font-size:11px; color:var(--kta-texte-3);">${hint}</span>` : ""}`;
    };
    // Paire de correspondance : xA,yA (plan source) → xB,yB (plan destination)
    const champPaire = function(id, titre, hint) {
      return `<div class="kta-cfg-label" style="margin-top:8px;">${titre}</div>
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; margin:4px 0 2px;">
          <input class="kta-cfg-input" id="${id}_xa" type="number" step="any" placeholder="xA">
          <input class="kta-cfg-input" id="${id}_ya" type="number" step="any" placeholder="yA">
          <input class="kta-cfg-input" id="${id}_xb" type="number" step="any" placeholder="xB">
          <input class="kta-cfg-input" id="${id}_yb" type="number" step="any" placeholder="yB">
        </div>
        ${hint ? `<span class="kta-planner-hint" style="font-size:11px; color:var(--kta-texte-3);">${hint}</span>` : ""}`;
    };
    sub.innerHTML = `
      <div class="kta-readme-modal-boite" style="max-width:500px; height:auto; max-height:90vh;">
        <div class="kta-readme-modal-entete">
          <span class="kta-readme-modal-titre">🔁 ${window.I18n.t("tabledit.resol.titre")}</span>
          <button class="kta-panneau-close" id="kta-tbl-resol-close">✕</button>
        </div>
        <div class="kta-readme-modal-corps" style="font-size:13px;">
          <p style="color:var(--kta-texte-3); margin:0 0 8px; line-height:1.5;">${window.I18n.t("tabledit.resol.intro")}</p>
          <p style="color:var(--kta-texte-3); margin:0 0 10px; line-height:1.5; font-size:11.5px;">ℹ️ ${window.I18n.t("tabledit.resol.nonTransforme")}</p>
          <div class="kta-cfg-label" style="font-weight:600;">${window.I18n.t("tabledit.resol.source")}</div>
          ${champRes("kta-tbl-resol-src", "", "", "")}
          <div class="kta-cfg-label" style="font-weight:600; margin-top:10px;">${window.I18n.t("tabledit.resol.dest")}</div>
          ${champRes("kta-tbl-resol-dst", w0, h0, "")}

          <div class="kta-cfg-label" style="font-weight:600; margin-top:12px;">🎯 ${window.I18n.t("tabledit.resol.recalTitre")}</div>
          <p style="color:var(--kta-texte-3); margin:2px 0 4px; line-height:1.45; font-size:11.5px;">${window.I18n.t("tabledit.resol.recalIntro")}</p>
          ${champPaire("kta-tbl-resol-p1", window.I18n.t("tabledit.resol.paire1"), "")}
          <div class="kta-planner-grille" style="margin:8px 0 2px;">
            <label class="kta-cfg-label" for="kta-tbl-resol-theta">${window.I18n.t("tabledit.resol.rotation")}</label>
            <input class="kta-cfg-input" id="kta-tbl-resol-theta" type="number" step="any" value="0">
          </div>
          <span class="kta-planner-hint" style="font-size:11px; color:var(--kta-texte-3);">${window.I18n.t("tabledit.resol.rotationHint")}</span>
          ${champPaire("kta-tbl-resol-p2", window.I18n.t("tabledit.resol.paire2"), window.I18n.t("tabledit.resol.paire2Hint"))}

          <div class="kta-cfg-label" style="font-weight:600; margin-top:12px;">${window.I18n.t("tabledit.resol.fichiers")}</div>
          <label class="kta-btn kta-btn-ghost kta-btn-small" style="margin:4px 0; display:inline-block;">📄 ${window.I18n.t("tabledit.resol.choisirFichiers")}
            <input type="file" id="kta-tbl-resol-files" accept=".json,application/json" multiple style="display:none;">
          </label>
          <div id="kta-tbl-resol-files-liste" style="font-size:12px; color:var(--kta-texte-2); margin:2px 0 6px;">${window.I18n.t("tabledit.resol.aucunFichier")}</div>
          <div id="kta-tbl-resol-recap" style="background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px; margin-top:6px; font-family:'Courier New',monospace; font-size:12px; min-height:36px;">—</div>
          <div id="kta-tbl-resol-warn" style="display:none; border:1px solid rgba(255,120,80,0.5); background:rgba(255,120,80,0.08); border-radius:6px; padding:8px 10px; margin-top:8px; font-size:12px;"></div>
          <div class="kta-conv-actions" style="margin-top:12px;">
            <button class="kta-btn kta-btn-ghost"   id="kta-tbl-resol-annuler">${window.I18n.t("tabledit.editor.annuler")}</button>
            <button class="kta-btn kta-btn-primary" id="kta-tbl-resol-go" disabled>${window.I18n.t("tabledit.resol.appliquer")}</button>
          </div>
        </div>
      </div>`;
    document.documentElement.appendChild(sub);
    const $ = function(id) { return document.getElementById(id); };
    const fermer = function() { sub.remove(); };
    $("kta-tbl-resol-close").addEventListener("click", fermer);
    $("kta-tbl-resol-annuler").addEventListener("click", fermer);
    sub.addEventListener("click", function(e) { if (e.target === sub) fermer(); });

    // Dimensions lues dans l'en-tête binaire d'une image (32 Ko suffisent).
    ["src", "dst"].forEach(function(cote) {
      $("kta-tbl-resol-" + cote + "_img").addEventListener("change", function(e) {
        const f = e.target.files && e.target.files[0];
        if (!f || typeof window.ktaLireDimensionsEntete !== "function") return;
        f.slice(0, 1048576).arrayBuffer().then(function(buf) {
          const dm = window.ktaLireDimensionsEntete(buf);
          if (dm && dm.width > 0) {
            $("kta-tbl-resol-" + cote + "_w").value = dm.width;
            $("kta-tbl-resol-" + cote + "_h").value = dm.height;
            recap();
          } else {
            window.ktaAlerte(window.I18n.t("tabledit.resol.errImage", { nom: f.name }), { type: "erreur" });
          }
        });
      });
    });

    let fichiers = [];
    $("kta-tbl-resol-files").addEventListener("change", function(e) {
      fichiers = Array.prototype.slice.call(e.target.files || []);
      $("kta-tbl-resol-files-liste").textContent = fichiers.length
        ? fichiers.map(function(f) { return f.name; }).join(" · ")
        : window.I18n.t("tabledit.resol.aucunFichier");
      recap();
    });

    function lireRes() {
      const v = function(id) { const x = parseInt($(id).value, 10); return (Number.isFinite(x) && x > 0) ? x : null; };
      return { wA: v("kta-tbl-resol-src_w"), hA: v("kta-tbl-resol-src_h"),
               wB: v("kta-tbl-resol-dst_w"), hB: v("kta-tbl-resol-dst_h") };
    }
    // Une paire : null = vide, {invalid:true} = partielle (refus), sinon {A,B}
    function lirePaire(id) {
      const v = function(sfx) { const x = parseFloat($(id + "_" + sfx).value); return Number.isFinite(x) ? x : null; };
      const xa = v("xa"), ya = v("ya"), xb = v("xb"), yb = v("yb");
      const remplis = [xa, ya, xb, yb].filter(function(x) { return x !== null; }).length;
      if (remplis === 0) return null;
      if (remplis < 4) return { invalid: true };
      return { A: { x: xa, y: ya }, B: { x: xb, y: yb } };
    }

    // Construit la matrice selon le mode. Rend { M, mode, warn } ou { err }.
    function construireMatrice() {
      const r = lireRes();
      const p1 = lirePaire("kta-tbl-resol-p1");
      const p2 = lirePaire("kta-tbl-resol-p2");
      if ((p1 && p1.invalid) || (p2 && p2.invalid)) return { err: window.I18n.t("tabledit.resol.errPaire") };
      if (p2 && !p1) return { err: window.I18n.t("tabledit.resol.errPaire2Seule") };
      if (p1 && p2) {
        // Mode 2 paires : tout est déduit. Résolutions = contre-contrôle.
        const M = _matriceDeuxPaires(p1.A, p1.B, p2.A, p2.B);
        if (!M) return { err: window.I18n.t("tabledit.resol.errDegenere") };
        let warn = null;
        if (r.wA && r.wB) {
          const kRes = r.wB / r.wA;
          const ecart = Math.abs(M._s - kRes) / Math.max(M._s, kRes);
          if (ecart > 0.02) warn = window.I18n.t("tabledit.resol.warnEchelle2p", { deduit: M._s.toFixed(4), res: kRes.toFixed(4) });
        }
        return { M: M, mode: "2p", warn: warn };
      }
      if (!r.wA || !r.hA || !r.wB || !r.hB) return { err: null };   // pas encore prêt (pas une erreur à afficher)
      const kX = r.wB / r.wA, kY = r.hB / r.hA;
      let warn = null;
      const ecartAspect = Math.abs(kX - kY) / Math.max(kX, kY);
      if (ecartAspect > 0.02) warn = window.I18n.t("tabledit.resol.warnAspect", { pct: (ecartAspect * 100).toFixed(1) });
      if (p1) {
        const theta = parseFloat($("kta-tbl-resol-theta").value) || 0;
        return { M: _matriceRecalage(kX, kY, theta, p1.A, p1.B), mode: "1p", warn: warn, kX: kX, kY: kY, theta: theta };
      }
      return { M: _matriceHomothetie(kX, kY), mode: "homo", warn: warn, kX: kX, kY: kY };
    }

    function recap() {
      const recapEl = $("kta-tbl-resol-recap"), warnEl = $("kta-tbl-resol-warn"), go = $("kta-tbl-resol-go");
      const res = construireMatrice();
      warnEl.style.display = "none";
      if (res.err !== undefined && res.err !== null) {
        recapEl.textContent = "—";
        warnEl.style.display = ""; warnEl.innerHTML = "⚠️ " + res.err;
        go.disabled = true; return;
      }
      if (!res.M) { recapEl.textContent = "—"; go.disabled = true; return; }
      let html = "";
      if (res.mode === "homo") {
        html = window.I18n.t("tabledit.resol.modeHomo") + "<br>kX = <strong>" + res.kX.toFixed(4) + "</strong> · kY = <strong>" + res.kY.toFixed(4) + "</strong>";
      } else if (res.mode === "1p") {
        html = window.I18n.t("tabledit.resol.mode1p") + "<br>kX = <strong>" + res.kX.toFixed(4) + "</strong> · kY = <strong>" + res.kY.toFixed(4) + "</strong> · θ = <strong>" + res.theta + "°</strong>";
      } else {
        html = window.I18n.t("tabledit.resol.mode2p") + "<br>" + window.I18n.t("tabledit.resol.echelle") + " = <strong>" + res.M._s.toFixed(4) + "</strong> · θ = <strong>" + res.M._thetaDeg.toFixed(2) + "°</strong>";
      }
      if (fichiers.length) html += "<br>" + window.I18n.t("tabledit.resol.nbFichiers", { n: fichiers.length });
      recapEl.innerHTML = html;
      if (res.warn) { warnEl.style.display = ""; warnEl.innerHTML = "⚠️ " + res.warn; }
      go.disabled = !fichiers.length;
    }
    ["src_w", "src_h", "dst_w", "dst_h", "theta",
     "p1_xa", "p1_ya", "p1_xb", "p1_yb", "p2_xa", "p2_ya", "p2_xb", "p2_yb"].forEach(function(sfx) {
      const el = $("kta-tbl-resol-" + sfx);
      if (el) el.addEventListener("input", recap);
    });
    recap();

    // Chaque fichier est retéléchargé « <nom>_conv.json » ; un fichier illisible n'arrête pas le lot.
    $("kta-tbl-resol-go").addEventListener("click", function() {
      const res = construireMatrice();
      if (!res.M || !fichiers.length) return;   // refus, pas de clamp
      const bilans = [], echecs = [];
      let restants = fichiers.length;
      fichiers.forEach(function(f) {
        f.text().then(function(txt) {
          const obj = JSON.parse(txt);
          const compte = _transformerCoordsFichier(obj, res.M);
          const total = Object.keys(compte).reduce(function(acc, k) { return acc + compte[k]; }, 0);
          if (!total) { echecs.push(f.name + " (" + window.I18n.t("tabledit.resol.aucuneCoord") + ")"); return; }
          const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = f.name.replace(/\.json$/i, "") + "_conv.json";
          a.click();
          setTimeout(function() { URL.revokeObjectURL(url); }, 4000);
          bilans.push(f.name + " → " + total);
        }).catch(function() {
          echecs.push(f.name + " (" + window.I18n.t("tabledit.resol.errLecture") + ")");
        }).finally(function() {
          restants--;
          if (restants === 0) {
            let msg = window.I18n.t("tabledit.resol.okMulti", { ok: bilans.length, detail: bilans.join("\n") || "—" });
            if (echecs.length) msg += "\n\n⚠️ " + window.I18n.t("tabledit.resol.echecs", { n: echecs.length }) + "\n" + echecs.join("\n");
            window.ktaAlerte(msg).then(function() { if (bilans.length) fermer(); });   // bilan lu avant la fermeture
          }
        });
      });
    });
  }
})();
