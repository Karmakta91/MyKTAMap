/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE LEAFLET
// =========================
// interface.js — barres d'outils du plan : titre et plan switcher, groupes de la sidebar
// (accordéon, flyout, modal de tuiles), modes exclusifs clic-carte, suppression au clic.
// Expose : window.initInterface, ouvrirMenuTracker, ktaDemarrerSuivi, ktaCouperModesOutils,
//   ktaMajOutilsLectureSeule, _desactiverTousLesModes, _fermerModeZone/Structure/Recalage, _groupes.
// Le reste de l'interface vit dans interfaceConfig/Docs/Legende/ImportExport/Itineraire/
//   Maintenance/DistanceTotale.js.
// Pièges :
//   🩸 initInterface est rejouée à chaque ouverture de plan : abonnements aux singletons UNIQUES
//      (flags *SubBound), modes et suspension du verrou remis à zéro.
//   🩸 Une forme en cours vidée ou supprimée doit fermer son mode (_fermerModeX), sinon bouton
//      allumé et clic carte sans effet.
//   🩸 Modes suppression au clic : la popup d'annotation avale le clic, il est rejoué depuis
//      `popupopen` (_onSuppPopupOpen).
// Garde-fous : scripts/check-etat-visible.js, check-doc-sidebar.js · Doc : docs/architecture/ui.md

window.interfaceInitialized = false;

// ── Titre ──────────────────────────────
L.control.titleControl = function () {
  let control = L.control({ position: "topleft" });

  control.onAdd = function () {
    // Conteneur Leaflet vide — le vrai titre est injecté en fixed hors Leaflet
    let div = L.DomUtil.create("div", "");
    div.style.display = "none";

    const planName    = window.PLAN_CONFIG?.plan?.name    || "DEVMAP";
    const planAuthor  = window.PLAN_CONFIG?.plan?.author  || "";
    const planVersion = window.PLAN_CONFIG?.plan?.version || "";

    const parts = [planAuthor, planVersion].filter(Boolean);
    const sousTitre = parts.join(" — ");

    const existing = document.getElementById("kta-titre-fixe");
    if (existing) existing.remove();

    const titre = document.createElement("div");
    titre.id = "kta-titre-fixe";
    titre.title = window.I18n.t("ui.title.changePlan");
    titre.innerHTML = `
      <div class="map-title-text">
        ${planName}
        <span class="kta-titre-arrow">▾</span>
        ${sousTitre ? `<span class="map-title-sub">${sousTitre}</span>` : ""}
      </div>
    `;
    document.body.appendChild(titre);

    titre.addEventListener("click", function(e) {
      e.stopPropagation();
      togglePlanSwitcher();
    });

    return div;
  };

  return control;
};

// ── Plan switcher : sélection rapide depuis le titre ──────────────────────────────

// Liste des modifs en cours, pour l'avertissement avant de quitter le plan.
function _resumeSession() {
  const items = [];
  const editorPts  = (window.getEditorPoints  && window.getEditorPoints())  || [];
  const roads      = (window.getRoads         && window.getRoads())         || [];
  const zones      = (window.getZones         && window.getZones())         || [];
  const structures = (window.getStructures    && window.getStructures())    || [];
  const measure     = (window.getMeasurePoints        && window.getMeasurePoints())        || [];
  const measureSurf = (window.getMeasurePointsSurface && window.getMeasurePointsSurface()) || [];
  const trackPath   = (window.getTrackingPath         && window.getTrackingPath())         || [];

  if (editorPts.length  > 0) items.push(window.I18n.t(editorPts.length > 1 ? "ui.resume.points" : "ui.resume.point", { n: editorPts.length }));
  if (roads.length      > 0) items.push(window.I18n.t(roads.length > 1 ? "ui.resume.traces" : "ui.resume.trace", { n: roads.length }));
  if (zones.length      > 0) items.push(window.I18n.t(zones.length > 1 ? "ui.resume.zones" : "ui.resume.zone", { n: zones.length }));
  if (structures.length  > 0) items.push(window.I18n.t(structures.length > 1 ? "ui.resume.structures" : "ui.resume.structure", { n: structures.length }));
  if (measure.length     > 0) items.push(window.I18n.t("ui.resume.measureDist"));
  if (measureSurf.length > 0) items.push(window.I18n.t("ui.resume.measureSurf"));
  if (trackPath.length   > 1) items.push(window.I18n.t("ui.resume.trackPath"));
  return items;
}

function _fmtDateRel(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1)    return window.I18n.t("ui.date.now");
    if (min < 60)   return window.I18n.t("ui.date.minAgo", { n: min });
    const h = Math.floor(min / 60);
    if (h < 24)     return window.I18n.t("ui.date.hourAgo", { n: h });
    const j = Math.floor(h / 24);
    if (j === 1)    return window.I18n.t("ui.date.yesterday");
    if (j < 7)      return window.I18n.t("ui.date.daysAgo", { n: j });
    return d.toLocaleDateString(window.ktaLocale ? window.ktaLocale() : "fr-FR", { day: "2-digit", month: "2-digit" });
  } catch(e) { return ""; }
}

function _ouvrirPlanSwitcher() {
  _fermerPlanSwitcher();

  if (!window.PlanRegistry) return;

  const all = window.PlanRegistry.getAll();
  const current = window.PlanRegistry.getLastOpened();
  const currentId = current && current.id;

  // 3 plans récents EXCLUANT le plan en cours
  const recents = all
    .filter(function(p) { return p.id !== currentId && p.lastOpened; })
    .sort(function(a, b) { return (b.lastOpened || "").localeCompare(a.lastOpened || ""); })
    .slice(0, 3);

  _ouvrirPlanSwitcherRefonte(recents, current);

  setTimeout(function() {
    document.addEventListener("click", _onClicAilleursPanneau, true);
    document.addEventListener("keydown", _onEscapePanneau, true);
  }, 0);
}

// Modale centrée : reprend .kta-readme-modal-overlay (backdrop, fade-in, safe-area) ;
// la boîte a son style compact (.kta-plan-switcher-modal-*).
function _ouvrirPlanSwitcherRefonte(recents, current) {
  const overlay = document.createElement("div");
  overlay.id = "kta-plan-switcher-overlay";
  overlay.className = "kta-readme-modal-overlay kta-plan-switcher-overlay";

  // Plan en cours : affiché, non cliquable (déjà chargé)
  let currentHtml = "";
  if (current) {
    const icon = current.type === "server" ? "🌐" : "💾";
    const ver  = current.version
      ? ' <span class="kta-switcher-ver">' + escapeHtmlSwitcher(current.version) + '</span>'
      : '';
    const sub  = current.lastOpened
      ? window.I18n.t("ui.switcher.openedAt", { date: (_fmtDateRel(current.lastOpened) || window.I18n.t("ui.switcher.recently")) })
      : window.I18n.t("ui.switcher.currentPlan");
    currentHtml =
      '<div class="kta-plan-switcher-current">' +
        '<div class="kta-plan-switcher-current-label">' + window.I18n.t("ui.switcher.currentLabel") + '</div>' +
        '<div class="kta-plan-switcher-current-name">' +
          '<span class="kta-plan-switcher-current-icon">' + icon + '</span>' +
          '<span>' + escapeHtmlSwitcher(window.PlanRegistry.displayName(current)) + '</span>' + ver +
        '</div>' +
        '<div class="kta-plan-switcher-current-sub">' + escapeHtmlSwitcher(sub) + '</div>' +
      '</div>';
  }

  let recentsHtml = "";
  if (recents.length > 0) {
    recentsHtml += '<div class="kta-plan-switcher-section-titre">' + window.I18n.t("ui.switcher.recentTitle") + '</div>';
    recentsHtml += '<div class="kta-switcher-list">';
    recents.forEach(function(p) {
      const icon = p.type === "server" ? "🌐" : "💾";
      const sub  = _fmtDateRel(p.lastOpened) || "";
      const ver  = p.version ? ' <span class="kta-switcher-ver">' + escapeHtmlSwitcher(p.version) + '</span>' : '';
      recentsHtml +=
        '<div class="kta-switcher-row" data-plan-id="' + escapeHtmlSwitcher(p.id) + '">' +
          '<span class="kta-switcher-icon">' + icon + '</span>' +
          '<div class="kta-switcher-info">' +
            '<div class="kta-switcher-name">' + escapeHtmlSwitcher(window.PlanRegistry.displayName(p)) + ver + '</div>' +
            (sub ? '<div class="kta-switcher-sub">' + sub + '</div>' : '') +
          '</div>' +
          '<span class="kta-switcher-row-arrow">›</span>' +
        '</div>';
    });
    recentsHtml += '</div>';
  } else {
    recentsHtml +=
      '<div class="kta-plan-switcher-section-titre">' + window.I18n.t("ui.switcher.recentTitle") + '</div>' +
      '<div class="kta-switcher-empty">' + window.I18n.t("ui.switcher.empty") + '</div>';
  }

  overlay.innerHTML =
    '<div class="kta-plan-switcher-modal-boite" id="kta-plan-switcher">' +
      '<div class="kta-plan-switcher-modal-header">' +
        '<span class="kta-plan-switcher-modal-titre">' + window.I18n.t("ui.switcher.modalTitle") + '</span>' +
        '<button class="kta-panneau-close" id="kta-plan-switcher-close" aria-label="' + window.I18n.t("ui.btn.close") + '">✕</button>' +
      '</div>' +
      '<div class="kta-plan-switcher-modal-corps">' +
        currentHtml +
        recentsHtml +
      '</div>' +
      '<div class="kta-plan-switcher-modal-footer">' +
        '<button class="kta-plan-switcher-cta" id="kta-switcher-tous">' +
          '<span class="kta-plan-switcher-cta-icon">📚</span>' +
          '<span class="kta-plan-switcher-cta-label">' + window.I18n.t("ui.switcher.ctaLabel") + '</span>' +
          '<span class="kta-plan-switcher-cta-sub">' + window.I18n.t("ui.switcher.ctaSub") + '</span>' +
        '</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  const titre = document.getElementById("kta-titre-fixe");
  if (titre) titre.classList.add("ouvert");

  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) _fermerPlanSwitcher();
  });

  const closeBtn = overlay.querySelector("#kta-plan-switcher-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      _fermerPlanSwitcher();
    });
  }

  overlay.querySelectorAll(".kta-switcher-row").forEach(function(row) {
    row.addEventListener("click", function(e) {
      e.stopPropagation();
      const id = row.dataset.planId;
      _fermerPlanSwitcher();
      _confirmEtChargerPlan(id);
    });
  });

  const btnTous = overlay.querySelector("#kta-switcher-tous");
  if (btnTous) {
    btnTous.addEventListener("click", function(e) {
      e.stopPropagation();
      _fermerPlanSwitcher();
      _retourLoaderAvecConfirm();
    });
  }
}

function _fermerPlanSwitcher() {
  // Retire le parent le plus haut : overlay s'il existe, sinon le panneau seul.
  const overlay = document.getElementById("kta-plan-switcher-overlay");
  if (overlay) {
    overlay.remove();
  } else {
    const panneau = document.getElementById("kta-plan-switcher");
    if (panneau) panneau.remove();
  }
  const titre = document.getElementById("kta-titre-fixe");
  if (titre) titre.classList.remove("ouvert");
  document.removeEventListener("click", _onClicAilleursPanneau, true);
  document.removeEventListener("keydown", _onEscapePanneau, true);
}

function _onClicAilleursPanneau(e) {
  // Avec overlay, son propre listener gère le backdrop ; ici seulement le panneau sans overlay.
  const overlay = document.getElementById("kta-plan-switcher-overlay");
  if (overlay) return;
  const panneau = document.getElementById("kta-plan-switcher");
  const titre   = document.getElementById("kta-titre-fixe");
  if (!panneau) return;
  if (panneau.contains(e.target)) return;
  if (titre && titre.contains(e.target)) return;
  _fermerPlanSwitcher();
}

function _onEscapePanneau(e) {
  if (e.key === "Escape") _fermerPlanSwitcher();
}

function togglePlanSwitcher() {
  const existant = document.getElementById("kta-plan-switcher");
  if (existant) {
    _fermerPlanSwitcher();
  } else {
    _ouvrirPlanSwitcher();
  }
}

function _confirmEtChargerPlan(planId) {
  if (!window.PlanRegistry) return;
  const plan = window.PlanRegistry.findById(planId);
  if (!plan) return;

  const items = _resumeSession();

  if (items.length === 0) {
    _chargerPlanDirect(plan);
    return;
  }

  // Le texte ne dit pas « perdu » : SessionPersist (auto-save par plan) et SessionBackups
  // (snapshots IDB) gardent la session du plan courant, restaurée au retour.
  const overlay = document.createElement("div");
  overlay.className = "kta-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-modal">' +
      '<div class="kta-modal-icon">🗂️</div>' +
      '<div class="kta-modal-titre">' + window.I18n.t("ui.loadOther.title") + '</div>' +
      '<div class="kta-modal-texte">' +
        window.I18n.t("ui.loadOther.activeIntro") +
        '<ul style="text-align:left; margin:10px 0 14px 0; padding-left:24px; color:#a8b3c8; line-height:1.6; list-style-type:disc;">' +
          items.map(function(it) { return '<li style="color:#a8b3c8;">' + escapeHtmlSwitcher(it) + '</li>'; }).join("") +
        '</ul>' +
        window.I18n.t("ui.loadOther.saved") +
        '<span style="color:#a8b3c8; font-size:12.5px;">' +
          window.I18n.t("ui.loadOther.snapshots") +
        '</span><br><br>' +
        window.I18n.t("ui.loadOther.confirm", { nom: escapeHtmlSwitcher(window.PlanRegistry.displayName(plan)) }) +
      '</div>' +
      '<div class="kta-modal-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-switch-annuler">' + window.I18n.t("ui.btn.cancel") + '</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-switch-confirmer">' + window.I18n.t("ui.loadOther.loadBtn") + '</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);

  document.getElementById("kta-switch-annuler").addEventListener("click", function() { overlay.remove(); });
  document.getElementById("kta-switch-confirmer").addEventListener("click", function() {
    overlay.remove();
    _chargerPlanDirect(plan);
  });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

// Charge un plan depuis le panneau, sans repasser par le loader.
async function _chargerPlanDirect(plan) {
  // 🩸 Ne pas retirer kta-titre-fixe ici : si le chargement échoue ou est annulé, le titre
  // du plan en cours doit rester. initInterface() le recrée en cas de succès.
  const popup = document.getElementById("popupChangerPlan");
  if (popup) popup.remove();

  // Un plan ZIP de l'index (`plan.zip`) n'a pas de dossier : il passe par chargerPlanDuRegistre.
  if (plan.type === "server" && !plan.zip) {
    try {
      await window.chargerPlanServeur(plan.path, plan);
    } catch(e) {
      // Retour au loader, qui propose la modale d'erreur
      console.error("[Switcher] Erreur chargement serveur :", e);
      if (window.afficherLoader) window.afficherLoader();
    }
    return;
  }

  // 🩸 Tout le reste (local, ZIP de l'index, plan d'extension « ext ») passe par
  // chargerPlanDuRegistre (homeLoader.js), comme un clic sur l'accueil : ne pas filtrer sur « local ».
  if (typeof window.chargerPlanDuRegistre === "function") {
    try { await window.chargerPlanDuRegistre(plan.id); }
    catch(e) {
      console.error("[Switcher] Erreur chargement :", e);
      if (window.afficherLoader) window.afficherLoader();
    }
  } else if (window.afficherLoader) {
    window.afficherLoader();
  }
}

// Retour au loader, avec confirmation si la session n'est pas vierge.
function _retourLoaderAvecConfirm() {
  const items = _resumeSession();
  if (items.length === 0) {
    if (window.afficherLoader) window.afficherLoader();
    return;
  }
  if (typeof afficherPopupChangerPlan === "function") {
    afficherPopupChangerPlan();
  } else if (window.afficherLoader) {
    window.afficherLoader();
  }
}
// Exposé pour le bouton home du header (refonteInterface.js).
window._retourLoaderAvecConfirm = _retourLoaderAvecConfirm;

function escapeHtmlSwitcher(s) { return window.ktaEsc(s); }

// ── Panneau ancré aux boutons ──────────────────────────────
(function () {
  let _panneauActif = null;
  let _closeOnOutside = null;

  function fermerPanneau() {
    if (_panneauActif) {
      _panneauActif.remove();
      _panneauActif = null;
    }
    if (_closeOnOutside) {
      document.removeEventListener("mousedown", _closeOnOutside);
      _closeOnOutside = null;
    }
  }

  window.fermerPanneau = fermerPanneau;

})();


// Import/export de session : js/interfaceImportExport.js · conversion : sessionExporter.js.

// ── Modales charte ──────────────────────────────
// Alerte charte à un bouton OK, sans callback (info, pas de décision).
// ⚠️ `texte` et `titre` sont injectés en HTML : l'appelant échappe ce qui vient de l'utilisateur.
function _alertCharte(titre, texte, icone) {
  const ic = icone || "⚠️";
  const existing = document.getElementById("kta-alert-charte");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "kta-alert-charte";
  overlay.className = "kta-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-modal" style="max-width:420px;">' +
      '<div class="kta-modal-icon">' + ic + '</div>' +
      '<div class="kta-modal-titre">' + titre + '</div>' +
      '<div class="kta-modal-texte">' + texte + '</div>' +
      '<div class="kta-modal-actions">' +
        '<button class="kta-btn kta-btn-primary" id="kta-alert-charte-ok">' + window.I18n.t("ui.btn.ok") + '</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);

  const btnOk = document.getElementById("kta-alert-charte-ok");
  if (btnOk) {
    btnOk.addEventListener("click", function() { overlay.remove(); });
    setTimeout(function() { try { btnOk.focus(); } catch(e) {} }, 0);
  }
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
  function _onKey(e) {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", _onKey);
    }
  }
  document.addEventListener("keydown", _onKey);
}

// Choix multiple : options = [{ label, icon, desc, onClick, danger, ghost }] + Annuler.
function _choixSuppression(titre, texte, options) {
  const overlay = document.createElement("div");
  overlay.className = "kta-modal-overlay";

  const boutonsHtml = options.map(function(opt, i) {
    const cls = opt.danger ? "kta-btn-danger" : (opt.ghost ? "kta-btn-ghost" : "kta-btn-primary");
    const ic  = opt.icon ? opt.icon + " " : "";
    return `<button class="kta-btn ${cls}" id="_choix-${i}" style="text-align:left; padding:10px 14px;">
      ${ic}${opt.label}
      ${opt.desc ? `<span style="display:block; font-size:11px; opacity:0.7; font-weight:400; margin-top:2px;">${opt.desc}</span>` : ""}
    </button>`;
  }).join("");

  overlay.innerHTML = `
    <div class="kta-modal" style="max-width:420px;">
      <div class="kta-modal-icon">⚠️</div>
      <div class="kta-modal-titre">${titre}</div>
      <div class="kta-modal-texte">${texte || ""}</div>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:14px;">
        ${boutonsHtml}
        <button class="kta-btn kta-btn-ghost" id="_choix-annuler" style="margin-top:4px;">${window.I18n.t("ui.btn.cancel")}</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  options.forEach(function(opt, i) {
    document.getElementById("_choix-" + i).addEventListener("click", function() {
      overlay.remove();
      try { opt.onClick(); } catch(e) { console.error(e); }
    });
  });

  document.getElementById("_choix-annuler").addEventListener("click", function() { overlay.remove(); });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

// ── Changer de plan ──────────────────────────────
function afficherPopupChangerPlan() {
  const existing = document.getElementById("popupChangerPlan");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "popupChangerPlan";
  overlay.className = "kta-readme-modal-overlay";

  overlay.innerHTML = `
    <div class="kta-modal" style="max-width:440px;">
      <div class="kta-modal-icon">🗂️</div>
      <div class="kta-modal-titre">${window.I18n.t("ui.changePlan.title")}</div>
      <div class="kta-modal-texte">
        ${window.I18n.t("ui.changePlan.body")}
      </div>
      <div class="kta-modal-actions">
        <button class="kta-btn kta-btn-ghost" id="popupResterIci">${window.I18n.t("ui.changePlan.stay")}</button>
        <button class="kta-btn kta-btn-primary" id="popupChargerPlan">${window.I18n.t("ui.changePlan.myPlans")}</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(overlay);
  document.getElementById("popupResterIci").addEventListener("click", function () { overlay.remove(); });
  document.getElementById("popupChargerPlan").addEventListener("click", function () {
    overlay.remove();
    if (window.afficherLoader) window.afficherLoader();
  });
  overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
}

