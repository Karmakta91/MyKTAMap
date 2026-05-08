// =========================
// TABLE EDITOR — Éditeur de fichiers JSON sous forme de tableau
// =========================
// Permet de charger un fichier .json (calque ou session), d'éditer son
// contenu dans un tableau interactif et de le sauvegarder.
//
// Workflow :
//   1. Modale d'import (drag & drop ou file picker)
//   2. Détection du format : "data" (calque) ou "editorPoints" (session)
//   3. Tableau interactif avec édition inline
//   4. Sauvegarde via 3 options : téléchargement, calque, session
// =========================

(function() {
  "use strict";

  // ========== ÉTAT ==========
  let _modal      = null;
  let _data       = [];           // tableau d'objets (points)
  let _colonnes   = [];           // colonnes détectées
  let _modifie    = false;        // flag modifs non sauvées
  let _selection  = new Set();    // indices sélectionnés
  let _tri        = { col: null, asc: true };
  let _filtre     = "";
  let _format     = null;         // "data" | "editorPoints"
  let _sourceMeta = {};           // fileName, type, version, autresChamps
  let _filtreTimer = null;
  let _lastSelectedIdx = null;    // pour shift-click

  // ========== STYLES INJECTÉS ==========
  function _injecterStyles() {
    if (document.getElementById("kta-tbl-styles")) return;
    const s = document.createElement("style");
    s.id = "kta-tbl-styles";
    s.textContent = `
      #kta-tbl-modal .kta-readme-modal-boite { max-width: 95vw; width: 1100px; height: 90vh; max-height: 90vh; display:flex; flex-direction:column; }
      #kta-tbl-modal .kta-readme-modal-corps { display:flex; flex-direction:column; flex:1; min-height:0; padding-bottom:0; }

      .kta-tbl-toolbar {
        display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
        padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .kta-tbl-toolbar input[type="text"] {
        flex: 1; min-width: 200px;
      }
      .kta-tbl-info {
        font-size: 12px; color: #8892a4;
        padding: 8px 0;
      }
      .kta-tbl-info .modif {
        color: #ffd28a; font-weight: 600;
      }

      .kta-tbl-wrap {
        flex: 1; min-height: 0;
        overflow: auto;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 6px;
        background: rgba(255,255,255,0.02);
      }
      .kta-tbl {
        width: 100%; border-collapse: collapse; font-size: 13px;
      }
      .kta-tbl th {
        position: sticky; top: 0; z-index: 2;
        background: #1a1f2e; color: #8cb4ff;
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
        color: #c0c8d8;
        vertical-align: middle;
      }
      .kta-tbl td.col-check {
        text-align: center;
      }
      .kta-tbl td.col-readonly {
        color: #6a7488; cursor: not-allowed;
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
      .kta-tbl td.editing input {
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
        font-size: 11px; color: #c0c8d8;
      }
      .kta-tag-chip-x {
        cursor: pointer; color: #ff8888; font-weight: bold;
      }
      .kta-tag-chip-x:hover { color: #ff4444; }
      .kta-tag-add {
        font-size: 11px; color: #8cb4ff; cursor: pointer;
        padding: 2px 6px; border: 1px dashed rgba(140,180,255,0.4);
        border-radius: 10px; margin: 1px 2px;
      }
      .kta-tag-add:hover { background: rgba(140,180,255,0.1); }

      /* Dropdown tags */
      .kta-tag-dropdown {
        position: fixed;
        background: #1a1f2e;
        border: 1px solid rgba(140,180,255,0.4);
        border-radius: 6px;
        padding: 6px;
        z-index: 10000;
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
        margin-left: auto; color: #8cb4ff;
      }
      .kta-tag-create {
        border-top: 1px solid rgba(255,255,255,0.08);
        margin-top: 4px; padding-top: 4px;
      }
      .kta-tag-create input {
        width: 100%; box-sizing: border-box;
        padding: 4px 8px;
        background: rgba(255,255,255,0.06);
        color: #e8eaf0;
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
        font-size: 13px; color: #c0c8d8;
      }

      /* Drop zone import */
      .kta-tbl-drop {
        border: 2px dashed rgba(140,180,255,0.3);
        border-radius: 8px;
        padding: 30px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        color: #c8d0e0;
      }
      .kta-tbl-drop:hover, .kta-tbl-drop.dragover {
        background: rgba(140,180,255,0.06);
        border-color: rgba(140,180,255,0.5);
        color: #e8eaf0;
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
    `;
    document.head.appendChild(s);
  }

  // ========== ENTRÉE PUBLIQUE ==========
  window.ouvrirTableEditor = function() {
    _injecterStyles();
    if (_modal) { _modal.remove(); _modal = null; }
    _afficherImport();
  };

  // ========== ÉTAPE 1 — IMPORT DU FICHIER ==========
  function _afficherImport() {
    const modal = document.createElement("div");
    modal.id = "kta-tbl-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = `
      <div class="kta-readme-modal-boite" style="max-width:520px; width:auto; height:auto; max-height:90vh;">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">📊 Éditeur de tableau JSON</span>
          <button class="kta-panneau-close" id="kta-tbl-close-import">✕</button>
        </div>
        <div class="kta-readme-modal-corps">
          <p style="font-size:13px; color:#8892a4; margin:0 0 14px; line-height:1.5;">
            Charge un fichier <code>.json</code> de type <strong>calque de données</strong> (ex: <code>puit.json</code>) ou <strong>session</strong> (<code>devmap-session.json</code>).
            Tu pourras éditer ses points dans un tableau, puis le sauvegarder.
          </p>

          <div class="kta-tbl-drop" id="kta-tbl-drop">
            <div style="font-size:32px; opacity:0.6;">📂</div>
            <div style="margin-top:8px;">Glisse un fichier .json ici</div>
            <div style="font-size:11px; opacity:0.6; margin-top:4px;">ou clique pour le sélectionner</div>
            <input type="file" id="kta-tbl-file" accept=".json,application/json" style="display:none;">
          </div>

          <div id="kta-tbl-import-erreur" class="kta-conv-erreur" style="display:none;"></div>

          <div class="kta-conv-actions" style="margin-top:14px;">
            <button class="kta-btn kta-btn-ghost" id="kta-tbl-annuler-import">Annuler</button>
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
      else _setErreurImport("Le fichier doit être un .json");
    });

    const fermer = function() { _modal.remove(); _modal = null; };
    document.getElementById("kta-tbl-close-import").addEventListener("click", fermer);
    document.getElementById("kta-tbl-annuler-import").addEventListener("click", fermer);
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

        // Détecter le format
        let format = null;
        let points = null;
        let meta   = { fileName: file.name };

        if (Array.isArray(json.data)) {
          format = "data";
          points = json.data;
          // Préserver les autres champs (type, version, roads, zones embarqués)
          meta.type    = json.type;
          meta.version = json.version;
          meta.roads   = json.roads;
          meta.zones   = json.zones;
        } else if (Array.isArray(json.editorPoints)) {
          format = "editorPoints";
          points = json.editorPoints;
          meta.type    = json.type;
          meta.version = json.version;
          meta.roads   = json.roads;
          meta.zones   = json.zones;
          meta.measure = json.measure;
        } else {
          throw new Error("Le fichier ne contient ni 'data' ni 'editorPoints'");
        }

        if (points.length === 0) {
          throw new Error("Le fichier ne contient aucun point");
        }

        _data       = points.map(function(p) { return Object.assign({}, p); }); // clone
        _format     = format;
        _sourceMeta = meta;
        _modifie    = false;
        _selection  = new Set();
        _tri        = { col: null, asc: true };
        _filtre     = "";
        _colonnes   = _detecterColonnes(_data);

        _afficherTableau();

      } catch(err) {
        console.error(err);
        _setErreurImport("❌ " + (err.message || err));
      }
    };
    reader.readAsText(file);
  }

  // ========== DÉTECTION DES COLONNES ==========
  function _detecterColonnes(data) {
    const set = new Set();
    data.forEach(function(p) {
      Object.keys(p).forEach(function(k) { set.add(k); });
    });
    // Ordre privilégié pour les clés courantes
    const ordreCourant = ["id", "nom", "x", "y", "tags", "etat", "description", "profondeur", "date_update"];
    const ordonnees = [];
    ordreCourant.forEach(function(k) { if (set.has(k)) { ordonnees.push(k); set.delete(k); } });
    // Ajouter les autres en queue
    set.forEach(function(k) { ordonnees.push(k); });
    return ordonnees;
  }

  // ========== ÉTAPE 2 — TABLEAU INTERACTIF ==========
  function _afficherTableau() {
    if (_modal) _modal.remove();
    const modal = document.createElement("div");
    modal.id = "kta-tbl-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = `
      <div class="kta-readme-modal-boite">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">📊 Éditeur — ${_escapeHtml(_sourceMeta.fileName)}</span>
          <button class="kta-panneau-close" id="kta-tbl-close">✕</button>
        </div>
        <div class="kta-readme-modal-corps">

          <div class="kta-tbl-info" id="kta-tbl-info"></div>

          <div class="kta-tbl-toolbar">
            <input type="text" class="kta-cfg-input" id="kta-tbl-search" placeholder="🔍 Rechercher dans toutes les colonnes...">
            <button class="kta-btn kta-btn-ghost" id="kta-tbl-add">+ Ajouter ligne</button>
            <button class="kta-btn kta-btn-ghost" id="kta-tbl-preview">📍 Voir sur la carte</button>
          </div>

          <div id="kta-tbl-warn-big-wrap"></div>

          <div class="kta-tbl-wrap">
            <table class="kta-tbl" id="kta-tbl-table">
              <thead></thead>
              <tbody></tbody>
            </table>
          </div>

          <div class="kta-tbl-footer">
            <div class="kta-tbl-selection-info" id="kta-tbl-selection-info">0 sélectionné</div>
            <div style="display:flex; gap:8px;">
              <button class="kta-btn kta-btn-ghost"   id="kta-tbl-duplicate" disabled>📋 Dupliquer</button>
              <button class="kta-btn kta-btn-danger"  id="kta-tbl-delete"    disabled>🗑️ Supprimer</button>
            </div>
          </div>

          <div class="kta-conv-actions" style="border-top:1px solid rgba(255,255,255,0.08); padding-top:12px;">
            <button class="kta-btn kta-btn-ghost"   id="kta-tbl-annuler">Annuler</button>
            <button class="kta-btn kta-btn-primary" id="kta-tbl-save">💾 Sauvegarder</button>
          </div>
        </div>
      </div>
    `;
    document.documentElement.appendChild(modal);
    _modal = modal;

    _construireEntete();
    _construireCorps();
    _miseAJourInfos();

    // Listeners
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

    document.getElementById("kta-tbl-add").addEventListener("click", _ajouterLigne);
    document.getElementById("kta-tbl-preview").addEventListener("click", _apercuCarte);
    document.getElementById("kta-tbl-delete").addEventListener("click", _supprimerSelection);
    document.getElementById("kta-tbl-duplicate").addEventListener("click", _dupliquerSelection);
    document.getElementById("kta-tbl-save").addEventListener("click", _menuSauvegarde);
  }

  // ========== EN-TÊTE ==========
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

    // Listeners en-têtes
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

  // ========== CORPS DU TABLEAU ==========
  function _construireCorps() {
    const tbody = _modal.querySelector("tbody");
    const config = window.PLAN_CONFIG;
    const imgW = config?.plan?.imageWidth  || 0;
    const imgH = config?.plan?.imageHeight || 0;

    // Avertissement gros volume
    const warnWrap = document.getElementById("kta-tbl-warn-big-wrap");
    if (warnWrap) {
      if (_data.length > 1000) {
        warnWrap.innerHTML = '<div class="kta-tbl-warn-big">⚠️ ' + _data.length + ' lignes — l\'édition peut être moins fluide. Utilise la recherche pour filtrer.</div>';
      } else {
        warnWrap.innerHTML = "";
      }
    }

    // Tri
    let indices = _data.map(function(_, i) { return i; });
    if (_tri.col) {
      indices.sort(function(a, b) {
        const va = _data[a][_tri.col];
        const vb = _data[b][_tri.col];
        let cmp = 0;
        if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
        else cmp = String(va || "").localeCompare(String(vb || ""));
        return _tri.asc ? cmp : -cmp;
      });
    }

    // Filtre
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
        const ro = (col === "id");
        let cls = "";
        if (ro) cls += "col-readonly";

        // Validation coords hors limites
        if (col === "x" && imgW && (v < 0 || v > imgW)) cls += (cls ? " " : "") + "col-error";
        if (col === "y" && imgH && (v < 0 || v > imgH)) cls += (cls ? " " : "") + "col-error";

        let contenu;
        if (col === "tags") {
          contenu = _renderTagsCellule(idx, v);
        } else if (Array.isArray(v)) {
          contenu = v.join(", ");
        } else if (v === undefined || v === null) {
          contenu = '<span style="opacity:0.4;">—</span>';
        } else {
          contenu = _escapeHtml(String(v));
        }

        const tooltip = (col === "x" && cls.includes("col-error")) ? ' title="X hors plan (max ' + imgW + ')"' :
                        (col === "y" && cls.includes("col-error")) ? ' title="Y hors plan (max ' + imgH + ')"' : "";

        html += '<td class="' + cls + '" data-col="' + _escapeAttr(col) + '" data-idx="' + idx + '"' + tooltip + '>' + contenu + '</td>';
      });
      html += "</tr>";
    });
    tbody.innerHTML = html;

    // Listeners
    tbody.querySelectorAll("input[data-row-check]").forEach(function(cb) {
      cb.addEventListener("click", function(e) {
        const idx = parseInt(cb.dataset.rowCheck);

        // Shift-click : sélection plage
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
        // Toggle classe visuelle ligne
        const tr = cb.closest("tr");
        if (tr) tr.classList.toggle("kta-tbl-selected", cb.checked);
      });
    });

    tbody.querySelectorAll("td[data-col]").forEach(function(td) {
      td.addEventListener("click", function(e) {
        if (e.target.closest("input")) return;
        const col = td.dataset.col;
        if (col === "id") return; // lecture seule
        if (col === "tags") {
          // Si clic sur ×, retirer le tag
          const removeBtn = e.target.closest("[data-tag-remove]");
          if (removeBtn) {
            const idx = parseInt(td.dataset.idx);
            const tagIdx = parseInt(removeBtn.dataset.tagRemove);
            _data[idx].tags = (_data[idx].tags || []).filter(function(_, i) { return i !== tagIdx; });
            _modifie = true;
            _construireCorps();
            _miseAJourInfos();
            return;
          }
          // Sinon ouvrir le dropdown
          _afficherDropdownTags(td, parseInt(td.dataset.idx));
          return;
        }
        if (td.classList.contains("editing")) return;
        _editerCellule(td);
      });
    });
  }

  // ========== ÉDITION D'UNE CELLULE ==========
  function _editerCellule(td) {
    const idx = parseInt(td.dataset.idx);
    const col = td.dataset.col;
    const p = _data[idx];
    const valOrig = p[col];

    // Sauvegarder le HTML pour annuler
    const htmlOrig = td.innerHTML;
    td.classList.add("editing");

    const isNum = (col === "x" || col === "y" || col === "profondeur");
    const input = document.createElement("input");
    input.type = isNum ? "number" : "text";
    input.value = valOrig === undefined || valOrig === null ? "" : valOrig;
    if (isNum && col !== "profondeur") input.step = "1";

    td.innerHTML = "";
    td.appendChild(input);
    input.focus();
    input.select();

    function valider() {
      let nouvelle = input.value;
      if (isNum) {
        nouvelle = nouvelle === "" ? undefined : Number(nouvelle);
        if (isNaN(nouvelle)) nouvelle = undefined;
      } else {
        nouvelle = nouvelle === "" ? "" : nouvelle;
      }
      if (nouvelle !== valOrig) {
        p[col] = nouvelle;
        _modifie = true;
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
        // Passer à la même colonne sur la ligne en dessous
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

  function _focusVoisin(idx, col, direction) {
    const visibles = _indexVisibles();
    const posLigne = visibles.indexOf(idx);
    const posCol = _colonnes.indexOf(col);
    let nIdx = idx, nCol = col;

    if (direction === "down" && posLigne < visibles.length - 1) nIdx = visibles[posLigne + 1];
    if (direction === "up"   && posLigne > 0)                   nIdx = visibles[posLigne - 1];
    if (direction === "right" && posCol < _colonnes.length - 1) nCol = _colonnes[posCol + 1];
    if (direction === "left"  && posCol > 0)                    nCol = _colonnes[posCol - 1];

    // Skip "id" en lecture seule
    if (nCol === "id" && (direction === "right" || direction === "left")) {
      const newPos = direction === "right" ? _colonnes.indexOf(nCol) + 1 : _colonnes.indexOf(nCol) - 1;
      if (newPos >= 0 && newPos < _colonnes.length) nCol = _colonnes[newPos];
    }

    setTimeout(function() {
      const tdNext = _modal.querySelector('td[data-idx="' + nIdx + '"][data-col="' + _escapeAttr(nCol) + '"]');
      if (tdNext && nCol !== "id" && nCol !== "tags") _editerCellule(tdNext);
    }, 50);
  }

  // ========== TAGS — RENDU ET DROPDOWN ==========
  function _renderTagsCellule(idx, tags) {
    if (!Array.isArray(tags)) tags = [];
    let html = "";
    tags.forEach(function(t, i) {
      html += '<span class="kta-tag-chip">' + _escapeHtml(t) +
              '<span class="kta-tag-chip-x" data-tag-remove="' + i + '" data-row="' + idx + '">×</span></span>';
    });
    html += '<span class="kta-tag-add" data-tag-add="' + idx + '">+ tag</span>';
    return html;
  }

  function _afficherDropdownTags(anchor, idx) {
    // Fermer dropdown précédent
    const prev = document.getElementById("kta-tag-dd");
    if (prev) prev.remove();

    const config = window.PLAN_CONFIG || {};
    const icons = config.icons || {};
    const exclu = ["default", "track"];

    // Tags disponibles : tous ceux dans icons + ceux déjà utilisés ailleurs dans _data
    const tagsExistants = new Set();
    Object.keys(icons).forEach(function(t) { if (!exclu.includes(t)) tagsExistants.add(t); });
    _data.forEach(function(p) {
      if (Array.isArray(p.tags)) p.tags.forEach(function(t) { tagsExistants.add(t); });
    });

    const tagsActifs = _data[idx].tags || [];

    // Créer le dropdown
    const dd = document.createElement("div");
    dd.id = "kta-tag-dd";
    dd.className = "kta-tag-dropdown";

    let html = "";
    [...tagsExistants].sort().forEach(function(t) {
      const isSelected = tagsActifs.includes(t);
      const iconUrl = icons[t];
      html += '<div class="kta-tag-option' + (isSelected ? " selected" : "") + '" data-tag="' + _escapeAttr(t) + '">';
      if (iconUrl) html += '<img src="' + _escapeAttr(iconUrl) + '">';
      else html += '<div style="width:22px; height:22px;"></div>';
      html += '<span>' + _escapeHtml(t) + '</span>';
      if (isSelected) html += '<span class="check">✓</span>';
      html += '</div>';
    });

    html += '<div class="kta-tag-create"><input type="text" id="kta-tag-new" placeholder="Créer un tag (Entrée)..."></div>';
    dd.innerHTML = html;
    document.body.appendChild(dd);

    // Position
    const rect = anchor.getBoundingClientRect();
    dd.style.left = rect.left + "px";
    dd.style.top  = (rect.bottom + 4) + "px";
    // Si dépasse à droite, recaler
    setTimeout(function() {
      const ddRect = dd.getBoundingClientRect();
      if (ddRect.right > window.innerWidth) {
        dd.style.left = (window.innerWidth - ddRect.width - 8) + "px";
      }
      if (ddRect.bottom > window.innerHeight) {
        dd.style.top = (rect.top - ddRect.height - 4) + "px";
      }
    }, 0);

    // Listeners options
    dd.querySelectorAll("[data-tag]").forEach(function(opt) {
      opt.addEventListener("click", function() {
        const t = opt.dataset.tag;
        const tags = _data[idx].tags || [];
        const i = tags.indexOf(t);
        if (i >= 0) tags.splice(i, 1);
        else        tags.push(t);
        _data[idx].tags = tags;
        _modifie = true;
        _construireCorps();
        _miseAJourInfos();
        _afficherDropdownTags(_modal.querySelector('td[data-idx="' + idx + '"][data-col="tags"]'), idx);
      });
    });

    // Création nouveau tag
    const newInput = document.getElementById("kta-tag-new");
    newInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        const t = newInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
        if (!t) return;
        const tags = _data[idx].tags || [];
        if (!tags.includes(t)) tags.push(t);
        _data[idx].tags = tags;
        _modifie = true;
        dd.remove();
        _construireCorps();
        _miseAJourInfos();
      } else if (e.key === "Escape") {
        dd.remove();
      }
    });

    // Fermer au clic extérieur
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

  // ========== TRI ==========
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

  // ========== AJOUT / SUPPRESSION / DUPLICATION ==========
  function _ajouterLigne() {
    const nouv = {};
    _colonnes.forEach(function(c) {
      if (c === "x" || c === "y" || c === "profondeur") nouv[c] = 0;
      else if (c === "tags") nouv[c] = [];
      else nouv[c] = "";
    });
    if ("id" in nouv) nouv.id = "";
    _data.push(nouv);
    _modifie = true;
    _construireCorps();
    _miseAJourInfos();
    // Scroller en bas
    const wrap = _modal.querySelector(".kta-tbl-wrap");
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  function _supprimerSelection() {
    if (_selection.size === 0) return;
    const n = _selection.size;
    if (!confirm("Supprimer " + n + " ligne(s) ? Cette action est irréversible.")) return;
    const indices = [..._selection].sort(function(a, b) { return b - a; });
    indices.forEach(function(i) { _data.splice(i, 1); });
    _selection.clear();
    _modifie = true;
    _construireCorps();
    _miseAJourInfos();
  }

  function _dupliquerSelection() {
    if (_selection.size === 0) return;
    const indices = [..._selection].sort();
    indices.forEach(function(i) {
      const copie = JSON.parse(JSON.stringify(_data[i]));
      // Ajouter "_copie" à l'id si présent
      if (copie.id) copie.id = String(copie.id) + "_copie";
      _data.push(copie);
    });
    _selection.clear();
    _modifie = true;
    _construireCorps();
    _miseAJourInfos();
  }

  // ========== APERÇU SUR LA CARTE ==========
  function _apercuCarte() {
    if (_selection.size === 0) {
      alert("Sélectionne d'abord une ou plusieurs lignes pour les visualiser sur la carte.");
      return;
    }
    if (!window.map || !APP_CONFIG) {
      alert("Carte non disponible");
      return;
    }

    // Récupérer les points sélectionnés
    const points = [..._selection].map(function(i) { return _data[i]; })
      .filter(function(p) { return typeof p.x === "number" && typeof p.y === "number"; });
    if (points.length === 0) {
      alert("Aucun des points sélectionnés n'a de coordonnées valides");
      return;
    }

    // Masquer la modale (mais ne pas la supprimer)
    _modal.style.display = "none";

    // Créer les markers temporaires
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

    // Centrer la carte sur les points
    const bounds = L.latLngBounds(points.map(function(p) {
      return [APP_CONFIG.imageHeight - p.y, p.x];
    }));
    window.map.fitBounds(bounds.pad(0.2));

    // Banner avec bouton retour
    const banner = document.createElement("div");
    banner.id = "kta-tbl-preview-banner";
    banner.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.92); color:#fff; padding:12px 20px; border-radius:8px; font-size:14px; z-index:9999; box-shadow:0 4px 16px rgba(0,0,0,0.5); border:1px solid rgba(140,180,255,0.5); display:flex; gap:12px; align-items:center;";
    banner.innerHTML = `
      <span>📍 Aperçu de ${points.length} point(s)</span>
      <button class="kta-btn kta-btn-primary" id="kta-tbl-preview-back" style="padding:6px 14px;">↩️ Retour à l'éditeur</button>
    `;
    document.body.appendChild(banner);

    document.getElementById("kta-tbl-preview-back").addEventListener("click", function() {
      window.map.removeLayer(tempLayer);
      banner.remove();
      _modal.style.display = "";
    });
  }

  // ========== INFOS HEADER ==========
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

    let html = "<strong>" + _data.length + "</strong> ligne(s)";
    if (_filtre) {
      const visibles = _indexVisibles().length;
      html += " — <strong>" + visibles + "</strong> filtrée(s)";
    }
    if (nbHorsLimite > 0) {
      html += ' — <span style="color:#ff8888;">⚠️ ' + nbHorsLimite + ' coordonnée(s) hors plan</span>';
    }
    if (_modifie) html += ' — <span class="modif">✏️ modifications non sauvegardées</span>';

    infoEl.innerHTML = html;

    // Selection
    const selEl = document.getElementById("kta-tbl-selection-info");
    if (selEl) selEl.textContent = _selection.size + " sélectionné" + (_selection.size > 1 ? "s" : "");
    document.getElementById("kta-tbl-delete").disabled    = _selection.size === 0;
    document.getElementById("kta-tbl-duplicate").disabled = _selection.size === 0;
  }

  // ========== UTILITAIRES ==========
  function _indexVisibles() {
    let indices = _data.map(function(_, i) { return i; });
    if (_tri.col) {
      indices.sort(function(a, b) {
        const va = _data[a][_tri.col];
        const vb = _data[b][_tri.col];
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

  function _escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  function _escapeAttr(s) { return _escapeHtml(s).replace(/"/g, "&quot;"); }

  // ========== FERMETURE AVEC CONFIRMATION ==========
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
          <span class="kta-readme-modal-titre">⚠️ Modifications non sauvegardées</span>
        </div>
        <div class="kta-readme-modal-corps">
          <p style="font-size:14px; color:#c0c8d8; margin:0 0 16px; line-height:1.5;">
            Tu as des modifications non sauvegardées. Que veux-tu faire ?
          </p>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="kta-btn kta-btn-primary" id="conf-save">💾 Sauvegarder maintenant</button>
            <button class="kta-btn kta-btn-danger"  id="conf-quit">🗑️ Quitter sans sauvegarder</button>
            <button class="kta-btn kta-btn-ghost"   id="conf-stay">↩️ Continuer l'édition</button>
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

  // ========== MENU DE SAUVEGARDE ==========
  function _menuSauvegarde() {
    // Détecter ce qui est possible
    const peutCalque = _format === "data" && _calqueCorrespondant() !== null;
    const peutSession = _format === "editorPoints";

    const overlay = document.createElement("div");
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100001"; // au-dessus de .kta-readme-modal-overlay (z-index 99999)
    overlay.innerHTML = `
      <div class="kta-readme-modal-boite" style="max-width:480px; height:auto;">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">💾 Sauvegarder</span>
          <button class="kta-panneau-close" id="save-close">✕</button>
        </div>
        <div class="kta-readme-modal-corps">
          <p style="font-size:13px; color:#8892a4; margin:0 0 14px; line-height:1.5;">
            Choisis une destination pour tes modifications :
          </p>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="kta-btn kta-btn-primary" id="save-dl">
              📥 Télécharger le fichier modifié
            </button>
            <button class="kta-btn kta-btn-ghost" id="save-layer" ${peutCalque ? "" : "disabled"}>
              🗺️ Remplacer le calque actif sur la carte
              ${peutCalque ? "" : '<br><span style="font-size:11px; opacity:0.6;">(pas de calque correspondant trouvé)</span>'}
            </button>
            <button class="kta-btn kta-btn-ghost" id="save-session" ${peutSession ? "" : "disabled"}>
              ✏️ Remplacer la session en cours
              ${peutSession ? "" : '<br><span style="font-size:11px; opacity:0.6;">(uniquement pour les fichiers session)</span>'}
            </button>
          </div>
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

    if (peutCalque) {
      document.getElementById("save-layer").addEventListener("click", function() {
        _remplacerCalque();
        _modifie = false;
        _miseAJourInfos();
        overlay.remove();
      });
    }
    if (peutSession) {
      document.getElementById("save-session").addEventListener("click", function() {
        _remplacerSession();
        _modifie = false;
        _miseAJourInfos();
        overlay.remove();
      });
    }
  }

  // ========== TÉLÉCHARGEMENT ==========
  function _telecharger() {
    const obj = _construireObjetSortie();
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = _sourceMeta.fileName || "data.json";
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }

  function _construireObjetSortie() {
    if (_format === "editorPoints") {
      const obj = {
        type:    _sourceMeta.type    || "devmap-session",
        version: _sourceMeta.version || 1,
        editorPoints: _data
      };
      if (_sourceMeta.measure) obj.measure = _sourceMeta.measure;
      if (_sourceMeta.roads)   obj.roads   = _sourceMeta.roads;
      if (_sourceMeta.zones)   obj.zones   = _sourceMeta.zones;
      return obj;
    }
    // format data (calque)
    const obj = { data: _data };
    if (_sourceMeta.type)    obj.type    = _sourceMeta.type;
    if (_sourceMeta.version) obj.version = _sourceMeta.version;
    if (_sourceMeta.roads)   obj.roads   = _sourceMeta.roads;
    if (_sourceMeta.zones)   obj.zones   = _sourceMeta.zones;
    return obj;
  }

  // ========== REMPLACEMENT CALQUE ACTIF ==========
  function _calqueCorrespondant() {
    const config = window.PLAN_CONFIG;
    if (!config || !Array.isArray(config.dataLayers)) return null;
    // Recherche par nom de fichier
    const fname = (_sourceMeta.fileName || "").toLowerCase();
    for (const lc of config.dataLayers) {
      const lcName = (lc.file || "").split("/").pop().toLowerCase();
      if (lcName && fname.includes(lcName)) return lc.id;
      if (lcName === fname) return lc.id;
    }
    return null;
  }

  function _remplacerCalque() {
    const layerId = _calqueCorrespondant();
    if (!layerId) { alert("Aucun calque correspondant trouvé"); return; }
    const layer = window.dataLayerGroups?.[layerId];
    if (!layer) { alert("Calque introuvable en mémoire"); return; }

    // Vider le layer existant
    layer.clearLayers();

    // Recréer les markers depuis _data
    _data.forEach(function(p) {
      if (typeof p.x !== "number" || typeof p.y !== "number") return;
      const m = L.marker(convertCoord(p.x, p.y), { icon: choisirIcone(p) });
      m.bindPopup("<b>" + (p.nom || "") + "</b><br>" + (p.description || ""));
      m.addTo(layer);
    });

    alert("Calque '" + layerId + "' mis à jour avec " + _data.length + " point(s).\nLes modifications sont en mémoire — pense à exporter ton plan si tu veux les conserver.");
  }

  // ========== REMPLACEMENT SESSION ==========
  function _remplacerSession() {
    if (!window.setEditorPoints) { alert("setEditorPoints non disponible"); return; }
    window.setEditorPoints(_data);
    if (window.renderEditorPoints) window.renderEditorPoints();
    alert("Session mise à jour avec " + _data.length + " point(s).");
  }

})();
