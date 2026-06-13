/*!
 * MyKTAMap — modeHistoire.js (v1.34.20)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// MODE HISTOIRE — Note libre + PDF Histoire (embarqué OU importé session)
// =========================
// Feature v1.34.19 → v1.34.20 — Modale unifiée 2 onglets accessible via
// bouton 📖 dans la status bar (à côté de 📊 stats et 🔋 batterie).
//
// Onglet 1 — 📝 NOTE LIBRE :
//   Zone de texte éditable où l'user peut prendre des notes contextuelles
//   au plan. Persistée localStorage per-plan (clé "myktamap_note_libre_<planId>").
//   Auto-save sur input avec debounce 500ms.
//
// Onglet 2 — 📚 HISTOIRE (PDF) — 2 sources possibles, priorité absolue à l'embarqué :
//   1. EMBARQUÉ : plan-config.json > plan.histoirePdf = "data/histoire.pdf"
//      → résolu via RUNTIME_ASSETS (extraction eager dans whitelist 2-pass
//        d'extraireZip v1.34.10+). Le bouton "Importer" est CACHÉ.
//   2. IMPORTÉ EN SESSION (v1.34.20) : si plan n'a pas histoirePdf embarqué,
//      l'user peut importer son propre PDF via file picker. Stocké en IDB
//      `myktamap_histoire_pdfs` (1 PDF max par plan, remplaçable). Bouton
//      "🗑️ Retirer" pour supprimer.
//   3. Si ni embarqué ni session → message + bouton "📥 Importer un PDF".
//
// Affichage : iframe natif sur desktop/Android, fallback bouton télécharger
// sur iOS (où iframe PDF est peu fiable).
//
// API publique :
//   window.ModeHistoire.open()       — ouvre la modale (mode défaut : note)
//   window.ModeHistoire.openTab(t)   — t = "note" | "pdf"
//   window.ModeHistoire.close()
//   window.ModeHistoire.isOpen()
//
// Au plan switch, la modale se ferme automatiquement. Les ObjectURL créés
// pour le PDF session sont revoke (Pack RAM Phase 4 — éviter bitmap pinning).
// =========================

(function() {
  "use strict";

  const MH = {};

  let _modal = null;
  let _currentMode = "note";  // "note" | "pdf"
  let _saveTimer = null;
  let _pdfBlobUrl = null;     // URL.createObjectURL pour le PDF session (à revoke)
  let _sessionPdfMeta = null; // { name, size } du PDF session importé pour ce plan

  // ========== IDB SESSION PDFS (v1.34.20) ==========
  const IDB_NAME    = "myktamap_histoire_pdfs";
  const IDB_VERSION = 1;
  const IDB_STORE   = "pdfs";
  let _idbPromise = null;

  function _idbOpen() {
    if (_idbPromise) return _idbPromise;
    _idbPromise = new Promise(function(resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB non supportée"));
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "planId" });
        }
      };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function() { reject(req.error); };
    });
    return _idbPromise;
  }

  function _idbGet(planId) {
    return _idbOpen().then(function(db) {
      return new Promise(function(resolve, reject) {
        const tx = db.transaction(IDB_STORE, "readonly");
        const st = tx.objectStore(IDB_STORE);
        const req = st.get(planId);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror   = function() { reject(req.error); };
      });
    });
  }

  function _idbSet(planId, blob, name) {
    return _idbOpen().then(function(db) {
      return new Promise(function(resolve, reject) {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const st = tx.objectStore(IDB_STORE);
        const rec = {
          planId: planId,
          blob:   blob,
          name:   String(name || "histoire.pdf"),
          size:   blob.size || 0,
          addedAt: Date.now()
        };
        const req = st.put(rec);
        req.onsuccess = function() { resolve(); };
        req.onerror   = function() { reject(req.error); };
      });
    });
  }

  function _idbDel(planId) {
    return _idbOpen().then(function(db) {
      return new Promise(function(resolve, reject) {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const st = tx.objectStore(IDB_STORE);
        const req = st.delete(planId);
        req.onsuccess = function() { resolve(); };
        req.onerror   = function() { reject(req.error); };
      });
    });
  }

  // ========== LOCALSTORAGE NOTE LIBRE ==========
  function _currentPlanId() {
    return window._currentLoadedPlanId || "default";
  }

  function _noteKey() {
    return "myktamap_note_libre_" + _currentPlanId();
  }

  function _loadNote() {
    try { return localStorage.getItem(_noteKey()) || ""; }
    catch(e) { return ""; }
  }

  function _saveNote(text) {
    try { localStorage.setItem(_noteKey(), String(text || "")); }
    catch(e) { console.warn("[ModeHistoire] localStorage save échec :", e); }
  }

  // ========== PDF EMBARQUÉ (plan-config.json > histoirePdf) ==========
  function _getEmbeddedPdfUrl() {
    if (!window.PLAN_CONFIG || !window.PLAN_CONFIG.plan) return null;
    const path = window.PLAN_CONFIG.plan.histoirePdf;
    if (!path) return null;
    if (typeof path === "string" && path.indexOf("blob:") === 0) return path;
    if (typeof window.getRuntimeAssetUrl === "function") {
      const url = window.getRuntimeAssetUrl(path);
      if (url) return url;
    }
    return path;
  }

  function _hasEmbeddedPdf() {
    return !!_getEmbeddedPdfUrl();
  }

  // ========== PDF SESSION (IDB) ==========
  // Récupère le PDF session du plan courant en IDB, crée la blob URL.
  // Retourne { url, name, size } ou null.
  // 🐛 v1.34.20 (Pack RAM Phase 4 lesson) : on revoke l'ancienne URL avant
  // d'en créer une nouvelle pour éviter fuite bitmap iOS.
  function _loadSessionPdf() {
    return _idbGet(_currentPlanId()).then(function(rec) {
      if (!rec || !rec.blob) return null;
      if (_pdfBlobUrl) {
        try { URL.revokeObjectURL(_pdfBlobUrl); } catch(e) {}
        _pdfBlobUrl = null;
      }
      _pdfBlobUrl = URL.createObjectURL(rec.blob);
      _sessionPdfMeta = { name: rec.name, size: rec.size };
      return { url: _pdfBlobUrl, name: rec.name, size: rec.size };
    }).catch(function(e) {
      console.warn("[ModeHistoire] _loadSessionPdf échec :", e);
      return null;
    });
  }

  // Stocke un nouveau PDF session pour le plan courant. Remplace l'existant
  // s'il y en avait un (et revoke son URL).
  function _saveSessionPdf(file) {
    if (!file) return Promise.reject(new Error("Pas de fichier"));
    return _idbSet(_currentPlanId(), file, file.name).then(function() {
      _sessionPdfMeta = { name: file.name, size: file.size };
      // Revoke l'ancienne URL si présente
      if (_pdfBlobUrl) {
        try { URL.revokeObjectURL(_pdfBlobUrl); } catch(e) {}
      }
      _pdfBlobUrl = URL.createObjectURL(file);
      return { url: _pdfBlobUrl, name: file.name, size: file.size };
    });
  }

  // Supprime le PDF session du plan courant + revoke URL.
  function _deleteSessionPdf() {
    return _idbDel(_currentPlanId()).then(function() {
      if (_pdfBlobUrl) {
        try { URL.revokeObjectURL(_pdfBlobUrl); } catch(e) {}
        _pdfBlobUrl = null;
      }
      _sessionPdfMeta = null;
    });
  }

  // ========== UI : MODALE ==========
  function _build() {
    if (_modal) return;
    const t = function(k, p) { return window.I18n.t(k, p); };
    _modal = document.createElement("div");
    _modal.id = "kta-histoire-modal";
    _modal.className = "kta-readme-modal-overlay";
    _modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-histoire-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + t("histoire.modal.titre") + '</span>' +
          '<button class="kta-panneau-close" id="kta-histoire-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-histoire-tabs" role="tablist">' +
          '<button class="kta-histoire-tab" id="kta-histoire-tab-note" role="tab" type="button" data-mode="note">' + t("histoire.tab.note") + '</button>' +
          '<button class="kta-histoire-tab" id="kta-histoire-tab-pdf" role="tab" type="button" data-mode="pdf">' + t("histoire.tab.pdf") + '</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-histoire-corps">' +
          // === ONGLET NOTE LIBRE (v1.34.30 — MD editor inline) ===
          // Deux modes : VIEW (rendu MD par défaut) + EDIT (textarea + toolbar).
          // L'user voit le rendu en arrivant ; clic ✏️ pour éditer la source MD.
          '<div class="kta-histoire-pane" id="kta-histoire-pane-note">' +
            // Header avec switch view/edit + status sauvegarde
            '<div class="kta-histoire-note-header">' +
              '<button class="kta-btn kta-btn-ghost kta-histoire-note-mode-btn" type="button" ' +
                'id="kta-histoire-note-edit-btn" title="' + t("histoire.note.editBtn.title") + '">' + t("histoire.note.editBtn") + '</button>' +
              '<button class="kta-btn kta-btn-ghost kta-histoire-note-mode-btn" type="button" ' +
                'id="kta-histoire-note-view-btn" title="' + t("histoire.note.viewBtn.title") + '" style="display:none;">' + t("histoire.note.viewBtn") + '</button>' +
              '<span class="kta-histoire-note-status" id="kta-histoire-note-status">' + t("histoire.note.status.saved") + '</span>' +
            '</div>' +
            // Mode VIEW : div avec MD rendu (par défaut visible)
            '<div id="kta-histoire-note-view" class="kta-histoire-note-rendered"></div>' +
            // Mode EDIT : toolbar + textarea (caché par défaut)
            '<div id="kta-histoire-note-edit" class="kta-histoire-note-edit-wrap" style="display:none;">' +
              '<div class="kta-histoire-md-toolbar" role="toolbar" aria-label="' + t("histoire.md.toolbar.label") + '">' +
                '<button type="button" class="kta-md-tb-btn" data-md="bold" title="' + t("histoire.md.bold.title") + '"><strong>B</strong></button>' +
                '<button type="button" class="kta-md-tb-btn" data-md="italic" title="' + t("histoire.md.italic.title") + '"><em>I</em></button>' +
                '<button type="button" class="kta-md-tb-btn" data-md="h1" title="' + t("histoire.md.h1.title") + '">H1</button>' +
                '<button type="button" class="kta-md-tb-btn" data-md="h2" title="' + t("histoire.md.h2.title") + '">H2</button>' +
                '<button type="button" class="kta-md-tb-btn" data-md="ul" title="' + t("histoire.md.ul.title") + '">' + t("histoire.md.ul.label") + '</button>' +
                '<button type="button" class="kta-md-tb-btn" data-md="link" title="' + t("histoire.md.link.title") + '">' + t("histoire.md.link.label") + '</button>' +
                '<button type="button" class="kta-md-tb-btn" data-md="code" title="' + t("histoire.md.code.title") + '">&lt;/&gt;</button>' +
                '<button type="button" class="kta-md-tb-btn" data-md="quote" title="' + t("histoire.md.quote.title") + '">❝</button>' +
              '</div>' +
              '<textarea id="kta-histoire-note" class="kta-histoire-textarea" ' +
                'placeholder="' + t("histoire.note.placeholder") + '"' +
                'autocomplete="off" spellcheck="true"></textarea>' +
            '</div>' +
          '</div>' +
          // === ONGLET HISTOIRE (PDF) ===
          '<div class="kta-histoire-pane" id="kta-histoire-pane-pdf" style="display:none;">' +
            // Toolbar (import / supprimer) — visible selon contexte (v1.34.20)
            '<div class="kta-histoire-pdf-toolbar" id="kta-histoire-pdf-toolbar" style="display:none;">' +
              '<span class="kta-histoire-pdf-meta" id="kta-histoire-pdf-meta"></span>' +
              '<input type="file" id="kta-histoire-pdf-input" accept="application/pdf,.pdf" style="display:none;">' +
              '<button class="kta-btn kta-btn-ghost" type="button" id="kta-histoire-pdf-import">' + t("histoire.pdf.import") + '</button>' +
              '<button class="kta-btn kta-btn-ghost" type="button" id="kta-histoire-pdf-replace" style="display:none;">' + t("histoire.pdf.replace") + '</button>' +
              '<button class="kta-btn kta-btn-danger" type="button" id="kta-histoire-pdf-remove" style="display:none;">' + t("histoire.pdf.remove") + '</button>' +
            '</div>' +
            // Viewer wrap (iframe ou fallback)
            '<div id="kta-histoire-pdf-wrap" class="kta-histoire-pdf-wrap">' +
              '<div class="kta-histoire-pdf-empty" id="kta-histoire-pdf-empty">' +
                '<p>' + t("histoire.pdf.empty.titre") + '</p>' +
                '<p style="font-size:12px; color:#8892a4;">' + t("histoire.pdf.empty.hint") + '</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(_modal);

    // Wire close handlers
    document.getElementById("kta-histoire-close").addEventListener("click", close);
    _modal.addEventListener("click", function(e) {
      if (e.target === _modal) close();
    });
    document.addEventListener("keydown", _onKey);

    // Wire onglets
    _modal.querySelectorAll(".kta-histoire-tab").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const m = btn.getAttribute("data-mode");
        if (m === "note" || m === "pdf") _switchMode(m);
      });
    });

    // Wire note auto-save + view/edit toggle + toolbar MD (v1.34.30)
    const ta       = document.getElementById("kta-histoire-note");
    const viewDiv  = document.getElementById("kta-histoire-note-view");
    const editWrap = document.getElementById("kta-histoire-note-edit");
    const btnEdit  = document.getElementById("kta-histoire-note-edit-btn");
    const btnView  = document.getElementById("kta-histoire-note-view-btn");
    const status   = document.getElementById("kta-histoire-note-status");

    // Charge la note depuis localStorage + render initial.
    // Si la note est vide → on bascule directement en mode EDIT (sinon
    // l'user voit un vide qui ne suggère pas qu'on peut écrire).
    const initialNote = _loadNote();
    ta.value = initialNote;
    _refreshNoteView();
    if (!initialNote || initialNote.length === 0) {
      _setNoteMode("edit");
    } else {
      _setNoteMode("view");
    }

    // Auto-save sur input + re-render preview (à la prochaine bascule view).
    ta.addEventListener("input", function() {
      if (status) status.textContent = window.I18n.t("histoire.note.status.modified");
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(function() {
        _saveNote(ta.value);
        if (status) status.textContent = window.I18n.t("histoire.note.status.saved");
      }, 500);
    });

    // Bouton "✏️ Éditer" → bascule en mode EDIT, focus textarea
    if (btnEdit) {
      btnEdit.addEventListener("click", function() {
        _setNoteMode("edit");
        // Focus avec léger délai pour iOS (clavier virtuel)
        setTimeout(function() { try { ta.focus(); } catch(e) {} }, 50);
      });
    }
    // Bouton "👁 Aperçu" → re-render + bascule en mode VIEW
    if (btnView) {
      btnView.addEventListener("click", function() {
        // Force sauvegarde immédiate avant aperçu (sinon le debounce 500ms
        // pourrait afficher un rendu en retard d'1 keystroke).
        if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
        _saveNote(ta.value);
        if (status) status.textContent = window.I18n.t("histoire.note.status.saved");
        _refreshNoteView();
        _setNoteMode("view");
      });
    }

    // Toolbar MD : insère un marqueur autour de la sélection (ou au curseur)
    const toolbar = _modal.querySelector(".kta-histoire-md-toolbar");
    if (toolbar) {
      toolbar.addEventListener("click", function(e) {
        const btn = e.target.closest(".kta-md-tb-btn");
        if (!btn) return;
        const kind = btn.getAttribute("data-md");
        _applyMdToolbar(ta, kind);
      });
    }

    // Wire PDF import/replace/remove (v1.34.20)
    const fileInput = document.getElementById("kta-histoire-pdf-input");
    const btnImport = document.getElementById("kta-histoire-pdf-import");
    const btnReplace = document.getElementById("kta-histoire-pdf-replace");
    const btnRemove = document.getElementById("kta-histoire-pdf-remove");

    function _triggerImport() {
      if (fileInput) fileInput.click();
    }
    if (btnImport)  btnImport.addEventListener("click", _triggerImport);
    if (btnReplace) btnReplace.addEventListener("click", _triggerImport);

    if (fileInput) {
      fileInput.addEventListener("change", function() {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        // Garde-fou : MIME / extension
        const isPdf = (f.type === "application/pdf") || /\.pdf$/i.test(f.name || "");
        if (!isPdf) {
          alert(window.I18n.t("histoire.pdf.err.onlyPdf"));
          fileInput.value = "";
          return;
        }
        _saveSessionPdf(f).then(function() {
          fileInput.value = "";
          _renderPdf({ force: true });
        }).catch(function(e) {
          console.error("[ModeHistoire] saveSessionPdf échec :", e);
          alert(window.I18n.t("histoire.pdf.err.saveFail", { ko: (e.message || e) }));
          fileInput.value = "";
        });
      });
    }

    if (btnRemove) {
      btnRemove.addEventListener("click", function() {
        if (!confirm(window.I18n.t("histoire.pdf.removeConfirm"))) return;
        _deleteSessionPdf().then(function() {
          _renderPdf({ force: true });
        }).catch(function(e) {
          console.error("[ModeHistoire] deleteSessionPdf échec :", e);
        });
      });
    }
  }

  // ========== HELPERS MODE NOTE (v1.34.30 — MD editor inline) ==========

  // Bascule entre VIEW (aperçu MD rendu) et EDIT (textarea source + toolbar).
  function _setNoteMode(mode) {
    const viewDiv  = document.getElementById("kta-histoire-note-view");
    const editWrap = document.getElementById("kta-histoire-note-edit");
    const btnEdit  = document.getElementById("kta-histoire-note-edit-btn");
    const btnView  = document.getElementById("kta-histoire-note-view-btn");
    if (!viewDiv || !editWrap || !btnEdit || !btnView) return;
    if (mode === "edit") {
      viewDiv.style.display  = "none";
      editWrap.style.display = "";
      btnEdit.style.display  = "none";
      btnView.style.display  = "";
    } else {
      viewDiv.style.display  = "";
      editWrap.style.display = "none";
      btnEdit.style.display  = "";
      btnView.style.display  = "none";
    }
  }

  // Re-rend l'aperçu MD depuis la valeur courante de la textarea (ou note LS
  // si textarea pas encore présente — fallback au cas où).
  function _refreshNoteView() {
    const viewDiv = document.getElementById("kta-histoire-note-view");
    const ta      = document.getElementById("kta-histoire-note");
    if (!viewDiv) return;
    const src = ta ? ta.value : _loadNote();
    if (!src || src.trim() === "") {
      // Note vide → placeholder doux (suggère le bouton Éditer).
      viewDiv.innerHTML = '<p class="kta-histoire-note-empty">' +
        window.I18n.t("histoire.note.empty") +
        '</p>';
      return;
    }
    if (typeof window.kta_renderMd === "function") {
      viewDiv.innerHTML = window.kta_renderMd(src);
    } else {
      // Fallback panique-safe : si mdParser pas chargé, on affiche le source
      // brut (escape automatique via textContent).
      viewDiv.textContent = src;
    }
  }

  // Toolbar MD : applique un marqueur autour de la sélection courante. Si
  // pas de sélection, insère un placeholder éditable (curseur sélectionne
  // le placeholder → user tape par-dessus). Conserve focus, déclenche input
  // pour l'auto-save. Gère 2 catégories de marqueurs :
  //   - Inline (bold, italic, code, link) : entoure la sélection
  //   - Préfixe de ligne (h1, h2, ul, quote) : insère en début de ligne
  //     (multi-ligne : préfixe chaque ligne sélectionnée)
  function _applyMdToolbar(ta, kind) {
    if (!ta) return;
    const start = ta.selectionStart || 0;
    const end   = ta.selectionEnd   || 0;
    const sel   = ta.value.substring(start, end);
    let before = "", after = "", placeholder = sel;
    let prefixLine = false;

    switch (kind) {
      case "bold":   before = "**"; after = "**"; if (!sel) placeholder = window.I18n.t("histoire.md.placeholder.text"); break;
      case "italic": before = "*";  after = "*";  if (!sel) placeholder = window.I18n.t("histoire.md.placeholder.text"); break;
      case "code":   before = "`";  after = "`";  if (!sel) placeholder = window.I18n.t("histoire.md.placeholder.code");  break;
      case "h1":     prefixLine = true; before = "# ";   if (!sel) placeholder = window.I18n.t("histoire.md.placeholder.h1"); break;
      case "h2":     prefixLine = true; before = "## ";  if (!sel) placeholder = window.I18n.t("histoire.md.placeholder.h2"); break;
      case "ul":     prefixLine = true; before = "- ";   if (!sel) placeholder = window.I18n.t("histoire.md.placeholder.ul"); break;
      case "quote":  prefixLine = true; before = "> ";   if (!sel) placeholder = window.I18n.t("histoire.md.placeholder.quote"); break;
      case "link":
        before = "[";
        after  = "](https://)";
        if (!sel) placeholder = window.I18n.t("histoire.md.placeholder.link");
        break;
      default: return;
    }

    let inserted, newStart, newEnd;
    if (prefixLine) {
      const lineStart = ta.value.lastIndexOf("\n", start - 1) + 1;
      if (sel.indexOf("\n") >= 0) {
        // Sélection multi-ligne : préfixe chaque ligne
        const lines = sel.split("\n").map(function(l) { return before + l; }).join("\n");
        inserted = ta.value.substring(0, start) + lines + ta.value.substring(end);
        newStart = start + before.length;
        newEnd   = start + lines.length;
      } else {
        // Insère marqueur en début de la ligne courante + placeholder
        const headPart = ta.value.substring(0, lineStart);
        const tailPart = ta.value.substring(lineStart);
        inserted = headPart + before + (sel || placeholder) + tailPart.substring(end - lineStart);
        newStart = lineStart + before.length;
        newEnd   = newStart + (sel || placeholder).length;
      }
    } else {
      inserted = ta.value.substring(0, start) + before + (sel || placeholder) + after +
                 ta.value.substring(end);
      newStart = start + before.length;
      newEnd   = newStart + (sel || placeholder).length;
    }

    ta.value = inserted;
    try { ta.focus(); ta.setSelectionRange(newStart, newEnd); } catch(e) {}
    // Déclenche input → auto-save via le listener existant
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function _onKey(e) {
    if (e.key === "Escape" && _modal) close();
  }

  function _switchMode(mode) {
    if (mode !== "note" && mode !== "pdf") return;
    _currentMode = mode;
    _modal.querySelectorAll(".kta-histoire-tab").forEach(function(btn) {
      btn.classList.toggle("kta-histoire-tab-active", btn.getAttribute("data-mode") === mode);
    });
    document.getElementById("kta-histoire-pane-note").style.display = (mode === "note") ? "" : "none";
    document.getElementById("kta-histoire-pane-pdf").style.display  = (mode === "pdf")  ? "" : "none";
    if (mode === "pdf") _renderPdf();
  }

  // _renderPdf : décide quelle source PDF afficher (embarqué > session > vide).
  // opts.force=true → re-render même si déjà fait (utilisé après import/delete).
  function _renderPdf(opts) {
    opts = opts || {};
    const wrap = document.getElementById("kta-histoire-pdf-wrap");
    const empty = document.getElementById("kta-histoire-pdf-empty");
    const toolbar = document.getElementById("kta-histoire-pdf-toolbar");
    const btnImport = document.getElementById("kta-histoire-pdf-import");
    const btnReplace = document.getElementById("kta-histoire-pdf-replace");
    const btnRemove = document.getElementById("kta-histoire-pdf-remove");
    const meta = document.getElementById("kta-histoire-pdf-meta");
    if (!wrap) return;

    // No-op si déjà rendu (sauf force)
    if (!opts.force) {
      if (wrap.querySelector("iframe") || wrap.querySelector(".kta-histoire-pdf-fallback")) {
        return;
      }
    } else {
      // Force : reset le wrap (revoke aussi l'iframe pour libérer la bitmap PDF iOS)
      const oldIframe = wrap.querySelector("iframe");
      if (oldIframe) {
        try { oldIframe.src = ""; } catch(e) {}
      }
      const fallback = wrap.querySelector(".kta-histoire-pdf-fallback");
      if (fallback) fallback.remove();
      if (oldIframe) oldIframe.remove();
    }

    // 1. Priorité absolue : PDF embarqué dans le plan
    const embeddedUrl = _getEmbeddedPdfUrl();
    if (embeddedUrl) {
      if (empty) empty.style.display = "none";
      if (toolbar) toolbar.style.display = "none";  // pas d'import si embarqué
      _displayPdfInWrap(embeddedUrl, "histoire.pdf");
      return;
    }

    // 2. Pas d'embarqué : on regarde la session IDB
    if (toolbar) toolbar.style.display = "flex";
    _loadSessionPdf().then(function(sessionInfo) {
      if (sessionInfo && sessionInfo.url) {
        if (empty) empty.style.display = "none";
        // Mode "PDF session présent" : meta + boutons Remplacer/Retirer
        if (btnImport)  btnImport.style.display  = "none";
        if (btnReplace) btnReplace.style.display = "";
        if (btnRemove)  btnRemove.style.display  = "";
        if (meta) {
          const sizeKb = Math.round((sessionInfo.size || 0) / 1024);
          meta.textContent = window.I18n.t("histoire.pdf.meta", { name: sessionInfo.name, kb: sizeKb });
        }
        _displayPdfInWrap(sessionInfo.url, sessionInfo.name);
      } else {
        // 3. Ni embarqué ni session : placeholder + bouton Importer
        if (empty) empty.style.display = "";
        if (btnImport)  btnImport.style.display  = "";
        if (btnReplace) btnReplace.style.display = "none";
        if (btnRemove)  btnRemove.style.display  = "none";
        if (meta) meta.textContent = "";
      }
    });
  }

  // Helper : injecte le viewer PDF (iframe ou fallback download) dans le wrap.
  function _displayPdfInWrap(url, name) {
    const wrap = document.getElementById("kta-histoire-pdf-wrap");
    if (!wrap) return;

    // Détection iOS : iframe PDF peu fiable → fallback bouton download
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
                  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const safeName = String(name || "histoire.pdf").replace(/"/g, "&quot;");

    if (isIOS) {
      wrap.insertAdjacentHTML("beforeend",
        '<div class="kta-histoire-pdf-fallback">' +
          '<p style="margin-bottom:12px;">' + window.I18n.t("histoire.pdf.ios.info") + '</p>' +
          '<a class="kta-btn kta-btn-primary" href="' + url + '" download="' + safeName + '" target="_blank" rel="noopener noreferrer">' +
            window.I18n.t("histoire.pdf.ios.open") +
          '</a>' +
        '</div>'
      );
    } else {
      // 🆕 v1.34.22 — En plus de l'iframe, on ajoute un petit bouton "Ouvrir"
      // en sticky en haut du wrap. (1) Si l'iframe est bloquée par CSP
      // (frame-src absent côté serveur), le user a au moins le bouton pour
      // ouvrir le PDF dans un nouvel onglet. (2) Même quand l'iframe marche,
      // certains users préfèrent ouvrir le PDF plein écran dans un onglet
      // dédié (zoom natif, copie texte, etc.).
      wrap.insertAdjacentHTML("beforeend",
        '<div class="kta-histoire-pdf-actions">' +
          '<a class="kta-btn kta-btn-ghost kta-histoire-pdf-action-open" ' +
             'href="' + url + '" target="_blank" rel="noopener noreferrer" ' +
             'title="' + window.I18n.t("histoire.pdf.openTab.title") + '">' +
            window.I18n.t("histoire.pdf.openTab") +
          '</a>' +
        '</div>'
      );
      const iframe = document.createElement("iframe");
      iframe.className = "kta-histoire-pdf-iframe";
      iframe.src = url;
      iframe.title = window.I18n.t("histoire.pdf.iframe.title", { name: (name || "histoire.pdf") });
      iframe.setAttribute("allow", "fullscreen");
      wrap.appendChild(iframe);
    }
  }

  // ========== PUBLIC API ==========
  function open() {
    _build();
    _modal.style.display = "flex";
    _switchMode(_currentMode);
    const ta = document.getElementById("kta-histoire-note");
    if (ta) ta.value = _loadNote();
  }

  function openTab(mode) {
    open();
    if (mode === "note" || mode === "pdf") _switchMode(mode);
  }

  function close() {
    if (!_modal) return;
    // Flush save note en cours
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
      const ta = document.getElementById("kta-histoire-note");
      if (ta) _saveNote(ta.value);
    }
    // 🐛 v1.34.20 (Pack RAM Phase 4 lesson) — Clear iframe src AVANT remove
    // pour libérer la bitmap PDF iOS. Sinon WebKit garde la texture pinned.
    const iframe = _modal.querySelector("iframe");
    if (iframe) {
      try { iframe.src = ""; } catch(e) {}
    }
    document.removeEventListener("keydown", _onKey);
    if (_modal.parentNode) _modal.parentNode.removeChild(_modal);
    _modal = null;
    // Revoke session PDF URL (l'embarqué reste géré par RUNTIME_ASSETS)
    if (_pdfBlobUrl) {
      try { URL.revokeObjectURL(_pdfBlobUrl); } catch(e) {}
      _pdfBlobUrl = null;
    }
    _sessionPdfMeta = null;
  }

  function isOpen() {
    return !!_modal;
  }

  // Hook plan switch : fermer la modale (la note du plan précédent est déjà
  // saved, on ne perd rien). Appelé par main.js > _libererRessourcesPlanPrecedent.
  function _onPlanSwitch() {
    close();
  }

  // 🆕 v1.34.29 — Helper d'import session (utilisé par interfaceImportExport.js
  // pour restaurer le Mode Histoire embarqué dans un .mkmsession.zip).
  // Pose la note libre + (éventuellement) le PDF de session sur le plan
  // courant. Cohérent avec la sémantique d'import des autres champs : on
  // remplace les données du plan courant par celles du fichier importé.
  //   - noteText : string (vide ou null = pas de note → on n'écrase rien)
  //   - pdfBlob  : Blob PDF ou null = pas de PDF (on ne supprime rien)
  //   - pdfName  : string suggéré pour le fichier
  // Renvoie Promise qui résout quand IDB est OK (note est sync).
  function importSessionData(noteText, pdfBlob, pdfName) {
    return new Promise(function(resolve) {
      try {
        // Note libre : si présente, on écrase la note courante du plan.
        if (typeof noteText === "string" && noteText.length > 0) {
          _saveNote(noteText);
        }
      } catch(e) {
        console.warn("[ModeHistoire] importSessionData note échec :", e);
      }
      // PDF : si présent, persist en IDB pour le plan courant.
      if (pdfBlob && pdfBlob.size > 0) {
        _idbSet(_currentPlanId(), pdfBlob, pdfName || "histoire.pdf")
          .then(function() { resolve(true); })
          .catch(function(err) {
            console.warn("[ModeHistoire] importSessionData PDF IDB échec :", err);
            resolve(false);
          });
      } else {
        resolve(true);
      }
    });
  }

  // ========== EXPORT ==========
  MH.open               = open;
  MH.openTab            = openTab;
  MH.close              = close;
  MH.isOpen             = isOpen;
  MH._onPlanSwitch      = _onPlanSwitch;
  MH.importSessionData  = importSessionData;  // 🆕 v1.34.29

  window.ModeHistoire = MH;

  console.log("[ModeHistoire] Module chargé (v1.34.20 — note libre + PDF embarqué/session IDB)");
})();