// Réglages, multi-niveau, géoréf : js/interfaceConfig.js · maintenance : js/interfaceMaintenance.js.

// ── Gestionnaire de modes exclusifs ──────────────────────────────
const _modesActifs = {};

// Exposé pour le picker « Où es-tu ? » (utils.js > ktaDemanderPositionCarte) : les modes
// clic-carte doivent tomber AVANT d'armer un picker, et seul ce registre éteint la surbrillance.
window._desactiverTousLesModes = _desactiverTousLesModes;
function _desactiverTousLesModes() {
  Object.values(_modesActifs).forEach(function(m) {
    try { m.desactiverFn(); } catch(e) {}
    m.btnEl.classList.remove("kta-actif");
  });
  Object.keys(_modesActifs).forEach(function(k) { delete _modesActifs[k]; });
}


// 🩸 Une suppression qui efface le tracé en cours DOIT fermer le mode : sinon le bouton reste
// « kta-actif » alors que resetRoads a remis window.modeRoad à zéro (clic carte sans effet).
// Idem zones.
function _fermerModeRoad() {
  const m = _modesActifs["road"];
  if (!m) return;
  try { m.desactiverFn(); } catch(e) {}
  if (m.btnEl) m.btnEl.classList.remove("kta-actif");
  delete _modesActifs["road"];
}

function _fermerModeZone() {
  const m = _modesActifs["zone"];
  if (!m) return;
  try { m.desactiverFn(); } catch(e) {}
  if (m.btnEl) m.btnEl.classList.remove("kta-actif");
  delete _modesActifs["zone"];
}

function _fermerModeStructure() {
  const m = _modesActifs["structure"];
  if (!m) return;
  try { m.desactiverFn(); } catch(e) {}
  if (m.btnEl) m.btnEl.classList.remove("kta-actif");
  delete _modesActifs["structure"];
}

// 🩸 Exposé pour zones.js / structures.js : la fermeture au re-clic sur le 1er point (leur handler
// Leaflet) doit aussi éteindre l'outil, sinon bouton kta-actif + window.modeX armé au clic suivant.
window._fermerModeZone      = _fermerModeZone;
window._fermerModeStructure = _fermerModeStructure;

// ── Modale ouverte sur la carte → coupure des modes sidebar ──────────────────────────────
// 🩸 Un mode clic-carte armé sous une modale = clics fantômes à la fermeture, bouton surligné
// sans effet. Détection centrale : MutationObserver `childList` SANS subtree (zéro coût sur le
// churn DOM Leaflet) sur <html> et <body>, les deux points d'attache des modales. Les 6 modes
// sidebar sont tous dans _modesActifs ; le tracker n'en fait pas partie → jamais coupé.
// Helper public : window.ktaCouperModesOutils().
(function _initCoupeModesSurModale() {
  const RX_OVERLAY = /(?:^|\s)(?:kta-readme-modal-overlay|kta-secours-overlay)(?:\s|$)/;
  // ⚠️ #kta-poi-modal (formulaire ouvert par le clic carte du mode édition) ne coupe pas :
  // le mode doit survivre pour poser plusieurs points d'affilée. Les boîtes `kta-modal-overlay`
  // (confirmations) sont hors du filet par leur classe.
  const IDS_EXCLUS = { "kta-poi-modal": true };
  function _couper() {
    if (Object.keys(_modesActifs).length === 0) return;
    if (typeof window.ktaPlanAffiche === "function" && !window.ktaPlanAffiche()) return;
    console.log("[Interface] Modale ouverte → modes sidebar coupés");
    _desactiverTousLesModes();
  }
  window.ktaCouperModesOutils = _couper;
  const obs = new MutationObserver(function(mutations) {
    for (const mu of mutations) {
      for (const n of mu.addedNodes) {
        if (n && n.nodeType === 1 && typeof n.className === "string" && RX_OVERLAY.test(n.className)) {
          if (n.id && IDS_EXCLUS[n.id]) continue;
          _couper();
          return;
        }
      }
    }
  });
  function _demarrer() {
    try {
      obs.observe(document.documentElement, { childList: true });
      if (document.body) obs.observe(document.body, { childList: true });
    } catch(e) { console.warn("[Interface] observer modales :", e); }
  }
  if (document.body) _demarrer();
  else document.addEventListener("DOMContentLoaded", _demarrer);
})();

// ── Curseur de précision (a11y) ──────────────────────────────
// Réticule contrasté (css : body.kta-precision-mode) dès qu'un mode clic-carte est actif.
// Les 6 flags window.modeX sont écrits à des endroits dispersés : on intercepte leurs
// ÉCRITURES par des accesseurs. ⚠️ Sûr tant qu'ils restent des propriétés window (pas `var`).
// modeRoad/modeStructure = null|chaîne, les autres = bool → `!!store[k]`.
(function _initPrecisionCursor() {
  var FLAGS = ["modeEdition", "modeMesure", "modeRecalage", "modeRoad", "modeZone", "modeStructure"];
  var store = {};
  function _sync() {
    var on = FLAGS.some(function(k) { return !!store[k]; });
    if (document.body) document.body.classList.toggle("kta-precision-mode", on);
  }
  FLAGS.forEach(function(k) {
    store[k] = window[k];
    try {
      Object.defineProperty(window, k, {
        configurable: true, enumerable: true,
        get: function() { return store[k]; },
        set: function(v) { store[k] = v; _sync(); }
      });
    } catch (e) { /* flag non-configurable (improbable) → on laisse tel quel */ }
  });
  _sync();
})();

// ── Avertissement tracker (au premier Play) ──────────────────────────────
// Montré au premier Play de la page : flag en mémoire, réaffiché après un reload.
// 🩸 iOS : DeviceMotionEvent.requestPermission() exige un geste utilisateur SYNCHRONE. onConfirm
// est appelé directement dans le handler de « J'ai compris » : ni setTimeout ni await avant,
// sinon la demande de permission iOS ne s'affiche pas.
let _trackerWarningAcknowledged = false;

function _afficherAvertissementTracker(onConfirm) {
  if (document.getElementById("kta-tracker-warn-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "kta-tracker-warn-overlay";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-tracker-warn-boite">' +
      '<div class="kta-readme-modal-header kta-tracker-warn-header">' +
        '<span class="kta-readme-modal-titre">' + window.I18n.t("ui.trackerWarn.title") + '</span>' +
      '</div>' +
      // Message volontairement bref : permission capteurs + limites en une ligne (décision produit).
      '<div class="kta-readme-modal-corps">' +
        '<p>' + window.I18n.t("ui.trackerWarn.permission") + '</p>' +
        '<p class="kta-tracker-warn-note">' + window.I18n.t("ui.trackerWarn.limites") + '</p>' +
        // Écran éteint = pas perdus + déverrouillage avec des gants : « garder l'écran allumé »
        // est proposé ici, pré-coché, seulement si supporté et pas déjà actif.
        ((window.WakeLock && typeof window.WakeLock.isSupported === "function" && window.WakeLock.isSupported()
          && typeof window.WakeLock.isEnabled === "function" && !window.WakeLock.isEnabled())
          ? '<label class="kta-tracker-warn-wake"><input type="checkbox" id="kta-tracker-warn-wake" checked> ' +
              '<span>' + window.I18n.t("ui.trackerWarn.wakeLock") + '</span></label>'
          : '') +
      '</div>' +
      '<div class="kta-tracker-warn-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-tracker-warn-cancel" type="button">' + window.I18n.t("ui.btn.cancel") + '</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-tracker-warn-ok"     type="button">' + window.I18n.t("ui.trackerWarn.startBtn") + '</button>' +
      '</div>' +
    '</div>';

  document.documentElement.appendChild(overlay);

  function _cleanup() {
    if (overlay.parentNode) overlay.remove();
    document.removeEventListener("keydown", _onKey);
  }
  function _onKey(e) {
    if (e.key === "Escape") _cleanup();
  }

  // Backdrop = annuler : seul « J'ai compris » démarre le suivi.
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) _cleanup();
  });
  document.addEventListener("keydown", _onKey);

  document.getElementById("kta-tracker-warn-cancel").addEventListener("click", _cleanup);

  document.getElementById("kta-tracker-warn-ok").addEventListener("click", function() {
    _trackerWarningAcknowledged = true;
    // ⚠️ Wake lock demandé depuis le même geste utilisateur (exigé par l'API).
    const wakeCb = document.getElementById("kta-tracker-warn-wake");
    if (wakeCb && wakeCb.checked && window.WakeLock && typeof window.WakeLock.setEnabled === "function") {
      try { window.WakeLock.setEnabled(true); } catch(e) { console.warn("[Tracker] wake lock :", e); }
    }
    _cleanup();
    // 🩸 Appel synchrone (permission iOS, cf. plus haut).
    try { onConfirm(); } catch(e) { console.error("[Tracker] onConfirm threw:", e); }
  });
}

// ── Accordéon des groupes : un seul ouvert à la fois ──────────────────────────────

const _groupes = {}; // { groupeId: { container, btnPrincipal, subActions: [], modeActif: false } }
// Exposé (même objet, lecture seule) pour shortcuts.js qui clique btnPrincipal ; les
// mutations restent dans _creerGroupeAccordeon.
window._groupes = _groupes;
let _groupeOuvert = null;

function _fermerGroupe(id) {
  const g = _groupes[id];
  if (!g) return;
  g.subActions.forEach(function(el) { el.classList.add("kta-hidden"); });
  if (g.btnPrincipal) g.btnPrincipal.classList.remove("kta-group-open");
  if (_groupeOuvert === id) _groupeOuvert = null;
}

// Ferme le groupe ouvert de la sidebar 'left' ou 'right' (bouton ≡ de refonteInterface.js),
// sauf s'il porte un mode actif.
window._fermerGroupeOuvertSide = function(side) {
  if (!_groupeOuvert) return;
  const g = _groupes[_groupeOuvert];
  if (!g || !g.position) return;
  const expected = side === "left" ? "topleft" : "topright";
  if (g.position !== expected) return;
  if (g.modeActif) return;
  _fermerGroupe(_groupeOuvert);
};

function _ouvrirGroupe(id) {
  // Ferme TOUS les autres groupes, même en mode actif : le mode continue (tracker en fond),
  // seul le tiroir se ferme ; kta-group-mode-actif reste sur l'icône. Le clic extérieur, lui,
  // respecte modeActif (_initClickExterieur).
  Object.keys(_groupes).forEach(function(autreId) {
    if (autreId === id) return;
    _fermerGroupe(autreId);
  });

  const g = _groupes[id];
  if (!g) return;
  g.subActions.forEach(function(el) {
    el.classList.remove("kta-hidden");
    el.classList.add("kta-sub-anim");
    setTimeout(function() { el.classList.remove("kta-sub-anim"); }, 200);
  });
  if (g.btnPrincipal) g.btnPrincipal.classList.add("kta-group-open");
  _groupeOuvert = id;
}

function _toggleGroupe(id) {
  if (_groupeOuvert === id) {
    // Replier est permis même en mode actif : le mode continue, seul le tiroir se ferme.
    _fermerGroupe(id);
  } else {
    _ouvrirGroupe(id);
  }
}

// Marque un groupe comme portant un mode actif (l'ouvre, sauf groupes en flyout).
function _setGroupeModeActif(id, actif, iconeReflet) {
  const g = _groupes[id];
  if (!g) return;
  g.modeActif = actif;
  if (actif) {
    if (iconeReflet && g.btnPrincipal) {
      g.btnPrincipal.dataset.iconeOriginale = g.btnPrincipal.dataset.iconeOriginale || g.btnPrincipal.innerHTML;
      g.btnPrincipal.innerHTML = iconeReflet;
    }
    // Seul signe qu'un mode tourne une fois le groupe replié (l'icône du tracker ne change pas).
    if (g.btnPrincipal) g.btnPrincipal.classList.add("kta-group-mode-actif");
    // Groupes en flyout (tracés/zones/structures) : pas d'accordéon, _ouvrirFlyout s'en charge.
    if (!g.useFlyout) {
      _ouvrirGroupe(id);
    }
  } else {
    if (g.btnPrincipal && g.btnPrincipal.dataset.iconeOriginale) {
      g.btnPrincipal.innerHTML = g.btnPrincipal.dataset.iconeOriginale;
    }
    if (g.btnPrincipal) g.btnPrincipal.classList.remove("kta-group-mode-actif");
  }
}

// Clic en dehors → ferme le groupe ouvert (si pas de mode actif)
function _initClickExterieur() {
  if (window._clickExterieurInit) return;
  window._clickExterieurInit = true;

  document.addEventListener("click", function(e) {
    if (!_groupeOuvert) return;
    const g = _groupes[_groupeOuvert];
    if (!g || g.modeActif) return;
    if (g.container.contains(e.target)) return;
    _fermerGroupe(_groupeOuvert);
  });
}

// ── 🔒 Outils de dessin grisés en lecture seule (plan relié en droit « lire ») ──────────────────────────────
// Les 4 groupes restent visibles mais grisés ; un clic rappelle le message (ktaEditionRefusee)
// sans ouvrir le groupe (écouteur de _creerGroupeAccordeon). Recalculé en fin d'initInterface,
// par main.js après l'annonce, et sur les événements de l'extension. Sans extension : jamais grisé.
const _KTA_GROUPES_DESSIN = ["edition", "traces", "zones", "structures"];
function _majOutilsLectureSeule() {
  const ro = typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee(true);
  _KTA_GROUPES_DESSIN.forEach(function(id) {
    const g = _groupes[id];
    if (!g || !g.btnPrincipal) return;
    g.btnPrincipal.classList.toggle("kta-outil-lecture-seule", ro);
    if (ro) g.btnPrincipal.setAttribute("aria-disabled", "true");
    else g.btnPrincipal.removeAttribute("aria-disabled");
  });
  if (!ro) return;
  // Droit perdu en cours de session : un outil de dessin armé ou un menu ouvert retombe.
  if (window.modeEdition || window.modeRoad || window.modeZone || window.modeStructure) _desactiverTousLesModes();
  if (_currentFlyout && _KTA_GROUPES_DESSIN.indexOf(_currentFlyout.dataset.groupId) !== -1) _fermerFlyout();
}
window.ktaMajOutilsLectureSeule = _majOutilsLectureSeule;
["mktm:compte-changed", "mktm:plans-extension-changes", "mktm:connexion-changed"].forEach(function(ev) {
  window.addEventListener(ev, function() { try { _majOutilsLectureSeule(); } catch(e) { /* affichage seulement */ } });
});

// ── Création d'un groupe ──────────────────────────────
// config = { id, iconePrincipale, titre, soloAction|null, useFlyout, useModal, modal, position,
//   sousActions: [ { icone, titre, onClick, refClassName?, ... } ], lcCat, customActivator,
//   dynamicSousActions }
function _creerGroupeAccordeon(config) {
  // config.position n'est lu que si window._refonteInterfaceActive ; sinon tout en topright.
  let pos = "topright";
  if (window._refonteInterfaceActive === true && typeof config.position === "string") {
    pos = config.position;
  }
  const ctrl = L.control({ position: pos });
  ctrl.onAdd = function() {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnPrincipal = L.DomUtil.create("a", "kta-group-toggle", div);
    btnPrincipal.innerHTML = config.iconePrincipale;
    // 🔒 "#" et non « javascript:void(0) », que la CSP stricte bloque ; chaque clic fait preventDefault.
    btnPrincipal.href      = "#";
    btnPrincipal.setAttribute("role", "button");
    btnPrincipal.title     = config.titre;

    // 🔒 Outil de dessin grisé (lecture seule) : posé AVANT l'écouteur du groupe, qu'il coupe
    // (stopImmediatePropagation). Droit revenu sans événement : on dégrise et le clic passe.
    if (_KTA_GROUPES_DESSIN.indexOf(config.id) !== -1) {
      L.DomEvent.on(btnPrincipal, "click", function(e) {
        if (!btnPrincipal.classList.contains("kta-outil-lecture-seule")) return;
        if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) {
          L.DomEvent.stop(e);
          e.stopImmediatePropagation();
          return;
        }
        _majOutilsLectureSeule();
      });
    }

    const subActions = [];

    if (config.soloAction) {
      L.DomEvent.on(btnPrincipal, "click", function(e) {
        L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
        if (_groupeOuvert) {
          const autre = _groupes[_groupeOuvert];
          if (autre && !autre.modeActif) _fermerGroupe(_groupeOuvert);
        }
        config.soloAction();
      });
    } else if (config.useFlyout === true) {
      // Sous-actions rendues dans un panneau latéral à l'ouverture (_ouvrirFlyout) : une cascade
      // verticale déborderait l'écran avec beaucoup de types + customs.
      L.DomEvent.on(btnPrincipal, "click", function(e) {
        L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
        _toggleFlyout(config.id);
      });
    } else if (config.useModal === true) {
      // Modal plein écran de tuiles (_ouvrirTrackerModal), alimenté par sousActionsConfig.
      L.DomEvent.on(btnPrincipal, "click", function(e) {
        L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
        _toggleTrackerModal(config.id);
      });
    } else {
      // Accordéon : sous-actions cachées par défaut.
      (config.sousActions || []).forEach(function(sub) {
        const extraCls = sub.cssClass ? (" " + sub.cssClass) : "";
        const btnSub = L.DomUtil.create("a", "kta-sub kta-hidden" + extraCls, div);
        // Même résolution d'icône que le flyout (pastille de couleur live des boutons de type).
        btnSub.innerHTML = (typeof sub.dynamicIcon === "function")
                             ? (sub.dynamicIcon() || sub.icone || "")
                             : sub.icone;
        btnSub.href      = "#";
        btnSub.setAttribute("role", "button");
        btnSub.title     = (typeof sub.dynamicTitre === "function")
                             ? (sub.dynamicTitre() || sub.titre || "")
                             : sub.titre;
        if (sub.refClassName) btnSub.dataset.refClassName = sub.refClassName;
        // ⚠️ Marque les boutons « type » (activent un mode de dessin) : les customs s'insèrent
        // après eux, avant les outils (Valider, Effacer).
        if (sub.isTypeAction) btnSub.dataset.typeAction = "1";

        L.DomEvent.on(btnSub, "click", function(e) {
          L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
          sub.onClick(btnSub);
        });

        if (sub.id) btnSub.dataset.subId = sub.id;
        subActions.push(btnSub);
      });

      L.DomEvent.on(btnPrincipal, "click", function(e) {
        L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
        _toggleGroupe(config.id);
      });
    }

    L.DomEvent.disableClickPropagation(div);

    _groupes[config.id] = {
      container:    div,
      btnPrincipal: btnPrincipal,
      subActions:   subActions,
      modeActif:    false,
      position:     pos,  // "topleft" ou "topright" (lu par _fermerGroupeOuvertSide)
      // Rendu du flyout : sousActionsConfig = liste brute, lcCat = catégorie LegendCustomization
      // (customs), customActivator = activation d'un id custom.
      useFlyout:        config.useFlyout === true,
      useModal:         config.useModal === true,
      modal:            config.modal || null,  // habillage du modal ; absent → _MODAL_TRACKER
      sousActionsConfig: config.sousActions || [],
      lcCat:             config.lcCat || null,
      customActivator:   config.customActivator || null,
      // Remplace sousActionsConfig à chaque ouverture (liste dynamique, ex. Favoris).
      dynamicSousActions: (typeof config.dynamicSousActions === "function")
                           ? config.dynamicSousActions
                           : null
    };

    return div;
  };
  ctrl.addTo(window.map);
}

