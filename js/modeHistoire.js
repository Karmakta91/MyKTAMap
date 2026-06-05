/*!
 * MyKTAMap — modeHistoire.js (v1.34.19)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// MODE HISTOIRE — Note libre + PDF Histoire embarqué dans le plan
// =========================
// Feature v1.34.19 — Modale unifiée 2 onglets accessible via bouton 📖 dans
// la status bar (à côté de 📊 stats et 🔋 batterie).
//
// Onglet 1 — 📝 NOTE LIBRE :
//   Zone de texte éditable où l'user peut prendre des notes contextuelles
//   au plan. Persistée localStorage per-plan (clé "myktamap_note_libre_<planId>").
//   Auto-save sur input avec debounce 500ms.
//
// Onglet 2 — 📚 HISTOIRE :
//   Affiche un PDF embarqué dans le ZIP du plan via le champ
//   plan-config.json > histoirePdf: "data/histoire.pdf". Le PDF est résolu
//   via RUNTIME_ASSETS (donc lazy-loaded via _lazyZipRef si v1.34.11+
//   actif). Affichage via <iframe> natif. Fallback bouton "📥 Télécharger"
//   si iframe ne marche pas (iOS Safari peut être capricieux).
//   Si plan-config n'a pas histoirePdf → message "Aucun PDF embarqué".
//
// API publique :
//   window.ModeHistoire.open()       — ouvre la modale (mode défaut : note)
//   window.ModeHistoire.openTab(t)   — t = "note" | "pdf"
//   window.ModeHistoire.close()
//   window.ModeHistoire.isOpen()
//
// Au plan switch, la modale se ferme automatiquement (cf hook map.js +
// _libererRessourcesPlanPrecedent).
// =========================

(function() {
  "use strict";

  const MH = {};

  let _modal = null;
  let _currentMode = "note";  // "note" | "pdf"
  let _saveTimer = null;
  let _pdfBlobUrl = null;     // URL.createObjectURL pour le PDF (à revoke au close)

  // ========== LOCALSTORAGE NOTE LIBRE ==========
  function _noteKey() {
    const pid = window._currentLoadedPlanId || "default";
    return "myktamap_note_libre_" + pid;
  }

  function _loadNote() {
    try { return localStorage.getItem(_noteKey()) || ""; }
    catch(e) { return ""; }
  }

  function _saveNote(text) {
    try { localStorage.setItem(_noteKey(), String(text || "")); }
    catch(e) { console.warn("[ModeHistoire] localStorage save échec :", e); }
  }

  // ========== PDF HISTOIRE ==========
  function _getHistoirePdfUrl() {
    if (!window.PLAN_CONFIG || !window.PLAN_CONFIG.plan) return null;
    const path = window.PLAN_CONFIG.plan.histoirePdf;
    if (!path) return null;
    // Path déjà résolu par cloneAndResolvePlanConfig (v1.34.19) en blob URL
    // ou path serveur. Si c'est déjà une blob URL, on l'utilise direct.
    if (typeof path === "string" && path.indexOf("blob:") === 0) return path;
    // Sinon : résoudre via RUNTIME_ASSETS (si import local) ou laisser tel quel
    // (mode serveur HTTP — rare en pratique).
    if (typeof window.getRuntimeAssetUrl === "function") {
      const url = window.getRuntimeAssetUrl(path);
      if (url) return url;
    }
    return path;
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
            '<div id="kta-histoire-pdf-wrap" class="kta-histoire-pdf-wrap">' +
              '<div class="kta-histoire-pdf-empty" id="kta-histoire-pdf-empty">' +
                '<p>📚 Aucun PDF d\'histoire embarqué dans ce plan.</p>' +
                '<p style="font-size:12px; color:#8892a4;">L\'auteur du plan peut ajouter un PDF via le champ <code>histoirePdf</code> dans <code>plan-config.json</code>.</p>' +
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
  }

  function _onKey(e) {
    if (e.key === "Escape" && _modal) close();
  }

  function _switchMode(mode) {
    if (mode !== "note" && mode !== "pdf") return;
    _currentMode = mode;
    // Visual state tabs
    _modal.querySelectorAll(".kta-histoire-tab").forEach(function(btn) {
      btn.classList.toggle("kta-histoire-tab-active", btn.getAttribute("data-mode") === mode);
    });
    // Show/hide panes
    document.getElementById("kta-histoire-pane-note").style.display = (mode === "note") ? "" : "none";
    document.getElementById("kta-histoire-pane-pdf").style.display  = (mode === "pdf")  ? "" : "none";
    // Lazy-load PDF only when switching to PDF tab
    if (mode === "pdf") _renderPdf();
  }

  function _renderPdf() {
    const wrap = document.getElementById("kta-histoire-pdf-wrap");
    const empty = document.getElementById("kta-histoire-pdf-empty");
    if (!wrap) return;

    // Si déjà rendu, no-op (l'iframe persiste tant que la modale est ouverte)
    if (wrap.querySelector("iframe") || wrap.querySelector(".kta-histoire-pdf-fallback")) {
      return;
    }

    const url = _getHistoirePdfUrl();
    if (!url) {
      // Affiche le placeholder "Aucun PDF" (déjà dans le HTML)
      if (empty) empty.style.display = "";
      return;
    }
    if (empty) empty.style.display = "none";

    _pdfBlobUrl = url;

    // Détection iOS : iframe PDF peu fiable → fallback bouton download
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
                  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIOS) {
      // Fallback iOS : bouton télécharger qui ouvre dans l'app Files/Safari
      wrap.insertAdjacentHTML("beforeend",
        '<div class="kta-histoire-pdf-fallback">' +
          '<p style="margin-bottom:12px;">📱 Sur iOS, le PDF s\'ouvre dans l\'app PDF de ton appareil.</p>' +
          '<a class="kta-btn kta-btn-primary" href="' + url + '" download="histoire.pdf" target="_blank" rel="noopener noreferrer">' +
            '📥 Ouvrir le PDF' +
          '</a>' +
        '</div>'
      );
    } else {
      // Desktop / Android : iframe natif
      const iframe = document.createElement("iframe");
      iframe.className = "kta-histoire-pdf-iframe";
      iframe.src = url;
      iframe.title = "PDF Histoire du plan";
      iframe.setAttribute("allow", "fullscreen");
      wrap.appendChild(iframe);
    }
  }

  // ========== PUBLIC API ==========
  function open() {
    _build();
    _modal.style.display = "flex";
    _switchMode(_currentMode);  // restaure le mode précédent ou "note" par défaut
    // Recharger la note (cas plan switch entre 2 ouvertures)
    const ta = document.getElementById("kta-histoire-note");
    if (ta) ta.value = _loadNote();
  }

  function openTab(mode) {
    open();
    if (mode === "note" || mode === "pdf") _switchMode(mode);
  }

  function close() {
    if (!_modal) return;
    // Flush save en cours
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
      const ta = document.getElementById("kta-histoire-note");
      if (ta) _saveNote(ta.value);
    }
    document.removeEventListener("keydown", _onKey);
    if (_modal.parentNode) _modal.parentNode.removeChild(_modal);
    _modal = null;
    // Pas de revoke _pdfBlobUrl : la blob URL est gérée par RUNTIME_ASSETS
    // (libérée au plan switch via resetRuntimeAssets).
    _pdfBlobUrl = null;
  }

  function isOpen() {
    return !!_modal;
  }

  // Hook plan switch : fermer la modale (la note du plan précédent est déjà
  // saved, on ne perd rien). Appelé par main.js > _libererRessourcesPlanPrecedent
  // via le helper exposé.
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

  console.log("[ModeHistoire] Module chargé (v1.34.19 — note libre + PDF embarqué)");
})();
