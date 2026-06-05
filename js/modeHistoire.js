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
    _modal = document.createElement("div");
    _modal.id = "kta-histoire-modal";
    _modal.className = "kta-readme-modal-overlay";
    _modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-histoire-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">📖 Mode Histoire</span>' +
          '<button class="kta-panneau-close" id="kta-histoire-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-histoire-tabs" role="tablist">' +
          '<button class="kta-histoire-tab" id="kta-histoire-tab-note" role="tab" type="button" data-mode="note">📝 Note libre</button>' +
          '<button class="kta-histoire-tab" id="kta-histoire-tab-pdf" role="tab" type="button" data-mode="pdf">📚 Histoire</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-histoire-corps">' +
          // === ONGLET NOTE LIBRE ===
          '<div class="kta-histoire-pane" id="kta-histoire-pane-note">' +
            '<textarea id="kta-histoire-note" class="kta-histoire-textarea" ' +
              'placeholder="Tes notes libres sur ce plan… Sauvegarde automatique."' +
              'autocomplete="off" spellcheck="true"></textarea>' +
            '<div class="kta-histoire-note-status" id="kta-histoire-note-status">Sauvé.</div>' +
          '</div>' +
          // === ONGLET HISTOIRE (PDF) ===
          '<div class="kta-histoire-pane" id="kta-histoire-pane-pdf" style="display:none;">' +
            // Toolbar (import / supprimer) — visible selon contexte (v1.34.20)
            '<div class="kta-histoire-pdf-toolbar" id="kta-histoire-pdf-toolbar" style="display:none;">' +
              '<span class="kta-histoire-pdf-meta" id="kta-histoire-pdf-meta"></span>' +
              '<input type="file" id="kta-histoire-pdf-input" accept="application/pdf,.pdf" style="display:none;">' +
              '<button class="kta-btn kta-btn-ghost" type="button" id="kta-histoire-pdf-import">📥 Importer un PDF</button>' +
              '<button class="kta-btn kta-btn-ghost" type="button" id="kta-histoire-pdf-replace" style="display:none;">🔄 Remplacer</button>' +
              '<button class="kta-btn kta-btn-danger" type="button" id="kta-histoire-pdf-remove" style="display:none;">🗑️ Retirer</button>' +
            '</div>' +
            // Viewer wrap (iframe ou fallback)
            '<div id="kta-histoire-pdf-wrap" class="kta-histoire-pdf-wrap">' +
              '<div class="kta-histoire-pdf-empty" id="kta-histoire-pdf-empty">' +
                '<p>📚 Aucun PDF d\'histoire pour ce plan.</p>' +
                '<p style="font-size:12px; color:#8892a4;">Tu peux <strong>importer un PDF de session</strong> avec le bouton ci-dessus (1 PDF par plan, sauvegardé localement sur ton appareil — survit aux rechargements, supprimé seulement si tu choisis « 🗑️ Retirer » ou que tu vides les données du site).</p>' +
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

    // Wire note auto-save
    const ta = document.getElementById("kta-histoire-note");
    ta.value = _loadNote();
    ta.addEventListener("input", function() {
      const status = document.getElementById("kta-histoire-note-status");
      if (status) status.textContent = "Modifié…";
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(function() {
        _saveNote(ta.value);
        if (status) status.textContent = "Sauvé.";
      }, 500);
    });

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
          alert("⚠️ Seul un fichier PDF est accepté.");
          fileInput.value = "";
          return;
        }
        _saveSessionPdf(f).then(function() {
          fileInput.value = "";
          _renderPdf({ force: true });
        }).catch(function(e) {
          console.error("[ModeHistoire] saveSessionPdf échec :", e);
          alert("⚠️ Échec de l'enregistrement du PDF : " + (e.message || e));
          fileInput.value = "";
        });
      });
    }

    if (btnRemove) {
      btnRemove.addEventListener("click", function() {
        if (!confirm("Retirer le PDF d'histoire de ce plan ? (Tes notes restent intactes.)")) return;
        _deleteSessionPdf().then(function() {
          _renderPdf({ force: true });
        }).catch(function(e) {
          console.error("[ModeHistoire] deleteSessionPdf échec :", e);
        });
      });
    }
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
          meta.textContent = "📥 " + sessionInfo.name + " · " + sizeKb + " Ko (session)";
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

    if (isIOS) {
      const safeName = String(name || "histoire.pdf").replace(/"/g, "&quot;");
      wrap.insertAdjacentHTML("beforeend",
        '<div class="kta-histoire-pdf-fallback">' +
          '<p style="margin-bottom:12px;">📱 Sur iOS, le PDF s\'ouvre dans l\'app PDF de ton appareil.</p>' +
          '<a class="kta-btn kta-btn-primary" href="' + url + '" download="' + safeName + '" target="_blank" rel="noopener noreferrer">' +
            '📥 Ouvrir le PDF' +
          '</a>' +
        '</div>'
      );
    } else {
      const iframe = document.createElement("iframe");
      iframe.className = "kta-histoire-pdf-iframe";
      iframe.src = url;
      iframe.title = "PDF Histoire — " + (name || "histoire.pdf");
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

  // ========== EXPORT ==========
  MH.open          = open;
  MH.openTab       = openTab;
  MH.close         = close;
  MH.isOpen        = isOpen;
  MH._onPlanSwitch = _onPlanSwitch;

  window.ModeHistoire = MH;

  console.log("[ModeHistoire] Module chargé (v1.34.20 — note libre + PDF embarqué/session IDB)");
})();