// ── Modal plein écran de tuiles (Tracker, lanceur d'export) ──────────────────────────────
// Groupes useModal:true. Les tuiles viennent de sousActionsConfig (icône dynamique + état actif
// relus à l'ouverture) ; un tap ferme le modal puis lance l'onClick, comme le flyout (bouton
// détaché du DOM). Habillage par groupe (`modal` de la config : id, icône, titre, sections,
// bande de statut). ⚠️ Une section prend `sub.section === cle`, ou `sub.cssClass` si elle en
// déclare un ; la section `defaut` recueille le reste. Titres = CLÉS, traduites à l'ouverture.
const _MODAL_TRACKER = {
  id: "kta-tracker-modal",
  icone: "🧭",
  titreCle: "ui.group.tracker",
  statut: true,
  sections: [
    { cle: "suivi",   titreCle: "tracker.modal.sectionSuivi" },
    { cle: "outils",  titreCle: "tracker.modal.sectionOutils", defaut: true },
    { cle: "urgence", titreCle: "tracker.modal.sectionUrgence", cssClass: "kta-sous-action-urgence" }
  ]
};

const _MODAL_EXPORT = {
  id: "kta-export-lanceur",
  icone: "⬆️",
  titreCle: "ui.group.save",
  statut: false,
  sections: [
    { cle: "image",   titreCle: "export.lanceur.sectionImage", defaut: true },
    { cle: "session", titreCle: "export.lanceur.sectionSession" },
    { cle: "externe", titreCle: "export.lanceur.sectionExterne" }
  ]
};

let _trackerModalEl = null;
let _trackerModalKeyHandler = null;

function _toggleTrackerModal(groupId) {
  if (_trackerModalEl) { _fermerTrackerModal(); return; }
  _ouvrirTrackerModal(groupId);
}

function _fermerTrackerModal() {
  if (_trackerModalKeyHandler) {
    document.removeEventListener("keydown", _trackerModalKeyHandler, true);
    _trackerModalKeyHandler = null;
  }
  if (_trackerModalEl && _trackerModalEl.parentNode) {
    _trackerModalEl.parentNode.removeChild(_trackerModalEl);
  }
  _trackerModalEl = null;
}

// Navigation clavier d'un panneau (flyout ou modal) : focus sur la 1ʳᵉ action, TAB et flèches
// cyclent dans le panneau, Entrée/Espace = activation native, Échap ferme si opts.handleEscape.
// Le listener meurt avec le conteneur (pas de cleanup).
function _installFocusNav(container, opts) {
  opts = opts || {};
  const sel = "button:not([disabled]), a[href], [tabindex]";
  function items() {
    return Array.prototype.slice.call(container.querySelectorAll(sel))
      .filter(function(el) { return el.offsetParent !== null && el.getAttribute("tabindex") !== "-1"; });
  }
  // Focus initial = 1ʳᵉ action (firstSelector), pas la croix de fermeture.
  const first = (opts.firstSelector && container.querySelector(opts.firstSelector)) || items()[0];
  if (first) { try { first.focus(); } catch(e) {} }

  container.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
      if (opts.handleEscape && typeof opts.onClose === "function") {
        e.preventDefault(); e.stopPropagation(); opts.onClose();
      }
      return;
    }
    const isTab  = (e.key === "Tab");
    const isNext = (e.key === "ArrowDown" || e.key === "ArrowRight");
    const isPrev = (e.key === "ArrowUp"   || e.key === "ArrowLeft");
    if (!isTab && !isNext && !isPrev) return;  // Entrée/Espace → activation native
    const list = items();
    if (!list.length) return;
    e.preventDefault();
    const idx = list.indexOf(document.activeElement);
    let n;
    if (isTab) n = e.shiftKey ? (idx <= 0 ? list.length - 1 : idx - 1)
                              : (idx === list.length - 1 ? 0 : idx + 1);
    else if (isNext) n = (idx < 0 || idx === list.length - 1) ? 0 : idx + 1;
    else n = (idx <= 0) ? list.length - 1 : idx - 1;
    try { list[n].focus(); } catch(e2) {}
  });
}

function _creerTuileTracker(sub) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "kta-tracker-modal-tile";
  if (sub.cssClass) tile.classList.add(sub.cssClass);
  if (typeof sub.isActive === "function") {
    try { if (sub.isActive()) tile.classList.add("kta-actif"); } catch(e) {}
  }
  // Trois états : on / pause (orange) / off = coupé en configuration (grisée mais cliquable :
  // le clic explique comment l'activer).
  if (typeof sub.etat === "function") {
    try {
      const e = sub.etat();
      tile.classList.toggle("kta-actif", e === "on");
      tile.classList.toggle("kta-pause", e === "pause");
      tile.classList.toggle("kta-inactif", e === "off");
    } catch(e) {}
  }
  const ic = document.createElement("span");
  ic.className = "kta-tracker-modal-tile-icon";
  ic.innerHTML = (typeof sub.dynamicIcon === "function")
                 ? (sub.dynamicIcon() || sub.icone || "")
                 : (sub.icone || "");
  const lbl = document.createElement("span");
  lbl.className = "kta-tracker-modal-tile-label";
  const titreFixe = sub.titreCle ? window.I18n.t(sub.titreCle) : (sub.titre || "");
  lbl.textContent = (typeof sub.dynamicTitre === "function")
                    ? (sub.dynamicTitre() || titreFixe)
                    : titreFixe;
  tile.appendChild(ic);
  tile.appendChild(lbl);
  tile.addEventListener("click", function(ev) {
    ev.stopPropagation();
    // Fermer AVANT l'action : la plupart ont besoin de la carte visible (recalage = clic carte)
    // ou ouvrent leur propre modale.
    _fermerTrackerModal();
    try { sub.onClick(tile); } catch(err) {
      console.warn("[TrackerModal] action click erreur :", err);
    }
  });
  return tile;
}

function _ajouterSectionTracker(corps, titre, actions) {
  if (!actions || actions.length === 0) return;
  const titreEl = document.createElement("div");
  titreEl.className = "kta-tracker-modal-section-title";
  titreEl.textContent = titre;
  corps.appendChild(titreEl);
  const grid = document.createElement("div");
  grid.className = "kta-tracker-modal-grid";
  const impair = (actions.length % 2 === 1);
  actions.forEach(function(sub, i) {
    const tile = _creerTuileTracker(sub);
    // Compte impair : la dernière tuile prend toute la largeur (pas de trou).
    if (impair && i === actions.length - 1) tile.classList.add("kta-tracker-modal-tile-wide");
    grid.appendChild(tile);
  });
  corps.appendChild(grid);
}

// Bande de statut du modal Tracker (suivi ON/OFF + distance + pas).
function _creerStatutSuivi() {
  const status = document.createElement("div");
  status.className = "kta-tracker-modal-status";
  // 🩸 `isTracking` est local à initInterface(), hors de portée ici : la source de vérité est
  // window.getTrackingActif() (tracking.js), juste quel que soit le déclencheur (tuile, voix…).
  const actif = (typeof window.getTrackingActif === "function") && window.getTrackingActif() === true;
  const etatWrap = document.createElement("span");
  etatWrap.className = "kta-tracker-modal-status-item";
  const dot = document.createElement("span");
  dot.className = "kta-tracker-modal-status-dot" + (actif ? " kta-on" : "");
  const lblEtat = document.createElement("span");
  lblEtat.textContent = window.I18n.t(actif ? "tracker.modal.statusOn" : "tracker.modal.statusOff");
  etatWrap.appendChild(dot);
  etatWrap.appendChild(lblEtat);
  status.appendChild(etatWrap);
  // Distance + pas affichés seulement si le suivi a produit des données.
  let distM = 0, pas = 0;
  // 🩸 Total = podomètre + tronçons estimés entre les « Je suis ici » : sans eux, une sortie
  // menée au recalage afficherait 0 m.
  let distEstM = 0;
  try {
    distM = (typeof window.getTrackingDistanceTotaleM === "function")
      ? (window.getTrackingDistanceTotaleM() || 0)
      : ((typeof window.getTrackingDistanceM === "function") ? (window.getTrackingDistanceM() || 0) : 0);
    if (typeof window.getTrackingDistanceEstimeeM === "function") {
      distEstM = window.getTrackingDistanceEstimeeM() || 0;
    }
  } catch(e) {}
  try { if (typeof window.getStepCount === "function") pas = window.getStepCount() || 0; } catch(e) {}
  if (distM > 0 || pas > 0) {
    const distEl = document.createElement("span");
    distEl.className = "kta-tracker-modal-status-item";
    distEl.textContent = "📏 " + (window.formatDistance ? window.formatDistance(distM, 0) : Math.round(distM) + " m") +
      (distEstM > 0
        ? " " + window.I18n.t("jrn.section.dontEstime", {
            dist: (window.formatDistance ? window.formatDistance(distEstM, 0) : Math.round(distEstM) + " m") })
        : "");
    status.appendChild(distEl);
    const pasEl = document.createElement("span");
    pasEl.className = "kta-tracker-modal-status-item";
    pasEl.textContent = "👣 " + pas + " " + window.I18n.t("tracker.modal.steps");
    status.appendChild(pasEl);
  }
  return status;
}

// Exposé pour le chip tracker du footer (refonteInterface.js).
window.ouvrirMenuTracker = function() { try { _ouvrirTrackerModal("tracker"); } catch(e) { console.warn("[Interface] menu tracker :", e); } };
function _ouvrirTrackerModal(groupId) {
  // Un seul menu à la fois.
  _fermerFlyout();
  if (_groupeOuvert) _fermerGroupe(_groupeOuvert);
  _fermerTrackerModal();

  const grp = _groupes[groupId];
  if (!grp) return;
  const cfg = grp.modal || _MODAL_TRACKER;
  // ⚠️ `optionnel: "<clé APP_CONFIG>"` : tuile montrée seulement si la fonctionnalité optionnelle
  // est activée. Filtré à chaque ouverture : la case agit sans recharger.
  const baseActions = ((typeof grp.dynamicSousActions === "function")
                        ? (grp.dynamicSousActions() || [])
                        : (grp.sousActionsConfig || []).slice())
    .filter(function(a) {
      return !a.optionnel || !!(window.APP_CONFIG && window.APP_CONFIG[a.optionnel] === true);
    });

  const overlay = document.createElement("div");
  overlay.className = "kta-tracker-modal-overlay";
  overlay.addEventListener("click", function(ev) {
    if (ev.target === overlay) _fermerTrackerModal();
  });

  const box = document.createElement("div");
  box.className = "kta-tracker-modal-box";

  // ⚠️ id lu par l'aide contextuelle (seule identité de cette modale créée à la volée).
  overlay.id = cfg.id;
  const header = document.createElement("div");
  header.className = "kta-tracker-modal-header";
  const titleWrap = document.createElement("div");
  titleWrap.className = "kta-tracker-modal-title";
  const titleIcon = document.createElement("span");
  titleIcon.textContent = cfg.icone;
  const titleTxt = document.createElement("span");
  titleTxt.textContent = window.I18n.t(cfg.titreCle);
  titleWrap.appendChild(titleIcon);
  titleWrap.appendChild(titleTxt);
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "kta-tracker-modal-close";
  closeBtn.title = window.I18n.t("ui.btn.close");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", function(ev) { ev.stopPropagation(); _fermerTrackerModal(); });
  header.appendChild(titleWrap);
  header.appendChild(closeBtn);
  box.appendChild(header);

  if (cfg.statut) box.appendChild(_creerStatutSuivi());

  const corps = document.createElement("div");
  corps.className = "kta-tracker-modal-body";
  const parSection = cfg.sections.map(function(s) {
    return baseActions.filter(function(a) {
      return s.cssClass ? a.cssClass === s.cssClass : a.section === s.cle;
    });
  });
  // 🩸 Action rangée nulle part → section `defaut`, sinon une option sans `section` disparaît.
  const classees = new Set([].concat.apply([], parSection));
  const autres = baseActions.filter(function(a) { return !classees.has(a); });
  cfg.sections.forEach(function(s, i) {
    const actions = s.defaut ? parSection[i].concat(autres) : parSection[i];
    _ajouterSectionTracker(corps, window.I18n.t(s.titreCle), actions);
  });
  box.appendChild(corps);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  _trackerModalEl = overlay;

  // Échap reste à _trackerModalKeyHandler (niveau document).
  _installFocusNav(overlay, { firstSelector: ".kta-tracker-modal-tile" });

  _trackerModalKeyHandler = function(ev) {
    if (ev.key === "Escape") { ev.stopPropagation(); _fermerTrackerModal(); }
  };
  document.addEventListener("keydown", _trackerModalKeyHandler, true);
}

// ── Flyout : panneau latéral à côté du bouton du groupe ──────────────────────────────
let _currentFlyout = null;

// 🩸 initInterface est rejouée à chaque changement de plan, mais HistoryManager / Favoris /
// LegendCustomization survivent : un onChange posé dans initInterface s'empilerait (fuite, et
// callbacks sur des sidebars détachées). Abonnement UNIQUE derrière un flag module + RÉFÉRENCE
// rafraîchie à chaque init pour les callbacks qui touchent la sidebar courante.
let _historyUiSubBound       = false;
let _favorisSubBound         = false;
let _legendCustomSubBound    = false;
let _syncHistoryUiRef        = null;  // closure de l'init COURANTE (boutons frais)
let _injecterBoutonsCustomRef = null; // idem

function _toggleFlyout(groupId) {
  if (_currentFlyout && _currentFlyout.dataset.groupId === groupId) {
    _fermerFlyout();
    return;
  }
  _ouvrirFlyout(groupId);
}

function _fermerFlyout() {
  if (_currentFlyout) {
    try { _currentFlyout.remove(); } catch(e) {}
    _currentFlyout = null;
  }
  if (_currentFlyoutFond) {
    try { _currentFlyoutFond.remove(); } catch(e) {}
    _currentFlyoutFond = null;
  }
  document.removeEventListener("pointerdown", _onDocClickFlyout, true);
  document.removeEventListener("mousedown",   _onDocClickFlyout, true);
  document.removeEventListener("touchstart",  _onDocClickFlyout, true);
  window.removeEventListener("resize",     _onResizeFlyout);
  window.removeEventListener("scroll",     _onResizeFlyout, true);
  if (window.visualViewport) {
    window.visualViewport.removeEventListener("resize", _onResizeFlyout);
    window.visualViewport.removeEventListener("scroll", _onResizeFlyout);
  }
}

// 🩸 Toucher la carte pour refermer le panneau ne doit RIEN faire d'autre : le tracé ajoute son
// sommet dès le `mousedown` (road.js), zones et structures au `click`. On ferme au premier
// pointerdown et on avale, sur la carte, la suite du même geste pendant un court instant.
let _flyoutAvalerJusqua = 0;
// Fond sous le panneau en mode CENTRÉ, sous la barre du haut et le footer (z-index 1049 < 1200),
// qui restent utilisables.
let _currentFlyoutFond = null;
const _EVTS_GESTE = ["pointerdown", "mousedown", "touchstart", "touchend", "mouseup", "click"];
function _cibleSurCarte(t) {
  const carte = document.getElementById("map");
  return !!(carte && t && carte.contains(t));
}
function _avalerGesteCarte(e) {
  if (Date.now() > _flyoutAvalerJusqua || !_cibleSurCarte(e.target)) return;
  e.stopPropagation();
  if (e.cancelable && e.type !== "touchstart") e.preventDefault();
}
let _avaleurPose = false;
function _poserAvaleur() {
  if (_avaleurPose) return;
  _avaleurPose = true;
  _EVTS_GESTE.forEach(function(t) { document.addEventListener(t, _avalerGesteCarte, true); });
}

function _onDocClickFlyout(e) {
  if (!_currentFlyout) return;
  if (_currentFlyout.contains(e.target)) return;
  // Le bouton du groupe a son propre toggle (_toggleFlyout) : fermer ici le rouvrirait.
  const grpId = _currentFlyout.dataset.groupId;
  const grp = _groupes[grpId];
  if (grp && grp.btnPrincipal && grp.btnPrincipal.contains(e.target)) return;
  // Toucher le fond revient à toucher la carte : une fois le fond retiré, la suite du geste tombe dessus.
  if (_cibleSurCarte(e.target) || (_currentFlyoutFond && e.target === _currentFlyoutFond)) {
    _flyoutAvalerJusqua = Date.now() + 700;
    _avalerGesteCarte(e);
  }
  _fermerFlyout();
}

function _onResizeFlyout() {
  if (!_currentFlyout) return;
  const grpId = _currentFlyout.dataset.groupId;
  const grp = _groupes[grpId];
  if (!grp) return;
  _positionnerFlyout(_currentFlyout, grp.btnPrincipal, grp.position);
}

