// =========================
// 🏷️ LegendCustomization (v1.16.0 step 2)
// =========================
//
// Module de personnalisation de la légende (libellés + visibilité +
// entrées custom). Cascade à 3 niveaux :
//
//   1. session  (overrides de l'utilisateur, persisté dans SessionPersist
//                — lié au plan courant, perdu si l'user change de plan
//                et y revient avec une session différente)
//   2. plan     (PLAN_CONFIG.customLegend — défini par l'auteur du plan)
//   3. default  (libellés hardcodés ci-dessous, charte MKM)
//
// Le resolver applique la cascade en order croissant : session > plan >
// default. Pour la visibilité : explicit-true / explicit-false / undefined
// = suivre le niveau supérieur.
//
// API publique :
//   window.LegendCustomization.getLabel(category, key)        → string
//   window.LegendCustomization.isVisible(category, key)       → bool
//   window.LegendCustomization.getSource(category, key)       → "session"|"plan"|"default"
//   window.LegendCustomization.listEntries(category)          → Entry[]
//   window.LegendCustomization.listCustomEntries(category)    → CustomEntry[]
//   window.LegendCustomization.setSessionLabel(cat, key, lbl) → void
//   window.LegendCustomization.setSessionVisibility(cat, key, vis)
//   window.LegendCustomization.addCustomEntry(entry)          → string (id)
//   window.LegendCustomization.removeCustomEntry(id)
//   window.LegendCustomization.resetSession()
//
//   Hooks SessionPersist :
//     window.LegendCustomization.loadSessionState(state)
//     window.LegendCustomization.getSessionState()        → serializable
//
//   Hook plan switch (appelé par main.js après PLAN_CONFIG load) :
//     window.LegendCustomization.loadPlanState()
//
// Catégories supportées :
//   - icones      (puits, signalétique, etc.)
//   - traces      (principal, secondaire, chemin, jonction)
//   - zones       (eau, remblais, effondrement, inaccessible)
//   - structures  (pilier-1, pilier-2, mur, front-1, front-2)
//
// Format de stockage (session ET plan) :
//   {
//     labels: { "<cat>.<key>": "Libellé override" },
//     hidden: { "<cat>.<key>": true/false },
//     customEntries: [
//       { id, category, label, lineColor?, fillColor?, borderColor?, iconUrl? }
//     ]
//   }
//
// Hash de version : si on change la structure, bumper SCHEMA_VERSION pour
// invalider gracieusement les anciennes sessions.

