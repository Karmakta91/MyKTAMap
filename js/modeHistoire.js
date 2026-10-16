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
//      (KARMA « si j'ai intégré un PDF dans un zip à la
//        génération, il ne remonte pas dans Mon Carnet > Récits ») : au
//        chargement du plan, chaque document embarqué est COPIÉ dans l'IDB
//        (`syncDocsEmbarques`). Il devient un document comme les autres —
//        donc visible dans le Carnet, qui lit l'IDB SANS charger le plan, et
//        **supprimable**. Le rouvrir depuis son plan le recrée : c'est le
//        comportement demandé, et il dispense d'une liste de pierres
//        tombales. L'affichage direct de l'embarqué reste en REPLI si la
//        copie échoue (quota, navigation privée, fetch KO).
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
  let _pdfBlobUrl = null;     // URL.createObjectURL du document AFFICHÉ (à revoke)
  let _sessionPdfMeta = null; // { id, name, size } du document affiché
  // multi-documents : id du document sélectionné dans la liste.
  // EMBED_ID = pseudo-id du PDF livré dans le ZIP (non supprimable, pas en IDB).
  const EMBED_ID = "__embed__";
  let _docSelectionne = null;

  // ========== IDB DOCUMENTS PDF (v1.34.20 · MULTI-DOCUMENTS depuis v1.69.0) ==========
  // v1 : 1 seul PDF par plan (`keyPath: "planId"`, un import écrasait le précédent).
  // v2 : N documents par plan → `keyPath: "id"` + index `by_plan`.
  // Le keyPath d'un store ne se change PAS : la migration lit les anciens
  // enregistrements dans la transaction `versionchange`, supprime le store et le
  // recrée. Chaque ancien PDF devient le document n°1 de son plan (jamais perdu).
  const IDB_NAME    = "myktamap_histoire_pdfs";
  const IDB_VERSION = 2;
  const IDB_STORE   = "pdfs";
  const IDB_INDEX   = "by_plan";

  // Garde-fous quota (décision KARMA 29/07 — 1:a). Sans eux, un seul PDF de
  // 80 Mo passait sans un mot, et la base n'apparaissait nulle part dans le
  // calcul « Stockage » (corrigé en même temps côté memInspector/homeProfile).
  const MAX_DOCS_PAR_PLAN = 10;
  const WARN_TOTAL_BYTES  = 25 * 1024 * 1024;    // avertissement au-delà
  const MAX_TOTAL_BYTES   = 100 * 1024 * 1024;   // refus au-delà

  let _idbPromise = null;

  function _genDocId() {
    return "doc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

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
        const tx = e.target.transaction;

        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const st = db.createObjectStore(IDB_STORE, { keyPath: "id" });
          st.createIndex(IDB_INDEX, "planId", { unique: false });
          return;
        }
        if (e.oldVersion >= 2) return;

        // ── Migration v1 → v2 (1 PDF/plan → N documents/plan) ──
        const anciens = [];
        const cur = tx.objectStore(IDB_STORE).openCursor();
        cur.onsuccess = function(ev) {
          const c = ev.target.result;
          if (c) { anciens.push(c.value); c.continue(); return; }
          // Tous les anciens sont en mémoire (Blobs = handles, pas des copies
          // d'octets) → on peut détruire et recréer le store dans la MÊME
          // transaction versionchange.
          db.deleteObjectStore(IDB_STORE);
          const neuf = db.createObjectStore(IDB_STORE, { keyPath: "id" });
          neuf.createIndex(IDB_INDEX, "planId", { unique: false });
          anciens.forEach(function(rec) {
            if (!rec || !rec.blob) return;
            neuf.put({
              id:      _genDocId(),
              planId:  rec.planId,
              blob:    rec.blob,
              name:    rec.name || "histoire.pdf",
              size:    rec.size || (rec.blob && rec.blob.size) || 0,
              addedAt: rec.addedAt || Date.now()
            });
          });
          console.log("[ModeHistoire] Migration IDB v1→v2 : " + anciens.length + " PDF conservé(s)");
        };
      };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function() { reject(req.error); };
    });
    return _idbPromise;
  }

  // Tous les documents d'un plan, du plus ancien au plus récent (ordre d'import).
  function _idbListe(planId) {
    return _idbOpen().then(function(db) {
      return new Promise(function(resolve) {
        try {
          const req = db.transaction(IDB_STORE, "readonly")
                        .objectStore(IDB_STORE).index(IDB_INDEX)
                        .getAll(IDBKeyRange.only(String(planId)));
          req.onsuccess = function() {
            const arr = req.result || [];
            arr.sort(function(a, b) { return (a.addedAt || 0) - (b.addedAt || 0); });
            resolve(arr);
          };
          req.onerror = function() { resolve([]); };
        } catch(e) { resolve([]); }
      });
    }).catch(function() { return []; });
  }

  function _idbGetDoc(id) {
    return _idbOpen().then(function(db) {
      return new Promise(function(resolve) {
        try {
          const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(String(id));
          req.onsuccess = function() { resolve(req.result || null); };
          req.onerror   = function() { resolve(null); };
        } catch(e) { resolve(null); }
      });
    }).catch(function() { return null; });
  }

  // COPIE D'UN DOCUMENT LIVRÉ AVEC LE PLAN.
  // Id DÉTERMINISTE (`embed_<planId>_<rang>`) + `put` : le plan peut être
  // rechargé dix fois sans jamais créer de doublon, et une copie supprimée
  // par l'utilisateur revient à la prochaine ouverture du plan.
  const EMBED_DOC_PREFIX = "embed_";
  function _idEmbed(planId, rang) {
    return EMBED_DOC_PREFIX + String(planId) + "_" + rang;
  }

  function _idbPoser(rec) {
    return _idbOpen().then(function(db) {
      return new Promise(function(resolve, reject) {
        try {
          const req = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).put(rec);
          req.onsuccess = function() { resolve(rec); };
          req.onerror   = function() { reject(req.error); };
        } catch(e) { reject(e); }
      });
    });
  }

  // Copie les documents embarqués du plan COURANT qui ne sont pas déjà en base.
  // Appelée à la fin du chargement d'un plan (`main.js`), jamais bloquante :
  // tout échec laisse l'affichage direct de l'embarqué prendre le relais.
  function syncDocsEmbarques() {
    const embarques = _getEmbeddedPdfUrls();
    if (!embarques.length) return Promise.resolve(0);
    const planId = _currentPlanId();
    if (!planId || planId === "default") return Promise.resolve(0);

    return _idbListe(planId).then(function(docs) {
      const parRang = {};
      let octets = 0;
      docs.forEach(function(d) {
        octets += Number(d.size) || 0;
        if (d.embarque && d.embedIdx !== undefined && d.embedIdx !== null) parRang[d.embedIdx] = true;
      });

      // Un plan qui livrerait 30 documents ne doit pas remplir la base à lui
      // seul : mêmes plafonds que pour un import manuel (nombre ET poids).
      let places = MAX_DOCS_PAR_PLAN - docs.length;
      const aFaire = [];
      embarques.forEach(function(e, i) {
        if (parRang[i]) return;              // déjà copié : on ne refetch MÊME PAS
        if (places <= 0) return;
        places--;
        aFaire.push({ rang: i, url: e.url, name: e.name });
      });
      if (!aFaire.length) return 0;

      let posees = 0;
      return aFaire.reduce(function(chaine, item) {
        return chaine.then(function() {
          return fetch(item.url).then(function(r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.blob();
          }).then(function(blob) {
            const taille = blob.size || 0;
            if (octets + taille > MAX_TOTAL_BYTES) {
              console.warn("[ModeHistoire] copie embarquée ignorée (plafond de poids) :", item.name);
              return;
            }
            octets += taille;
            return _idbPoser({
              id:       _idEmbed(planId, item.rang),
              planId:   String(planId),
              blob:     blob,
              name:     item.name || "histoire.pdf",
              size:     taille,
              addedAt:  Date.now(),
              embarque: true,      // → libellé « livré avec le plan »
              embedIdx: item.rang  // → sert à ne PAS afficher l'embarqué en double
            }).then(function() { posees++; });
          }).catch(function(e) {
            // Rien de fatal : l'onglet Histoire affichera l'embarqué en direct.
            console.warn("[ModeHistoire] copie de « " + item.name + " » impossible :", e);
          });
        });
      }, Promise.resolve()).then(function() {
        if (posees) console.log("[ModeHistoire] " + posees + " document(s) du plan copié(s) — visibles dans le Carnet");
        return posees;
      });
    }).catch(function(e) {
      console.warn("[ModeHistoire] synchro des documents embarqués échouée :", e);
      return 0;
    });
  }

  function _idbAjouter(planId, blob, name) {
    return _idbOpen().then(function(db) {
      return new Promise(function(resolve, reject) {
        const rec = {
          id:      _genDocId(),
          planId:  String(planId),
          blob:    blob,
          name:    String(name || "histoire.pdf"),
          size:    blob.size || 0,
          addedAt: Date.now()
        };
        try {
          const req = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).add(rec);
          req.onsuccess = function() { resolve(rec); };
          req.onerror   = function() { reject(req.error); };
        } catch(e) { reject(e); }
      });
    });
  }

  function _idbDel(id) {
    return _idbOpen().then(function(db) {
      return new Promise(function(resolve, reject) {
        try {
          const req = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).delete(String(id));
          req.onsuccess = function() { resolve(); };
          req.onerror   = function() { reject(req.error); };
        } catch(e) { reject(e); }
      });
    });
  }

  // Vérifie les garde-fous AVANT d'écrire. Retourne null si OK, sinon un message.
  // `avertir` (fonction) est appelé pour les cas non bloquants.
  function _verifierQuota(docs, file, avertir) {
    if (docs.length >= MAX_DOCS_PAR_PLAN) {
      return window.I18n.t("histoire.pdf.err.tropDeDocs", { max: MAX_DOCS_PAR_PLAN });
    }
    let total = 0;
    docs.forEach(function(d) { total += Number(d.size) || 0; });
    const apres = total + (file.size || 0);
    if (apres > MAX_TOTAL_BYTES) {
      return window.I18n.t("histoire.pdf.err.tropLourd", { max: Math.round(MAX_TOTAL_BYTES / 1048576) });
    }
    if (apres > WARN_TOTAL_BYTES && typeof avertir === "function") {
      avertir(window.I18n.t("histoire.pdf.warn.taille", { mo: Math.round(apres / 1048576) }));
    }
    return null;
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

  // ========== PDF EMBARQUÉS (plan-config.json) ==========
  // MULTI : lit `plan.histoirePdfs[]` (générateur v1.71+), avec
  // repli sur `plan.histoirePdf` (chaîne unique, plans antérieurs). ⚠️ Quand
  // les DEUX existent, histoirePdf est le 1er élément du tableau — ne JAMAIS
  // concaténer les deux sources (doublon garanti).
  function _resoudreCheminEmbed(path) {
    if (!path) return null;
    if (typeof path === "string" && path.indexOf("blob:") === 0) return path;
    if (typeof window.getRuntimeAssetUrl === "function") {
      const url = window.getRuntimeAssetUrl(path);
      if (url) return url;
    }
    return path;
  }
  function _getEmbeddedPdfUrls() {
    if (!window.PLAN_CONFIG || !window.PLAN_CONFIG.plan) return [];
    const plan = window.PLAN_CONFIG.plan;
    const sources = Array.isArray(plan.histoirePdfs) && plan.histoirePdfs.length
      ? plan.histoirePdfs
      : (plan.histoirePdf ? [plan.histoirePdf] : []);
    const out = [];
    sources.forEach(function(p, i) {
      const url = _resoudreCheminEmbed(p);
      if (!url) return;
      const base = (typeof p === "string" && p.indexOf("blob:") !== 0)
        ? String(p).split("/").pop() : ("histoire-" + (i + 1) + ".pdf");
      out.push({ url: url, name: base });
    });
    return out;
  }


  // ========== DOCUMENTS PDF DU PLAN (IDB, multi depuis v1.69.0) ==========

  // Documents importés du plan courant (métadonnées + Blob handle).
  function _docsImportes() {
    return _idbListe(_currentPlanId());
  }

  // Crée la blob URL d'un document et révoque la précédente (fuite bitmap iOS
  // — leçon Pack RAM Phase 4 : une seule URL vivante à la fois).
  function _urlDeDoc(id) {
    return _idbGetDoc(id).then(function(rec) {
      if (!rec || !rec.blob) return null;
      if (_pdfBlobUrl) {
        try { URL.revokeObjectURL(_pdfBlobUrl); } catch(e) {}
        _pdfBlobUrl = null;
      }
      _pdfBlobUrl = URL.createObjectURL(rec.blob);
      _sessionPdfMeta = { id: rec.id, name: rec.name, size: rec.size };
      return { url: _pdfBlobUrl, name: rec.name, size: rec.size, id: rec.id,
               fourni: !!rec.embarque };
    });
  }

  // Ajoute un document (ne remplace plus rien) après contrôle des garde-fous.
  function _ajouterDoc(file) {
    if (!file) return Promise.reject(new Error("Pas de fichier"));
    return _docsImportes().then(function(docs) {
      const err = _verifierQuota(docs, file, function(msg) {   // l'ajout continue : avertissement → toast warn
        if (window.OOMGuard && window.OOMGuard.showToast) window.OOMGuard.showToast(msg, "warn", { important: true });
        else window.ktaAlerte(msg);
      });
      if (err) { const e = new Error(err); e.code = "QUOTA"; throw e; }
      return _idbAjouter(_currentPlanId(), file, file.name);
    });
  }

  function _supprimerDoc(id) {
    return _idbDel(id).then(function() {
      if (_sessionPdfMeta && _sessionPdfMeta.id === id && _pdfBlobUrl) {
        try { URL.revokeObjectURL(_pdfBlobUrl); } catch(e) {}
        _pdfBlobUrl = null;
        _sessionPdfMeta = null;
      }
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
              '<button class="kta-btn kta-btn-danger" type="button" id="kta-histoire-pdf-remove" style="display:none;">' + t("histoire.pdf.remove") + '</button>' +
            '</div>' +
            // liste des documents (N par plan). Le PDF embarqué dans
            // le ZIP y figure aussi, en lecture seule : il n'appartient pas à
            // l'utilisateur, seul le générateur peut le changer.
            '<div class="kta-histoire-pdf-docs" id="kta-histoire-pdf-docs" style="display:none;"></div>' +
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

    // Wire PDF import / suppression (v1.34.20 · multi-documents v1.69.0)
    const fileInput = document.getElementById("kta-histoire-pdf-input");
    const btnImport = document.getElementById("kta-histoire-pdf-import");
    const btnRemove = document.getElementById("kta-histoire-pdf-remove");

    if (btnImport) {
      btnImport.addEventListener("click", function() { if (fileInput) fileInput.click(); });
    }

    if (fileInput) {
      fileInput.addEventListener("change", function() {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        // Garde-fou : MIME / extension
        const isPdf = (f.type === "application/pdf") || /\.pdf$/i.test(f.name || "");
        if (!isPdf) {
          window.ktaAlerte(window.I18n.t("histoire.pdf.err.onlyPdf"));
          fileInput.value = "";
          return;
        }
        _ajouterDoc(f).then(function(rec) {
          fileInput.value = "";
          _docSelectionne = rec.id;   // on affiche celui qu'on vient d'ajouter
          _renderPdf({ force: true });
        }).catch(function(e) {
          fileInput.value = "";
          if (e && e.code === "QUOTA") { window.ktaAlerte(e.message, { type: "erreur" }); return; }
          console.error("[ModeHistoire] ajout document échec :", e);
          window.ktaAlerte(window.I18n.t("histoire.pdf.err.saveFail", { ko: (e.message || e) }), { type: "erreur" });
        });
      });
    }

    // Supprime le document AFFICHÉ (jamais l'embarqué : le bouton est masqué
    // quand la sélection vient du ZIP).
    if (btnRemove) {
      btnRemove.addEventListener("click", async function() {
        if (!_docSelectionne || String(_docSelectionne).indexOf(EMBED_ID) === 0) return;
        if (!(await window.ktaConfirm(window.I18n.t("histoire.pdf.removeConfirm")))) return;
        _supprimerDoc(_docSelectionne).then(function() {
          _docSelectionne = null;
          _renderPdf({ force: true });
        }).catch(function(e) {
          console.error("[ModeHistoire] suppression document échec :", e);
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

  // _renderPdf : construit la liste des documents du plan (embarqué + importés)
  // et affiche celui qui est sélectionné.
  // opts.force=true → re-render même si déjà fait (après import/suppression).
  //
  // ⚠️ l'embarqué ne MASQUE plus l'import. Avant, un plan livré avec
  // un PDF interdisait d'en ajouter (toolbar cachée) — l'user ne pouvait rien
  // joindre à ces plans-là. Il est maintenant une entrée de la liste parmi les
  // autres, simplement non supprimable.
  function _renderPdf(opts) {
    opts = opts || {};
    const wrap = document.getElementById("kta-histoire-pdf-wrap");
    const empty = document.getElementById("kta-histoire-pdf-empty");
    const toolbar = document.getElementById("kta-histoire-pdf-toolbar");
    const btnRemove = document.getElementById("kta-histoire-pdf-remove");
    const meta = document.getElementById("kta-histoire-pdf-meta");
    if (!wrap) return;

    if (!opts.force && wrap.getAttribute("data-rendu") === "1") return;

    // Reset du wrap : vider l'iframe AVANT de la retirer (bitmap PDF épinglée
    // sur WebKit sinon).
    const oldIframe = wrap.querySelector("iframe");
    if (oldIframe) { try { oldIframe.src = ""; } catch(e) {} oldIframe.remove(); }
    const fallback = wrap.querySelector(".kta-histoire-pdf-fallback");
    if (fallback) fallback.remove();
    const actions = wrap.querySelector(".kta-histoire-pdf-actions");
    if (actions) actions.remove();
    wrap.setAttribute("data-rendu", "1");

    if (toolbar) toolbar.style.display = "flex";

    const embarques = _getEmbeddedPdfUrls();

    _docsImportes().then(function(docs) {
      const liste = [];
      // un document embarqué DÉJÀ COPIÉ en base ne doit pas
      // apparaître deux fois : la copie le représente, et c'est elle qui est
      // supprimable. L'entrée « embarquée » ci-dessous n'est plus qu'un REPLI,
      // pour le cas où la copie n'a pas pu se faire.
      const copies = {};
      docs.forEach(function(d) {
        if (d.embarque && d.embedIdx !== undefined && d.embedIdx !== null) copies[d.embedIdx] = true;
      });
      embarques.forEach(function(e, i) {
        if (copies[i]) return;
        liste.push({ id: EMBED_ID + i, name: (embarques.length > 1 ? "📕 " + e.name : window.I18n.t("histoire.pdf.embarque")),
                     size: 0, embarque: true, url: e.url, nomFichier: e.name });
      });
      docs.forEach(function(d) {
        liste.push({ id: d.id, name: (d.embarque ? "📕 " + d.name : d.name),
                     size: d.size, embarque: false });
      });

      _renderDocsListe(liste);

      if (liste.length === 0) {
        if (empty) empty.style.display = "";
        if (btnRemove) btnRemove.style.display = "none";
        if (meta) meta.textContent = "";
        _docSelectionne = null;
        return;
      }
      if (empty) empty.style.display = "none";

      // Sélection : celle en cours si elle existe encore, sinon la première.
      let sel = null;
      for (let i = 0; i < liste.length; i++) {
        if (liste[i].id === _docSelectionne) { sel = liste[i]; break; }
      }
      if (!sel) sel = liste[0];
      _docSelectionne = sel.id;
      _marquerDocActif(sel.id);

      if (btnRemove) btnRemove.style.display = sel.embarque ? "none" : "";

      if (sel.embarque) {
        if (meta) meta.textContent = window.I18n.t("histoire.pdf.embarqueMeta");
        _displayPdfInWrap(sel.url, sel.nomFichier || "histoire.pdf");
        return;
      }
      _urlDeDoc(sel.id).then(function(info) {
        if (!info) { _docSelectionne = null; _renderPdf({ force: true }); return; }
        if (meta) {
          meta.textContent = window.I18n.t(
            info.fourni ? "histoire.pdf.metaFourni" : "histoire.pdf.meta", {
              name: info.name, kb: Math.round((info.size || 0) / 1024)
            });
        }
        _displayPdfInWrap(info.url, info.name);
      });
    });
  }

  // Rangée par document : clic = afficher. La liste est masquée s'il n'y a
  // qu'un seul document (une liste d'un élément n'apprend rien).
  function _renderDocsListe(liste) {
    const box = document.getElementById("kta-histoire-pdf-docs");
    if (!box) return;
    if (liste.length < 2) { box.style.display = "none"; box.innerHTML = ""; return; }
    box.style.display = "";
    box.innerHTML = liste.map(function(d, i) {
      const ko = d.size ? (" · " + Math.round(d.size / 1024) + " Ko") : "";
      return '<button type="button" class="kta-histoire-doc" data-id="' + String(d.id).replace(/"/g, "") + '" ' +
               'data-i="' + i + '">' +
               (d.embarque ? "📕 " : "📄 ") +
               '<span class="kta-histoire-doc-nom">' + window.kta_escapeHtml(d.name || "?") + '</span>' +
               '<span class="kta-histoire-doc-meta">' + ko + '</span>' +
             '</button>';
    }).join("");
    box.querySelectorAll(".kta-histoire-doc").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const id = btn.getAttribute("data-id");
        if (!id || id === _docSelectionne) return;
        _docSelectionne = id;
        _renderPdf({ force: true });
      });
    });
  }

  function _marquerDocActif(id) {
    const box = document.getElementById("kta-histoire-pdf-docs");
    if (!box) return;
    box.querySelectorAll(".kta-histoire-doc").forEach(function(btn) {
      btn.classList.toggle("kta-histoire-doc-actif", btn.getAttribute("data-id") === String(id));
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
      // En plus de l'iframe, on ajoute un petit bouton "Ouvrir"
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
    // (Pack RAM Phase 4 lesson) — Clear iframe src AVANT remove
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

  // Helper d'import session (utilisé par interfaceImportExport.js
  // pour restaurer le Mode Histoire embarqué dans un .mkmsession.zip).
  // Pose la note libre + (éventuellement) le PDF de session sur le plan
  // courant. Cohérent avec la sémantique d'import des autres champs : on
  // remplace les données du plan courant par celles du fichier importé.
  //   - noteText : string (vide ou null = pas de note → on n'écrase rien)
  //   - docs     : 📄 v1.69.0 — TABLEAU [{blob, name}] de documents à AJOUTER.
  //                Ancienne signature (pdfBlob, pdfName) encore acceptée.
  // Renvoie Promise qui résout quand IDB est OK (note est sync).
  function importSessionData(noteText, docs, pdfNameLegacy) {
    // Rétrocompat d'appel : importSessionData(note, blob, name)
    if (docs && typeof docs.size === "number" && !Array.isArray(docs)) {
      docs = [{ blob: docs, name: pdfNameLegacy || "histoire.pdf" }];
    }
    const liste = Array.isArray(docs) ? docs.filter(function(d) { return d && d.blob && d.blob.size > 0; }) : [];
    return new Promise(function(resolve) {
      try {
        // Note libre : si présente, on écrase la note courante du plan.
        if (typeof noteText === "string" && noteText.length > 0) {
          _saveNote(noteText);
        }
      } catch(e) {
        console.warn("[ModeHistoire] importSessionData note échec :", e);
      }
      // PDF : AJOUTÉS aux documents du plan courant.
      // c'était un `put` sur la clé du plan → réimporter une
      // session écrasait le PDF déjà en place. Depuis le multi-documents, on
      // ajoute — l'import n'efface plus rien (cohérent avec « merge » ailleurs).
      if (liste.length === 0) { resolve(true); return; }
      const planId = _currentPlanId();
      Promise.all(liste.map(function(d) {
        return _idbAjouter(planId, d.blob, d.name || "histoire.pdf");
      })).then(function() { resolve(true); })
        .catch(function(err) {
          console.warn("[ModeHistoire] importSessionData PDF IDB échec :", err);
          resolve(false);
        });
    });
  }

  // ========== EXPORT ==========
  MH.open               = open;
  MH.openTab            = openTab;
  MH.close              = close;
  MH.isOpen             = isOpen;
  MH._onPlanSwitch      = _onPlanSwitch;
  MH.importSessionData  = importSessionData;

  // appelée par `main.js` à la fin du chargement d'un plan.
  MH.syncDocsEmbarques = syncDocsEmbarques;

  window.ModeHistoire = MH;

  console.log("[ModeHistoire] Module chargé (note libre + documents PDF multiples, IDB v" + IDB_VERSION + ")");
})();