function _ouvrirFlyout(groupId) {
  // Un seul menu à la fois.
  _fermerFlyout();
  if (_groupeOuvert) _fermerGroupe(_groupeOuvert);

  const grp = _groupes[groupId];
  if (!grp || !grp.useFlyout) return;
  if (!grp.btnPrincipal) return;

  const fly = document.createElement("div");
  fly.className = "kta-group-flyout";
  fly.dataset.groupId = groupId;

  const header = document.createElement("div");
  header.className = "kta-group-flyout-header";
  const titleEl = document.createElement("span");
  titleEl.className = "kta-group-flyout-title";
  titleEl.textContent = (grp.btnPrincipal.title || groupId);
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "kta-group-flyout-close";
  closeBtn.title = window.I18n.t("ui.btn.close");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", function(ev) {
    ev.stopPropagation();
    _fermerFlyout();
  });
  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  fly.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "kta-group-flyout-grid";
  fly.appendChild(grid);

  // Ordre : types built-in, customs, ➕ nouveau type, puis outils.
  const baseActions = (typeof grp.dynamicSousActions === "function")
                        ? (grp.dynamicSousActions() || [])
                        : (grp.sousActionsConfig || []).slice();
  const allActions  = baseActions.slice();
  if (window.LegendCustomization && grp.lcCat && typeof window.LegendCustomization.listCustomEntries === "function") {
    // 🩸 Pas de filtre sur `e.visible` : masquer un type de la légende n'empêche jamais de le
    // dessiner (comme pour les built-in). Le retirer de la CARTE, c'est Filtres.
    const customs = window.LegendCustomization.listCustomEntries(grp.lcCat);
    if (customs.length > 0) {
      const firstNonTypeIdx = allActions.findIndex(function(a) { return !a.isTypeAction; });
      const insertIdx = firstNonTypeIdx >= 0 ? firstNonTypeIdx : allActions.length;
      const customActions = customs.map(function(e) {
        const isLine = (e.geometry === "polyline") || (!e.geometry && e.lineColor && !e.fillColor);
        let iconHtml;
        if (isLine) {
          const col = e.lineColor || e.fillColor || '#888';
          iconHtml = '<span style="display:inline-block;width:18px;height:3px;background:' + col + ';vertical-align:middle;border-radius:1px;"></span>';
        } else {
          const fill   = e.fillColor || e.lineColor || '#888';
          const border = e.borderColor || e.lineColor || fill;
          iconHtml = '<span style="display:inline-block;width:14px;height:14px;background:' + fill + ';border:1px solid ' + border + ';vertical-align:middle;border-radius:2px;"></span>';
        }
        return {
          icone:        iconHtml,
          // Pas de préfixe « ✨ » : la pastille colorée distingue déjà un custom (décision produit).
          titre:        e.label,
          isTypeAction: true,
          isCustom:     true,
          customType:   e.id,
          onClick:      function(btn) {
            if (typeof grp.customActivator === "function") grp.customActivator(e.id, btn);
          }
        };
      });
      allActions.splice(insertIdx, 0, ...customActions);
    }
    // Tuile « nouveau type » : créer un type sans passer par la légende : même boîte, catégorie verrouillée ; le type
    // créé est aussitôt sélectionné et l'outil armé. Dernier des types, avant les outils.
    if (typeof window.LegendCustomization.ouvrirAddDialog === "function"
        && typeof grp.customActivator === "function") {
      const idxOutils = allActions.findIndex(function(a) { return !a.isTypeAction; });
      allActions.splice(idxOutils >= 0 ? idxOutils : allActions.length, 0, {
        icone:        "➕",
        titre:        window.I18n.t("ui.subaction.nouveauType"),
        isTypeAction: true,
        onClick:      function() {
          window.LegendCustomization.ouvrirAddDialog(function(id) {
            // Bouton détaché : même situation qu'un clic de flyout (fermé avant l'action).
            if (id) grp.customActivator(id, document.createElement("button"));
          }, { category: grp.lcCat, titre: window.I18n.t("ui.subaction.nouveauTypeTitre") });
        }
      });
    }
  }

  // Type actif du groupe (surbrillance kta-actif)
  const currentMode = (function() {
    if (groupId === "traces")     return window.modeRoad      || null;
    if (groupId === "zones")      return window.modeZone      || null;
    if (groupId === "structures") return window.modeStructure || null;
    return null;
  })();

  // Séparateur entre le dernier type et le premier outil.
  let sepInserted = false;

  allActions.forEach(function(sub, idx) {
    if (!sepInserted && !sub.isTypeAction && idx > 0 && allActions[idx-1].isTypeAction) {
      const sep = document.createElement("div");
      sep.className = "kta-group-flyout-sep";
      grid.appendChild(sep);
      sepInserted = true;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kta-group-flyout-btn";
    // cssClass propagée comme dans l'accordéon (ex. fond rouge kta-sous-action-urgence).
    if (sub.cssClass)     btn.classList.add(sub.cssClass);
    if (sub.isTypeAction) btn.dataset.typeAction = "1";
    if (sub.customType)   btn.dataset.customType = sub.customType;

    const iconEl = document.createElement("span");
    iconEl.className = "kta-group-flyout-btn-icon";
    iconEl.innerHTML = (typeof sub.dynamicIcon === "function")
                       ? (sub.dynamicIcon() || sub.icone || "")
                       : (sub.icone || "");
    const lblEl = document.createElement("span");
    lblEl.className = "kta-group-flyout-btn-label";
    // dynamicTitre : un type renommé dans la légende garde son nom au prochain rendu.
    lblEl.textContent = (typeof sub.dynamicTitre === "function")
                        ? (sub.dynamicTitre() || sub.titre || "")
                        : (sub.titre || "");
    btn.appendChild(iconEl);
    btn.appendChild(lblEl);

    // Surbrillance : sub.isActive() pour les groupes à plusieurs états parallèles ; sinon
    // currentMode (un seul type actif : tracés/zones/structures).
    if (typeof sub.isActive === "function") {
      try { if (sub.isActive()) btn.classList.add("kta-actif"); } catch(e) {}
    } else if (currentMode && (sub.customType === currentMode)) {
      btn.classList.add("kta-actif");
    } else if (currentMode && !sub.customType && sub.isTypeAction) {
      // Built-in : l'id vit dans la closure onClick, on compare sub.typeKey.
      if (sub.typeKey && sub.typeKey === currentMode) {
        btn.classList.add("kta-actif");
      }
    }

    btn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      // Fermer AVANT l'action : elle peut ouvrir une modale (ex. suppression).
      _fermerFlyout();
      try { sub.onClick(btn); } catch(err) {
        console.warn("[Flyout] action click erreur :", err);
      }
    });
    grid.appendChild(btn);
  });

  if (!(window.APP_CONFIG && window.APP_CONFIG.panneauxAncres === true)) {
    fly.classList.add("kta-flyout-centre");
    _currentFlyoutFond = document.createElement("div");
    _currentFlyoutFond.className = "kta-group-flyout-fond";
    _currentFlyoutFond.setAttribute("aria-hidden", "true");
    document.body.appendChild(_currentFlyoutFond);
  }
  document.body.appendChild(fly);
  _positionnerFlyout(fly, grp.btnPrincipal, grp.position);
  _currentFlyout = fly;

  _installFocusNav(fly, { firstSelector: ".kta-group-flyout-btn", handleEscape: true, onClose: _fermerFlyout });

  // setTimeout : le clic qui ouvre ne doit pas refermer aussitôt (bubble).
  setTimeout(function() {
    // Fermeture au DÉBUT du geste (cf _onDocClickFlyout). mousedown/touchstart = navigateurs sans
    // PointerEvent ; ailleurs le premier des trois ferme et retire les autres.
    _poserAvaleur();
    document.addEventListener("pointerdown", _onDocClickFlyout, true);
    document.addEventListener("mousedown",   _onDocClickFlyout, true);
    document.addEventListener("touchstart",  _onDocClickFlyout, true);
    window.addEventListener("resize",     _onResizeFlyout);
    window.addEventListener("scroll",     _onResizeFlyout, true);
    // 🩸 La barre d'URL mobile bouge sans `resize` : seul `visualViewport` le signale, sinon le
    // panneau redéborde au premier défilement.
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", _onResizeFlyout);
      window.visualViewport.addEventListener("scroll", _onResizeFlyout);
    }
  }, 0);
}

// Lit `env(safe-area-inset-*)` par une sonde CSS (seul moyen en JS) ; cache invalidé quand la
// largeur change (rotation).
let _safeAreaCache = null;
function _lireSafeAreaInsets() {
  if (_safeAreaCache && _safeAreaCache.w === window.innerWidth) return _safeAreaCache;
  const d = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    const sonde = document.createElement("div");
    sonde.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;" +
      "top:env(safe-area-inset-top,0px);bottom:env(safe-area-inset-bottom,0px);" +
      "left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px);";
    document.body.appendChild(sonde);
    const cs = getComputedStyle(sonde);
    d.top    = parseFloat(cs.top)    || 0;
    d.bottom = parseFloat(cs.bottom) || 0;
    d.left   = parseFloat(cs.left)   || 0;
    d.right  = parseFloat(cs.right)  || 0;
    sonde.remove();
  } catch (e) {}
  d.w = window.innerWidth;
  _safeAreaCache = d;
  return d;
}

function _positionnerFlyout(fly, btnPrincipal, sidebarPosition) {
  const rect    = btnPrincipal.getBoundingClientRect();
  const padding = 8;
  // 🩸 `innerHeight` n'est pas ce que l'utilisateur voit : sur mobile il inclut la barre d'URL,
  // et un panneau dimensionné dessus finit sous le bord visible (son scroll interne n'y change
  // rien). `visualViewport` donne la zone visible ; son `offsetTop` est le décalage qu'un
  // élément `position: fixed` doit rattraper.
  const vv      = window.visualViewport || null;
  const vpW     = vv ? vv.width  : window.innerWidth;
  const vpH     = vv ? vv.height : window.innerHeight;
  const offX    = vv ? vv.offsetLeft : 0;
  const offY    = vv ? vv.offsetTop  : 0;
  const safeMargin = 12;
  // Encoche et barre d'accueil : comptées visibles par `visualViewport`, mais un bouton dessous
  // est inatteignable.
  const insets = _lireSafeAreaInsets();

  // 🩸 Bande utile verticale = entre la barre du haut et le footer (z-index 1200, au-dessus du
  // panneau à 1050) : sans eux, le bas du panneau (« Fermer la structure », « Effacer ») passe
  // sous le footer en paysage. Repli sur l'écran visible si une barre est absente ou masquée.
  let haut = offY + safeMargin + insets.top;
  let bas  = offY + vpH - safeMargin - insets.bottom;
  const _barre = function (id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return (r.height > 0 && r.width > 0 && getComputedStyle(el).visibility !== "hidden") ? r : null;
  };
  const rHaut = _barre("kta-refonte-header");
  const rBas  = _barre("kta-refonte-statusbar");
  if (rHaut && rHaut.bottom + 6 > haut) haut = rHaut.bottom + 6;
  if (rBas  && rBas.top - 6 < bas)      bas  = rBas.top - 6;
  if (bas - haut < 120) { haut = offY + safeMargin + insets.top; bas = offY + vpH - safeMargin - insets.bottom; }

  // max-height/max-width en px réels, pas en vh (vh peu fiable sur Safari iOS) : le scroll
  // interne prend le relais.
  const maxH = Math.max(120, bas - haut);
  fly.style.maxHeight = maxH + "px";

  const maxW = Math.max(180, vpW - 2 * safeMargin - insets.left - insets.right);
  fly.style.maxWidth = Math.min(maxW, 320) + "px";

  // Mesure réelle après application des max-*.
  const flyWidth  = fly.offsetWidth  || 240;
  const flyHeight = fly.offsetHeight || 200;

  // Mode ancré : aligné au haut du bouton, clampé à la bande utile.
  let top = rect.top;
  if (top + flyHeight > bas) top = bas - flyHeight;
  if (top < haut) top = haut;

  // Sidebar gauche → panneau à droite du bouton, et inversement ; bascule si pas de place.
  let left;
  const isLeft = (sidebarPosition === "topleft");
  if (isLeft) {
    left = rect.right + padding;
    if (left + flyWidth > offX + vpW - safeMargin - insets.right) {
      left = rect.left - flyWidth - padding;
    }
  } else {
    left = rect.left - flyWidth - padding;
    if (left < offX + safeMargin + insets.left) {
      left = rect.right + padding;
    }
  }
  if (left < offX + safeMargin + insets.left) left = offX + safeMargin + insets.left;
  if (left + flyWidth > offX + vpW - safeMargin - insets.right) {
    left = offX + vpW - flyWidth - safeMargin - insets.right;
  }

  // Centré par défaut : ancré au bouton, une longue liste (un type de structure par niveau)
  // descend jusqu'à buter. L'ancrage reste un réglage (panneauxAncres) pour le travail à la
  // souris sur grand écran (décision produit).
  if (!(window.APP_CONFIG && window.APP_CONFIG.panneauxAncres === true)) {
    top  = haut + (bas - haut - flyHeight) / 2;
    left = offX + insets.left + (vpW - insets.left - insets.right - flyWidth) / 2;
    // Plus haut que la bande utile : collé en haut, le scroll interne prend le relais.
    if (top  < haut) top = haut;
    if (left < offX + safeMargin + insets.left) left = offX + safeMargin + insets.left;
  }

  fly.style.top  = Math.round(top)  + "px";
  fly.style.left = Math.round(left) + "px";
}

// ── Contrôle des couches Leaflet ──────────────────────────────
// Panneau des couches ouvert → body.kta-layers-panel-open, pour que le CSS décale #kta-titre-fixe
// (sinon, sur mobile, le panneau passe derrière le titre pleine largeur).
function _initLayersControlWatcher() {
  function _attachWatcher() {
    const layersCtrl = document.querySelector(".leaflet-control-layers");
    if (!layersCtrl) {
      setTimeout(_attachWatcher, 200);
      return;
    }
    const observer = new MutationObserver(function() {
      document.body.classList.toggle(
        "kta-layers-panel-open",
        layersCtrl.classList.contains("leaflet-control-layers-expanded")
      );
    });
    observer.observe(layersCtrl, { attributes: true, attributeFilter: ["class"] });
    document.body.classList.toggle(
      "kta-layers-panel-open",
      layersCtrl.classList.contains("leaflet-control-layers-expanded")
    );
  }
  _attachWatcher();
}

// ── Bouton Filtres (remplace L.control.layers) : ouvre la modale FilterPanel ──────────────────────────────
L.control.ktaFilterControl = function() {
  const ctrl = L.control({ position: "topright" });
  ctrl.onAdd = function() {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control kta-filter-ctrl");
    // 🩸 Ni color ni background en inline : le thème (sombre/clair) passe par .leaflet-bar a.
    div.innerHTML =
      '<a href="#" role="button" aria-label="' + window.I18n.t("ui.filter.aria") + '" title="' + window.I18n.t("ui.filter.title") + '" ' +
      'style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;font-size:18px;line-height:1;text-decoration:none;">' +
      '&#9776;' +  // ≡
      '</a>';
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.on(div, "click", function(e) {
      L.DomEvent.preventDefault(e);
      if (window.FilterPanel && typeof window.FilterPanel.ouvrir === "function") {
        window.FilterPanel.ouvrir();
      } else {
        console.warn("[Interface] FilterPanel non chargé");
      }
    });
    return div;
  };
  return ctrl;
};

// ── Tracker : « Ma position » et suspension du verrou sur tracé ──────────────────────────────

// Recentre la carte sur la position du tracker, sans dézoomer.
function _centrerSurMaPosition() {
  if (!window.map || typeof window.getTrackingPosition !== "function" || typeof window.convertCoord !== "function") {
    window.ktaAlerte(window.I18n.t("tracker.maPosition.indispo")); return;
  }
  var pos = window.getTrackingPosition();
  if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
    window.ktaAlerte(window.I18n.t("tracker.maPosition.indispo")); return;
  }
  var ll = window.convertCoord(pos.x, pos.y);
  var z = Math.max(window.map.getZoom(), 0);
  try { window.map.setView(ll, z, { animate: true }); } catch (e) { window.map.setView(ll, z); }
}

// Suspension du verrou sur tracé (APP_CONFIG.smartNav, lu à chaque pas par tracking.js > avancer()).
// État en mémoire seulement. ⚠️ On ne suspend que si smartNav est ON : la réactivation remet true.
var _verrouSuspendu = false, _verrouTimer = null, _verrouInterval = null, _verrouFinTs = 0;

function _gererSuspensionVerrou() {
  if (_verrouSuspendu) { _confirmerReactivationVerrou(); return; } // déjà suspendu → confirme la réactivation
  if (window.APP_CONFIG && window.APP_CONFIG.smartNav !== true) {  // rien à suspendre
    window.ktaAlerte(window.I18n.t("tracker.verrou.nonActif")); return;
  }
  _ouvrirChoixDureeVerrou();
}

function _ouvrirChoixDureeVerrou() {
  var opts = [
    { ms: 30000,  key: "tracker.verrou.d30s" },
    { ms: 60000,  key: "tracker.verrou.d1min" },
    { ms: 600000, key: "tracker.verrou.d10min" },
    { ms: null,   key: "tracker.verrou.jusqua" }
  ];
  var boutons = opts.map(function(o, i) {
    return '<button class="kta-btn ' + (i === opts.length - 1 ? "kta-btn-ghost" : "kta-btn-primary") +
           '" data-i="' + i + '" style="width:100%;">' + window.I18n.t(o.key) + '</button>';
  }).join("");
  var overlay = document.createElement("div");
  overlay.className = "kta-readme-modal-overlay";
  overlay.style.zIndex = "100001";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:400px; height:auto;">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">' + window.I18n.t("tracker.verrou.titre") + '</span>' +
        '<button class="kta-panneau-close" id="kta-verrou-close">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<div style="display:flex; flex-direction:column; gap:8px;">' + boutons + '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);
  var fermer = function() { overlay.remove(); };
  document.getElementById("kta-verrou-close").addEventListener("click", fermer);
  overlay.addEventListener("click", function(e) { if (e.target === overlay) fermer(); });
  overlay.querySelectorAll("[data-i]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var o = opts[parseInt(btn.dataset.i, 10)];
      fermer();
      _suspendreVerrou(o.ms);
    });
  });
}

function _suspendreVerrou(ms) {
  if (!window.APP_CONFIG) return;
  _verrouSuspendu = true;
  window.APP_CONFIG.smartNav = false;        // pris en compte au prochain pas
  _verrouFinTs = ms ? (Date.now() + ms) : 0; // 0 = jusqu'à réactivation
  if (_verrouTimer)    { clearTimeout(_verrouTimer);   _verrouTimer = null; }
  if (_verrouInterval) { clearInterval(_verrouInterval); _verrouInterval = null; }
  if (ms) {
    _verrouTimer    = setTimeout(_reactiverVerrou, ms);
    _verrouInterval = setInterval(_majBadgeVerrou, 1000);
  }
  _afficherBadgeVerrou();
  // Toast : la barre du bas, repliable, ne suffit pas comme retour.
  if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
    window.OOMGuard.showToast(ms
      ? window.I18n.t("tracker.verrou.toastSuspendu", { duree: Math.round(ms / 1000) >= 60 ? Math.round(ms / 60000) + " min" : Math.round(ms / 1000) + " s" })
      : window.I18n.t("tracker.verrou.toastSuspenduInfini"), "warn");
  }
  console.log("[Tracker] Verrou sur tracé suspendu" + (ms ? " (" + Math.round(ms / 1000) + "s)" : " (jusqu'à réactivation)"));
}

function _verrouStatEl() { return document.getElementById("kta-refonte-stat-verrou"); }

function _reactiverVerrou() {
  if (_verrouTimer)    { clearTimeout(_verrouTimer);   _verrouTimer = null; }
  if (_verrouInterval) { clearInterval(_verrouInterval); _verrouInterval = null; }
  if (window.APP_CONFIG) window.APP_CONFIG.smartNav = true; // restaure (suspendu uniquement si ON)
  _verrouSuspendu = false;
  _verrouFinTs = 0;
  var el = _verrouStatEl();
  if (el) { el.style.display = "none"; el.onclick = null; }
  if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
    window.OOMGuard.showToast(window.I18n.t("tracker.verrou.toastReactive"), "info");
  }
  console.log("[Tracker] Verrou sur tracé réactivé");
}

// Confirmation avant réactivation : sans elle, le clic sur la stat du footer réactive sans retour.
function _confirmerReactivationVerrou() {
  var overlay = document.createElement("div");
  overlay.className = "kta-readme-modal-overlay";
  overlay.style.zIndex = "100001";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:380px; height:auto;">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">' + window.I18n.t("tracker.verrou.reactivTitre") + '</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p style="font-size:14px; color:var(--kta-texte-2); margin:0 0 16px; line-height:1.5;">' + window.I18n.t("tracker.verrou.reactivTexte") + '</p>' +
        '<div style="display:flex; gap:8px;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-verrou-react-non" style="flex:1;">' + window.I18n.t("tracker.verrou.reactivNon") + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-verrou-react-oui" style="flex:1;">' + window.I18n.t("tracker.verrou.reactivOui") + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);
  var fermer = function() { overlay.remove(); };
  document.getElementById("kta-verrou-react-non").addEventListener("click", fermer);
  overlay.addEventListener("click", function(e) { if (e.target === overlay) fermer(); });
  document.getElementById("kta-verrou-react-oui").addEventListener("click", function() { fermer(); _reactiverVerrou(); });
}

// Compte à rebours dans le footer (#kta-refonte-stat-verrou, créé caché par refonteInterface.js).
function _afficherBadgeVerrou() {
  var el = _verrouStatEl();
  if (!el) return;
  el.style.display = "";
  el.onclick = _confirmerReactivationVerrou;
  _majBadgeVerrou();
}

function _majBadgeVerrou() {
  var el = _verrouStatEl();
  if (!el) return;
  var val = el.querySelector(".kta-refonte-stat-val");
  if (!val) return;
  if (!_verrouFinTs) { val.textContent = "∞"; return; } // jusqu'à réactivation
  var reste = Math.max(0, Math.round((_verrouFinTs - Date.now()) / 1000));
  var m = Math.floor(reste / 60), s = reste % 60;
  val.textContent = m + ":" + (s < 10 ? "0" : "") + s;
}