window.LegendCustomization = (function() {
  "use strict";

  const SCHEMA_VERSION = 1;

  // ─────────────────────────────────────────────
  // Libellés défaut (charte MKM — synchro exporter.js > _dessinerLegende)
  // ─────────────────────────────────────────────
  const DEFAULT_LABELS = {
    icones: {
      salle: "Salle", pa: "Puits Aération", pc: "Puits Comblé",
      pb: "Puits Bouché", pe: "Puits au sol / Bassin", ps: "Puits extraction",
      peo: "Puits à échelon ouvert", pef: "Puits à échelon fermé",
      eso: "Escalier service ouvert", esf: "Escalier service fermé",
      cao: "Cavage ouvert", caf: "Cavage fermé",
      passage: "Passage", chatiere: "Chatière", vehicule: "Véhicule",
      danger: "Danger", info: "Information", elec: "Électricité", epure: "Épure",
      plaque: "Plaque indication"
    },
    traces: {
      principal:  "Route principale",
      secondaire: "Route secondaire",
      chemin:     "Chemin",
      jonction:   "Jonction interniveau"
    },
    zones: {
      eau:          "Eau",
      remblais:     "Remblais",
      effondrement: "Effondrement",
      inaccessible: "Inaccessible"
    },
    structures: {
      "pilier-1":  "Pilier 1ère masse",
      "pilier-2":  "Pilier 2e masse",
      "mur":       "Mur",
      "front-1":   "Front de taille 1ère",
      "front-2":   "Front de taille 2e"
    }
  };

  // Rendus défaut (couleurs/icônes) pour les entrées non-icones.
  // Pour icones, le rendu vient de _iconePourTag dans exporter.js.
  const DEFAULT_RENDERS = {
    traces: {
      principal:  { lineColor: "#00ff00" },
      secondaire: { lineColor: "#b000ff" },
      chemin:     { lineColor: "#ffff00" },
      jonction:   { lineColor: "#ff4ecb" }
    },
    zones: {
      eau:          { fillColor: "#3aa9e8", borderColor: "#0066aa" },
      remblais:     { fillColor: "#5a5a68", borderColor: "#3a3a44" },
      effondrement: { fillColor: "#ff3333", borderColor: "#cc0000" },
      inaccessible: { fillColor: "#7a0000", borderColor: "#5a0a0a" }
    },
    structures: {
      "pilier-1":  { fillColor: "#f4c542", borderColor: "#000000" },
      "pilier-2":  { fillColor: "#ff9933", borderColor: "#000000" },
      "mur":       { fillColor: "#1e3a8a", borderColor: "#000000" },
      "front-1":   { lineColor:  "#f4c542" },
      "front-2":   { lineColor:  "#ff9933" }
    }
  };

  const CATEGORIES = ["icones", "traces", "zones", "structures"];
  const CATEGORY_TITLES = {
    icones:     "🏷️ Icônes",
    traces:     "🛣️ Tracés",
    zones:      "⬛ Zones",
    structures: "🏛️ Structures"
  };

  // ─────────────────────────────────────────────
  // États session + plan (cascade)
  // ─────────────────────────────────────────────
  function _emptyState() {
    return { labels: {}, hidden: {}, customEntries: [] };
  }

  let _sessionState = _emptyState();
  let _planState    = _emptyState();

  function _normalize(state) {
    const s = state || {};
    return {
      labels:        (s.labels && typeof s.labels === "object") ? s.labels : {},
      hidden:        (s.hidden && typeof s.hidden === "object") ? s.hidden : {},
      customEntries: Array.isArray(s.customEntries) ? s.customEntries.slice() : []
    };
  }

  function loadSessionState(state) {
    _sessionState = _normalize(state);
  }

  function getSessionState() {
    // Retourne un snapshot sérialisable (deep copy minimale)
    return {
      schemaVersion: SCHEMA_VERSION,
      labels:        Object.assign({}, _sessionState.labels),
      hidden:        Object.assign({}, _sessionState.hidden),
      customEntries: _sessionState.customEntries.map(function(e) { return Object.assign({}, e); })
    };
  }

  function isSessionStateEmpty() {
    return Object.keys(_sessionState.labels).length === 0
        && Object.keys(_sessionState.hidden).length === 0
        && _sessionState.customEntries.length === 0;
  }

  function loadPlanState() {
    const config = window.PLAN_CONFIG;
    _planState = _normalize(config && config.customLegend);
  }

  // ─────────────────────────────────────────────
  // Cascade resolvers
  // ─────────────────────────────────────────────
  function _key(category, key) {
    return category + "." + key;
  }

  function getDefaultLabel(category, key) {
    return (DEFAULT_LABELS[category] && DEFAULT_LABELS[category][key]) || key;
  }

  function getLabel(category, key) {
    const k = _key(category, key);
    if (_sessionState.labels[k] != null && _sessionState.labels[k] !== "") return _sessionState.labels[k];
    if (_planState.labels[k]    != null && _planState.labels[k]    !== "") return _planState.labels[k];
    return getDefaultLabel(category, key);
  }

  function isVisible(category, key) {
    const k = _key(category, key);
    // session a la priorité (true = caché, false = explicite show, undefined = fallthrough)
    if (_sessionState.hidden[k] === true)  return false;
    if (_sessionState.hidden[k] === false) return true;
    if (_planState.hidden[k]    === true)  return false;
    if (_planState.hidden[k]    === false) return true;
    return true; // défaut visible
  }

  function getSource(category, key) {
    const k = _key(category, key);
    if (_sessionState.labels[k] != null && _sessionState.labels[k] !== "") return "session";
    if (_planState.labels[k]    != null && _planState.labels[k]    !== "") return "plan";
    return "default";
  }

  // ─────────────────────────────────────────────
  // Liste des entrées (cascade appliquée)
  // ─────────────────────────────────────────────
  function listEntries(category) {
    const out = [];
    Object.keys(DEFAULT_LABELS[category] || {}).forEach(function(key) {
      const r = (DEFAULT_RENDERS[category] && DEFAULT_RENDERS[category][key]) || {};
      out.push({
        category:     category,
        key:          key,
        label:        getLabel(category, key),
        defaultLabel: getDefaultLabel(category, key),
        planLabel:    _planState.labels[_key(category, key)] || null,
        visible:      isVisible(category, key),
        source:       getSource(category, key),
        lineColor:    r.lineColor,
        fillColor:    r.fillColor,
        borderColor:  r.borderColor,
        isCustom:     false
      });
    });
    return out;
  }

  function listCustomEntries(category) {
    // Custom entries provenant des 2 niveaux (plan + session). Pas de
    // déduplication — chaque entrée a son id unique.
    const out = [];
    _planState.customEntries.forEach(function(e) {
      if (!category || e.category === category) {
        out.push(Object.assign({}, e, { isCustom: true, source: "plan", visible: isCustomVisible(e.id) }));
      }
    });
    _sessionState.customEntries.forEach(function(e) {
      if (!category || e.category === category) {
        out.push(Object.assign({}, e, { isCustom: true, source: "session", visible: isCustomVisible(e.id) }));
      }
    });
    return out;
  }

  function isCustomVisible(id) {
    // Visibilité d'une entrée custom : même mécanisme via hidden map avec
    // clé spéciale "custom.<id>". Permet à un user de masquer une custom
    // entry du plan sans la supprimer.
    const k = "custom." + id;
    if (_sessionState.hidden[k] === true)  return false;
    if (_sessionState.hidden[k] === false) return true;
    if (_planState.hidden[k]    === true)  return false;
    return true;
  }

  // ─────────────────────────────────────────────
  // Setters (session uniquement, le plan n'est éditable que dans createConf)
  // ─────────────────────────────────────────────
  function _persistSession() {
    // Sauvegarde immédiate via SessionPersist si dispo. Sinon no-op (la
    // session sera sauvée à la prochaine save automatique).
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch(e) {}
    }
  }

  function setSessionLabel(category, key, label) {
    const k = _key(category, key);
    if (label == null) {
      delete _sessionState.labels[k];
    } else {
      const trimmed = String(label).trim();
      // Si l'user efface le champ OU saisit exactement le defaultLabel/planLabel,
      // on retire l'override (= retour propre à la cascade niveau supérieur).
      const planLabel = _planState.labels[k];
      const defLabel  = getDefaultLabel(category, key);
      if (trimmed === "" || trimmed === planLabel || trimmed === defLabel) {
        delete _sessionState.labels[k];
      } else {
        _sessionState.labels[k] = trimmed;
      }
    }
    _persistSession();
  }

  function setSessionVisibility(category, key, visible) {
    const k = _key(category, key);
    const wantHidden = (visible === false);
    const planHidden = _planState.hidden[k] === true;
    if (wantHidden === planHidden) {
      // Aligné avec le plan → pas besoin d'override session
      delete _sessionState.hidden[k];
    } else {
      _sessionState.hidden[k] = wantHidden;
    }
    _persistSession();
  }

  function setCustomEntryVisibility(id, visible) {
    const k = "custom." + id;
    const wantHidden = (visible === false);
    const planHidden = _planState.hidden[k] === true;
    if (wantHidden === planHidden) {
      delete _sessionState.hidden[k];
    } else {
      _sessionState.hidden[k] = wantHidden;
    }
    _persistSession();
  }

  function _newId() {
    // ID stable et lisible pour debug (pas besoin d'UUID full RFC4122)
    return "cust-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
  }

  function addCustomEntry(entry) {
    if (!entry || !entry.category) return null;
    if (CATEGORIES.indexOf(entry.category) < 0) return null;
    const id = entry.id || _newId();
    const clean = {
      id:          id,
      category:    entry.category,
      label:       String(entry.label || "").trim() || "Sans nom",
      // Renders optionnels — au moins UN doit être présent pour le render
      lineColor:   entry.lineColor   || null,
      fillColor:   entry.fillColor   || null,
      borderColor: entry.borderColor || null,
      iconUrl:     entry.iconUrl     || null
    };
    _sessionState.customEntries.push(clean);
    _persistSession();
    return id;
  }

  function removeCustomEntry(id) {
    const idx = _sessionState.customEntries.findIndex(function(e) { return e.id === id; });
    if (idx >= 0) {
      _sessionState.customEntries.splice(idx, 1);
      _persistSession();
      return true;
    }
    // Si c'est une entrée du PLAN (non éditable), on la cache via hidden
    // plutôt que la supprimer.
    const planEntry = _planState.customEntries.find(function(e) { return e.id === id; });
    if (planEntry) {
      setCustomEntryVisibility(id, false);
      return true;
    }
    return false;
  }

  function updateCustomEntry(id, patch) {
    const idx = _sessionState.customEntries.findIndex(function(e) { return e.id === id; });
    if (idx < 0) return false;
    const e = _sessionState.customEntries[idx];
    if (patch.label != null)       e.label       = String(patch.label).trim() || e.label;
    if (patch.lineColor   !== undefined) e.lineColor   = patch.lineColor   || null;
    if (patch.fillColor   !== undefined) e.fillColor   = patch.fillColor   || null;
    if (patch.borderColor !== undefined) e.borderColor = patch.borderColor || null;
    if (patch.iconUrl     !== undefined) e.iconUrl     = patch.iconUrl     || null;
    _persistSession();
    return true;
  }

  function resetSession() {
    _sessionState = _emptyState();
    _persistSession();
  }

  // ─────────────────────────────────────────────
  // Helpers exposés pour exporter.js
  // ─────────────────────────────────────────────
  function categoryTitle(category) {
    return CATEGORY_TITLES[category] || category;
  }

  function listCategories() {
    return CATEGORIES.slice();
  }

  // ─────────────────────────────────────────────
  // ÉDITEUR STANDALONE (modale dédiée)
  // ─────────────────────────────────────────────
  //
  // Ouvre une modale charte MKM qui contient le même panneau de personnalisation
  // que la modale Export PNG, mais utilisable depuis n'importe où dans l'UI
  // (typiquement : bouton « ✏️ Modifier » dans la fenêtre Légende mode carte).
  //
  // L'editeur appelle les setters de session du module → SessionPersist.save
  // se déclenche automatiquement via _persistSession.
  //
  // opts = { onChange: () => void }    (callback à chaque modification)
  //        { onClose:  () => void }    (callback à la fermeture)
  function ouvrirEditeur(opts) {
    opts = opts || {};

    // Si déjà ouvert → close (toggle)
    const existing = document.getElementById("kta-legend-editor-modal");
    if (existing) { existing.remove(); if (opts.onClose) opts.onClose(); return; }

    function _esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const modal = document.createElement("div");
    modal.id = "kta-legend-editor-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.zIndex = "100050";  // au-dessus de la modale Légende (qui est à 99999)
    modal.innerHTML =
      '<div class="kta-readme-modal-boite" style="width:auto; max-width:560px; height:auto; max-height:90vh; padding:0; overflow:hidden; display:flex; flex-direction:column;">' +
        '<div class="kta-readme-modal-header" style="padding:14px 16px;">' +
          '<span class="kta-readme-modal-titre">✏️ Personnaliser la légende</span>' +
          '<button class="kta-panneau-close" id="kta-legend-editor-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" id="kta-legend-editor-body" style="padding:14px 16px; overflow-y:auto; flex:1 1 auto;">' +
          '<p style="font-size:12px; color:#8892a4; margin:0 0 12px 0; line-height:1.5;">' +
            'Renomme les libellés, masque les entrées que tu n\'utilises pas, ' +
            'ou ajoute des entrées custom. Les modifications sont sauvegardées ' +
            'automatiquement dans ta session.' +
          '</p>' +
          '<div id="kta-legend-editor-list"></div>' +
        '</div>' +
        '<div style="padding:12px 16px; border-top:1px solid rgba(255,255,255,0.08); display:flex; gap:8px; flex-wrap:wrap; justify-content:space-between;">' +
          '<div style="display:flex; gap:8px;">' +
            '<button class="kta-btn kta-btn-ghost kta-btn-small" type="button" id="kta-legend-editor-add">' +
              '➕ Ajouter une entrée' +
            '</button>' +
            '<button class="kta-btn kta-btn-ghost kta-btn-small" type="button" id="kta-legend-editor-reset" title="Restaure les libellés défaut">' +
              '🔄 Reset session' +
            '</button>' +
          '</div>' +
          '<button class="kta-btn kta-btn-primary kta-btn-small" type="button" id="kta-legend-editor-done">' +
            '✅ Terminer' +
          '</button>' +
        '</div>' +
      '</div>';

    document.documentElement.appendChild(modal);

    function _sourceBadge(source) {
      if (source === "session") return '<span class="kta-legend-src kta-legend-src-session" title="Override de votre session">✏️</span>';
      if (source === "plan")    return '<span class="kta-legend-src kta-legend-src-plan"    title="Défini par le plan">📋</span>';
      return                          '<span class="kta-legend-src kta-legend-src-default" title="Libellé défaut MKM">·</span>';
    }

    function _renderEntryRow(e, isCustomEntry) {
      // Pour les icones standard, essaie de résoudre l'iconUrl via _iconePourTag
      // (helper global d'exporter.js — peut être absent si l'utilisateur a
      // ouvert cet éditeur sans avoir d'abord chargé exporter.js).
      let iconUrl = e.iconUrl;
      if (!iconUrl && e.category === "icones" && typeof window._iconePourTag === "function") {
        try { iconUrl = window._iconePourTag(e.key); } catch(err) { iconUrl = null; }
      } else if (!iconUrl && e.category === "icones") {
        // Fallback : essaie PLAN_CONFIG.icons puis window._iconMap directement
        const cfg = window.PLAN_CONFIG;
        if (cfg && cfg.icons && cfg.icons[e.key]) iconUrl = cfg.icons[e.key];
        else if (window._iconMap && window._iconMap[e.key]) {
          const iobj = window._iconMap[e.key];
          iconUrl = iobj._kta_iconUrl || (iobj.options && iobj.options.iconUrl) || null;
        }
      }

      let swatch = '';
      if (iconUrl) {
        swatch = '<img src="' + _esc(iconUrl) + '" alt="" style="width:16px;height:16px;object-fit:contain;flex:0 0 16px;">';
      } else if (e.lineColor) {
        swatch = '<span style="display:inline-block;width:16px;height:3px;background:' + _esc(e.lineColor) + ';flex:0 0 16px;border-radius:1px;"></span>';
      } else if (e.fillColor) {
        const border = e.borderColor ? ('border:1px solid ' + _esc(e.borderColor) + ';') : '';
        swatch = '<span style="display:inline-block;width:14px;height:14px;background:' + _esc(e.fillColor) + ';' + border + 'flex:0 0 14px;border-radius:2px;"></span>';
      } else {
        swatch = '<span style="display:inline-block;width:14px;height:14px;flex:0 0 14px;"></span>';
      }

      const dataAttrs = isCustomEntry
        ? 'data-custom-id="' + _esc(e.id) + '"'
        : 'data-cat="' + _esc(e.category) + '" data-key="' + _esc(e.key) + '"';

      const placeholder = isCustomEntry ? _esc(e.label) : _esc(e.defaultLabel);
      const value = (e.label === e.defaultLabel && !isCustomEntry) ? "" : _esc(e.label);

      const btnRm = isCustomEntry
        ? '<button type="button" class="kta-legend-rm" title="Supprimer cette entrée custom" ' + dataAttrs + '>🗑️</button>'
        : '';

      return '<div class="kta-legend-row" ' + dataAttrs + '>' +
               '<label class="kta-legend-vis" title="Afficher cette entrée dans la légende">' +
                 '<input type="checkbox" class="kta-legend-vis-cb" ' +
                   (e.visible ? "checked" : "") + ' ' + dataAttrs + '>' +
               '</label>' +
               swatch +
               '<input type="text" class="kta-legend-label" placeholder="' + placeholder + '" ' +
                 'value="' + value + '" ' + dataAttrs + '>' +
               _sourceBadge(e.source) +
               btnRm +
             '</div>';
    }

    function _render() {
      const cont = document.getElementById("kta-legend-editor-list");
      if (!cont) return;
      let html = "";
      CATEGORIES.forEach(function(cat) {
        const title = categoryTitle(cat);
        const entries = listEntries(cat);
        const customs = listCustomEntries(cat);
        const isIcones = (cat === "icones");
        const sectionOpen = isIcones ? "" : "open";
        html += '<details class="kta-legend-cat" ' + sectionOpen + '>' +
                  '<summary>' + _esc(title) +
                    ' <span class="kta-legend-count">(' + (entries.length + customs.length) + ')</span>' +
                  '</summary>' +
                  '<div class="kta-legend-cat-body">';
        entries.forEach(function(e) { html += _renderEntryRow(e, false); });
        customs.forEach(function(e) { html += _renderEntryRow(e, true); });
        html += '</div></details>';
      });
      cont.innerHTML = html;
    }

    _render();

    function _applyFromUI(target) {
      const cat = target.getAttribute("data-cat");
      const key = target.getAttribute("data-key");
      const customId = target.getAttribute("data-custom-id");

      if (target.classList.contains("kta-legend-vis-cb")) {
        if (customId) setCustomEntryVisibility(customId, target.checked);
        else if (cat && key) setSessionVisibility(cat, key, target.checked);
      } else if (target.classList.contains("kta-legend-label")) {
        if (customId) updateCustomEntry(customId, { label: target.value });
        else if (cat && key) setSessionLabel(cat, key, target.value);
      }
      if (opts.onChange) opts.onChange();
    }

    const body = document.getElementById("kta-legend-editor-list");
    if (body) {
      body.addEventListener("change", function(e) {
        if (e.target.matches(".kta-legend-vis-cb")) _applyFromUI(e.target);
      });
      body.addEventListener("input", function(e) {
        if (e.target.matches(".kta-legend-label")) _applyFromUI(e.target);
      });
      body.addEventListener("click", function(e) {
        if (e.target.matches(".kta-legend-rm")) {
          const id = e.target.getAttribute("data-custom-id");
          if (id) {
            removeCustomEntry(id);
            _render();
            if (opts.onChange) opts.onChange();
          }
        }
      });
    }

    document.getElementById("kta-legend-editor-add").addEventListener("click", function() {
      _ouvrirAddDialog(function() {
        _render();
        if (opts.onChange) opts.onChange();
      });
    });

    document.getElementById("kta-legend-editor-reset").addEventListener("click", function() {
      const ok = window.confirm(
        "Effacer tous vos overrides de session sur la légende ?\n\n" +
        "(les libellés défaut du plan reviennent ; ce qui est défini dans " +
        "le plan-config reste actif)"
      );
      if (!ok) return;
      resetSession();
      _render();
      if (opts.onChange) opts.onChange();
    });

    function fermer() {
      try { modal.remove(); } catch(e) {}
      if (opts.onClose) opts.onClose();
    }
    document.getElementById("kta-legend-editor-close").addEventListener("click", fermer);
    document.getElementById("kta-legend-editor-done").addEventListener("click", fermer);
    modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });
  }

  // Mini-modale « Ajouter une entrée custom » — utilisée par ouvrirEditeur.
  // Reprend la même structure que la version inline d'exporter.js mais en
  // version standalone (= peut être appelée hors contexte Export PNG).
  function _ouvrirAddDialog(onAdded) {
    const wrap = document.createElement("div");
    wrap.className = "kta-readme-modal-overlay";
    wrap.style.zIndex = "100100";  // au-dessus de l'éditeur (100050)
    wrap.innerHTML =
      '<div class="kta-readme-modal-boite" style="width:auto; max-width:420px; height:auto; max-height:90vh; padding:20px; overflow-y:auto;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; gap:8px;">' +
          '<h3 style="margin:0; font-size:16px; color:#e8eaf0;">➕ Nouvelle entrée légende</h3>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" type="button" id="kta-lc-add-close" style="padding:2px 8px;">✕</button>' +
        '</div>' +
        '<div style="margin-bottom:10px;">' +
          '<label class="kta-cfg-label">Catégorie</label>' +
          '<select class="kta-cfg-input" id="kta-lc-add-cat">' +
            '<option value="traces">🛣️ Tracés</option>' +
            '<option value="zones">⬛ Zones</option>' +
            '<option value="structures">🏛️ Structures</option>' +
            '<option value="icones">🏷️ Icônes (URL image)</option>' +
          '</select>' +
        '</div>' +
        '<div style="margin-bottom:10px;">' +
          '<label class="kta-cfg-label">Libellé</label>' +
          '<input class="kta-cfg-input" id="kta-lc-add-label" type="text" placeholder="Ex : Pilier ancien">' +
        '</div>' +
        '<div style="margin-bottom:10px;" id="kta-lc-add-line-wrap">' +
          '<label class="kta-cfg-label">Couleur de trait (ligne)</label>' +
          '<input class="kta-cfg-input" id="kta-lc-add-line" type="color" value="#00ff00" style="height:32px; padding:2px;">' +
          '<label class="kta-export-cb-row" style="margin-top:4px;">' +
            '<input type="checkbox" id="kta-lc-add-line-on" checked>' +
            '<span>Activer le trait</span>' +
          '</label>' +
        '</div>' +
        '<div style="margin-bottom:10px;" id="kta-lc-add-fill-wrap">' +
          '<label class="kta-cfg-label">Couleur de remplissage</label>' +
          '<input class="kta-cfg-input" id="kta-lc-add-fill" type="color" value="#3aa9e8" style="height:32px; padding:2px;">' +
          '<label class="kta-export-cb-row" style="margin-top:4px;">' +
            '<input type="checkbox" id="kta-lc-add-fill-on">' +
            '<span>Activer le remplissage</span>' +
          '</label>' +
        '</div>' +
        '<div style="margin-bottom:10px; display:none;" id="kta-lc-add-icon-wrap">' +
          '<label class="kta-cfg-label">URL de l\'icône (.png / .svg / data:)</label>' +
          '<input class="kta-cfg-input" id="kta-lc-add-icon" type="text" placeholder="https://... ou data:image/...">' +
        '</div>' +
        '<div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">' +
          '<button class="kta-btn kta-btn-ghost"   type="button" id="kta-lc-add-cancel">Annuler</button>' +
          '<button class="kta-btn kta-btn-primary" type="button" id="kta-lc-add-ok">✅ Ajouter</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);

    function fermerAdd() { try { wrap.remove(); } catch(e) {} }

    document.getElementById("kta-lc-add-close").addEventListener("click", fermerAdd);
    document.getElementById("kta-lc-add-cancel").addEventListener("click", fermerAdd);
    wrap.addEventListener("click", function(e) { if (e.target === wrap) fermerAdd(); });

    const catSel = document.getElementById("kta-lc-add-cat");
    const lineWrap = document.getElementById("kta-lc-add-line-wrap");
    const fillWrap = document.getElementById("kta-lc-add-fill-wrap");
    const iconWrap = document.getElementById("kta-lc-add-icon-wrap");

    function _majChamps() {
      const cat = catSel.value;
      if (cat === "icones") {
        lineWrap.style.display = "none";
        fillWrap.style.display = "none";
        iconWrap.style.display = "block";
      } else {
        iconWrap.style.display = "none";
        if (cat === "traces") {
          lineWrap.style.display = "block";
          fillWrap.style.display = "none";
        } else if (cat === "zones") {
          lineWrap.style.display = "none";
          fillWrap.style.display = "block";
          document.getElementById("kta-lc-add-fill-on").checked = true;
        } else {
          lineWrap.style.display = "block";
          fillWrap.style.display = "block";
        }
      }
    }
    catSel.addEventListener("change", _majChamps);
    _majChamps();

    document.getElementById("kta-lc-add-ok").addEventListener("click", function() {
      const cat   = catSel.value;
      const label = (document.getElementById("kta-lc-add-label").value || "").trim();
      if (!label) { alert("Donne un libellé à l'entrée."); return; }
      const entry = { category: cat, label: label };
      if (cat === "icones") {
        const url = (document.getElementById("kta-lc-add-icon").value || "").trim();
        if (!url) { alert("URL d'icône requise pour cette catégorie."); return; }
        entry.iconUrl = url;
      } else {
        const lineOn = document.getElementById("kta-lc-add-line-on").checked;
        const fillOn = document.getElementById("kta-lc-add-fill-on").checked;
        if (lineOn) entry.lineColor = document.getElementById("kta-lc-add-line").value;
        if (fillOn) {
          entry.fillColor = document.getElementById("kta-lc-add-fill").value;
          if (cat === "zones" && !lineOn) entry.borderColor = entry.fillColor;
        }
        if (!entry.lineColor && !entry.fillColor) {
          alert("Active au moins une couleur (trait ou remplissage).");
          return;
        }
      }
      addCustomEntry(entry);
      fermerAdd();
      if (typeof onAdded === "function") onAdded();
    });
  }

  // ─────────────────────────────────────────────
  // API publique
  // ─────────────────────────────────────────────
  return {
    SCHEMA_VERSION:        SCHEMA_VERSION,
    DEFAULT_LABELS:        DEFAULT_LABELS,
    DEFAULT_RENDERS:       DEFAULT_RENDERS,
    CATEGORIES:            CATEGORIES,

    // Hooks de cycle de vie
    loadSessionState:      loadSessionState,
    getSessionState:       getSessionState,
    isSessionStateEmpty:   isSessionStateEmpty,
    loadPlanState:         loadPlanState,

    // Resolvers (cascade)
    getLabel:              getLabel,
    isVisible:             isVisible,
    getSource:             getSource,
    getDefaultLabel:       getDefaultLabel,
    listEntries:           listEntries,
    listCustomEntries:     listCustomEntries,
    isCustomVisible:       isCustomVisible,

    // Setters session
    setSessionLabel:       setSessionLabel,
    setSessionVisibility:  setSessionVisibility,
    setCustomEntryVisibility: setCustomEntryVisibility,
    addCustomEntry:        addCustomEntry,
    removeCustomEntry:     removeCustomEntry,
    updateCustomEntry:     updateCustomEntry,
    resetSession:          resetSession,

    // UI helpers
    categoryTitle:         categoryTitle,
    listCategories:        listCategories,

    // Éditeur standalone (modale dédiée — utilisée depuis la fenêtre
    // Légende en mode carte, mais réutilisable de n'importe quel endroit
    // de l'UI). opts = { onChange, onClose }
    ouvrirEditeur:         ouvrirEditeur
  };
})();