// ── initInterface : barres d'outils du plan ──────────────────────────────
// ⚠️ Rejouée à chaque ouverture de plan (main.js remet interfaceInitialized à false).
function initInterface() {
  console.log("[Interface] initInterface");
  if (window.interfaceInitialized) return;
  window.interfaceInitialized = true;

  Object.keys(_groupes).forEach(function(k) { delete _groupes[k]; });
  _groupeOuvert = null;

  // 🩸 La suspension du verrou est oubliée au changement de plan : smartNav est reconstruit depuis
  // les préférences, garder la suspension ferait proposer de « réactiver » un verrou actif.
  // Ne pas toucher smartNav ici.
  if (_verrouSuspendu || _verrouTimer || _verrouInterval) {
    if (_verrouTimer)    { clearTimeout(_verrouTimer);   _verrouTimer = null; }
    if (_verrouInterval) { clearInterval(_verrouInterval); _verrouInterval = null; }
    _verrouSuspendu = false;
    _verrouFinTs = 0;
  }

  // 🏷️ ancre:reset-modes-plan
  // 🩸 Reset des modes à l'ouverture d'un plan : sinon un mode édition armé (ex. POI créé puis
  // portail inter-plan) reste actif à l'arrivée et chaque clic carte pose un point.
  // _desactiverTousLesModes() touche des boutons de l'ancienne sidebar (détachés, inoffensif) ;
  // les flags sont forcés à false en filet, et leurs setters (curseur de précision) notifient.
  try { _desactiverTousLesModes(); } catch(e) {}
  window.modeEdition  = false;
  window.modeMesure   = false;
  window.modeRecalage = false;
  window.modeRoad     = false;
  window.modeZone     = false;
  window.modeStructure = false;

  L.control.titleControl().addTo(window.map);

  L.control.ktaFilterControl().addTo(window.map);

  // Interface refondue : boutons ≡ de réduction des sidebars (mis en haut par CSS order:-1),
  // puis Niveau et Favoris en sidebar gauche. Sinon Niveau est créé en fin d'initInterface.
  // ⚠️ L'ordre d'ajout fixe l'ordre visuel des boutons dans chaque sidebar.
  if (window._refonteInterfaceActive === true) {
    if (typeof window._refonteInterfaceCreerBoutonReductionLeft === "function") {
      window._refonteInterfaceCreerBoutonReductionLeft();
    }
    if (typeof window._refonteInterfaceCreerBoutonReductionRight === "function") {
      window._refonteInterfaceCreerBoutonReductionRight();
    }
    // Niveau (interfaceConfig.js), avant les groupes topleft.
    if (typeof window._initLevelFilterControl === "function") {
      window._initLevelFilterControl();
    }

    // Favoris : juste sous Niveau. Liste relue à chaque ouverture (Favoris.getAll()) ;
    // _allerVersFavori est déclarée plus bas dans initInterface (hoisting).
    _creerGroupeAccordeon({
      id: "favoris",
      iconePrincipale: "⭐",
      titre: window.I18n.t("ui.group.favoris"),
      position: "topleft",
      useFlyout: true,
      dynamicSousActions: function() {
        if (!window.Favoris) return [];
        const favs = window.Favoris.getAll();
        if (favs.length === 0) {
          return [{
            icone: "ℹ️",
            titre: window.I18n.t("ui.favoris.empty"),
            onClick: function() {}  // no-op
          }];
        }
        return favs.map(function(f) {
          const tag = f.tag || "default";
          let iconHtml;
          if (window.PLAN_CONFIG && window.PLAN_CONFIG.icons && window.PLAN_CONFIG.icons[tag]) {
            iconHtml = '<img src="' + window.PLAN_CONFIG.icons[tag] + '" alt="" style="width:18px;height:18px;object-fit:contain;">';
          } else if (window._iconMap && window._iconMap[tag]) {
            const io = window._iconMap[tag];
            const url = io._kta_iconUrl || (io.options && io.options.iconUrl);
            if (url) iconHtml = '<img src="' + url + '" alt="" style="width:18px;height:18px;object-fit:contain;">';
          }
          if (!iconHtml) iconHtml = "📍";

          return {
            icone: iconHtml,
            titre: f.nom,
            onClick: function() {
              _allerVersFavori(f);
            }
          };
        });
      }
    });
  }

  // Panneau d'une installation reliée (ex. « Équipe »), sous Favoris, seulement si une extension
  // le fournit (prise neutre `panneau`) : sans extension, aucun bouton.
  const _panneauExt = (window.KtaExtensions && typeof window.KtaExtensions.panneauExtension === "function")
    ? window.KtaExtensions.panneauExtension() : null;
  // ⚠️ Config dans une variable, pas un littéral : absent du guide public, ce bouton ne doit pas
  // être vu par scripts/check-doc-sidebar.js.
  if (_panneauExt) {
    const _cfgPanneauExt = {
      id: "ext-panneau",
      iconePrincipale: _panneauExt.icone,
      titre: _panneauExt.titre,
      position: "topleft",
      soloAction: function() { window.KtaExtensions.ouvrirPanneau(); }
    };
    _creerGroupeAccordeon(_cfgPanneauExt);
  }

  // 🩸 #map en position:fixed = stacking context isolé : le panneau des couches ne peut pas passer
  // au-dessus du titre fixe (z-index 1100, dans body) ; le watcher décale le titre par CSS.
  _initLayersControlWatcher();

  // Aide / Documentation / Légende
  _creerGroupeAccordeon({
    id: "aide",
    iconePrincipale: "📚",
    titre: window.I18n.t("ui.group.aide"),
    position: "topleft",
    sousActions: [
      // afficherAide / afficherReadme vivent dans interfaceDocs.js : appel via window.
      { icone: "❓", titre: window.I18n.t("ui.subaction.aide"),          onClick: function() { if (typeof window.afficherAide === "function") window.afficherAide(); } },
      { icone: "📖", titre: window.I18n.t("ui.subaction.documentation"), onClick: function() { if (typeof window.afficherReadme === "function") window.afficherReadme(); } },
      // Aide IA et tutoriel ne sont pas ici : dans l'en-tête de la Documentation (aussi depuis l'accueil).
      { icone: "🗺️", titre: window.I18n.t("ui.subaction.legende"),       onClick: afficherLegende }
    ]
  });

  // Paramètres (solo). 🩸 Pas de bascule de thème sur la carte : elle vit dans la Configuration de
  // l'accueil et recharge l'app (ThemeManager.setThemeAndReload) ; un changement « à chaud »
  // laisse des modales et le bandeau dans l'ancien thème.
  _creerGroupeAccordeon({
    id: "settings",
    iconePrincipale: "⚙️",
    titre: window.I18n.t("ui.group.settings"),
    position: "topleft",
    soloAction: function() { if (typeof window.afficherConfig === "function") window.afficherConfig(); }
  });

  // Recherche (solo)
  _creerGroupeAccordeon({
    id: "recherche",
    iconePrincipale: "🔍",
    titre: window.I18n.t("ui.group.recherche"),
    soloAction: function() {
      if (window.ouvrirRecherche) window.ouvrirRecherche();
      else window.ktaAlerte(window.I18n.t("ui.alert.rechercheIndispo"), { type: "erreur" });
    }
  });

  // Charger / Importer (solo) : ouvre directement le sélecteur de fichier, l'extension choisit le parcours
  // (session .json / .zip ou GPX, interfaceImportExport.js). « Changer de plan » n'y est pas : header et
  // titre du plan le font déjà ; l'Éditeur de données du plan vit dans ⬆️ Exporter (décision produit).
  _creerGroupeAccordeon({
    id: "charger",
    iconePrincipale: "⬇️",
    titre: window.I18n.t("ui.group.charger"),
    position: "topleft",
    soloAction: function() {
      if (typeof window.ouvrirImportChoix === "function") window.ouvrirImportChoix();
      else if (typeof window.ouvrirImportSession === "function") window.ouvrirImportSession();
    }
  });

  // Pas de Générateur de plan sur la carte : il vit à l'accueil (décision produit).

  // Exporter (id "save") : lanceur à tuiles (Image / Session / Export externe), chaque tuile ouvre
  // directement son écran. ⚠️ Le 2ᵉ argument de ouvrirExportSessionModal est sans effet ; le 3ᵉ
  // `{ format }` présélectionne KMZ ou GPX.
  function _ouvrirExportSession(onglet, opts) {
    if (window.ouvrirExportSessionModal) window.ouvrirExportSessionModal(onglet, true, opts);
    else if (window.telechargerSessionJSON) window.telechargerSessionJSON();
  }
  _creerGroupeAccordeon({
    id: "save",
    iconePrincipale: "⬆️",
    titre: window.I18n.t("ui.group.save"),
    position: "topleft",
    useModal: true,
    modal: _MODAL_EXPORT,
    sousActions: [
      { icone: "🖼️", titreCle: "export.lanceur.image", section: "image", onClick: function() {
          if (window.ouvrirExportModal) {
            window.ouvrirExportModal();
          } else if (window.telechargerPlan) {
            // telechargerPlan relance l'erreur : attrapée ici pour un message visible.
            window.telechargerPlan().catch(function(err) {
              window.ktaAlerte(window.I18n.t("ui.alert.exportError", { err: (err && err.message ? err.message : err) }),
                { type: "erreur" });
            });
          }
        } },
      { icone: "🖨️", titreCle: "export.lanceur.pdf", section: "image", onClick: function() {
          if (window.MyKTAMapPdfExport && window.MyKTAMapPdfExport.afficherModale) {
            window.MyKTAMapPdfExport.afficherModale();
          } else {
            window.ktaAlerte(window.I18n.t("ui.alert.pdfIndispo"), { type: "erreur" });
          }
        } },
      { icone: "💾", titreCle: "export.lanceur.complet", section: "session", onClick: function() {
          _ouvrirExportSession("full");
        } },
      { icone: "🎨", titreCle: "export.lanceur.avance", section: "session", onClick: function() {
          _ouvrirExportSession("advanced");
        } },
      { icone: "📊", titreCle: "export.lanceur.editeur", section: "session", onClick: function() {
          if (window.ouvrirTableEditor) window.ouvrirTableEditor();
          else window.ktaAlerte(window.I18n.t("ui.alert.tableEditorIndispo"), { type: "erreur" });
        } },
      { icone: "🌍", titreCle: "export.lanceur.kmz", section: "externe", onClick: function() {
          _ouvrirExportSession("extern", { format: "kmz" });
        } },
      { icone: "📍", titreCle: "export.lanceur.gpx", section: "externe", onClick: function() {
          _ouvrirExportSession("extern", { format: "gpx" });
        } }
    ]
  });

  // Historique : dernier groupe de la sidebar gauche (déclaré après save). Ctrl+Z / Ctrl+Y vivent
  // dans historyManager.js ; ces boutons servent au mobile, grisés quand la pile est vide.
  _creerGroupeAccordeon({
    id: "history",
    iconePrincipale: "⏪",
    titre: window.I18n.t("ui.group.history"),
    position: "topleft",
    sousActions: [
      {
        icone: "⏪",
        titre: window.I18n.t("ui.subaction.undo"),
        onClick: function(btnSub) {
          if (!window.HistoryManager) return;
          if (!window.HistoryManager.canUndo()) {
            if (window.OOMGuard && window.OOMGuard.showToast) {
              window.OOMGuard.showToast(window.I18n.t("ui.toast.nothingUndo"), "info");
            }
            return;
          }
          window.HistoryManager.undo();
        }
      },
      {
        icone: "⏩",
        titre: window.I18n.t("ui.subaction.redo"),
        onClick: function(btnSub) {
          if (!window.HistoryManager) return;
          if (!window.HistoryManager.canRedo()) {
            if (window.OOMGuard && window.OOMGuard.showToast) {
              window.OOMGuard.showToast(window.I18n.t("ui.toast.nothingRedo"), "info");
            }
            return;
          }
          window.HistoryManager.redo();
        }
      }
    ]
  });

  // Grisage selon canUndo/canRedo. ⚠️ Boutons lus dans _groupes["history"].subActions, dans
  // l'ordre de déclaration [Undo, Redo] (aucun attribut data-* ne les désigne).
  (function _wireHistoryUiState() {
    if (!window.HistoryManager) return;
    const grp = _groupes["history"];
    if (!grp || !Array.isArray(grp.subActions) || grp.subActions.length < 2) {
      console.warn("[HistoryUI] grisage indisponible — _groupes[history].subActions manquant ou incomplet.");
      return;
    }
    const btnUndo = grp.subActions[0];
    const btnRedo = grp.subActions[1];
    function _applyDisabled(btn, disabled) {
      if (!btn) return;
      if (disabled) {
        btn.classList.add("kta-disabled-state");
        btn.style.opacity = "0.4";
        btn.style.cursor = "not-allowed";
        btn.style.pointerEvents = "auto"; // garder cliquable pour afficher le toast "Rien à annuler"
      } else {
        btn.classList.remove("kta-disabled-state");
        btn.style.opacity = "";
        btn.style.cursor = "";
        btn.style.pointerEvents = "";
      }
    }
    function _sync(state) {
      _applyDisabled(btnUndo, !state.canUndo);
      _applyDisabled(btnRedo, !state.canRedo);
    }
    _sync({
      canUndo: window.HistoryManager.canUndo(),
      canRedo: window.HistoryManager.canRedo()
    });
    // Abonnement unique + référence rafraîchie (cf. _historyUiSubBound) : la closure pointe les
    // boutons de la sidebar COURANTE.
    _syncHistoryUiRef = _sync;
    if (!_historyUiSubBound) {
      _historyUiSubBound = true;
      window.HistoryManager.onChange(function(state) {
        if (_syncHistoryUiRef) _syncHistoryUiRef(state);
        // 🩸 Undo jusqu'à VIDER une forme en cours : _applyState remet le mode à null sans toucher
        // au bouton, resté kta-actif (« allumé mais mort »). Bouton actif + mode éteint → on ferme.
        // Exact car _applyState restaure le mode tant qu'il reste une forme en cours ; et
        // desactiverFn ne bascule que `if (window.modeX)`, donc ne ré-arme pas l'outil.
        try {
          if (_modesActifs["road"]      && !window.modeRoad)      _fermerModeRoad();
          if (_modesActifs["zone"]      && !window.modeZone)      _fermerModeZone();
          if (_modesActifs["structure"] && !window.modeStructure) _fermerModeStructure();
        } catch (e) { /* resync best-effort */ }
      });
    }
  })();

  // Tracker : modal de tuiles. Icône Play/Stop dynamique, plusieurs états actifs en parallèle
  // (Play, Recalage, Boussole) → isActive par tuile.
  let isTracking = false;
  // Seul chemin de démarrage du suivi (tuile Play et relance d'une sortie du carnet) :
  // avertissement de première fois, permission capteurs, puis tuile + voyant. `btnSub` absent
  // pour une relance.
  function _demarrerSuivi(btnSub) {
    if (isTracking) return;
    // 🩸 requestPermission() est appelé dans le geste utilisateur (« J'ai compris », iOS) et sa
    // réponse (Promise<boolean>) est ATTENDUE avant startTracking() : sinon un refus laisse la
    // pastille ON et zéro pas. Refus → pas de démarrage, modale avec le chemin de réactivation.
    const _doStart = function() {
      let perm;
      try { perm = requestPermission(); } catch(e) { perm = true; }
      Promise.resolve(perm).then(function(ok) {
        if (ok === false) {
          _alertCharte(window.I18n.t("ui.trackerWarn.refusTitre"),
                       window.I18n.t("ui.trackerWarn.refusTexte"), "🚫");
          return;
        }
        _doStartSuite();
      });
    };
    const _doStartSuite = function() {
      startTracking();
      if (btnSub) btnSub.innerHTML = "⏹️";
      // L'icône principale reste 🧭 (identité du groupe) ; kta-group-mode-actif signale le suivi.
      _setGroupeModeActif("tracker", true, null);
      isTracking = true;
    };
    if (_trackerWarningAcknowledged) {
      _doStart();
    } else {
      _afficherAvertissementTracker(_doStart);
    }
  }
  window.ktaDemarrerSuivi = function() { _demarrerSuivi(null); };
  // Tuile « Partager ma position sur ce plan » : seulement si une installation reliée sait publier
  // une présence (prise neutre `presence`, js/ktaExtensions.js).
  function _tuilePresence() {
    const X = window.KtaExtensions;
    if (!X || typeof X.aPrise !== "function" || !X.aPrise("presence")) return null;
    return {
      icone: "📡",
      titre: window.I18n.t("ui.subaction.presence"),
      section: "suivi",
      isActive: function() { return X.presenceActive() === true; },
      onClick: function(btnSub) {
        X.basculerPresence().then(function(actif) {
          if (btnSub) btnSub.classList.toggle("kta-actif", actif);
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(window.I18n.t(actif ? "presence.toast.on" : "presence.toast.off"), "info");
          }
        });
      }
    };
  }
  _creerGroupeAccordeon({
    id: "tracker",
    iconePrincipale: "🧭",
    titre: window.I18n.t("ui.group.tracker"),
    useModal: true,
    sousActions: [
      {
        icone: "▶️",
        titre: window.I18n.t("ui.subaction.trackToggle"),
        section: "suivi",
        dynamicIcon: function() { return isTracking ? "⏹️" : "▶️"; },
        isActive:    function() { return isTracking === true; },
        onClick: function(btnSub) {
          if (isTracking) {
            stopTracking();
            btnSub.innerHTML = "▶️";
            _setGroupeModeActif("tracker", false);
            isTracking = false;
            return;
          }
          _demarrerSuivi(btnSub);
        }
      },
      {
        icone: "🧭",
        titre: window.I18n.t("ui.subaction.compass"),
        section: "outils",
        isActive: function() {
          return !!(window.CompassWidget && typeof window.CompassWidget.isVisible === "function"
                    && window.CompassWidget.isVisible());
        },
        onClick: function(btnSub) {
          if (!window.CompassWidget) return;
          window.CompassWidget.toggle();
          const visible = window.CompassWidget.isVisible();
          btnSub.classList.toggle("kta-actif", visible);
          // Appelé quand le widget est fermé par sa croix.
          window._onCompassHiddenExternally = function() {
            btnSub.classList.remove("kta-actif");
          };
        }
      },
      {
        // Plan orienté : pendant le suivi, la CARTE tourne (marche vers le haut). Réglage d'appareil
        // persisté, OFF par défaut ; se pose à l'avance, ne s'anime que suivi en cours.
        icone: "🗺️",
        titre: window.I18n.t("ui.subaction.planOriente"),
        section: "outils",
        isActive: function() {
          return !!(window.MapBearing && window.MapBearing.isEnabled());
        },
        onClick: function(btnSub) {
          if (!window.MapBearing) return;
          const actif = !window.MapBearing.isEnabled();
          window.MapBearing.setEnabled(actif);
          btnSub.classList.toggle("kta-actif", actif);
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(actif ? window.I18n.t("bearing.toastOn")
                                            : window.I18n.t("bearing.toastOff"), "info");
          }
        }
      },
      {
        // Guidage : le bandeau s'affiche seul dès qu'un itinéraire coexiste avec le suivi ou une
        // position confirmée. Réglage Auto / Jamais (persisté) ; la croix du bandeau le coupe, cette
        // tuile le rallume. Doc : docs/ETUDE_GUIDAGE.md.
        icone: "🪧",
        titre: window.I18n.t("ui.subaction.guidage"),
        section: "outils",
        isActive: function() {
          return !!(window.ItiGuidage && window.ItiGuidage.getPref() === "auto");
        },
        onClick: function(btnSub) {
          if (!window.ItiGuidage) return;
          const actif = window.ItiGuidage.getPref() !== "auto";
          window.ItiGuidage.setPref(actif ? "auto" : "jamais");
          btnSub.classList.toggle("kta-actif", actif);
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(actif ? window.I18n.t("guid.toast.on")
                                            : window.I18n.t("guid.toast.off"), "info");
          }
        }
      },
      {
        icone: "📍",
        titre: window.I18n.t("ui.subaction.recalage"),
        section: "suivi",
        isActive: function() { return window.modeRecalage === true; },
        onClick: function(btnSub) {
          if (typeof window.modeRecalage === "undefined") return;
          const dejaActif = btnSub.classList.contains("kta-actif");
          _desactiverTousLesModes();
          if (dejaActif) {
            window.modeRecalage = false;
_setGroupeModeActif("tracker", isTracking, null);
            return;
          }
          window.modeRecalage = true;
          btnSub.classList.add("kta-actif");
          // Exposée à tracking.js (window._fermerModeRecalage), qui la rappelle après le clic carte.
          const _desactiverFn = function() {
            window.modeRecalage = false;
            btnSub.classList.remove("kta-actif");
            delete _modesActifs["recalage"];
            // 🩸 Remettre 🧭 à la main : _setGroupeModeActif(true, null) ne touche pas l'icône,
            // restée à 📍 si le suivi tourne.
            const g = _groupes["tracker"];
            if (g && g.btnPrincipal && g.btnPrincipal.dataset.iconeOriginale) {
              g.btnPrincipal.innerHTML = g.btnPrincipal.dataset.iconeOriginale;
            }
            _setGroupeModeActif("tracker", isTracking, null);
          };
          _modesActifs["recalage"] = { btnEl: btnSub, desactiverFn: _desactiverFn };
          window._fermerModeRecalage = _desactiverFn;
          _setGroupeModeActif("tracker", true, "📍");
        }
      },
      {
        icone: "🎯",
        titre: window.I18n.t("ui.subaction.maPosition"),
        section: "suivi",
        onClick: function() { _centrerSurMaPosition(); }
      },
      // Suspendre le verrou sur tracé sans passer par les Réglages (ex. sortie de galerie hors plan).
      {
        icone: "🔓",
        titre: window.I18n.t("ui.subaction.verrouSuspend"),
        section: "suivi",
        // Coupé en configuration = grisé · suspendu = orange · en service = vert
        dynamicIcon: function() { return _verrouSuspendu ? "🔓" : "🔒"; },
        // ⚠️ La suspension met smartNav à false : elle se teste en premier.
        etat: function() {
          if (_verrouSuspendu) return "pause";
          return (window.APP_CONFIG && window.APP_CONFIG.smartNav === true) ? "on" : "off";
        },
        onClick: function() { _gererSuspensionVerrou(); }
      },
      {
        icone: "🗺️",
        titre: window.I18n.t("ui.subaction.itineraire"),
        section: "outils",
        onClick: function() {
          if (typeof window.ouvrirItinerairModal === "function") {
            window.ouvrirItinerairModal();
          }
        }
      },
      // Replay du parcours (timeline cumulée depuis startTracking, recalages = ancres).
      {
        icone: "🎬",
        titre: window.I18n.t("ui.subaction.replay"),
        section: "outils",
        optionnel: "replayEnabled",
        onClick: function() {
          if (window.MyKTAMapTrackerReplay && typeof window.MyKTAMapTrackerReplay.ouvrirModale === "function") {
            window.MyKTAMapTrackerReplay.ouvrirModale();
          } else {
            window.ktaAlerte(window.I18n.t("ui.alert.replayIndispo"), { type: "erreur" });
          }
        }
      },
      // Heatmap : cumul multi-session de la timeline (persistée par SessionPersist / SessionBackups).
      {
        icone: "🔥",
        titre: window.I18n.t("ui.subaction.heatmap"),
        section: "outils",
        // ⚠️ Seule la TUILE est optionnelle : le module reste chargé, le Mode
        // Secours garde son bloc « Heatmap d'activité » quel que soit ce réglage.
        optionnel: "heatmapEnabled",
        onClick: function() {
          if (window.MyKTAMapHeatmap && typeof window.MyKTAMapHeatmap.ouvrirModale === "function") {
            window.MyKTAMapHeatmap.ouvrirModale();
          } else {
            window.ktaAlerte(window.I18n.t("ui.alert.heatmapIndispo"), { type: "erreur" });
          }
        }
      },
      // Urgence en fin de liste, fond rouge (kta-sous-action-urgence → section « urgence »).
      {
        icone: "⛑️",
        titre: window.I18n.t("ui.subaction.lost"),
        cssClass: "kta-sous-action-urgence",
        onClick: function() {
          if (window.LostMode && typeof window.LostMode.open === "function") {
            window.LostMode.open();
          } else {
            window.ktaAlerte(window.I18n.t("ui.alert.lostIndispo"), { type: "erreur" });
          }
        }
      },
      // Affichage XL : position + cap en grand, sans le superflu (≠ Je suis perdu, qui calcule une
      // zone de recherche ; ≠ 🚨 Sortie d'urgence).
      {
        icone: "🔆",
        titre: window.I18n.t("ui.subaction.emergency"),
        cssClass: "kta-sous-action-urgence",
        onClick: function() {
          if (window.EmergencyMode && typeof window.EmergencyMode.activer === "function") {
            window.EmergencyMode.activer();
          } else {
            window.ktaAlerte(window.I18n.t("ui.alert.emergencyIndispo"), { type: "erreur" });
          }
        }
      },
      // Mode Secours : assigner des équipes de recherche à des zones du plan.
      {
        icone: "🚑",
        titre: window.I18n.t("ui.subaction.secours"),
        cssClass: "kta-sous-action-urgence",
        onClick: function() {
          if (window.SecoursMode && typeof window.SecoursMode.ouvrir === "function") {
            window.SecoursMode.ouvrir();
          } else {
            window.ktaAlerte(window.I18n.t("ui.alert.secoursIndispo"), { type: "erreur" });
          }
        }
      }
    ]
  });
  // Liste du tracker recalculée à chaque ouverture : la tuile de présence n'existe que si une
  // extension la propose, éventuellement déclarée après la construction du groupe.
  // 🩸 À poser ici, à la construction du groupe, pas dans une action (sinon la tuile n'apparaît
  // qu'après cette action).
  if (_groupes.tracker) {
    _groupes.tracker.dynamicSousActions = function() {
      const l = (_groupes.tracker.sousActionsConfig || []).slice();
      const p = _tuilePresence();
      if (p) l.push(p);
      return l;
    };
  }

  // Mesure
  _creerGroupeAccordeon({
    id: "mesure",
    iconePrincipale: "📐",
    titre: window.I18n.t("ui.group.mesure"),
    sousActions: [
      // 🩸 Distance et Surface sont deux actions exclusives qui ARMENT modeMesure ET choisissent le
      // sous-mode : changer seulement le sous-mode laisse le clic carte sans effet. Re-clic = coupe.
      {
        icone: "📐",
        titre: window.I18n.t("ui.subaction.mesureDistance"),
        onClick: function(btnSub) {
          const dejaActif = btnSub.classList.contains("kta-actif");
          _desactiverTousLesModes();
          if (dejaActif) {
            window.modeMesure = false;
            _setGroupeModeActif("mesure", false);
            return;
          }
          // ⚠️ Sous-mode AVANT d'armer : nettoie les libellés de segments de la surface.
          if (typeof window.setMeasureMode === "function") {
            window.setMeasureMode("distance");
          }
          window.modeMesure = true;
          btnSub.classList.add("kta-actif");
          _modesActifs["mesure"] = {
            btnEl: btnSub,
            desactiverFn: function() {
              window.modeMesure = false;
              btnSub.classList.remove("kta-actif");
              _setGroupeModeActif("mesure", false);
            }
          };
          _setGroupeModeActif("mesure", true);
        }
      },
      {
        icone: "♦️",
        titre: window.I18n.t("ui.subaction.mesureSurface"),
        onClick: function(btnSub) {
          const dejaActif = btnSub.classList.contains("kta-actif");
          _desactiverTousLesModes();
          if (dejaActif) {
            window.modeMesure = false;
            _setGroupeModeActif("mesure", false);
            return;
          }
          // ⚠️ Sous-mode AVANT d'armer : cache la polyline, montre le polygone.
          if (typeof window.setMeasureMode === "function") {
            window.setMeasureMode("surface");
          }
          window.modeMesure = true;
          btnSub.classList.add("kta-actif");
          _modesActifs["mesure"] = {
            btnEl: btnSub,
            desactiverFn: function() {
              window.modeMesure = false;
              btnSub.classList.remove("kta-actif");
              _setGroupeModeActif("mesure", false);
            }
          };
          _setGroupeModeActif("mesure", true);   // icône 📐 inchangée, surlignée
          if (window.OOMGuard && window.OOMGuard.showToast) {
            window.OOMGuard.showToast(
              window.I18n.t("ui.toast.surfaceMode"),
              "info"
            );
          }
        }
      },
      {
        icone: "❌",
        titre: window.I18n.t("ui.subaction.mesureEffacer"),
        onClick: function() {
          // Deux mesures indépendantes : « dernier point » vise le sous-mode actif
          // (getMeasureMode) ; chaque « toute la X » n'apparaît que si elle a des points.
          const ptsD = (window.getMeasurePoints        ? window.getMeasurePoints()        : []) || [];
          const ptsS = (window.getMeasurePointsSurface ? window.getMeasurePointsSurface() : []) || [];
          if (ptsD.length === 0 && ptsS.length === 0) return;

          const activeMode = (typeof window.getMeasureMode === "function") ? window.getMeasureMode() : "distance";
          const ptsActive  = (activeMode === "surface") ? ptsS : ptsD;
          const labelActive = (activeMode === "surface") ? window.I18n.t("ui.mesure.labelSurface") : window.I18n.t("ui.mesure.labelDistance");

          const choix = [];
          if (ptsActive.length > 0) {
            choix.push({
              label: window.I18n.t("ui.mesure.lastPoint", { label: labelActive }), icon: "↩️",
              desc: window.I18n.t("ui.mesure.lastPointDesc", { n: ptsActive.length, label: labelActive }),
              onClick: function() { if (window.removeLastMeasurePoint) window.removeLastMeasurePoint(); }
            });
          }
          if (ptsD.length > 0) {
            choix.push({
              label: window.I18n.t("ui.mesure.allDistance"), icon: "🗑️", danger: true,
              desc: window.I18n.t("ui.mesure.nPoints", { n: ptsD.length }),
              onClick: function() { if (window.resetMesureMode) window.resetMesureMode("distance"); }
            });
          }
          if (ptsS.length > 0) {
            choix.push({
              label: window.I18n.t("ui.mesure.allSurface"), icon: "🗑️", danger: true,
              desc: window.I18n.t("ui.mesure.nPoints", { n: ptsS.length }),
              onClick: function() { if (window.resetMesureMode) window.resetMesureMode("surface"); }
            });
          }
          if (ptsD.length > 0 && ptsS.length > 0) {
            choix.push({
              label: window.I18n.t("ui.mesure.allBoth"), icon: "🗑️", danger: true,
              onClick: function() { if (window.resetMesure) window.resetMesure(); }
            });
          }

          _choixSuppression(window.I18n.t("ui.mesure.choixTitle"), window.I18n.t("ui.choix.whatErase"), choix);
        }
      }
    ]
  });

  // Édition (solo) : le crayon bascule le mode ajout de point. Supprimer un point passe par sa
  // popup ou Ctrl+Z. kta-group-mode-actif est posé à la main (_setGroupeModeActif vise les
  // groupes à sous-actions).
  _creerGroupeAccordeon({
    id: "edition",
    iconePrincipale: "✏️",
    titre: window.I18n.t("ui.group.edition"),
    soloAction: function() {
      const grp = _groupes["edition"];
      if (!grp || !grp.btnPrincipal) return;
      const btn = grp.btnPrincipal;
      const dejaActif = btn.classList.contains("kta-group-mode-actif");
      _desactiverTousLesModes();
      if (dejaActif) {
        window.modeEdition = false;
        btn.classList.remove("kta-group-mode-actif");
        grp.modeActif = false;
        delete _modesActifs["edition"];
        return;
      }
      // 🔒 Plan en lecture seule (installation reliée, droit « lire ») : le mode ne s'arme pas.
      // Le contrôle doit rester ICI, sur le chemin réel du bouton.
      if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;
      window.modeEdition = true;
      btn.classList.add("kta-group-mode-actif");
      grp.modeActif = true;
      _modesActifs["edition"] = {
        btnEl: btn,
        desactiverFn: function() {
          window.modeEdition = false;
          btn.classList.remove("kta-group-mode-actif");
          grp.modeActif = false;
        }
      };
    }
  });

  // 🩸 Pastille résolue (ktaTypeSwatchHtml) pour les boutons de TYPE : un émoji coloré garderait
  // sa couleur après un override de légende. Résolue à chaque rendu. Les émojis restent là où ils
  // sont un symbole (🪜 jonction, ⛔ inaccessible, outils).
  function _iconeType(cat, key, repli) {
    if (typeof window.ktaTypeSwatchHtml === "function") {
      const h = window.ktaTypeSwatchHtml(cat, key, repli);
      if (h) return h;
    }
    return repli;
  }

  // Miroir de _iconeType pour le LIBELLÉ : nom personnalisé (session ou plan) s'il existe, sinon
  // le libellé i18n de la sidebar. ⚠️ Tester getSource() ≠ "default" : les libellés par défaut de
  // la légende et de la sidebar diffèrent.
  function _titreType(cat, key, repli) {
    const LC = window.LegendCustomization;
    if (LC && typeof LC.getLabel === "function" && typeof LC.getSource === "function") {
      try {
        if (LC.getSource(cat, key) !== "default") {
          const l = LC.getLabel(cat, key);
          if (l) return l;
        }
      } catch(e) {}
    }
    return repli;
  }

  // Tracés : active un type (re-clic = coupe).
  function _activerRoute(type, btnCible, iconeReflet) {
    const dejaActif = window.modeRoad === type;
    _desactiverTousLesModes();

    if (window.modeRoad) toggleRoadMode(window.modeRoad);
    const grp = _groupes["traces"];
    if (grp) grp.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
    _setGroupeModeActif("traces", false);

    if (dejaActif) return;

    toggleRoadMode(type);
    // 🔒 Mode refusé (lecture seule) : le bouton ne s'allume pas, sinon il s'allume sans rien poser.
    if (window.modeRoad !== type) return;
    btnCible.classList.add("kta-actif");
    _modesActifs["road"] = {
      btnEl: btnCible,
      desactiverFn: function() {
        if (window.modeRoad) toggleRoadMode(window.modeRoad);
        if (grp) grp.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
        _setGroupeModeActif("traces", false);
      }
    };
    _setGroupeModeActif("traces", true, iconeReflet);
  }

  // Multi-niveau ON : ajoute 🪜 Jonction après Chemin. La pastille de niveau est un contrôle
  // Leaflet à part (_initLevelFilterControl), pas une sous-action.
  const _isMultiLevel = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);

  const _sousActionsTraces = [];

  _sousActionsTraces.push(
    { icone: "🟩", dynamicIcon: function() { return _iconeType("traces", "principal", "🟩"); }, titre: window.I18n.t("ui.trace.principal"), dynamicTitre: function() { return _titreType("traces", "principal", window.I18n.t("ui.trace.principal")); }, isTypeAction: true, typeKey: "principal",
      onClick: function(btn) { _activerRoute("principal", btn, _iconeType("traces", "principal", "🟩")); } },
    { icone: "🟪", dynamicIcon: function() { return _iconeType("traces", "secondaire", "🟪"); }, titre: window.I18n.t("ui.trace.secondaire"), dynamicTitre: function() { return _titreType("traces", "secondaire", window.I18n.t("ui.trace.secondaire")); }, isTypeAction: true, typeKey: "secondaire",
      onClick: function(btn) { _activerRoute("secondaire", btn, _iconeType("traces", "secondaire", "🟪")); } },
    { icone: "🟨", dynamicIcon: function() { return _iconeType("traces", "chemin", "🟨"); }, titre: window.I18n.t("ui.trace.chemin"), dynamicTitre: function() { return _titreType("traces", "chemin", window.I18n.t("ui.trace.chemin")); }, isTypeAction: true, typeKey: "chemin",
      onClick: function(btn) { _activerRoute("chemin", btn, _iconeType("traces", "chemin", "🟨")); } }
  );

  if (_isMultiLevel) {
    _sousActionsTraces.push({
      icone: "🪜",
      titre: window.I18n.t("ui.trace.jonction"),
      dynamicTitre: function() { return _titreType("traces", "jonction", window.I18n.t("ui.trace.jonction")); },
      isTypeAction: true,
      typeKey: "jonction",
      onClick: function(btn) {
        // Re-clic = coupe le mode, comme les autres types ; sinon ouvre la saisie from/to.
        if (window.modeRoad === "jonction") {
          _fermerModeRoad();
          return;
        }
        // _ouvrirCreationJonction : interfaceConfig.js
        if (typeof window._ouvrirCreationJonction === "function") {
          window._ouvrirCreationJonction(btn);
        }
      }
    });
  }

  _sousActionsTraces.push(
    // Valider : clôt le tracé en cours, quel que soit son type (custom compris) = re-clic sur le
    // type actif (le tracé reste dans roadsData). Sans isTypeAction → après le séparateur.
    { icone: "✅", titre: window.I18n.t("ui.trace.valider"),
      onClick: function() {
        if (!window.modeRoad) {
          _alertCharte(
            window.I18n.t("ui.trace.noneTitle"),
            window.I18n.t("ui.trace.noneBody"),
            "🛣️"
          );
          return;
        }
        _fermerModeRoad();
      }
    },
    { icone: "📏", titre: window.I18n.t("ui.trace.distanceTotale"),
        onClick: function() {
          if (typeof window.ouvrirRoadsDistanceFloater === "function") {
            window.ouvrirRoadsDistanceFloater();
          }
        }
      },
      { icone: "🧹", titre: window.I18n.t("ui.btn.effacer"),
        onClick: function() {
          const roads = window.getRoads ? window.getRoads() : [];
          if (roads.length === 0) return;
          const dernier = roads[roads.length - 1];
          const nbPts = dernier?.points?.length || 0;
          // Tracés sélectionnables au clic (jonction comprise, itinéraire exclu).
          const tracesSelectables = roads.filter(function(r) {
            return r && ["principal", "secondaire", "chemin", "jonction"].indexOf(r.type) !== -1;
          });
          _choixSuppression(
            window.I18n.t("ui.trace.choixTitle"), window.I18n.t("ui.choix.whatErase"),
            [
              { label: window.I18n.t("ui.trace.eraseLastPoint"), icon: "↩️",
                desc: window.I18n.t("ui.trace.eraseLastPointDesc", { n: nbPts }),
                onClick: function() {
                  // 🩸 Tracé en cours vidé → fermer le mode (cf. _fermerModeRoad).
                  const before = (typeof window.getCurrentRoad === "function") ? window.getCurrentRoad() : null;
                  if (window.removeLastRoadPoint) window.removeLastRoadPoint();
                  const after = (typeof window.getCurrentRoad === "function") ? window.getCurrentRoad() : null;
                  if (before && !after) _fermerModeRoad();
                } },
              { label: window.I18n.t("ui.trace.eraseLast"), icon: "✂️",
                desc: window.I18n.t("ui.trace.eraseLastDesc", { n: roads.length }),
                onClick: function() {
                  // 🩸 Tracé en cours capturé AVANT : s'il est supprimé, fermer le mode.
                  const before = (typeof window.getCurrentRoad === "function") ? window.getCurrentRoad() : null;
                  if (window.removeLastRoad) window.removeLastRoad();
                  const after = (typeof window.getCurrentRoad === "function") ? window.getCurrentRoad() : null;
                  if (before && !after) _fermerModeRoad();
                } },
              { label: window.I18n.t("ui.trace.eraseSelect"), icon: "🎯",
                desc: window.I18n.t("ui.trace.eraseSelectDesc", { n: tracesSelectables.length }),
                onClick: function() {
                  if (typeof window.activerModeSuppressionTraceClic === "function") {
                    window.activerModeSuppressionTraceClic();
                  }
                } },
              { label: window.I18n.t("ui.trace.eraseAll"), icon: "🗑️", danger: true,
                desc: window.I18n.t("ui.choix.undoableCtrlZ"),
                onClick: function() {
                  const _hb = window.HistoryManager ? window.HistoryManager.captureState() : null;
                  if (window.resetRoads) window.resetRoads();
                  // resetRoads coupe aussi window.modeRoad : fermeture sans condition.
                  _fermerModeRoad();
                  if (window.HistoryManager && _hb) {
                    window.HistoryManager.record(window.I18n.t("history.action.deleteAllPaths"), _hb);
                  }
                } }
            ]
          );
        }
      }
  );

  _creerGroupeAccordeon({
    id: "traces",
    iconePrincipale: "🛣️",
    titre: window.I18n.t("ui.group.traces"),
    sousActions: _sousActionsTraces,
    useFlyout: true,
    lcCat: "traces",
    customActivator: function(customId, btn) { _activerRoute(customId, btn, _iconeType("traces", customId, "✨")); }
  });

  // Zones (polygones remplis)
  function _activerZone(type, btnCible, iconeReflet) {
    const dejaActif = window.modeZone === type;
    _desactiverTousLesModes();

    if (window.modeZone) toggleZoneMode(window.modeZone);
    const grpZ = _groupes["zones"];
    if (grpZ) grpZ.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
    _setGroupeModeActif("zones", false);

    if (dejaActif) return;

    toggleZoneMode(type);
    if (window.modeZone !== type) return;   // 🔒 mode refusé (lecture seule) : le bouton ne s'allume pas
    btnCible.classList.add("kta-actif");
    _modesActifs["zone"] = {
      btnEl: btnCible,
      desactiverFn: function() {
        if (window.modeZone) toggleZoneMode(window.modeZone);
        if (grpZ) grpZ.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
        _setGroupeModeActif("zones", false);
      }
    };
    _setGroupeModeActif("zones", true, iconeReflet);
  }

  _creerGroupeAccordeon({
    id: "zones",
    iconePrincipale: "⬛",
    titre: window.I18n.t("ui.group.zones"),
    useFlyout: true,
    lcCat: "zones",
    customActivator: function(customId, btn) { _activerZone(customId, btn, _iconeType("zones", customId, "✨")); },
    sousActions: [
      { icone: "⬛", dynamicIcon: function() { return _iconeType("zones", "remblais", "⬛"); }, titre: window.I18n.t("ui.zone.remblais"), dynamicTitre: function() { return _titreType("zones", "remblais", window.I18n.t("ui.zone.remblais")); }, isTypeAction: true, typeKey: "remblais",
        onClick: function(btn) { _activerZone("remblais", btn, _iconeType("zones", "remblais", "⬛")); } },
      { icone: "🟥", dynamicIcon: function() { return _iconeType("zones", "effondrement", "🟥"); }, titre: window.I18n.t("ui.zone.effondrement"), dynamicTitre: function() { return _titreType("zones", "effondrement", window.I18n.t("ui.zone.effondrement")); }, isTypeAction: true, typeKey: "effondrement",
        onClick: function(btn) { _activerZone("effondrement", btn, _iconeType("zones", "effondrement", "🟥")); } },
      { icone: "🟦", dynamicIcon: function() { return _iconeType("zones", "eau", "🟦"); }, titre: window.I18n.t("ui.zone.eau"), dynamicTitre: function() { return _titreType("zones", "eau", window.I18n.t("ui.zone.eau")); }, isTypeAction: true, typeKey: "eau",
        onClick: function(btn) { _activerZone("eau", btn, _iconeType("zones", "eau", "🟦")); } },
      // Inaccessible : contrainte dure du pathfinder (tout segment qui la traverse est exclu).
      { icone: "⛔", titre: window.I18n.t("ui.zone.inaccessible"), dynamicTitre: function() { return _titreType("zones", "inaccessible", window.I18n.t("ui.zone.inaccessible")); }, isTypeAction: true, typeKey: "inaccessible",
        onClick: function(btn) { _activerZone("inaccessible", btn, "⛔"); } },
      { icone: "✅", titre: window.I18n.t("ui.zone.fermer"),
        onClick: function() {
          if (!window.modeZone) {
            _alertCharte(
              window.I18n.t("ui.zone.noneTitle"),
              window.I18n.t("ui.zone.noneBody"),
              "⛔"
            );
            return;
          }
          if (window.fermerZoneEnCours) {
            // 🩸 Même chemin que la fermeture au clic sur le 1er sommet : historiser, puis éteindre
            // l'outil (sinon le tap suivant démarre une nouvelle zone).
            const _avantZ = window.HistoryManager ? window.HistoryManager.captureState("zones") : null;
            const _typeZ  = window.modeZone;
            const ok = window.fermerZoneEnCours();
            if (ok) {
              if (window.HistoryManager && _avantZ) {
                window.HistoryManager.record(window.I18n.t("history.action.closeZone", { type: _typeZ }), _avantZ, "zones");
              }
              if (typeof window._fermerModeZone === "function") window._fermerModeZone();
            }
            if (!ok) {
              _alertCharte(
                window.I18n.t("ui.zone.tooFewTitle"),
                window.I18n.t("ui.zone.tooFewBody"),
                "📐"
              );
            }
          }
        }
      },
      { icone: "🧹", titre: window.I18n.t("ui.btn.effacer"),
        onClick: function() {
          const zones = window.getZones ? window.getZones() : [];
          if (zones.length === 0) return;

          const nbZonesFermees = zones.length;
          // Sélectionnables : au moins 3 points
          const nbSelectables = zones.filter(function(z) {
            return z && Array.isArray(z.points) && z.points.length >= 3;
          }).length;

          _choixSuppression(
            window.I18n.t("ui.zone.choixTitle"), window.I18n.t("ui.choix.whatErase"),
            [
              { label: window.I18n.t("ui.zone.eraseLastPoint"), icon: "↩️",
                desc: window.I18n.t("ui.zone.eraseLastPointDesc"),
                onClick: function() {
                  // 🩸 Zone en cours vidée → fermer le mode (cf. _fermerModeRoad).
                  const before = (typeof window.getCurrentZone === "function") ? window.getCurrentZone() : null;
                  if (window.removeLastZonePoint) window.removeLastZonePoint();
                  const after = (typeof window.getCurrentZone === "function") ? window.getCurrentZone() : null;
                  if (before && !after) _fermerModeZone();
                } },
              // removeLastZone vise la zone en cours si elle existe, sinon la dernière fermée.
              { label: window.I18n.t("ui.zone.eraseLast"), icon: "✂️",
                desc: window.I18n.t("ui.zone.eraseLastDesc", { n: nbZonesFermees }),
                onClick: function() {
                  // 🩸 Zone en cours supprimée → fermer le mode.
                  const before = (typeof window.getCurrentZone === "function") ? window.getCurrentZone() : null;
                  if (window.removeLastZone) window.removeLastZone();
                  const after = (typeof window.getCurrentZone === "function") ? window.getCurrentZone() : null;
                  if (before && !after) _fermerModeZone();
                } },
              { label: window.I18n.t("ui.zone.eraseSelect"), icon: "🎯",
                desc: window.I18n.t("ui.zone.eraseSelectDesc", { n: nbSelectables }),
                onClick: function() {
                  if (typeof window.activerModeSuppressionZoneClic === "function") {
                    window.activerModeSuppressionZoneClic();
                  }
                } },
              { label: window.I18n.t("ui.zone.eraseAll"), icon: "🗑️", danger: true,
                desc: window.I18n.t("ui.choix.undoableCtrlZ"),
                onClick: function() {
                  const _hb = window.HistoryManager ? window.HistoryManager.captureState() : null;
                  if (window.resetZones) window.resetZones();
                  // resetZones coupe aussi window.modeZone : fermeture sans condition.
                  _fermerModeZone();
                  if (window.HistoryManager && _hb) {
                    window.HistoryManager.record(window.I18n.t("history.action.deleteAllZones"), _hb);
                  }
                } }
            ]
          );
        }
      }
    ]
  });

  // Structures (piliers, murs) : polygones comme les zones, mais éléments physiques du réseau.
  function _activerStructure(type, btnCible, iconeReflet) {
    const dejaActif = window.modeStructure === type;
    _desactiverTousLesModes();

    if (window.modeStructure && typeof window.toggleStructureMode === "function") {
      window.toggleStructureMode(window.modeStructure);
    }
    const grpS = _groupes["structures"];
    if (grpS) grpS.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
    _setGroupeModeActif("structures", false);

    if (dejaActif) return;

    if (typeof window.toggleStructureMode === "function") {
      window.toggleStructureMode(type);
    }
    if (window.modeStructure !== type) return;   // 🔒 mode refusé (lecture seule) : le bouton ne s'allume pas
    btnCible.classList.add("kta-actif");
    _modesActifs["structure"] = {
      btnEl: btnCible,
      desactiverFn: function() {
        if (window.modeStructure && typeof window.toggleStructureMode === "function") {
          window.toggleStructureMode(window.modeStructure);
        }
        if (grpS) grpS.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
        _setGroupeModeActif("structures", false);
      }
    };
    _setGroupeModeActif("structures", true, iconeReflet);
  }

  // Déclaré juste après Zones : l'ordre d'ajout fixe sa place dans la sidebar droite.
  _creerGroupeAccordeon({
    id: "structures",
    iconePrincipale: "🏛️",
    titre: window.I18n.t("ui.group.structures"),
    useFlyout: true,
    lcCat: "structures",
    customActivator: function(customId, btn) { _activerStructure(customId, btn, _iconeType("structures", customId, "✨")); },
    sousActions: [
      // Pilier 1ʳᵉ masse : jaune (fill #f4c542) ; en multi-niveau, tagué au niveau actif.
      { icone: "🟡", dynamicIcon: function() { return _iconeType("structures", "pilier-1", "🟡"); }, titre: window.I18n.t("ui.struct.pilier1"), dynamicTitre: function() { return _titreType("structures", "pilier-1", window.I18n.t("ui.struct.pilier1")); }, isTypeAction: true, typeKey: "pilier-1",
        onClick: function(btn) { _activerStructure("pilier-1", btn, _iconeType("structures", "pilier-1", "🟡")); } },
      // Pilier 2ᵉ masse : orange (fill #ff9933) ; en multi-niveau, auto-tagué `activeLevel - 1`
      // (structures.js) : c'est la masse inférieure vue depuis le niveau actif.
      { icone: "🟠", dynamicIcon: function() { return _iconeType("structures", "pilier-2", "🟠"); }, titre: window.I18n.t("ui.struct.pilier2"), dynamicTitre: function() { return _titreType("structures", "pilier-2", window.I18n.t("ui.struct.pilier2")); }, isTypeAction: true, typeKey: "pilier-2",
        onClick: function(btn) { _activerStructure("pilier-2", btn, _iconeType("structures", "pilier-2", "🟠")); } },
      // Mur : rond bleu, à ne pas confondre avec le carré 🟦 de la zone eau.
      { icone: "🔵", dynamicIcon: function() { return _iconeType("structures", "mur", "🔵"); }, titre: window.I18n.t("ui.struct.mur"), dynamicTitre: function() { return _titreType("structures", "mur", window.I18n.t("ui.struct.mur")); }, isTypeAction: true, typeKey: "mur",
        onClick: function(btn) { _activerStructure("mur", btn, _iconeType("structures", "mur", "🔵")); } },
      // Fronts de taille : polylines épaisses, mais rangés dans Structures (décision produit).
      // Même règle multi-niveau que les piliers : front-2 auto-tagué activeLevel - 1.
      { icone: "🟨", dynamicIcon: function() { return _iconeType("structures", "front-1", "🟨"); }, titre: window.I18n.t("ui.struct.front1"), dynamicTitre: function() { return _titreType("structures", "front-1", window.I18n.t("ui.struct.front1")); }, isTypeAction: true, typeKey: "front-1",
        onClick: function(btn) { _activerStructure("front-1", btn, _iconeType("structures", "front-1", "🟨")); } },
      { icone: "🟧", dynamicIcon: function() { return _iconeType("structures", "front-2", "🟧"); }, titre: window.I18n.t("ui.struct.front2"), dynamicTitre: function() { return _titreType("structures", "front-2", window.I18n.t("ui.struct.front2")); }, isTypeAction: true, typeKey: "front-2",
        onClick: function(btn) { _activerStructure("front-2", btn, _iconeType("structures", "front-2", "🟧")); } },
      { icone: "✅", titre: window.I18n.t("ui.struct.fermer"),
        onClick: function() {
          if (!window.modeStructure) {
            _alertCharte(
              window.I18n.t("ui.struct.noneTitle"),
              window.I18n.t("ui.struct.noneBody"),
              "🏛️"
            );
            return;
          }
          if (window.fermerStructureEnCours) {
            // 🩸 Comme les zones : historiser, puis éteindre l'outil.
            const _avantS = window.HistoryManager ? window.HistoryManager.captureState("structures") : null;
            const _typeS  = window.modeStructure;
            const ok = window.fermerStructureEnCours();
            if (ok) {
              if (window.HistoryManager && _avantS) {
                window.HistoryManager.record(window.I18n.t("struct.undo.close", { type: _typeS }), _avantS, "structures");
              }
              if (typeof window._fermerModeStructure === "function") window._fermerModeStructure();
            }
            if (!ok) {
              // Polyline = 2 points min, polygone = 3. 🩸 Passer par isStructurePolylineType (lit
              // LegendCustomization) : tester "front-1/front-2" en dur se trompe pour les customs.
              const isLine = (typeof window.isStructurePolylineType === "function")
                && window.isStructurePolylineType(window.modeStructure);
              if (isLine) {
                _alertCharte(
                  window.I18n.t("ui.struct.tooFewTitle"),
                  window.I18n.t("ui.struct.tooFewLineBody"),
                  "📐"
                );
              } else {
                _alertCharte(
                  window.I18n.t("ui.struct.tooFewTitle"),
                  window.I18n.t("ui.struct.tooFewPolyBody"),
                  "📐"
                );
              }
            }
          }
        }
      },
      { icone: "🧹", titre: window.I18n.t("ui.btn.effacer"),
        onClick: function() {
          const structures = window.getStructures ? window.getStructures() : [];
          if (structures.length === 0) return;

          const nbStructFermees = structures.length;
          const nbSelectables = structures.filter(function(s) {
            return s && Array.isArray(s.points) && s.points.length >= 3;
          }).length;

          _choixSuppression(
            window.I18n.t("ui.struct.choixTitle"), window.I18n.t("ui.choix.whatErase"),
            [
              { label: window.I18n.t("ui.struct.eraseLastPoint"), icon: "↩️",
                desc: window.I18n.t("ui.struct.eraseLastPointDesc"),
                onClick: function() {
                  // 🩸 Structure en cours vidée → fermer le mode (cf. _fermerModeRoad).
                  const before = (typeof window.getCurrentStructure === "function") ? window.getCurrentStructure() : null;
                  if (window.removeLastStructurePoint) window.removeLastStructurePoint();
                  const after = (typeof window.getCurrentStructure === "function") ? window.getCurrentStructure() : null;
                  if (before && !after) _fermerModeStructure();
                } },
              // removeLastStructure vise la structure en cours si elle existe, sinon la dernière fermée.
              { label: window.I18n.t("ui.struct.eraseLast"), icon: "✂️",
                desc: window.I18n.t("ui.struct.eraseLastDesc", { n: nbStructFermees }),
                onClick: function() {
                  const before = (typeof window.getCurrentStructure === "function") ? window.getCurrentStructure() : null;
                  if (window.removeLastStructure) window.removeLastStructure();
                  const after = (typeof window.getCurrentStructure === "function") ? window.getCurrentStructure() : null;
                  if (before && !after) _fermerModeStructure();
                } },
              { label: window.I18n.t("ui.struct.eraseSelect"), icon: "🎯",
                desc: window.I18n.t("ui.struct.eraseSelectDesc", { n: nbSelectables }),
                onClick: function() {
                  if (typeof window.activerModeSuppressionStructureClic === "function") {
                    window.activerModeSuppressionStructureClic();
                  }
                } },
              { label: window.I18n.t("ui.struct.eraseAll"), icon: "🗑️", danger: true,
                desc: window.I18n.t("ui.struct.eraseAllDesc", { n: nbSelectables }),
                onClick: function() {
                  const _hb = window.HistoryManager ? window.HistoryManager.captureState() : null;
                  if (window.resetStructures) window.resetStructures();
                  _fermerModeStructure();
                  if (window.HistoryManager && _hb) {
                    window.HistoryManager.record(window.I18n.t("history.action.deleteAllStructures"), _hb);
                  }
                } }
            ]
          );
        }
      }
    ]
  });

  // Boutons des types CUSTOM de la légende dans traces / zones / structures (accordéon) :
  // pastille de couleur, data-custom-id = entry.id, clic → _activerX(entry.id) (stocké comme
  // type). Rafraîchi par LegendCustomization.onCustomEntriesChange.
  function _injecterBoutonsCustomSidebar() {
    const mapping = [
      { groupeId: "traces",     lcCat: "traces",     activerFn: _activerRoute     },
      { groupeId: "zones",      lcCat: "zones",      activerFn: _activerZone      },
      { groupeId: "structures", lcCat: "structures", activerFn: _activerStructure }
    ];
    const LC = window.LegendCustomization;
    if (!LC) return;

    mapping.forEach(function(m) {
      const grp = _groupes[m.groupeId];
      if (!grp || !grp.container) return;

      // Flyout : customs relus à chaque _ouvrirFlyout ; on reconstruit seulement s'il est ouvert.
      if (grp.useFlyout) {
        if (_currentFlyout && _currentFlyout.dataset.groupId === m.groupeId) {
          _ouvrirFlyout(m.groupeId);
        }
        return;
      }

      // Retire les anciens customs du DOM ET de subActions.
      grp.container.querySelectorAll('a.kta-sub[data-custom-id]').forEach(function(el) {
        el.remove();
      });
      grp.subActions = grp.subActions.filter(function(el) {
        return !el.dataset || !el.dataset.customId;
      });

      // Ancre = premier outil (non-type) : les customs s'insèrent juste avant, entre types et outils.
      const allSubs   = Array.from(grp.container.querySelectorAll('a.kta-sub'));
      const ancreBtn  = allSubs.find(function(b) { return !b.dataset.typeAction; });
      const ancreIdx  = ancreBtn
        ? grp.subActions.indexOf(ancreBtn)
        : grp.subActions.length;

      // 🩸 Pas de filtre sur `visible`, comme dans _ouvrirFlyout : les deux sites DOIVENT rester
      // d'accord, sinon la sidebar change de contenu à son premier rafraîchissement.
      const customs = LC.listCustomEntries(m.lcCat);
      customs.forEach(function(e, i) {
        const isLine = (e.geometry === "polyline") || (!e.geometry && e.lineColor && !e.fillColor);
        // Sans parent : attaché plus bas par insertBefore
        const btn = L.DomUtil.create("a", "kta-sub kta-hidden");
        btn.href            = "#";   // 🔒 pas « javascript: » (CSP stricte) ; le clic fait L.DomEvent.stop
        btn.setAttribute("role", "button");
        btn.title           = "✨ " + e.label;
        btn.dataset.customId = e.id;
        btn.dataset.subId    = "custom-" + e.id;

        if (isLine) {
          const col = e.lineColor || e.fillColor || '#888';
          btn.innerHTML = '<span style="display:inline-block;width:16px;height:3px;background:' + col + ';vertical-align:middle;border-radius:1px;"></span>';
        } else {
          const fill   = e.fillColor || e.lineColor || '#888';
          const border = e.borderColor || e.lineColor || fill;
          btn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;background:' + fill + ';border:1px solid ' + border + ';vertical-align:middle;border-radius:2px;"></span>';
        }

        L.DomEvent.on(btn, "click", function(ev) {
          L.DomEvent.stop(ev); L.DomEvent.preventDefault(ev);
          m.activerFn(e.id, btn, "✨");
        });

        if (ancreBtn) {
          grp.container.insertBefore(btn, ancreBtn);
        } else {
          grp.container.appendChild(btn);
        }
        grp.subActions.splice(ancreIdx + i, 0, btn);

        if (_groupeOuvert === m.groupeId || grp.modeActif) {
          btn.classList.remove("kta-hidden");
        }
      });
    });
  }

  _injecterBoutonsCustomSidebar();

  // Abonnement unique + référence rafraîchie (cf. _historyUiSubBound).
  _injecterBoutonsCustomRef = _injecterBoutonsCustomSidebar;
  if (!_legendCustomSubBound && window.LegendCustomization
      && typeof window.LegendCustomization.onCustomEntriesChange === "function") {
    _legendCustomSubBound = true;
    window.LegendCustomization.onCustomEntriesChange(function() {
      if (_injecterBoutonsCustomRef) _injecterBoutonsCustomRef();
    });
  }

  // Flyout Favoris ouvert → re-rendu quand la liste change. Abonnement unique ; pas de référence
  // à rafraîchir : le callback ne lit que des variables module.
  if (!_favorisSubBound && window.Favoris && typeof window.Favoris.onChange === "function") {
    _favorisSubBound = true;
    window.Favoris.onChange(function() {
      if (_currentFlyout && _currentFlyout.dataset.groupId === "favoris") {
        _ouvrirFlyout("favoris");
      }
    });
  }

  // Centre sur un favori, l'entoure d'un cercle et ouvre la popup du marker s'il existe.
  function _allerVersFavori(fav) {
    if (!fav || !window.map) return;
    const latlng = convertCoord(fav.x, fav.y);
    window.map.setView(latlng, window.map.getZoom(), { animate: false });
    window.map.invalidateSize();

    if (window._favFlashLayer) {
      try { window.map.removeLayer(window._favFlashLayer); } catch(e) {}
      window._favFlashLayer = null;
    }

    // Même cercle que searchPoints.js > _ouvrirPopupEtFlash.
    window._favFlashLayer = L.circleMarker(latlng, {
      radius:       28,
      color:        "#ffaa00",
      fillColor:    "#ffcc44",
      fillOpacity:  0,
      weight:       3,
      opacity:      0.9,
      interactive:  false
    }).addTo(window.map);

    // Marker retrouvé par coordonnées plan x/y (tolérance 0,5 px), session ou couche data.
    let foundMarker = null;
    function _scanLayer(lyr) {
      if (foundMarker || !lyr || !lyr.eachLayer) return;
      lyr.eachLayer(function(m) {
        if (foundMarker) return;
        if (m.getLatLng) {
          const ll = m.getLatLng();
          const mx = ll.lng;
          const my = APP_CONFIG.imageHeight - ll.lat;
          if (Math.abs(mx - fav.x) < 0.5 && Math.abs(my - fav.y) < 0.5) {
            foundMarker = m;
          }
        }
      });
    }
    if (window.layerEditor) _scanLayer(window.layerEditor);
    if (!foundMarker && window.dataLayerGroups) {
      Object.keys(window.dataLayerGroups).forEach(function(id) {
        _scanLayer(window.dataLayerGroups[id]);
      });
    }
    if (foundMarker && foundMarker.openPopup) {
      foundMarker.openPopup();
    }

    setTimeout(function() {
      if (window._favFlashLayer) {
        try { window.map.removeLayer(window._favFlashLayer); } catch(e) {}
        window._favFlashLayer = null;
      }
    }, 3000);
  }

  _initClickExterieur();
  // Le contrôle Niveau est créé au début d'initInterface (ordre visuel après le zoom).
}


// Itinéraire et évitements : js/interfaceItineraire.js.

// ── Suppression au clic (tracé / zone / structure) : garde des popups ──────────────────────────────
// 🩸 Les éléments de session ont une popup d'annotation (utils.js > attacherNotePopup). Un clic
// PILE sur l'élément ouvre la popup et Leaflet (`_openPopup`) fait `DomEvent.stop(e)` : le
// `map.on("click")` du mode suppression ne tire JAMAIS (seuls les clics à côté marchaient).
// Donc on REJOUE la suppression depuis `popupopen` : la popup s'ouvre au point cliqué, on la
// ferme et on appelle le handler actif avec `{ latlng }`. Le vrai clic carte ne tire pas → pas
// de double. Limite : deux modes suppression actifs à la fois → le rejeu peut viser le mauvais type.
let _suppPopupGuardActif = false;
function _onSuppPopupOpen(e) {
  const popup = e && e.popup;
  let latlng = null;
  try {
    latlng = (popup && popup.getLatLng) ? popup.getLatLng() : (popup && popup._latlng) || null;
  } catch(err) { latlng = null; }
  try { window.map.closePopup(popup); } catch(err) {}
  if (!latlng) return;
  const fakeEvt = { latlng: latlng };
  try {
    if (_suppTraceClickHandler)          _suppTraceClickHandler(fakeEvt);
    else if (_suppZoneClickHandler)      _suppZoneClickHandler(fakeEvt);
    else if (_suppStructureClickHandler) _suppStructureClickHandler(fakeEvt);
  } catch(err) {
    console.warn("[Suppr] rejeu clic via popupopen échoué :", err);
  }
}
function _installerSuppPopupGuard() {
  if (_suppPopupGuardActif || !window.map) return;
  _suppPopupGuardActif = true;
  window.map.on("popupopen", _onSuppPopupOpen);
}
function _retirerSuppPopupGuard() {
  if (!_suppPopupGuardActif) return;
  _suppPopupGuardActif = false;
  if (window.map) window.map.off("popupopen", _onSuppPopupOpen);
}

// ── Suppression d'un tracé au clic ──────────────────────────────
// Floater en bas ; la polyline la plus proche du clic (tolérance en px) est supprimée.
let _suppTraceClickHandler = null;
let _suppTraceFloater      = null;

// Distance point-segment, bornée aux extrémités. ⚠️ Coordonnées plan (px image), pas latlng.
function _pointSegmentDistanceFlat(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function _desactiverModeSuppressionTrace() {
  if (_suppTraceClickHandler && window.map) {
    window.map.off("click", _suppTraceClickHandler);
    _suppTraceClickHandler = null;
  }
  if (_suppTraceFloater) {
    _suppTraceFloater.remove();
    _suppTraceFloater = null;
  }
  _retirerSuppPopupGuard();
}

window.activerModeSuppressionTraceClic = function() {
  if (!window.map) return;
  if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;

  const allRoads = window.getRoads ? (window.getRoads() || []) : [];
  const supprimables = allRoads.filter(function(r) {
    return r && Array.isArray(r.points) && r.points.length >= 2 &&
           ["principal", "secondaire", "chemin", "jonction"].indexOf(r.type) !== -1;
  });
  if (supprimables.length === 0) {
    window.ktaAlerte(window.I18n.t("ui.alert.noTraceToDelete"));
    return;
  }

  _desactiverModeSuppressionTrace();

  _suppTraceFloater = document.createElement("div");
  _suppTraceFloater.id = "kta-supp-trace-floater";
  _suppTraceFloater.className = "kta-supp-trace-floater";
  _suppTraceFloater.innerHTML =
    '<span class="kta-supp-trace-icon">🎯</span>' +
    '<span class="kta-supp-trace-msg">' + window.I18n.t("ui.suppClic.traceMsg") + '</span>' +
    '<button class="kta-btn kta-btn-ghost" id="kta-supp-trace-annuler" type="button">' + window.I18n.t("ui.btn.cancelX") + '</button>';
  document.body.appendChild(_suppTraceFloater);

  document.getElementById("kta-supp-trace-annuler")
    .addEventListener("click", _desactiverModeSuppressionTrace);

  _installerSuppPopupGuard();

  // Tolérance en px IMAGE (pas écran) : compromis doigt / souris.
  const TOLERANCE_PX = 20;

  _suppTraceClickHandler = function(e) {
    const cx = e.latlng.lng;
    const cy = APP_CONFIG.imageHeight - e.latlng.lat;

    let closestRoad = null;
    let closestDist = Infinity;

    for (let r = 0; r < supprimables.length; r++) {
      const road = supprimables[r];
      const pts  = road.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = _pointSegmentDistanceFlat({ x: cx, y: cy }, pts[i], pts[i + 1]);
        if (d < closestDist) {
          closestDist = d;
          closestRoad = road;
        }
      }
    }

    if (!closestRoad || closestDist > TOLERANCE_PX) {
      console.log("[Suppr trace] Click à", Math.round(closestDist), "px — hors tolérance, ignoré");
      return;
    }

    // 🩸 Tracé en cours capturé AVANT : setRoads remet currentRoad à null. S'il est supprimé,
    // fermer le mode.
    const currentBefore = (typeof window.getCurrentRoad === "function") ? window.getCurrentRoad() : null;
    const closeRoadMode = (currentBefore && currentBefore === closestRoad);

    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState() : null;

    const currentRoads = window.getRoads ? window.getRoads() : [];
    const filtered = currentRoads.filter(function(r) { return r !== closestRoad; });
    if (window.setRoads) window.setRoads(filtered);
    console.log("[Suppr trace] Tracé supprimé :", closestRoad.type,
                "(distance click :", Math.round(closestDist), "px) —",
                filtered.length, "tracé(s) restant(s)");

    if (closeRoadMode) _fermerModeRoad();

    _desactiverModeSuppressionTrace();

    if (window.HistoryManager && _historyBefore) {
      window.HistoryManager.record(window.I18n.t("history.action.deletePathClick", { type: (closestRoad.type || "?") }), _historyBefore);
    }
  };

  window.map.on("click", _suppTraceClickHandler);
};

// ── Suppression d'une zone au clic ──────────────────────────────
// 1) point dans le polygone (la DERNIÈRE dessinée gagne : c'est celle du dessus) ;
// 2) sinon, clic près d'un bord (tolérance px), pour les petites zones.
let _suppZoneClickHandler = null;
let _suppZoneFloater      = null;

// Ray casting : nombre impair d'intersections = dedans.
function _pointInPolygon(p, poly) {
  if (!Array.isArray(poly) || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
                      (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function _desactiverModeSuppressionZone() {
  if (_suppZoneClickHandler && window.map) {
    window.map.off("click", _suppZoneClickHandler);
    _suppZoneClickHandler = null;
  }
  if (_suppZoneFloater) {
    _suppZoneFloater.remove();
    _suppZoneFloater = null;
  }
  _retirerSuppPopupGuard();
}

window.activerModeSuppressionZoneClic = function() {
  if (!window.map) return;
  if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;

  const allZones = window.getZones ? (window.getZones() || []) : [];
  const supprimables = allZones.filter(function(z) {
    return z && Array.isArray(z.points) && z.points.length >= 3;
  });
  if (supprimables.length === 0) {
    window.ktaAlerte(window.I18n.t("ui.alert.noZoneToDelete"));
    return;
  }

  _desactiverModeSuppressionZone();

  _suppZoneFloater = document.createElement("div");
  _suppZoneFloater.id = "kta-supp-zone-floater";
  _suppZoneFloater.className = "kta-supp-trace-floater";  // même style que les tracés
  _suppZoneFloater.innerHTML =
    '<span class="kta-supp-trace-icon">🎯</span>' +
    '<span class="kta-supp-trace-msg">' + window.I18n.t("ui.suppClic.zoneMsg") + '</span>' +
    '<button class="kta-btn kta-btn-ghost" id="kta-supp-zone-annuler" type="button">' + window.I18n.t("ui.btn.cancelX") + '</button>';
  document.body.appendChild(_suppZoneFloater);

  document.getElementById("kta-supp-zone-annuler")
    .addEventListener("click", _desactiverModeSuppressionZone);

  _installerSuppPopupGuard();

  const TOLERANCE_BORD_PX = 20;

  _suppZoneClickHandler = function(e) {
    const cx = e.latlng.lng;
    const cy = APP_CONFIG.imageHeight - e.latlng.lat;
    const cp = { x: cx, y: cy };

    // Ordre INVERSE : la zone du dessus gagne en cas de chevauchement.
    let foundZone = null;
    for (let i = supprimables.length - 1; i >= 0; i--) {
      if (_pointInPolygon(cp, supprimables[i].points)) {
        foundZone = supprimables[i];
        break;
      }
    }

    // Repli : clic près d'un bord (contour fermé, segment final pts[N-1] → pts[0]).
    if (!foundZone) {
      let closestDist = Infinity;
      let closestZone = null;
      for (let z = 0; z < supprimables.length; z++) {
        const pts = supprimables[z].points;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const d = _pointSegmentDistanceFlat(cp, a, b);
          if (d < closestDist) {
            closestDist = d;
            closestZone = supprimables[z];
          }
        }
      }
      if (closestZone && closestDist <= TOLERANCE_BORD_PX) {
        foundZone = closestZone;
      }
    }

    if (!foundZone) {
      console.log("[Suppr zone] Click hors zone et hors tolérance bord, ignoré");
      return;
    }

    // 🩸 Zone en cours capturée AVANT (setZones remet currentZone à null) : supprimée → fermer le mode.
    const currentBefore = (typeof window.getCurrentZone === "function") ? window.getCurrentZone() : null;
    const closeZoneMode = (currentBefore && currentBefore === foundZone);

    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState() : null;

    const currentZones = window.getZones ? window.getZones() : [];
    const filtered = currentZones.filter(function(z) { return z !== foundZone; });
    if (window.setZones) window.setZones(filtered);
    console.log("[Suppr zone] Zone supprimée :", foundZone.type, "—",
                filtered.length, "zone(s) restante(s)");

    if (closeZoneMode) _fermerModeZone();

    _desactiverModeSuppressionZone();

    if (window.HistoryManager && _historyBefore) {
      window.HistoryManager.record(window.I18n.t("history.action.deleteZoneClick", { type: (foundZone.type || "?") }), _historyBefore);
    }
  };

  window.map.on("click", _suppZoneClickHandler);
};

// ── Suppression d'une structure au clic ──────────────────────────────
// Hybride selon window.isStructurePolylineType (structures.js) : polygone (piliers, murs) =
// point dedans puis bord (20 px) ; polyline (fronts) = distance au segment (15 px, plus serré).
let _suppStructureClickHandler = null;
let _suppStructureFloater      = null;

function _desactiverModeSuppressionStructure() {
  if (_suppStructureClickHandler && window.map) {
    window.map.off("click", _suppStructureClickHandler);
    _suppStructureClickHandler = null;
  }
  if (_suppStructureFloater) {
    _suppStructureFloater.remove();
    _suppStructureFloater = null;
  }
  _retirerSuppPopupGuard();
}

window.activerModeSuppressionStructureClic = function() {
  if (!window.map) return;
  if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;

  const allStructures = window.getStructures ? (window.getStructures() || []) : [];
  // Assez de points : 2 pour une polyline, 3 pour un polygone
  const supprimables = allStructures.filter(function(s) {
    if (!s || !Array.isArray(s.points)) return false;
    const isLine = (typeof window.isStructurePolylineType === "function")
                   && window.isStructurePolylineType(s.type);
    const minPts = isLine ? 2 : 3;
    return s.points.length >= minPts;
  });
  if (supprimables.length === 0) {
    window.ktaAlerte(window.I18n.t("ui.alert.noStructToDelete"));
    return;
  }

  _desactiverModeSuppressionStructure();

  _suppStructureFloater = document.createElement("div");
  _suppStructureFloater.id = "kta-supp-structure-floater";
  _suppStructureFloater.className = "kta-supp-trace-floater";  // même style que les tracés
  _suppStructureFloater.innerHTML =
    '<span class="kta-supp-trace-icon">🎯</span>' +
    '<span class="kta-supp-trace-msg">' + window.I18n.t("ui.suppClic.structMsg") + '</span>' +
    '<button class="kta-btn kta-btn-ghost" id="kta-supp-structure-annuler" type="button">' + window.I18n.t("ui.btn.cancelX") + '</button>';
  document.body.appendChild(_suppStructureFloater);

  document.getElementById("kta-supp-structure-annuler")
    .addEventListener("click", _desactiverModeSuppressionStructure);

  _installerSuppPopupGuard();

  const TOLERANCE_BORD_PX  = 20;  // polygon fallback bord
  const TOLERANCE_TRACE_PX = 15;  // polyline (fronts)

  _suppStructureClickHandler = function(e) {
    const cx = e.latlng.lng;
    const cy = APP_CONFIG.imageHeight - e.latlng.lat;
    const cp = { x: cx, y: cy };

    let foundStruct = null;

    // Polygones : point dedans, en ordre inverse (celle du dessus gagne).
    for (let i = supprimables.length - 1; i >= 0; i--) {
      const s = supprimables[i];
      const isLine = (typeof window.isStructurePolylineType === "function")
                     && window.isStructurePolylineType(s.type);
      if (!isLine && _pointInPolygon(cp, s.points)) {
        foundStruct = s;
        break;
      }
    }

    // Repli : distance au bord ou au segment (petits piliers, fronts fins).
    if (!foundStruct) {
      let closestDist = Infinity;
      let closestStruct = null;
      for (let z = 0; z < supprimables.length; z++) {
        const s = supprimables[z];
        const pts = s.points;
        const isLine = (typeof window.isStructurePolylineType === "function")
                       && window.isStructurePolylineType(s.type);
        const tolerance = isLine ? TOLERANCE_TRACE_PX : TOLERANCE_BORD_PX;
        // Polyline : segments ouverts ; polygone : fermés (pts[N-1] → pts[0]).
        const segCount = isLine ? pts.length - 1 : pts.length;
        for (let i = 0; i < segCount; i++) {
          const a = pts[i];
          const b = pts[isLine ? (i + 1) : ((i + 1) % pts.length)];
          if (!a || !b) continue;
          const d = _pointSegmentDistanceFlat(cp, a, b);
          if (d < closestDist && d <= tolerance) {
            closestDist = d;
            closestStruct = s;
          }
        }
      }
      if (closestStruct) foundStruct = closestStruct;
    }

    if (!foundStruct) {
      console.log("[Suppr structure] Click hors structure et hors tolérance, ignoré");
      return;
    }

    // 🩸 Structure en cours capturée AVANT (setStructures la remet à null au rendu) : supprimée →
    // fermer le mode.
    const currentBefore = (typeof window.getCurrentStructure === "function")
                          ? window.getCurrentStructure() : null;
    const closeMode = (currentBefore && currentBefore === foundStruct);

    // ⚠️ Passer par setStructures, pas par mutation directe : l'état interne du module suit.
    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState() : null;
    const currentStructures = window.getStructures ? window.getStructures() : [];
    const filtered = currentStructures.filter(function(s) { return s !== foundStruct; });
    if (window.setStructures) window.setStructures(filtered);
    console.log("[Suppr structure] Supprimée :", foundStruct.type, "—",
                filtered.length, "structure(s) restante(s)");

    if (closeMode) _fermerModeStructure();

    _desactiverModeSuppressionStructure();

    if (window.HistoryManager && _historyBefore) {
      window.HistoryManager.record(window.I18n.t("history.action.deleteStructureClick", { type: (foundStruct.type || "?") }), _historyBefore);
    }
  };

  window.map.on("click", _suppStructureClickHandler);
};


// Distance totale des tracés : js/interfaceDistanceTotale.js · légende : js/interfaceLegende.js.

// ── Export global ──────────────────────────────
window.initInterface         = initInterface;
